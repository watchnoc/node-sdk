import { getClient } from '../../index.js';

/**
 * Interface for query fingerprinting.
 */
export interface QueryFingerprint {
  collection: string;
  filter: string; // sanitized shape
  command: string;
}

/**
 * Per-request query tracker - keyed by Watchnoc request_id.
 * Used for N+1 detection.
 */
const requestQueryMap = new Map<
  string,
  {
    queries: Map<
      string,
      {
        count: number;
        totalMs: number;
        fingerprint: QueryFingerprint;
      }
    >;
    startedAt: number;
  }
>();

/**
 * Tracks queries per request to detect N+1 patterns.
 */
export function trackForNPlusOne(params: {
  requestId: string;
  collection: string;
  filter: string;
  commandName: string;
  duration: number;
  threshold: number;
  orm?: string;
}): void {
  const { requestId, collection, filter, commandName, duration, threshold, orm } = params;

  if (!requestId) return;

  if (!requestQueryMap.has(requestId)) {
    requestQueryMap.set(requestId, {
      queries: new Map(),
      startedAt: Date.now(),
    });
    // Clean up after 30s to prevent memory leak
    setTimeout(() => requestQueryMap.delete(requestId), 30_000);
  }

  const tracker = requestQueryMap.get(requestId)!;
  const key = `${commandName}::${collection}::${filter}`;

  const existing = tracker.queries.get(key) ?? {
    count: 0,
    totalMs: 0,
    fingerprint: { collection, filter, command: commandName },
  };

  existing.count += 1;
  existing.totalMs += duration;
  tracker.queries.set(key, existing);

  // Fire N+1 warning as soon as threshold is crossed
  if (existing.count === threshold) {
    const client = getClient();
    client.warn(`db.n_plus_one_detected`, {
      collection,
      command: commandName,
      filter_shape: filter,
      count: existing.count,
      total_ms: existing.totalMs,
      request_id: requestId,
      orm,
      suggestion: buildNPlusOneSuggestion(commandName, collection, filter),
    });
  }
}

function buildNPlusOneSuggestion(command: string, collection: string, _filter: string): string {
  const normalizedCommand = command.toLowerCase();

  if (normalizedCommand === 'find' || normalizedCommand === 'select') {
    return (
      `Consider using a batch fetch (e.g. IN or $in) for '${collection}' ` +
      `instead of querying documents one at a time in a loop.`
    );
  }

  if (normalizedCommand === 'aggregate') {
    return (
      `Consider using a join ($lookup) in the parent pipeline for '${collection}' ` +
      `instead of running separate aggregations per document.`
    );
  }

  return `Repeated ${command} on '${collection}' detected — consider batching.`;
}
