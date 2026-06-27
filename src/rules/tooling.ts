// Tooling rules: dependencies that won't run on tsgo until the stable programmatic API lands.
//
// tsgo (TypeScript 7.0) ships the CLI and the language service, but NOT a stable public Compiler API
// (createProgram / ts.factory / the checker) — that is slated for 7.1+. Anything that imports
// `typescript` to build a Program or walk types programmatically must keep TypeScript 6 installed
// side-by-side until then. `tsgo --noEmit` will NOT warn you about this — it only checks YOUR code.
//
// Sources:
//   https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-rc/  (API gap, TS6 side-by-side)
//   https://github.com/withastro/roadmap/discussions/1321  (ecosystem Compiler-API dependency risk)

import type { Finding } from "../types.js";
import type { PackageJson } from "../load.js";

// Packages known to drive the TypeScript Compiler API (build a Program / use the type checker).
// These cannot run on tsgo alone until the 7.1 API; keep TS 6 pinned for them.
const COMPILER_API_TOOLS: Record<string, string> = {
  "ts-morph": "Wraps the Compiler API to manipulate source — needs the programmatic API.",
  "@ts-morph/common": "ts-morph core; same Compiler-API dependency.",
  "ts-patch": "Patches tsc to run custom transformers via the Compiler API.",
  ttypescript: "Deprecated tsc wrapper for transformers; Compiler-API based (migrate to ts-patch, then keep TS6).",
  "ts-json-schema-generator": "Walks the type checker to emit JSON Schema.",
  "typescript-json-schema": "Older type-checker-based JSON Schema generator.",
  "ts-auto-mock": "Transformer that reads types via the Compiler API.",
  typeconv: "Uses ts-json-schema-generator under the hood.",
  typedoc: "Builds a Program and reads the checker to generate docs.",
  "ts-prune": "Builds a Program to find unused exports.",
  "type-coverage": "Builds a Program to measure typed coverage.",
  "ts-unused-exports": "Builds a Program to find unused exports.",
  "@microsoft/api-extractor": "Builds a Program to roll up .d.ts and API reports.",
};

// Type-aware ESLint: rules that need type info construct a Program through typescript-eslint.
const TYPE_AWARE_ESLINT = ["@typescript-eslint/parser", "typescript-eslint", "@typescript-eslint/eslint-plugin"];

// Decorator/metadata-heavy frameworks: highest-risk *runtime* surface under tsgo's emit. Not a
// guaranteed break (the RC says clean TS6 builds should emit the same), but the area most worth a
// real build + test before you cut over — especially at low `target` or with emitDecoratorMetadata.
const DECORATOR_FRAMEWORKS: Record<string, string> = {
  "@nestjs/core": "NestJS — DI + controller/param decorators, emitDecoratorMetadata.",
  typeorm: "TypeORM — entity/column decorators rely on emitted design:type metadata.",
  "type-graphql": "TypeGraphQL — schema built from decorator metadata.",
  "mikro-orm": "MikroORM — entity decorators + metadata.",
  "@mikro-orm/core": "MikroORM core — entity decorators + metadata.",
  inversify: "InversifyJS — @injectable/@inject rely on emitted metadata.",
  "class-transformer": "class-transformer — reads design:type metadata for nested transforms.",
  "class-validator": "class-validator — often paired with reflected metadata.",
  "routing-controllers": "routing-controllers — controller/param decorators + metadata.",
  "sequelize-typescript": "sequelize-typescript — model decorators + metadata.",
  "@tsed/common": "Ts.ED — heavy decorator + metadata usage.",
};

const RC = "https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-rc/";

export function checkTooling(pkg: PackageJson | undefined): Finding[] {
  const findings: Finding[] = [];
  if (!pkg) return findings;
  const deps = pkg.deps;

  for (const [name, why] of Object.entries(COMPILER_API_TOOLS)) {
    if (name in deps) {
      findings.push({
        id: "tooling/compiler-api",
        severity: "warn",
        category: "tooling",
        title: `${name} uses the TypeScript Compiler API`,
        detail: `${why} tsgo (TS 7.0) ships without the stable programmatic API (planned for 7.1), so ${name} cannot run on tsgo alone yet. Keep TypeScript 6 installed side-by-side for this tool until it announces tsgo support.`,
        evidence: `${name}@${deps[name]}`,
        file: "package.json",
        docs: RC,
      });
    }
  }

  for (const name of TYPE_AWARE_ESLINT) {
    if (name in deps) {
      findings.push({
        id: "tooling/type-aware-eslint",
        severity: "review",
        category: "tooling",
        title: `${name} (type-aware linting)`,
        detail:
          "If you enable type-checked ESLint rules (parserOptions.project / projectService), typescript-eslint builds a Program through the Compiler API. Those rules need TypeScript 6 side-by-side until tsgo exposes the API. Syntax-only rules are unaffected.",
        evidence: `${name}@${deps[name]}`,
        file: "package.json",
        docs: "https://typescript-eslint.io/getting-started/typed-linting/",
      });
      break; // one note is enough
    }
  }

  for (const [name, why] of Object.entries(DECORATOR_FRAMEWORKS)) {
    if (name in deps) {
      findings.push({
        id: "tooling/decorator-framework",
        severity: "review",
        category: "decorators",
        title: `${name} relies on decorators/metadata`,
        detail: `${why} tsgo's decorator and emitDecoratorMetadata output is the riskiest emit surface in the move to TS7. The RC says clean TS6 builds should emit identically, but verify: build with tsgo, run your test suite, and confirm reflected metadata still works — especially if target < ES2022.`,
        evidence: `${name}@${deps[name]}`,
        file: "package.json",
        docs: RC,
      });
    }
  }

  return findings;
}
