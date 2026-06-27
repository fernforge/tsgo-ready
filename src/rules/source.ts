// Source rules: patterns in your code (not config or deps) that tsgo treats differently.
//
// Kept deliberately conservative — these are line-anchored hints to review, not guaranteed breaks.
// Sources:
//   https://github.com/microsoft/typescript-go/blob/main/CHANGES.md  (JS/JSDoc behavior deltas)
//   https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-rc/

import type { Finding } from "../types.js";
import type { RawTsconfig, SourceFile } from "../load.js";

const CHANGES = "https://github.com/microsoft/typescript-go/blob/main/CHANGES.md";

export function checkSource(files: SourceFile[], cfg: RawTsconfig | undefined): Finding[] {
  const findings: Finding[] = [];
  const co = cfg?.compilerOptions ?? {};
  const isolatedModules = co.isolatedModules === true;
  const preserveConstEnums = co.preserveConstEnums === true;

  // const enum: erased at compile time. Under isolatedModules (every bundler / tsgo's per-file mode)
  // a `const enum` imported across files can't be inlined and behaves like a regular enum or errors.
  // Only worth flagging once per file, and only when the config makes it risky.
  const constEnumRisky = isolatedModules && !preserveConstEnums;

  for (const f of files) {
    const isJs = /\.(c|m)?jsx?$/.test(f.path);
    const lines = f.text.split(/\r?\n/);

    let flaggedConstEnum = false;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];

      if (constEnumRisky && !flaggedConstEnum && /\bconst\s+enum\b/.test(ln)) {
        flaggedConstEnum = true;
        findings.push({
          id: "source/const-enum",
          severity: "review",
          category: "source",
          title: "const enum under isolatedModules",
          detail:
            "`const enum` members are inlined by tsc, but isolatedModules (which tsgo and every bundler assume) compiles files in isolation and can't inline across modules. Verify these resolve, or switch to a plain `enum`/`as const` object, or set preserveConstEnums.",
          evidence: ln.trim().slice(0, 120),
          file: f.path,
          line: i + 1,
          docs: CHANGES,
        });
      }

      // JSDoc tags whose handling differs in the native JS checker.
      if (isJs) {
        const m = ln.match(/@(enum|constructor|class)\b/);
        if (m) {
          findings.push({
            id: "source/jsdoc-tag",
            severity: "info",
            category: "source",
            title: `JSDoc @${m[1]} in a JS file`,
            detail:
              "The native compiler's JSDoc handling has documented differences from Strada (see CHANGES.md). If you rely on @enum/@constructor/@class type inference in checked JS, re-run the type-check under tsgo on this file.",
            evidence: ln.trim().slice(0, 120),
            file: f.path,
            line: i + 1,
            docs: CHANGES,
          });
          break; // one JSDoc note per file is plenty
        }
      }
    }
  }

  return findings;
}
