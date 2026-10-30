import { Injectable } from '@nestjs/common';
import { finalize } from 'rxjs';
import type { MonoTypeOperatorFunction } from 'rxjs';

/**
 * The `Telemetry` port (ADR-028).
 *
 * Application code emits metrics through this interface and never through a
 * vendor SDK. That is the whole reason it exists: auto-instrumentation is free
 * to abandon because it touches no application code, but *custom* metrics are
 * the lines that would otherwise have to be rewritten for every vendor. One
 * adapter changes, nothing else does.
 *
 * Two kinds of measurement, because they are collected differently:
 *
 *  - **Pushed** — counters and gauges the code sets as things happen. A
 *    dispatch completes, a stream opens. Cheap, in-memory, no I/O.
 *  - **Collected** — values only knowable by asking the database, like the
 *    outbox backlog. Running those on every state change would be absurd, so
 *    they are registered as functions and called at scrape time instead.
 *
 * The exposition format is Prometheus text, which is the neutral interchange
 * both candidate backends in ADR-028 read: Grafana Alloy scrapes it directly,
 * and the CloudWatch agent ingests it natively. Choosing it now does not
 * choose a vendor.
 */
export type Labels = Readonly<Record<string, string>>;

export type Telemetry = {
  /** Monotonic count of things that happened. */
  counter: (name: string, delta?: number, labels?: Labels) => void;
  /** A value that goes up and down. */
  gauge: (name: string, value: number, labels?: Labels) => void;
  /**
   * Registers a value that has to be fetched when asked for — a database
   * count, a queue depth. Called on every scrape, so it must be cheap.
   */
  collect: (name: string, help: string, fn: () => Promise<Metric[]>) => void;
  /** Tracks an observable's open/close as a gauge — see `trackStream`. */
  trackStream: <T>(name: string, labels?: Labels) => MonoTypeOperatorFunction<T>;
};

export type Metric = { readonly value: number; readonly labels?: Labels };

export const TELEMETRY = Symbol('TELEMETRY');

type Series = { readonly help: string; readonly type: 'counter' | 'gauge'; readonly points: Map<string, Metric> };

/**
 * The in-memory adapter. Holds current values and renders them on demand.
 *
 * Deliberately not a vendor client: for a single deployable scraped every 15
 * seconds, pushing to an API would add a network dependency to the act of
 * measuring. A scrape endpoint also means the metrics are readable with
 * `curl` during an incident, with no dashboard and no credentials.
 */
@Injectable()
export class InMemoryTelemetry implements Telemetry {
  private readonly series = new Map<string, Series>();
  private readonly collectors = new Map<string, { help: string; fn: () => Promise<Metric[]> }>();

  counter(name: string, delta = 1, labels: Labels = {}): void {
    const series = this.seriesFor(name, 'counter', '');
    const key = keyOf(labels);
    const current = series.points.get(key)?.value ?? 0;
    series.points.set(key, { value: current + delta, labels });
  }

  gauge(name: string, value: number, labels: Labels = {}): void {
    const series = this.seriesFor(name, 'gauge', '');
    series.points.set(keyOf(labels), { value, labels });
  }

  collect(name: string, help: string, fn: () => Promise<Metric[]>): void {
    this.collectors.set(name, { help, fn });
  }

  /**
   * Increments a gauge while the stream is subscribed and decrements when it
   * ends, however it ends — completion, error, or the client simply going
   * away. `finalize` is what makes the third case work, and the third case is
   * the only one that actually happens to an SSE connection.
   */
  trackStream<T>(name: string, labels: Labels = {}): MonoTypeOperatorFunction<T> {
    return (source) => {
      this.adjust(name, 1, labels);
      return source.pipe(
        finalize(() => {
          this.adjust(name, -1, labels);
        }),
      );
    };
  }

  /** Prometheus text exposition. */
  async render(): Promise<string> {
    const lines: string[] = [];

    for (const [name, series] of this.series) {
      if (series.help !== '') lines.push(`# HELP ${name} ${series.help}`);
      lines.push(`# TYPE ${name} ${series.type}`);
      for (const point of series.points.values()) {
        lines.push(`${name}${renderLabels(point.labels)} ${point.value}`);
      }
    }

    for (const [name, collector] of this.collectors) {
      lines.push(`# HELP ${name} ${collector.help}`);
      lines.push(`# TYPE ${name} gauge`);
      // A failing collector must not take down the whole scrape: a database
      // blip would otherwise hide every other metric at exactly the moment
      // they are being looked at.
      try {
        for (const point of await collector.fn()) {
          lines.push(`${name}${renderLabels(point.labels)} ${point.value}`);
        }
      } catch {
        lines.push(`${name}_collect_failed 1`);
      }
    }

    return `${lines.join('\n')}\n`;
  }

  private adjust(name: string, delta: number, labels: Labels): void {
    const series = this.seriesFor(name, 'gauge', '');
    const key = keyOf(labels);
    const current = series.points.get(key)?.value ?? 0;
    series.points.set(key, { value: current + delta, labels });
  }

  private seriesFor(name: string, type: 'counter' | 'gauge', help: string): Series {
    const existing = this.series.get(name);
    if (existing !== undefined) return existing;
    const created: Series = { help, type, points: new Map() };
    this.series.set(name, created);
    return created;
  }
}

function keyOf(labels: Labels): string {
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k] ?? ''}`)
    .join(',');
}

function renderLabels(labels: Labels | undefined): string {
  if (labels === undefined) return '';
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  const rendered = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    .join(',');
  return `{${rendered}}`;
}
