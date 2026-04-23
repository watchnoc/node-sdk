import { getClient, Context } from '../../index.js';
import { stripBindings, extractOperation, extractTable } from '../common/db-utils.js';
import { trackForNPlusOne } from '../common/nplusone.js';

export function instrumentPg(pool: any): any {
  const originalConnect = pool.connect.bind(pool);

  pool.connect = async (...args: any[]) => {
    const client = await originalConnect(...args);
    const originalQuery = client.query.bind(client);

    client.query = async (text: any, values?: any) => {
      const start = performance.now();
      const sqlText = typeof text === 'string' ? text : text?.text;
      const sqlSafe = stripBindings(sqlText);
      const table = extractTable(sqlText);
      const operation = extractOperation(sqlText);

      try {
        const result = await originalQuery(text, values);
        const duration = performance.now() - start;
        const ctx = Context.get();
        const pClient = getClient();
        const cfg = pClient.getConfig();

        pClient.info('db.query', {
          sql: sqlSafe,
          duration_ms: Math.round(duration),
          rows_returned: result.rowCount ?? 0,
          operation,
          table,
          slow: duration > cfg.slowQueryMs,
          orm: 'pg',
          request_id: ctx?.requestId,
          session_id: ctx?.sessionId,
        });

        if (duration > cfg.slowQueryMs) {
          pClient.warn('db.slow_query', {
            sql: sqlSafe,
            duration_ms: Math.round(duration),
            threshold_ms: cfg.slowQueryMs,
            orm: 'pg',
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
            orm: 'pg',
          });
        }

        return result;
      } catch (err) {
        const pClient = getClient();
        pClient.captureException(err as Error, {
          sql: sqlSafe || '[complex query]',
          orm: 'pg',
          source: 'pg',
        });
        throw err;
      }
    };

    return client;
  };

  return pool;
}
