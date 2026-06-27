// tsconfig rules: compiler options removed or changed on the path to tsgo (TypeScript 7.0).
//
// TS 6.0 is the bridge release: it turns long-deprecated options into errors you can silence ONCE
// with `ignoreDeprecations: "6.0"`. TS 7.0 removes that escape hatch — so anything you are still
// silencing in TS 6 hard-errors in TS 7. We flag the deprecated options directly, plus the presence
// of `ignoreDeprecations` itself (a signal you depend on removed surface), plus a few options whose
// default/behavior changes.
//
// Sources:
//   https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-rc/
//   https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/
//   https://github.com/microsoft/typescript-go/blob/main/CHANGES.md

import type { Finding } from "../types.js";
import type { RawTsconfig } from "../load.js";
import { lineOfKey } from "../load.js";

const RC = "https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-rc/";

// Options deprecated in TS 5.0/5.5 → error-with-ignoreDeprecations in TS 6 → removed in TS 7.
const REMOVED_FLAGS: Record<string, string> = {
  charset: "No replacement; the compiler reads files as UTF-8.",
  out: "Use `outFile` instead (and only with `module: amd`/`system`).",
  importsNotUsedAsValues: "Replace with `verbatimModuleSyntax: true`.",
  preserveValueImports: "Replace with `verbatimModuleSyntax: true`.",
  keyofStringsOnly: "Remove it; `keyof` has included number/symbol keys for years.",
  noImplicitUseStrict: "Remove it.",
  noStrictGenericChecks: "Remove it; fix the underlying generic variance instead.",
  suppressExcessPropertyErrors: "Remove it; address the excess-property errors directly.",
  suppressImplicitAnyIndexErrors: "Remove it; add an index signature or a cast.",
  prepend: "Remove `prepend` from project references; it is no longer supported.",
};

