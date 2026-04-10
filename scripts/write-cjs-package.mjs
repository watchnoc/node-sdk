import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const root = resolve(__dirname, '..');
const outDir = join(root, 'dist', 'cjs');
mkdirSync(outDir, { recursive: true });

writeFileSync(join(outDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n', 'utf8');

