# ai-harness

TypeScript workspace for AI harnesses aimed at high-quality outputs, including with smaller models.

`@ai-harness/core` holds shared harness code and lists only the packages that code needs. `@ai-harness/cursor-implementation` is the Cursor agent client. `@cursor/sdk` is a dependency of that package, along with its `zod` peer.

## Build

Installing and compiling the workspace needs Node.js 18 or newer. Running the Cursor client needs Node.js 22.13 or newer, because that is what `@cursor/sdk` declares.

```bash
npm install
npm run build
```

`npm run build` compiles every workspace package with `tsc`. `npm run typecheck` typechecks without emitting files.
