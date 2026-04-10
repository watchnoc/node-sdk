import { getClient, Context } from '../index.js';
import { stripBindings, extractOperation, extractTable } from './db-utils.js';
import { trackForNPlusOne } from './nplusone.js';

export function instrumentPrisma(prisma: any): any {
  prisma.$on('query', (e: any) => {
    const ctx = Context.get();
    const client = getClient();
    const cfg = client.getConfig();

    const sqlSafe = stripBindings(e.query);
    const table = extractTable(e.query);
    const operation = extractOperation(e.query);
    const duration = e.duration;

    client.info('db.query', {
      sql: sqlSafe,
      duration_ms: duration,
      operation,
      table,
      params: '[REDACTED]',
      slow: duration > cfg.slowQueryMs,
      orm: 'prisma',
      request_id: ctx?.requestId,
      session_id: ctx?.sessionId,
    });

    if (duration > cfg.slowQueryMs) {
      client.warn('db.slow_query', {
        sql: sqlSafe,
        duration_ms: duration,
        threshold_ms: cfg.slowQueryMs,
        orm: 'prisma',
        request_id: ctx?.requestId,
      });
    }

    if (ctx?.requestId) {
      trackForNPlusOne({
        requestId: ctx.requestId,
        collection: table,
        filter: sqlSafe,
        commandName: operation,
        duration,
        threshold: cfg.nPlusOneThreshold,
        orm: 'prisma',
      });
    }
  });

  return prisma;
}
