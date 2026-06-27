// Programmatic API for the tsgo / TypeScript 7.0 migration readiness scanner.

import { findTsconfig, loadTsconfig, loadPackageJson, walkSource } from "./load.js";
import { checkTsconfig } from "./rules/tsconfig.js";
import { checkTooling } from "./rules/tooling.js";
import { checkSource } from "./rules/source.js";
import { SEVERITY_ORDER, type Finding, type ScanInput, type ScanResult, type Severity } from "./types.js";

export * from "./types.js";

export function scan(input: ScanInput): ScanResult {
  const projectDir = input.projectDir;
  const tsconfigPath = findTsconfig(projectDir, input.tsconfig);
  const cfg = tsconfigPath ? loadTsconfig(tsconfigPath) : undefined;
  const pkg = loadPackageJson(projectDir);

  const findings: Finding[] = [];
  findings.push(...checkTsconfig(cfg));
  findings.push(...checkTooling(pkg));
  if (!input.noSource) {
    const files = walkSource(projectDir);
    findings.push(...checkSource(files, cfg));
  }

  findings.sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      a.category.localeCompare(b.category) ||
      (a.file ?? "").localeCompare(b.file ?? ""),
  );

  const counts = { error: 0, warn: 0, review: 0, info: 0 } as Record<Severity, number>;
  for (const f of findings) counts[f.severity]++;

  return { projectDir, tsconfigPath, findings, counts };
}
