import { WatchnocContextStore, generateRequestId, parseTraceparent } from '../../core/context.js';

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
    const requestId = req.headers['x-request-id'] ?? generateRequestId();
    const sessionId = req.headers['x-session-id'];
    const tp = req.headers['traceparent'];
    const trace = typeof tp === 'string' ? parseTraceparent(tp) : null;

    reply.header('x-request-id', requestId);

    WatchnocContextStore.run(
      {
        requestId: typeof requestId === 'string' ? requestId : String(requestId),
        sessionId: typeof sessionId === 'string' ? sessionId : undefined,
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

