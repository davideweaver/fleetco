import type { DynamicModule, NestApplicationOptions } from '@nestjs/common';

import { loadConfig } from '../../config';

/**
 * NestJS Observe, wired for **evaluation only**.
 *
 * Everything here is inert unless `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET`
 * are set, so the test suite, CI and a local run without an account behave
 * exactly as they did before the dependency was added. That is deliberate:
 * this is a spike of a third-party service, and the spike must not become
 * load-bearing before the decision is made.
 *
 * ---------------------------------------------------------------------------
 * What this is NOT
 * ---------------------------------------------------------------------------
 *
 * `@nestjs/observe` is not an OpenTelemetry distribution. Its only runtime
 * dependency is `@jridgewell/trace-mapping` (source maps), and there is no
 * OTLP exporter anywhere in it. Custom instrumentation written against its
 * `TracerService` is therefore vendor-specific, which is why nothing in this
 * codebase calls `TracerService` directly — see the note at the bottom.
 *
 * It *is* repointable: `endpoint` (or `OBSERVE_ENDPOINT`) aims the SDK at a
 * different collector, which the SDK's own docs describe as how a self-hosted
 * collector is used. So the exit path is "speak their ingest protocol", not
 * "swap an OTLP endpoint" — a narrower escape hatch than OTel, but not a
 * closed box.
 *
 * ---------------------------------------------------------------------------
 * Why this is initialised asynchronously
 * ---------------------------------------------------------------------------
 *
 * `@nestjs/observe` is published `"type": "module"` with no CommonJS build.
 * This application is CommonJS, because Nest's `emitDecoratorMetadata` wants
 * CJS emit (NOTES.md § 2.3). A static `import` therefore fails to compile:
 *
 *     TS1479: ... the referenced file is an ECMAScript module and cannot be
 *     imported with 'require'.
 *
 * A dynamic `import()` bridges it — verified working from compiled CJS output
 * — but it is async, and `createObserveModule()` has to run *before*
 * `AppModule`'s decorator is evaluated. So `main.ts` awaits `initObserve()`
 * and then imports `AppModule` dynamically. That is the whole cost of the
 * mismatch, and it is confined to bootstrap.
 */

type Created = {
  readonly ObserveInstrument: NestApplicationOptions['instrument'];
  readonly ObserveModule: {
    forRoot: (options: {
      appKey: string;
      appSecret: string;
      serviceId: string;
      endpoint?: string;
    }) => DynamicModule;
  };
};

let created: Created | null = null;

/**
 * Must be awaited before `AppModule` is imported. A no-op without credentials.
 */
export async function initObserve(): Promise<void> {
  const config = loadConfig();
  if (config.OBSERVE_APP_KEY === undefined || config.OBSERVE_APP_SECRET === undefined) {
    return;
  }

  const { createObserveModule } = await import('@nestjs/observe');

  created = createObserveModule({
    /**
     * Honour an inbound `x-request-id` and mint a UUIDv7 otherwise. This is
     * the SDK default, restated because it happens to satisfy the P0
     * "request ID propagation" item in [[Infrastructure Checklist]] and that
     * should not be an accident of a vendor default.
     */
    attachTraceIdToLogs: true,

    /**
     * OFF for the evaluation.
     *
     * With `sourceContext` on (the SDK default) fragments of application
     * source are shipped to the Observe server and stored alongside each
     * error. That is a genuinely useful feature and a genuine disclosure, and
     * it is not a decision to make by leaving a default alone — particularly
     * before a DPA exists. Turn it on deliberately, or not at all.
     */
    sourceContext: false,

    /**
     * The outbox dispatcher polls every `OUTBOX_POLL_MS` (200ms by default),
     * which is ~13M job runs a month with nobody using the system. Billing is
     * per observability event, so instrumenting it as-is would consume a
     * plan's entire allowance on an idle service.
     *
     * Excluded here so the evaluation measures *request* volume rather than
     * poll volume. Note the trade: dispatcher **errors** stop being reported
     * too, so if Observe were adopted this would need replacing with a
     * sampled span plus an explicit failure counter, not a blanket skip.
     */
    skipInstrumentation: (instance: unknown): boolean =>
      instance !== null &&
      instance !== undefined &&
      instance.constructor.name === 'OutboxDispatcher',
  });
}

/** `imports: [...observeImports()]` — empty when the SDK is not configured. */
export function observeImports(): DynamicModule[] {
  const active = created;
  if (active === null) return [];
  const config = loadConfig();
  if (config.OBSERVE_APP_KEY === undefined || config.OBSERVE_APP_SECRET === undefined) return [];

  return [
    active.ObserveModule.forRoot({
      appKey: config.OBSERVE_APP_KEY,
      appSecret: config.OBSERVE_APP_SECRET,
      serviceId: config.OBSERVE_SERVICE_ID,
      ...(config.OBSERVE_ENDPOINT === undefined ? {} : { endpoint: config.OBSERVE_ENDPOINT }),
    }),
  ];
}

/** Passed to `NestFactory.create`; `undefined` when the SDK is not configured. */
export function observeInstrument(): NestApplicationOptions['instrument'] | undefined {
  return created?.ObserveInstrument;
}

/** Whether telemetry is actually being shipped — reported by `/health`. */
export function observeEnabled(): boolean {
  return created !== null;
}

/*
 * A note for whoever adds custom metrics.
 *
 * Do NOT inject `TracerService` into a service. Every such call is a line that
 * has to be rewritten if this vendor is replaced, and the whole reason the
 * auto-instrumentation above is cheap to abandon is that it touches no
 * application code. Put custom spans and counters behind a `Telemetry` port of
 * our own — the same shape as the AuthN port in ADR-012 — and make this SDK
 * one adapter behind it.
 */
