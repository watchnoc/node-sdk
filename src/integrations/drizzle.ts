import { getClient, Context } from '../index.js';
import { stripBindings, extractOperation, extractTable } from './db-utils.js';
import { trackForNPlusOne } from './nplusone.js';

export const WatchnocDrizzleLogger = {
  logQuery(query: string, _params: any[]) {
    const start = performance.now();
    return (result: any) => {
      const duration = performance.now() - start;
      const ctx = Context.get();
      const client = getClient();
      const cfg = client.getConfig();

      const sqlSafe = stripBindings(query);
      const table = extractTable(query);
      const operation = extractOperation(query);

      client.info('db.query', {
        sql: sqlSafe,
        duration_ms: Math.round(duration),
        operation,
        table,
        slow: duration > cfg.slowQueryMs,
        orm: 'drizzle',
        request_id: ctx?.requestId,
        session_id: ctx?.sessionId,
        rows_returned: (result as any)?.rowCount ?? 0,
      });

      if (duration > cfg.slowQueryMs) {
        client.warn('db.slow_query', {
          sql: sqlSafe,
          duration_ms: Math.round(duration),
          threshold_ms: cfg.slowQueryMs,
          orm: 'drizzle',
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
          orm: 'drizzle',
        });
      }
    };
  },
};
