import { describe, expect, it, vi } from 'vitest';

import { HttpTransport } from './http';

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
});

