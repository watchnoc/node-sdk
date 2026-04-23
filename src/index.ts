import { WatchnocClient, type WatchnocClientOptions } from './core/client.js';
import type { LogMeta as Meta } from './core/event.js';

let defaultClient: WatchnocClient | null = null;

export function createClient(config: WatchnocClientOptions): WatchnocClient {
  return new WatchnocClient(config);
}

export function init(config: WatchnocClientOptions): void {
  if (defaultClient) {
    throw new Error('watchnoc: init called twice');
  }
  defaultClient = new WatchnocClient(config);
}

export const log = {
  debug(message: string, meta?: Meta) {
    defaultClient?.debug(message, meta);
  },
  info(message: string, meta?: Meta) {
    defaultClient?.info(message, meta);
  },
  warn(message: string, meta?: Meta) {
    defaultClient?.warn(message, meta);
  },
  error(message: string, meta?: Meta) {
    defaultClient?.error(message, meta);
  },
  fatal(message: string, meta?: Meta) {
    defaultClient?.fatal(message, meta);
  },
};

export function captureException(error: Error, meta?: Meta): void {
  defaultClient?.captureException(error, meta);
}

export async function flush(): Promise<void> {
  await defaultClient?.flush();
}

export async function shutdown(): Promise<void> {
  await defaultClient?.shutdown();
}

export async function shutdownWithDeadline(deadlineMs = 5000): Promise<void> {
  await defaultClient?.shutdownWithDeadline(deadlineMs);
}

export function getClient(): WatchnocClient {
  if (!defaultClient) {
    throw new Error('watchnoc: getClient called before init');
  }
  return defaultClient;
}

export { WatchnocClient } from './core/client.js';
export type { WatchnocClientOptions } from './core/client.js';
export type { WatchnocConfig } from './core/config.js';
export type { LogMeta as Meta } from './core/event.js';
export type { LogEvent, LogLevel } from './core/event.js';
export { WatchnocContextStore as Context, parseTraceparent } from './core/context.js';
export { generateRequestId, generateSessionId } from './core/context.js';
export { watchnocExpressMiddleware as watchnocMiddleware } from './integrations/frameworks/express.js';
export { watchnocFastifyPlugin as watchnocPlugin } from './integrations/frameworks/fastify.js';
export { WatchnocMiddleware } from './integrations/frameworks/nestjs.js';
export { watchnocHttpHandler } from './integrations/frameworks/http.js';
export { instrumentPrisma } from './integrations/databases/prisma.js';
export { watchnocDrizzleLogger } from './integrations/databases/drizzle.js';
export { WatchnocTypeORMLogger } from './integrations/databases/typeorm.js';
export { instrumentPg } from './integrations/databases/pg.js';
export { instrumentMongoDB } from './integrations/databases/mongodb.js';
export { instrumentMongoose } from './integrations/databases/mongoose.js';
export { uploadReplayChunk } from './replay/upload.js';
export { defaultRedactPatterns } from './utils/redact.js';
