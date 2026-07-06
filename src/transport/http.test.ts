import { gunzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';

import { HttpTransport, assertSecureUrl } from './http';

describe('HttpTransport', () => {
  it('sets x-api-key header on request', async () => {
    const fetchSpy = vi.fn(async (_url: string, init: any) => {
      expect(init.headers['x-api-key']).toBe('pk_test');
      return { ok: true, status: 200, headers: { get: () => null } } as any;
    });
    (globalThis as any).fetch = fetchSpy;

    const t = new HttpTransport({ apiKey: 'pk_test', baseUrl: 'http://localhost:8080' });
    await t.sendBatch(
      [{ log_id: 'l1', timestamp_unix_ms: Date.now(), level: 'info', message: 'hi' }],
      { timeoutMs: 1000 },
    );
  });

  it('sends small batches as plain JSON without content-encoding', async () => {
    const fetchSpy = vi.fn(async (_url: string, init: any) => {
      expect(init.headers['content-encoding']).toBeUndefined();
      expect(typeof init.body).toBe('string');
      return { ok: true, status: 200, headers: { get: () => null } } as any;
    });
    (globalThis as any).fetch = fetchSpy;

    const t = new HttpTransport({ apiKey: 'pk_test', baseUrl: 'http://localhost:8080' });
    await t.sendBatch(
      [{ log_id: 'l1', timestamp_unix_ms: Date.now(), level: 'info', message: 'hi' }],
      { timeoutMs: 1000 },
    );
  });

  it('gzips large batches and sets content-encoding: gzip', async () => {
    const fetchSpy = vi.fn(async (_url: string, init: any) => {
      expect(init.headers['content-encoding']).toBe('gzip');
      expect(Buffer.isBuffer(init.body)).toBe(true);
      const decoded = JSON.parse(gunzipSync(init.body).toString('utf8'));
      expect(decoded.events).toHaveLength(1);
      expect(decoded.events[0].message).toContain('x');
      return { ok: true, status: 200, headers: { get: () => null } } as any;
    });
    (globalThis as any).fetch = fetchSpy;

    const t = new HttpTransport({ apiKey: 'pk_test', baseUrl: 'http://localhost:8080' });
    await t.sendBatch(
      [
        {
          log_id: 'l1',
          timestamp_unix_ms: Date.now(),
          level: 'info',
          message: 'x'.repeat(2000),
        },
      ],
      { timeoutMs: 1000 },
    );
  });

  it('allows plaintext http to localhost', () => {
    expect(() => new HttpTransport({ apiKey: 'pk_test', baseUrl: 'http://localhost:8080' })).not.toThrow();
    expect(() => new HttpTransport({ apiKey: 'pk_test', baseUrl: 'http://127.0.0.1:8080' })).not.toThrow();
  });

  it('refuses plaintext http to a non-local host', () => {
    expect(() => new HttpTransport({ apiKey: 'pk_test', baseUrl: 'http://collector.example.com' })).toThrow(
      /plaintext http/,
    );
  });

  it('allows plaintext http to a non-local host when explicitly opted in', () => {
    expect(
      () =>
        new HttpTransport({
          apiKey: 'pk_test',
          baseUrl: 'http://collector.example.com',
          allowInsecureHttp: true,
        }),
    ).not.toThrow();
  });

  it('allows https to any host', () => {
    expect(() => new HttpTransport({ apiKey: 'pk_test', baseUrl: 'https://collector.example.com' })).not.toThrow();
  });
});

describe('assertSecureUrl', () => {
  it('rejects unsupported protocols', () => {
    expect(() => assertSecureUrl('ftp://collector.example.com')).toThrow(/unsupported protocol/);
  });

  it('rejects invalid urls', () => {
    expect(() => assertSecureUrl('not a url')).toThrow(/invalid httpUrl/);
  });
});

