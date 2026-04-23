import { getClient } from '../../index.js';

interface QueryFingerprint {
  collection: string;
  filter: string; // sanitized shape
  command: string;
}

// Per-request query tracker — keyed by Watchnoc request_id
const requestQueryMap = new Map<
  string,
  {
    queries: Map<string, { count: number; totalMs: number; fingerprint: QueryFingerprint }>;
    startedAt: number;
  }
>();

/**
 * Tracks MongoDB queries per request to detect N+1 patterns.
 */
export function trackForNPlusOne(
  requestId: string,
  collection: string,
  filter: string,
  commandName: string,
  duration: number,
  threshold: number,
): void {
  if (!requestId) return;

  if (!requestQueryMap.has(requestId)) {
    requestQueryMap.set(requestId, { queries: new Map(), startedAt: Date.now() });
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
    getClient().warn('mongodb.n_plus_one_detected', {
      collection,
      command: commandName,
      filter_shape: filter,
      count: existing.count,
      total_ms: existing.totalMs,
      request_id: requestId,
      suggestion: buildNPlusOneSuggestion(commandName, collection, filter),
    });
  }
}

function buildNPlusOneSuggestion(command: string, collection: string, _filter: string): string {
  if (command === 'find') {
    return (
      `Consider using $in to batch-fetch documents from '${collection}' ` +
      `instead of querying one at a time. ` +
      `Example: db.${collection}.find({ _id: { $in: ids } })`
    );
  }
  if (command === 'aggregate') {
    return (
      `Consider using $lookup in the parent pipeline to join '${collection}' ` +
      `documents instead of running separate aggregations per document.`
    );
  }
  return `Repeated ${command} on '${collection}' detected — consider batching.`;
}
