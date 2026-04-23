import { WatchnocContextStore, generateRequestId, parseTraceparent } from '../../core/context.js';

export type NestMiddlewareOptions = {
  environment?: string;
  release?: string;
};

export class WatchnocMiddleware {
  private readonly opts: NestMiddlewareOptions;

  constructor(opts: NestMiddlewareOptions = {}) {
    this.opts = opts;
  }

  use(req: any, res: any, next: any) {
    const requestId = header(req, 'x-request-id') ?? generateRequestId();
    const sessionId = header(req, 'x-session-id') ?? undefined;
    const tp = header(req, 'traceparent');
    const trace = tp ? parseTraceparent(tp) : null;

    if (res?.setHeader) {
      res.setHeader('x-request-id', requestId);
    }

    WatchnocContextStore.run(
      {
        requestId,
        sessionId,
        traceId: trace?.traceId,
        spanId: trace?.spanId,
        environment: this.opts.environment ?? process.env.WATCHNOC_ENVIRONMENT,
        release: this.opts.release ?? process.env.WATCHNOC_RELEASE,
      },
      () => next(),
    );
  }
}

function header(req: any, name: string): string | null {
  const h = req?.headers;
  if (!h) return null;
  const v = h[name] ?? h[name.toLowerCase()] ?? h[name.toUpperCase()];
  if (Array.isArray(v)) return v[0] ?? null;
  if (typeof v === 'string') return v;
  return null;
}

