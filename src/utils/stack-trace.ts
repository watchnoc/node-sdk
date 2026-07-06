/**
 * Utility for capturing and parsing stack traces to identify the caller's location.
 */

export interface SourceLocation {
  file: string;
  lineNumber: number;
  functionName?: string;
}

/**
 * Captures the current stack trace and parses it to find the first frame outside of the Watchnoc SDK.
 */
/**
 * @param depth how many non-SDK frames to skip before returning a location;
 * 1 (default) returns the caller's immediate frame, 2 returns its caller, etc.
 */
export function captureSourceLocation(depth = 1): SourceLocation | undefined {
  const err = new Error();
  const stack = err.stack;
  if (!stack) return undefined;

  const lines = stack.split('\n');
  const targetDepth = Math.max(1, Math.floor(depth));
  let seen = 0;

  // Skip the first line (Error message) and subsequent frames that are inside the SDK
  // We look for the Nth frame (per targetDepth) that is not part of our package
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Filter out internal node modules and Watchnoc SDK frames
    if (
      line.includes('node:internal') ||
      line.includes('(internal/') ||
      line.includes('/watchnoc/node/src/') ||
      line.includes('/watchnoc/node/dist/') ||
      line.includes('stack-trace.js') ||
      line.includes('client.js') ||
      line.includes('index.js')
    ) {
      continue;
    }

    const location = parseStackFrame(line);
    if (location) {
      seen += 1;
      if (seen >= targetDepth) return location;
    }
  }

  return undefined;
}

function parseStackFrame(line: string): SourceLocation | undefined {
  // Regex for different stack formats (V8, Webkit, etc.)
  // V8: "at functionName (path/to/file.js:123:45)" or "at path/to/file.js:123:45"
  const v8Match = line.match(/at\s+(?:(.+?)\s+\()?(?:(.+?):(\d+):(\d+))\)?/);
  if (v8Match) {
    return {
      functionName: v8Match[1] || undefined,
      file: v8Match[2],
      lineNumber: parseInt(v8Match[3], 10),
    };
  }

  return undefined;
}
