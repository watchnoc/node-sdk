/**
 * Common utilities for database instrumentation.
 */

/**
 * Replaces actual values in SQL with placeholders to prevent PII leakage.
 * e.g. "SELECT * FROM users WHERE id = 123" -> "SELECT * FROM users WHERE id = ?"
 */
export function stripBindings(sql: string): string {
  // Replace single quoted strings
  let sanitized = sql.replace(/'[^']*'/g, '?');
  // Replace numbers
  sanitized = sanitized.replace(/\b\d+\b/g, '?');
  // Replace multiple placeholders with a single ?
  sanitized = sanitized.replace(/\?\s*,\s*\?/g, '?');
  return sanitized;
}

/**
 * Extracts the SQL operation (SELECT, INSERT, UPDATE, DELETE).
 */
export function extractOperation(sql: string): string {
  const match = sql.trim().match(/^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE)/i);
  return match ? match[1].toUpperCase() : 'UNKNOWN';
}

/**
 * Extracts the table name from a SQL query.
 */
export function extractTable(sql: string): string {
  const op = extractOperation(sql);
  let match: RegExpMatchArray | null = null;

  if (op === 'SELECT' || op === 'DELETE') {
    match = sql.match(/FROM\s+["`]?(\w+)["`]?/i);
  } else if (op === 'INSERT') {
    match = sql.match(/INTO\s+["`]?(\w+)["`]?/i);
  } else if (op === 'UPDATE') {
    match = sql.match(/UPDATE\s+["`]?(\w+)["`]?/i);
  }

  return match ? match[1] : 'unknown';
}

/**
 * Converts a MongoDB filter/pipeline into a shape string with values redacted.
 */
export function sanitizeFilter(value: any): any {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map(sanitizeFilter);
  }

  if (typeof value === 'object') {
    if (value.constructor !== Object) {
      if (value instanceof Date) return '<date>';
      if (value instanceof RegExp) return '<regex>';
      if (value._bsontype === 'ObjectID') return '<objectid>';
    }

    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('$')) {
        if (isOperatorWithValue(k)) {
          result[k] = shapeOf(v);
        } else {
          result[k] = sanitizeFilter(v);
        }
      } else {
        result[k] = sanitizeFilter(v);
      }
    }
    return result;
  }

  return shapeOf(value);
}

function shapeOf(value: any): string {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'string') return '<string>';
  if (type === 'number') return '<number>';
  if (type === 'boolean') return '<boolean>';
  return `<${type}>`;
}

function isOperatorWithValue(op: string): boolean {
  return ['$gt', '$gte', '$lt', '$lte', '$eq', '$ne', '$in', '$nin', '$regex', '$elemMatch'].includes(op);
}
