import dc from 'node:diagnostics_channel';
import type { WatchnocClient } from '../core/client.js';
import type { Instrumentation } from './registry.js';
import { WatchnocContextStore } from '../core/context.js';

export class HttpInstrumentation implements Instrumentation {
  readonly name = 'http';

  init(client: WatchnocClient): void {
    const channel = dc.channel('undici:request:summary');
    if (channel.hasSubscribers) return;

    // We use undici:request:summary which is high-level and covers fetch/undici
    // For standard http, we can use http.client.request.start/stop
    
    dc.channel('http.client.request.start').subscribe((data: any) => {
      const { request } = data;
      if (!request) return;

      const url = `${request.protocol}//${request.host}${request.path}`;
      if (url.includes(client.getConfig().httpUrl) || url.includes(client.getConfig().grpcAddr)) {
        return; // Don't instrument our own calls
      }

      // Add request ID if not present
      const ctx = WatchnocContextStore.get();
      if (ctx.requestId) {
        request.setHeader('x-request-id', ctx.requestId);
      }
    });

    dc.channel('http.client.request.stop').subscribe((data: any) => {
      const { request, response } = data;
      if (!request || !response) return;

      const url = `${request.protocol}//${request.host}${request.path}`;
      if (url.includes(client.getConfig().httpUrl) || url.includes(client.getConfig().grpcAddr)) {
        return;
      }

      const duration = (data.timeStamp ?? Date.now()) - (data.startTime ?? Date.now());

      client.info(`HTTP ${request.method} ${url} - ${response.statusCode}`, {
        type: 'network',
        method: request.method,
        url,
        status: response.statusCode,
        duration_ms: duration,
      });
    });
  }
}
