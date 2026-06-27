# tsgo-ready

TypeScript 7.0 — the native Go compiler, `tsgo` — shipped its RC on June 18, 2026, with stable expected about a month later. `tsgo --noEmit` will tell you if *your code* still type-checks. It won't tell you that `ts-morph` can't run on it yet, that your `keyofStringsOnly` flag is now a hard error, or that the `ignoreDeprecations` line you added in TS 6 stops working the moment you drop it.

`tsgo-ready` scans for exactly that — the three things the official check misses:

1. **tsconfig flags** that are removed in 7.0 (`importsNotUsedAsValues`, `keyofStringsOnly`, `out`, `prepend`, ...), plus `ignoreDeprecations` itself (the TS 6 escape hatch that 7.0 deletes) and resolver/target changes.
2. **Dependencies that use the Compiler API** — `ts-morph`, `ts-patch`, `ttypescript`, `typedoc`, type-aware `typescript-eslint`, JSON-schema generators. tsgo ships without a stable programmatic API until 7.1, so these need TypeScript 6 kept alongside. `tsgo --noEmit` never mentions them.
3. **Decorator/metadata and JSDoc surfaces** worth a real build before you cut over — NestJS, TypeORM, MikroORM, and `const enum` under `isolatedModules`.

Deterministic. No LLM key, no network, no telemetry. It reads your `tsconfig.json`, `package.json`, and source files and prints a fix-list.

## Run it

```bash
npx github:fernforge/tsgo-ready
```

Point it at a directory, or change the output:

```bash
npx github:fernforge/tsgo-ready --project ./packages/api
npx github:fernforge/tsgo-ready --json --out tsgo-report.json
npx github:fernforge/tsgo-ready --markdown
```

## What the output looks like

```
ERROR   Removed compiler option: keyofStringsOnly
   tsconfig.json:8
   `keyofStringsOnly` is deprecated in TypeScript 5/6 and removed in 7.0 — it will
   hard-error. Remove it; `keyof` has included number/symbol keys for years.

WARN    ts-morph uses the TypeScript Compiler API
   package.json
   tsgo ships without the stable programmatic API (planned for 7.1), so ts-morph
   cannot run on tsgo alone yet. Keep TypeScript 6 installed side-by-side.

REVIEW  experimentalDecorators + emitDecoratorMetadata
   tsconfig.json:10
   Build with tsgo and run your tests before cutting over; confirm reflected
   metadata (NestJS/TypeORM-style DI) still resolves.

Summary: 3 error  2 warn  7 review  1 info
```

### Severity

| level | meaning |
| --- | --- |
| `error` | will hard-error / stop compiling under tsgo |
| `warn` | removed or deprecated surface that very likely needs a change |
| `review` | documented behavior change — verify your project, don't assume it breaks |
| `info` | minor or context-dependent note |

The split matters. The RC notes say code that compiles cleanly under TS 6 (no deprecation warnings silenced) should emit the same under 7.0 — so decorator and `const enum` findings are `review`, not `error`. The tool points you at what to test; it doesn't cry wolf about emit it can't actually verify statically.

## In CI

```yaml
- uses: fernforge/tsgo-ready@main
  with:
    project: .
    fail-on: warn   # error | warn | review | never
```

It writes a Markdown table to the job summary and fails the step on findings at or above `fail-on` (default `warn`). Or call the CLI directly:

```yaml
- run: npx -y github:fernforge/tsgo-ready --fail-on error
```

### Code scanning (Security tab + PR annotations)

Emit SARIF and upload it so each finding shows up inline on the PR and in the repo's Security tab:

```yaml
- uses: fernforge/tsgo-ready@main
  with:
    fail-on: never        # let the gate happen in code scanning, not the step
    sarif-file: tsgo-ready.sarif
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with:
    sarif_file: tsgo-ready.sarif
```

`error`/`warn` map to SARIF `error`/`warning`; `review`/`info` map to `note`. Each result is anchored to the offending `tsconfig.json` line, `package.json`, or source file.

## Options

```
-p, --project <dir>    directory to scan (default: ".")
    --tsconfig <path>  explicit tsconfig (default: auto-discover)
    --format <fmt>     console | json | markdown | sarif
    --json             shorthand for --format json
    --markdown         shorthand for --format markdown
    --sarif            shorthand for --format sarif (GitHub code scanning)
    --out <file>       write the report to a file
    --no-source        skip the source-file walk (config + deps only)
    --no-color         disable ANSI colors
    --fail-on <sev>    error | warn | review | never (default: warn)
```

## Scope and limits

This is a static heuristic scan over config, dependency names, and source patterns. It does not run the compiler. The rule set tracks the documented 6→7 changes — removed options, the Compiler-API gap, the decorator/JSDoc deltas in the `typescript-go` CHANGES file — and the migration mechanics will keep moving as 7.0 reaches stable and 7.1 restores the programmatic API. Treat the report as a checklist to confirm, then run `tsgo --noEmit` and your test suite.

Sources behind every rule link to the [TypeScript 7.0 RC announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-rc/), the [6.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/), and the [typescript-go CHANGES](https://github.com/microsoft/typescript-go/blob/main/CHANGES.md).

MIT.
