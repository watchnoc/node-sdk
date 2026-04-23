export type RedactPattern = {
  pattern: RegExp;
  replacement: string;
};

export function defaultRedactPatterns(): RedactPattern[] {
  return [
    { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: '[REDACTED_EMAIL]' },
    { pattern: /\b(?:\d[ -]*?){13,19}\b/g, replacement: '[REDACTED_CC]' },
    { pattern: /\bpk_[A-Za-z0-9_-]{8,}\b/g, replacement: 'pk_***' },
    { pattern: /\bBearer\s+[A-Za-z0-9._-]+\b/gi, replacement: 'Bearer ***' },
  ];
}

export function redactString(input: string, patterns: RedactPattern[]): string {
  if (patterns.length === 0) return input;
  
  // Optimization: Combine into a single regex if they are simple
  // For now, we'll keep the loop but use it more efficiently.
  // Real optimization would be a compiled single regex per pattern set.
  let out = input;
  for (let i = 0; i < patterns.length; i++) {
    out = out.replace(patterns[i].pattern, patterns[i].replacement);
  }
  return out;
}


export function redactMetadata(
  meta: Record<string, string> | undefined,
  patterns: RedactPattern[],
): Record<string, string> | undefined {
  if (!meta) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = redactString(v, patterns);
  }
  return out;
}

export function redactApiKey(raw: string): string {
  const s = (raw ?? '').trim();
  if (s.startsWith('pk_')) return 'pk_***';
  if (s.length === 0) return '';
  return '***';
}

