import { expect } from 'vitest';

import { documentedOperations } from '../openapi/document';
import { headersFor } from './harness';
import type { RunningApp } from './harness';
import type { Principal } from '../types/principal';

/**
 * Shared machinery for the per-module leak suites.
 *
 * Extracted when the second module arrived and not before — "no abstraction
 * until there are two real call sites" ([[Code Standards and Guardrails]]).
 * Every function here was previously a private helper inside
 * `modules/customers/__tests__/leak.test.ts`; the only change is that the ones
 * that closed over the running app now take it as an argument.
 */

export function request(
  app: RunningApp,
  method: string,
  path: string,
  principal: Principal,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${app.baseUrl}${path}`, {
    method,
    headers: { ...headersFor(principal), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/**
 * The documented operations belonging to one module, keyed by its path prefix.
 *
 * This exists because the coverage assertion has to be per-module now. When
 * there was one module, "my probes cover every documented operation" was the
 * same statement as "the application's whole surface is covered". With two,
 * that assertion in either module fails because of the *other* module's
 * routes, so each suite claims only its own prefix — and
 * `platform/__tests__/leak.test.ts` makes the app-wide claim that nothing is
 * left over.
 */
export function operationsUnder(prefix: string): string[] {
  return documentedOperations().filter((operation) => operation.split(' ')[1]?.startsWith(prefix));
}

export type OpenStream = { text: () => string; close: () => void };

/** Opens an SSE connection and accumulates raw frames until closed. */
export async function openSse(
  app: RunningApp,
  path: string,
  principal: Principal,
  lastEventId?: string,
): Promise<OpenStream> {
  const controller = new AbortController();
  const response = await fetch(`${app.baseUrl}${path}`, {
    headers: {
      ...headersFor(principal),
      ...(lastEventId === undefined ? {} : { 'last-event-id': lastEventId }),
    },
    signal: controller.signal,
  });
  if (response.body === null) throw new Error(`no stream body for ${path}`);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/event-stream');

  const chunks: string[] = [];
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  void (async (): Promise<void> => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        chunks.push(decoder.decode(value, { stream: true }));
      }
    } catch {
      // Aborted by `close()`.
    }
  })();

  return {
    text: () => chunks.join(''),
    close: () => controller.abort(),
  };
}

/**
 * Nest's registered routes, as `METHOD /path` with OpenAPI path templates, so
 * they can be compared with the generated document. `/health`, `/ready` and
 * `/metrics` are excluded: infrastructure read by the load balancer and the
 * scraper, carrying no tenant data, deliberately outside the public
 * contract.
 */
export function registeredOperations(app: RunningApp): string[] {
  const instance: unknown = app.app.getHttpAdapter().getInstance();
  const stack = routerStack(instance);
  const operations: string[] = [];

  for (const layer of stack) {
    const route = layer.route;
    if (route === undefined) continue;
    const path = route.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
    // Infrastructure routes, deliberately outside the tenant contract: read
    // by the load balancer and the metrics scraper, carrying no tenant data.
    if (INFRA_ROUTES.some((prefix) => path.startsWith(prefix))) continue;
    for (const [method, enabled] of Object.entries(route.methods)) {
      if (enabled) operations.push(`${method.toUpperCase()} ${path}`);
    }
  }
  if (operations.length === 0) {
    throw new Error('could not read the router — the suite would pass vacuously');
  }
  return operations;
}

export const INFRA_ROUTES = ['/health', '/ready', '/metrics'] as const;

type RouterLayer = { route?: { path: string; methods: Record<string, boolean> } };

/** Express 5 exposes `router`; Express 4 exposed `_router`. Support both. */
function routerStack(instance: unknown): RouterLayer[] {
  if (instance === null || (typeof instance !== 'object' && typeof instance !== 'function')) {
    return [];
  }
  const candidates = ['router', '_router'] as const;
  for (const key of candidates) {
    if (!(key in instance)) continue;
    const router: unknown = Reflect.get(instance, key);
    // An Express router is a *function* with a `stack` property, not a plain
    // object — the kind of detail that makes router introspection a poor
    // foundation, as NOTES.md says.
    if (router === null || (typeof router !== 'object' && typeof router !== 'function')) continue;
    if (!('stack' in router)) continue;
    const stack: unknown = Reflect.get(router, 'stack');
    if (Array.isArray(stack)) return stack as RouterLayer[];
  }
  return [];
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
