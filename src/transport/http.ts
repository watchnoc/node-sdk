import { WatchnocError } from '../core/errors.js';
import type { LogEvent } from '../core/event.js';

import type { SendOptions, Transport } from './interface.js';
import { getFetch } from './fetch.js';
import { compressJsonBody } from './compress.js';

export type HttpTransportOptions = {
  apiKey: string;
  baseUrl: string;
  allowInsecureHttp?: boolean;
};

export class HttpTransport implements Transport {
  readonly name = 'http' as const;

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts: HttpTransportOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    assertSecureUrl(this.baseUrl, opts.allowInsecureHttp);
  }

  async sendBatch(events: LogEvent[], opts: SendOptions): Promise<void> {
    if (events.length === 0) return;
    const url = `${this.baseUrl}/api/v1/ingest/logs`;
    const bodyEvents = events.map((e) => ({ ...e, ingestion_type: 'http' }));
    const { body, headers } = compressJsonBody({ logs: bodyEvents });
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { ...headers, 'x-api-key': this.apiKey },
        body,
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
            headers: { ...headers, 'x-api-key': this.apiKey },
            body,
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

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Refuses to ship telemetry (including the API key, in the x-api-key header)
 * over plaintext HTTP to a non-local host. Loopback addresses are allowed
 * unencrypted for local development against a local collector.
 */
export function assertSecureUrl(rawUrl: string, allowInsecureHttp?: boolean): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (err) {
    throw new WatchnocError('config', `invalid httpUrl: ${rawUrl}`, err);
  }

  if (parsed.protocol === 'https:') return;
  if (parsed.protocol !== 'http:') {
    throw new WatchnocError('config', `unsupported protocol in httpUrl: ${parsed.protocol}`);
  }
  if (allowInsecureHttp) return;
  if (LOCAL_HOSTNAMES.has(parsed.hostname.toLowerCase())) return;

  throw new WatchnocError(
    'config',
    `refusing to send data over plaintext http:// to non-local host "${parsed.hostname}"; ` +
      'use https:// or set allowInsecureHttp: true to override',
  );
}
