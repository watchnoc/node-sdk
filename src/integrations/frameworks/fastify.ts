import {
  WatchnocContextStore,
  generateRequestId,
  parseTraceparent,
  sanitizeExternalId,
} from '../../core/context.js';

export type FastifyPluginOptions = {
  environment?: string;
  release?: string;
};

export function WatchnocFastifyPlugin(
  fastify: any,
  opts: FastifyPluginOptions = {},
  done: (err?: Error) => void,
) {
  fastify.addHook('onRequest', (req: any, reply: any, next: any) => {
    const requestId =
      sanitizeExternalId(typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : undefined) ??
      generateRequestId();
    const sessionId = sanitizeExternalId(
      typeof req.headers['x-session-id'] === 'string' ? req.headers['x-session-id'] : undefined,
    );
    const tp = req.headers['traceparent'];
    const trace = typeof tp === 'string' ? parseTraceparent(tp) : null;

    reply.header('x-request-id', requestId);

    WatchnocContextStore.run(
      {
        requestId,
        sessionId,
        traceId: trace?.traceId,
        spanId: trace?.spanId,
        environment: opts.environment ?? process.env.WATCHNOC_ENVIRONMENT,
        release: opts.release ?? process.env.WATCHNOC_RELEASE,
      },
      () => next(),
    );
  });

  done();
}

