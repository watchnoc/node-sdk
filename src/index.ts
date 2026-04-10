import { WatchnocClient, type WatchnocClientOptions } from './client.js';
import type { LogMeta as Meta } from './event.js';

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

export { WatchnocClient } from './client.js';
export type { WatchnocClientOptions } from './client.js';
export type { WatchnocConfig } from './config.js';
export type { LogMeta as Meta } from './event.js';
export type { LogEvent, LogLevel } from './event.js';
export { WatchnocContextStore as Context, parseTraceparent } from './context.js';
export { generateRequestId, generateSessionId } from './context.js';
export { watchnocExpressMiddleware as watchnocMiddleware } from './integrations/express.js';
export { watchnocFastifyPlugin as watchnocPlugin } from './integrations/fastify.js';
export { WatchnocMiddleware } from './integrations/nestjs.js';
export { watchnocHttpHandler } from './integrations/http.js';
export { instrumentPrisma } from './integrations/prisma.js';
export { watchnocDrizzleLogger } from './integrations/drizzle.js';
export { WatchnocTypeORMLogger } from './integrations/typeorm.js';
export { instrumentPg } from './integrations/pg.js';
export { instrumentMongoDB } from './integrations/mongodb.js';
export { instrumentMongoose } from './integrations/mongoose.js';
export { uploadReplayChunk } from './replay/upload.js';
export { defaultRedactPatterns } from './redact';
