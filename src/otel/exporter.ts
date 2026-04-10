import { ExportResultCode } from '@opentelemetry/core';
import type { LogRecordExporter, LogRecordExportResult } from '@opentelemetry/sdk-logs';
import type { ReadableLogRecord } from '@opentelemetry/sdk-logs';
import type { WatchnocClient } from '../client';
import { SeverityNumber } from '@opentelemetry/api-logs';

export class WatchnocLogRecordExporter implements LogRecordExporter {
  constructor(private readonly client: WatchnocClient) {}

  export(logs: ReadableLogRecord[], resultCallback: (result: LogRecordExportResult) => void): void {
    if (logs.length === 0) {
      resultCallback({ code: ExportResultCode.SUCCESS });
      return;
    }

    for (const log of logs) {
      const level = mapSeverity(log.severityNumber);
      const message = String(log.body ?? '');
      const meta = {
        ...log.attributes,
        otel_service_name: log.resource.attributes['service.name'] as string,
        otel_span_id: log.spanContext?.spanId,
        otel_trace_id: log.spanContext?.traceId,
      };

      this.client[level](message, meta);
    }

    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  async shutdown(): Promise<void> {
    await this.client.flush();
  }

  async forceFlush(): Promise<void> {
    await this.client.flush();
  }
}

function mapSeverity(severity?: SeverityNumber): 'info' | 'warn' | 'error' | 'fatal' | 'debug' {
  if (!severity) return 'info';
  if (severity >= SeverityNumber.FATAL) return 'fatal';
  if (severity >= SeverityNumber.ERROR) return 'error';
  if (severity >= SeverityNumber.WARN) return 'warn';
  if (severity >= SeverityNumber.INFO) return 'info';
  return 'debug';
}
