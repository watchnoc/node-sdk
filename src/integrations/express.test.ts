import { describe, expect, it } from 'vitest';

import { WatchnocContextStore } from '../context';
import { WatchnocExpressMiddleware } from './express';

describe('WatchnocExpressMiddleware', () => {
  it('sets requestId from header and stores it in context', () => {
    const mw = WatchnocExpressMiddleware();

    const req: any = { headers: { 'x-request-id': 'req_123' } };
    const res: any = {
      headers: {} as Record<string, string>,
      setHeader(k: string, v: string) {
        this.headers[k] = v;
      },
    };

    mw(req, res, () => {
      expect(WatchnocContextStore.get().requestId).toBe('req_123');
    });

    expect(res.headers['x-request-id']).toBe('req_123');
  });
});

