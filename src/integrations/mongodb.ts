import { getClient, Context } from '../index.js';
import { sanitizeFilter } from './db-utils.js';
import { trackForNPlusOne } from './mongodb-nplus1.js';

export interface WatchnocMongoConfig {
  slowQueryMs?: number;
  captureFilter?: boolean;
  ignoredCommands?: string[];
  nPlusOneThreshold?: number;
}

const inFlight = new Map<
  number,
  {
    startedAt: number;
    commandName: string;
    collection: string;
    filter: string;
    requestId: string;
    sessionId: string;
  }
>();

export function instrumentMongoDB(client: any, config: WatchnocMongoConfig = {}): any {
  const pClient = getClient();
  const baseCfg = pClient.getConfig();

  const cfg = {
    slowQueryMs: config.slowQueryMs ?? baseCfg.slowQueryMs,
    captureFilter: config.captureFilter ?? true,
    ignoredCommands: config.ignoredCommands ?? ['ping', 'hello', 'buildInfo', 'endSessions', 'isMaster'],
    nPlusOneThreshold: config.nPlusOneThreshold ?? baseCfg.nPlusOneThreshold,
  };

  client.on('commandStarted', (event: any) => {
    if (cfg.ignoredCommands.includes(event.commandName)) return;

    const ctx = Context.get();
    const filter = cfg.captureFilter ? sanitizeFilter(event.command) : '[disabled]';
    const filterStr = JSON.stringify(filter);

    inFlight.set(event.requestId, {
      startedAt: Date.now(),
      commandName: event.commandName,
      collection: extractCollection(event),
      filter: filterStr,
      requestId: ctx?.requestId ?? '',
      sessionId: ctx?.sessionId ?? '',
    });
  });

  client.on('commandSucceeded', (event: any) => {
    const started = inFlight.get(event.requestId);
    if (!started) return;
    inFlight.delete(event.requestId);

    const duration = event.duration;

    pClient.info('db.query', {
      status: 'success',
      commandName: started.commandName,
      collection: started.collection,
      filter: started.filter,
      duration_ms: duration,
      docs_returned: extractDocsReturned(event.reply),
      docs_modified: extractDocsModified(event.reply),
      request_id: started.requestId,
      session_id: started.sessionId,
      slow: duration > cfg.slowQueryMs,
      orm: 'mongodb',
    });

    if (duration > cfg.slowQueryMs) {
      pClient.warn('db.slow_query', {
        commandName: started.commandName,
        collection: started.collection,
        filter: started.filter,
        duration_ms: duration,
        threshold_ms: cfg.slowQueryMs,
        request_id: started.requestId,
        orm: 'mongodb',
      });
    }

    if (started.requestId) {
      trackForNPlusOne(
        started.requestId,
        started.collection,
        started.filter,
        started.commandName,
        duration,
        cfg.nPlusOneThreshold,
      );
    }
  });

  client.on('commandFailed', (event: any) => {
    const started = inFlight.get(event.requestId);
    if (!started) return;
    inFlight.delete(event.requestId);

    pClient.captureException(event.failure as Error, {
      source: 'mongodb',
      commandName: started.commandName,
      collection: started.collection,
      filter: started.filter,
      duration_ms: event.duration,
      request_id: started.requestId,
      orm: 'mongodb',
    });
  });

  client.on('connectionCheckOutFailed', (event: any) => {
    pClient.warn('mongodb.pool_checkout_failed', {
      reason: event.reason,
      source: 'mongodb',
    });

    if (event.reason === 'timeout') {
      pClient.error('mongodb.pool_exhausted', {
        message: 'MongoDB connection pool timed out — pool may be exhausted',
        source: 'mongodb',
      });
    }
  });

  return client;
}

function extractCollection(event: any): string {
  return event.command.collection || event.command[event.commandName] || 'unknown';
}

function extractDocsReturned(reply: any): number {
  if (reply.cursor && reply.cursor.firstBatch) return reply.cursor.firstBatch.length;
  if (reply.cursor && reply.cursor.nextBatch) return reply.cursor.nextBatch.length;
  return reply.n || 0;
}

function extractDocsModified(reply: any): number {
  return reply.nModified || reply.nUpserted || reply.nRemoved || 0;
}
