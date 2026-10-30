import type { Page, Principal, Problem, StreamFrame } from './types';

/**
 * The collection path segment. Matches the `collection` field each resource
 * declares in the API's own `RESOURCES` list, which is why `work-orders` is
 * hyphenated here and `WorkOrder` elsewhere.
 */
export type Resource = 'customers' | 'vehicles' | 'work-orders';

/**
 * The whole client. Every request carries the principal header, which is the
 * spike's stand-in for a session token — so switching principals in the UI is
 * exactly the thing the leak suite does programmatically.
 */
const PRINCIPAL_HEADER = 'x-fleetco-principal';

/** A failed request, carrying the API's own problem body when there is one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem | null,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function headers(principal: Principal): Record<string, string> {
  return {
    'content-type': 'application/json',
    [PRINCIPAL_HEADER]: JSON.stringify(stripEmpty(principal)),
  };
}

/**
 * `customerId` must be absent rather than empty for a non-portal principal:
 * the contract refuses a principal carrying a customerId it is not shaped for,
 * which is the invariant that keeps a scope from being widened by hand.
 */
function stripEmpty(principal: Principal): Principal {
  if (principal.role === 'portal') return principal;
  const { customerId: _dropped, ...rest } = principal;
  return rest;
}

async function send<T>(
  method: string,
  path: string,
  principal: Principal,
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: headers(principal),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new ApiError(response.status, parseProblem(text), `${method} ${path} → ${response.status}`);
  }
  return (text === '' ? null : JSON.parse(text)) as T;
}

function parseProblem(text: string): Problem | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && 'kind' in parsed && 'message' in parsed) {
      return parsed as Problem;
    }
  } catch {
    // Not every failure has a JSON body — a proxy error, for instance.
  }
  return null;
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const rendered = search.toString();
  return rendered === '' ? '' : `?${rendered}`;
}

export const api = {
  health: (): Promise<{ status: string; outboxPending: number }> =>
    fetch('/health').then((response) => response.json() as Promise<{ status: string; outboxPending: number }>),

  list: <T>(
    resource: Resource,
    principal: Principal,
    params: Record<string, string | number | undefined>,
  ): Promise<Page<T>> => send('GET', `/v1/${resource}${query(params)}`, principal),

  get: <T>(resource: Resource, principal: Principal, id: string): Promise<T> =>
    send('GET', `/v1/${resource}/${id}`, principal),

  create: <T>(
    resource: Resource,
    principal: Principal,
    body: unknown,
  ): Promise<T> => send('POST', `/v1/${resource}`, principal, body),

  update: <T>(
    resource: Resource,
    principal: Principal,
    id: string,
    body: unknown,
  ): Promise<T> => send('PATCH', `/v1/${resource}/${id}`, principal, body),

  /**
   * The line sub-resource. Spelled out rather than folded into the generic
   * helpers above, for the same reason the API spells it out rather than
   * bending `crudPaths`: it is not the shape every resource has.
   */
  listLines: (principal: Principal, orderId: string): Promise<unknown[]> =>
    send('GET', `/v1/work-orders/${orderId}/lines`, principal),

  addLine: <T>(principal: Principal, orderId: string, body: unknown): Promise<T> =>
    send('POST', `/v1/work-orders/${orderId}/lines`, principal, body),

  removeLine: (principal: Principal, orderId: string, lineId: string): Promise<null> =>
    send('DELETE', `/v1/work-orders/${orderId}/lines/${lineId}`, principal),
};

/**
 * Reads an SSE endpoint with `fetch` rather than `EventSource`.
 *
 * `EventSource` cannot send a custom header, and identity lives in one — so
 * the browser's built-in SSE client is unusable against an authenticated
 * stream. Reading the body as a stream and splitting frames by hand is the
 * standard way around it, and it is about thirty lines.
 *
 * Returns an abort function. `onFrame` is called per complete frame; heartbeat
 * comment frames carry no event and are skipped, which is what makes them
 * invisible to a client.
 */
export function openStream(
  resource: Resource,
  principal: Principal,
  id: string,
  lastEventId: string | null,
  onFrame: (frame: StreamFrame) => void,
  onError: (error: ApiError) => void,
): () => void {
  const controller = new AbortController();

  void (async (): Promise<void> => {
    let response: Response;
    try {
      response = await fetch(`/v1/${resource}/${id}/events`, {
        headers: {
          ...headers(principal),
          ...(lastEventId === null ? {} : { 'last-event-id': lastEventId }),
        },
        signal: controller.signal,
      });
    } catch {
      return; // aborted before the response arrived
    }

    if (!response.ok) {
      const text = await response.text();
      onError(new ApiError(response.status, parseProblem(text), `stream → ${response.status}`));
      return;
    }
    if (response.body === null) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });

        // Frames are separated by a blank line.
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const parsed = parseFrame(frame);
          if (parsed !== null) onFrame(parsed);
          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch {
      // Aborted by the caller.
    }
  })();

  return () => controller.abort();
}

function parseFrame(raw: string): StreamFrame | null {
  let id = '';
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of raw.split('\n')) {
    // A comment frame — the heartbeat. Carries no event, so a client never
    // sees it.
    if (line.startsWith(':')) continue;
    if (line.startsWith('id:')) id = line.slice(3).trim();
    else if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }

  if (dataLines.length === 0) return null;
  const body = dataLines.join('\n');
  return {
    id,
    event,
    data: safeJson(body),
    receivedAt: new Date().toISOString(),
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
