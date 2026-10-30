# ai-harness

TypeScript package for AI harnesses aimed at high-quality outputs, including with smaller models.

This repository is a compile-only skeleton. Harness implementations are not here yet, and `@cursor/sdk` is not a dependency until a harness needs to drive Cursor agents.

## Build

Requires Node.js 18 or newer.

```bash
npm install
npm run build
```

`npm run build` compiles `src/` to `dist/` with `tsc`. `npm run typecheck` typechecks without emitting files.
