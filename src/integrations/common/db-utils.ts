/**
 * Common utilities for database instrumentation.
 */

/**
 * Replaces actual values in SQL with placeholders to prevent PII leakage.
 * e.g. "SELECT * FROM users WHERE id = 123" -> "SELECT * FROM users WHERE id = ?"
 *
 * Scans char-by-char rather than using standalone regexes so that quote
 * escaping (doubled '' quotes, backslash escapes) and Postgres dollar-quoted
 * strings ($tag$...$tag$) don't leave literal PII behind mid-string, which a
 * naive `/'[^']*'/` replace would do on the first embedded quote.
 */
export function stripBindings(sql: string): string {
  if (!sql) return sql;
  const n = sql.length;
  let out = '';
  let i = 0;

  while (i < n) {
    const c = sql[i];

    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === '\\') {
          j += 2;
          continue;
        }
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      out += '?';
      i = j;
      continue;
    }

    if (c === '"') {
      // Quoted identifier, not a value — pass through untouched.
      let j = i + 1;
      while (j < n && sql[j] !== '"') j += 1;
      out += sql.slice(i, Math.min(j + 1, n));
      i = j + 1;
      continue;
    }

    if (c === '$') {
      const tagMatch = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (tagMatch) {
        const tag = tagMatch[0];
        const end = sql.indexOf(tag, i + tag.length);
        if (end !== -1) {
          out += '?';
          i = end + tag.length;
          continue;
        }
      }
    }

    if (c >= '0' && c <= '9') {
      const start = i;
      let j = i;
      while (j < n && sql[j] >= '0' && sql[j] <= '9') j += 1;
      if (sql[j] === '.' && sql[j + 1] >= '0' && sql[j + 1] <= '9') {
        j += 1;
        while (j < n && sql[j] >= '0' && sql[j] <= '9') j += 1;
      }
      const prev = start > 0 ? sql[start - 1] : '';
      const next = j < n ? sql[j] : '';
      const wordAdjacent = /[A-Za-z_]/.test(prev) || /[A-Za-z_]/.test(next);
      out += wordAdjacent ? sql.slice(start, j) : '?';
      i = j;
      continue;
    }

    out += c;
    i += 1;
  }

  // Collapse repeated placeholders, e.g. VALUES (?, ?, ?) -> VALUES (?)
  return out.replace(/\?(\s*,\s*\?)+/g, '?');
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
