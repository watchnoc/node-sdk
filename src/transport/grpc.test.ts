import { describe, expect, it } from 'vitest';

import { GrpcTransport } from './grpc';

describe('GrpcTransport', () => {
  it('sets x-api-key metadata on stream', async () => {
    const state: { md: any | null; writes: any[] } = { md: null, writes: [] };
    const fakeClient = {
      waitForReady(_deadline: Date, cb: (err?: any) => void) {
        cb(null);
      },
      sendLogs(md: any, _cb: any) {
        state.md = md;
        return {
          write(m: any) {
            state.writes.push(m);
            return true;
          },
          end() {},
          on() {
            return this;
          },
        } as any;
      },
      close() {},
    };

    const t = new GrpcTransport({ apiKey: 'pk_test', addr: 'localhost:50051', client: fakeClient });
    await t.sendBatch(
      [
        {
          log_id: 'l1',
          timestamp_unix_ms: Date.now(),
          level: 'info',
          message: 'hi',
        },
      ],
      { timeoutMs: 1000 },
    );

    expect(state.md).toBeTruthy();
    expect(state.md.get('x-api-key')[0]).toBe('pk_test');
    expect(state.writes.length).toBe(1);
  });
});
