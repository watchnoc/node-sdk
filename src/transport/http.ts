import { WatchnocError } from '../core/errors.js';
import type { LogEvent } from '../core/event.js';

import type { SendOptions, Transport } from './interface.js';
import { getFetch } from './fetch.js';

export type HttpTransportOptions = {
  apiKey: string;
  baseUrl: string;
};

export class HttpTransport implements Transport {
  readonly name = 'http' as const;

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts: HttpTransportOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
  }

  async sendBatch(events: LogEvent[], opts: SendOptions): Promise<void> {
    if (events.length === 0) return;
    const url = `${this.baseUrl}/v1/logs/batch`;
    const bodyEvents = events.map((e) => ({ ...e, ingestion_type: 'http' }));
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify({ events: bodyEvents }),
      },
      opts.timeoutMs,
    );

    if (res.ok) return;

    const status = res.status;
    if (status === 401 || status === 403) throw new WatchnocError('auth', 'authentication failed');
    if (status === 429) {
      const ra = res.headers.get('retry-after');
      const waitMs = parseRetryAfterMs(ra);
      if (waitMs !== null) {
        await delay(Math.min(waitMs, opts.timeoutMs));
        const retry = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-api-key': this.apiKey,
            },
            body: JSON.stringify({ events: bodyEvents }),
          },
          opts.timeoutMs,
        );
        if (retry.ok) return;
      }
      throw new WatchnocError('rate_limit', 'rate limited');
    }
    if (status >= 400 && status < 500) throw new WatchnocError('validation', `invalid request (${status})`);
    if (status >= 500) throw new WatchnocError('server', `server error (${status})`);
    throw new WatchnocError('unknown', `unexpected response (${status})`);
  }

  async shutdown(): Promise<void> {}
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  t.unref?.();

  try {
    const f = getFetch();
    return await f(input, { ...init, signal: controller.signal });
  } catch (err) {
    throw new WatchnocError('network', 'network error', err);
  } finally {
    clearTimeout(t);
  }
}

function parseRetryAfterMs(v: string | null): number | null {
  if (!v) return null;
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n) && n >= 0) return Math.floor(n * 1000);
  const d = Date.parse(s);
  if (!Number.isNaN(d)) return Math.max(0, d - Date.now());
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
