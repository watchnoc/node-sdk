import type { IncomingMessage, ServerResponse } from 'http';

import { WatchnocContextStore, generateRequestId, parseTraceparent } from '../../core/context.js';

export function WatchnocHttpHandler(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? generateRequestId();
    const sessionId = req.headers['x-session-id'] as string | undefined;
    const tp = req.headers['traceparent'] as string | undefined;
    const trace = tp ? parseTraceparent(tp) : null;

    res.setHeader('x-request-id', requestId);

    WatchnocContextStore.run(
      { requestId, sessionId, traceId: trace?.traceId, spanId: trace?.spanId },
      () => handler(req, res),
    );
  };
}

