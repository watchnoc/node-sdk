import { getClient, Context } from '../index.js';
import { stripBindings, extractOperation, extractTable } from './db-utils.js';
import { trackForNPlusOne } from './nplusone.js';

export class WatchnocTypeORMLogger {
  logQuery(query: string, _parameters?: any[], _queryRunner?: any) {
    // TypeORM does not provide duration in the logQuery method
    // In practice, this would require deeper integration into TypeORM's
    // QueryRunner. For now, we capture simple query info.
    const ctx = Context.get();
    const client = getClient();
    const sqlSafe = stripBindings(query);
    const table = extractTable(query);
    const operation = extractOperation(query);

    client.info('db.query', {
      sql: sqlSafe,
      operation,
      table,
      orm: 'typeorm',
      request_id: ctx?.requestId,
      session_id: ctx?.sessionId,
    });
  }

  logQuerySlow(time: number, query: string, _parameters?: any[]) {
    const ctx = Context.get();
    const client = getClient();
    const sqlSafe = stripBindings(query);
    const table = extractTable(query);
    const operation = extractOperation(query);

    client.warn('db.slow_query', {
      sql: sqlSafe,
      duration_ms: time,
      operation,
      table,
      orm: 'typeorm',
      request_id: ctx?.requestId,
      session_id: ctx?.sessionId,
    });

    if (ctx?.requestId) {
      const cfg = client.getConfig();
      trackForNPlusOne({
        requestId: ctx.requestId,
        collection: table,
        filter: sqlSafe,
        commandName: operation,
        duration: time,
        threshold: cfg.nPlusOneThreshold,
        orm: 'typeorm',
      });
    }
  }

  logQueryError(error: string, query: string, _parameters?: any[]) {
    const client = getClient();
    client.captureException(new Error(error), {
      sql: stripBindings(query),
      orm: 'typeorm',
      source: 'typeorm',
    });
  }

  // Required by interface but not useful for Watchnoc
  logSchemaBuild(_message: string) {}
  logMigration(_message: string) {}
  log(_level: 'log' | 'info' | 'warn', _message: any) {}
}