export function checkTsconfig(cfg: RawTsconfig | undefined): Finding[] {
  const findings: Finding[] = [];
  if (!cfg) {
    findings.push({
      id: "tsconfig/missing",
      severity: "info",
      category: "tsconfig",
      title: "No tsconfig.json found",
      detail:
        "Could not locate a tsconfig.json from the project root. tsconfig-level checks were skipped; pass --tsconfig <path> if yours lives elsewhere.",
    });
    return findings;
  }

  const co = cfg.compilerOptions;
  const rel = relName(cfg.path);
  const at = (key: string): Pick<Finding, "file" | "line"> => ({
    file: rel,
    line: lineOfKey(cfg.text, key),
  });

  // Removed compiler options.
  for (const [flag, fix] of Object.entries(REMOVED_FLAGS)) {
    if (flag in co) {
      findings.push({
        id: "tsconfig/removed-flag",
        severity: "error",
        category: "tsconfig",
        title: `Removed compiler option: ${flag}`,
        detail: `\`${flag}\` is deprecated in TypeScript 5/6 and removed in 7.0 — it will hard-error. ${fix}`,
        evidence: `${flag}: ${JSON.stringify(co[flag])}`,
        docs: RC,
        ...at(flag),
      });
    }
  }

  // ignoreDeprecations: the TS6 one-time silencer; gone in TS7.
  if ("ignoreDeprecations" in co) {
    findings.push({
      id: "tsconfig/ignore-deprecations",
      severity: "error",
      category: "tsconfig",
      title: "ignoreDeprecations is set",
      detail:
        "`ignoreDeprecations` silences deprecated-option errors in TypeScript 6 but is itself removed in 7.0. Every option you are silencing with it will hard-error once you drop it. Resolve the underlying deprecations now.",
      evidence: `ignoreDeprecations: ${JSON.stringify(co.ignoreDeprecations)}`,
      docs: RC,
      ...at("ignoreDeprecations"),
    });
  }

  // target: ES3 removed; ES5 emit path deprecated/at risk.
  const target = String(co.target ?? "").toLowerCase();
  if (target === "es3") {
    findings.push({
      id: "tsconfig/target-es3",
      severity: "error",
      category: "tsconfig",
      title: "target: ES3 is removed",
      detail: "ES3 output was removed in TypeScript 5.5. Set `target` to ES2015 or higher.",
      evidence: `target: ${JSON.stringify(co.target)}`,
      docs: RC,
      ...at("target"),
    });
  } else if (target === "es5") {
    findings.push({
      id: "tsconfig/target-es5",
      severity: "warn",
      category: "tsconfig",
      title: "target: ES5",
      detail:
        "ES5 is the oldest still-supported target and the most exposed to downlevel-emit differences under the native compiler (decorators, async/await, iteration helpers). Raise `target` to ES2017+ if you can, and test the emit before cutting over.",
      evidence: `target: ${JSON.stringify(co.target)}`,
      docs: RC,
      ...at("target"),
    });
  }

  // moduleResolution: classic removed; node/node10 renamed/at risk.
  const mr = String(co.moduleResolution ?? "").toLowerCase();
  if (mr === "classic") {
    findings.push({
      id: "tsconfig/moduleresolution-classic",
      severity: "error",
      category: "tsconfig",
      title: "moduleResolution: classic is removed",
      detail: "The `classic` resolution mode is removed. Use `bundler`, `node16`/`nodenext`, or `node10`.",
      evidence: `moduleResolution: ${JSON.stringify(co.moduleResolution)}`,
      docs: RC,
      ...at("moduleResolution"),
    });
  } else if (mr === "node" || mr === "node10") {
    findings.push({
      id: "tsconfig/moduleresolution-node",
      severity: "review",
      category: "tsconfig",
      title: `moduleResolution: ${co.moduleResolution}`,
      detail:
        "`node`/`node10` is the legacy CommonJS-style resolver. It still exists but is the least aligned with how tsgo resolves modules. Prefer `bundler` (apps) or `nodenext` (libraries) and re-run a type-check after switching.",
      evidence: `moduleResolution: ${JSON.stringify(co.moduleResolution)}`,
      docs: RC,
      ...at("moduleResolution"),
    });
  }

  // baseUrl behavior: andrewbranch/ts5to6 territory.
  if ("baseUrl" in co && !mr.startsWith("node1") && mr !== "nodenext" && mr !== "bundler") {
    findings.push({
      id: "tsconfig/baseurl",
      severity: "review",
      category: "tsconfig",
      title: "baseUrl with a legacy resolver",
      detail:
        "How `baseUrl` interacts with bare-module resolution changed across the 5→6→7 line. If you use `baseUrl` for non-relative imports, verify they still resolve under tsgo. The `@andrewbranch/ts5to6` codemod rewrites the common cases.",
      evidence: `baseUrl: ${JSON.stringify(co.baseUrl)}`,
      docs: "https://github.com/andrewbranch/ts5to6",
      ...at("baseUrl"),
    });
  }

  // Legacy decorators + emitted metadata at a low target: tsgo's highest-risk emit path.
  if (co.experimentalDecorators === true) {
    const meta = co.emitDecoratorMetadata === true;
    const lowTarget = ["es3", "es5", "es2015", "es2016", "es2017", "es2018", "es2019", "es2020", "es2021"].includes(
      target,
    );
    if (meta || lowTarget) {
      findings.push({
        id: "tsconfig/decorators",
        severity: "review",
        category: "decorators",
        title: meta ? "experimentalDecorators + emitDecoratorMetadata" : "experimentalDecorators at a low target",
        detail:
          "Legacy decorators" +
          (meta ? " with emitted design:type metadata" : "") +
          " are the emit surface most likely to differ under the native compiler" +
          (lowTarget ? `, and your target (${co.target}) downlevels them` : "") +
          ". Build with tsgo and run your tests before cutting over; confirm reflected metadata (NestJS/TypeORM-style DI) still resolves.",
        evidence: `experimentalDecorators: true${meta ? ", emitDecoratorMetadata: true" : ""}, target: ${JSON.stringify(co.target)}`,
        docs: RC,
        ...at("experimentalDecorators"),
      });
    }
  }

  return findings;
}

function relName(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}
