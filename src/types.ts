// Shared types for the tsgo / TypeScript 7.0 migration readiness scanner.

// error  = will hard-error or stop compiling under tsgo (TypeScript 7.0).
// warn   = removed/deprecated surface that very likely needs a change before TS7.
// review = behavior is documented to change; verify your project rather than assume it breaks.
// info   = minor or context-dependent note.
export type Severity = "error" | "warn" | "review" | "info";

export type Category = "tsconfig" | "tooling" | "decorators" | "source";

export interface Finding {
  id: string; // stable rule id, e.g. "tsconfig/removed-flag"
  severity: Severity;
  category: Category;
  title: string; // one-line headline
  detail: string; // what changed and what to do
  file?: string; // path relative to project root
  line?: number; // 1-based, when known
  evidence?: string; // the offending value/match, trimmed
  docs?: string; // a URL the dev can read
}

export interface ScanInput {
  projectDir: string;
  // explicit tsconfig path override; otherwise auto-discovered
  tsconfig?: string;
  // skip the source-file walk (faster on huge repos)
  noSource?: boolean;
}

export interface ScanResult {
  projectDir: string;
  tsconfigPath?: string;
  findings: Finding[];
  // count by severity, for the summary line and exit-code logic
  counts: Record<Severity, number>;
}

export const SEVERITY_ORDER: Severity[] = ["error", "warn", "review", "info"];
