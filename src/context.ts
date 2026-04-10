import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, randomUUID } from 'node:crypto';

export type WatchnocContext = {
  requestId?: string;
  sessionId?: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  querySource?: string;
  environment?: string;
  release?: string;
};

const storage = new AsyncLocalStorage<WatchnocContext>();

export const WatchnocContextStore = {
  run<T>(ctx: WatchnocContext, fn: () => T): T {
    const parent = storage.getStore() ?? {};
    return storage.run({ ...parent, ...ctx }, fn);
  },

  set(ctx: WatchnocContext): void {
    const store = storage.getStore();
    if (store) {
      Object.assign(store, ctx);
    } else {
      storage.enterWith({ ...ctx });
    }
  },

  get(): WatchnocContext {
    return storage.getStore() ?? {};
  },

  clear(): void {
    const store = storage.getStore();
    if (store) {
      for (const key in store) {
        delete (store as any)[key];
      }
    }
  },

  setUserId(userId: string): void {
    const store = storage.getStore();
    if (store) {
      store.userId = userId;
    } else {
      storage.enterWith({ userId });
    }
  },

  setSessionId(sessionId: string): void {
    const store = storage.getStore();
    if (store) {
      store.sessionId = sessionId;
    } else {
      storage.enterWith({ sessionId });
    }
  },

  getSessionId(): string | undefined {
    return storage.getStore()?.sessionId;
  },
};



export function parseTraceparent(traceparent: string): { traceId: string; spanId: string } | null {
  const v = (traceparent ?? '').trim();
  const parts = v.split('-');
  if (parts.length !== 4) return null;
  const traceId = parts[1];
  const spanId = parts[2];
  if (!/^[0-9a-f]{32}$/i.test(traceId)) return null;
  if (!/^[0-9a-f]{16}$/i.test(spanId)) return null;
  return { traceId: traceId.toLowerCase(), spanId: spanId.toLowerCase() };
}

export function generateRequestId(): string {
  try {
    return randomUUID();
  } catch {
    return randomBytes(16).toString('hex');
  }
}

export function generateSessionId(): string {
  return generateRequestId();
}

/**
 * Returns traceparent and other headers for propagating context
 */
export function getTraceHeaders(): Record<string, string> {
  const ctx = WatchnocContextStore.get();
  const headers: Record<string, string> = {};
  
  if (ctx.traceId && ctx.spanId) {
    headers['traceparent'] = `00-${ctx.traceId}-${ctx.spanId}-01`;
  }
  if (ctx.requestId) {
    headers['x-request-id'] = ctx.requestId;
  }
  if (ctx.sessionId) {
    headers['x-session-id'] = ctx.sessionId;
  }
  
  return headers;
}

