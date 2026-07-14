# Contributing

Thanks for considering a contribution to `@watchnoc/node`.

## Setup

```bash
npm install
npm run build
npm test
```

## Before opening a PR

Run these and make sure they pass — CI enforces all of them:

```bash
npm run lint
npm run build
npm run typecheck:examples
npm test
```

- `npm run typecheck:examples` type-checks `examples/` against the built package's public API (`dist/types`) — it catches examples that reference something not actually exported, or use an export incorrectly. Run `npm run build` first if you've changed `src/`.
- Keep changes to `src/` covered by a test in the matching `*.test.ts` file — `npm test` runs the full suite via Vitest.

## Reporting a security issue

Do not open a public issue for a security vulnerability — see [SECURITY.md](./SECURITY.md).

## Style

- Formatting is enforced by Prettier (`.prettierrc`) and linted by ESLint (`.eslintrc.json`) — most editors will pick these up automatically.
- This package is ESM-only (`"type": "module"`) internally; the build produces both ESM and CJS output for consumers (see `package.json`'s `exports` field).
