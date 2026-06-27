// Renderers: console (default), JSON (CI), Markdown (GitHub Action step summary / PR comment).

import pc from "picocolors";
import type { ScanResult, Severity, Finding } from "./types.js";

const LABEL: Record<Severity, string> = {
  error: "ERROR ",
  warn: "WARN  ",
  review: "REVIEW",
  info: "INFO  ",
};

function color(sev: Severity, s: string): string {
  switch (sev) {
    case "error":
      return pc.red(s);
    case "warn":
      return pc.yellow(s);
    case "review":
      return pc.cyan(s);
    default:
      return pc.dim(s);
  }
}

function loc(f: Finding): string {
  if (!f.file) return "";
  return f.line ? `${f.file}:${f.line}` : f.file;
}

export function renderConsole(r: ScanResult, noColor = false): string {
  const paint = noColor ? (_: Severity, s: string) => s : color;
  const dim = noColor ? (s: string) => s : pc.dim;
  const bold = noColor ? (s: string) => s : pc.bold;
  const out: string[] = [];

  out.push("");
  out.push(bold(`tsgo-ready — TypeScript 7.0 / tsgo migration scan`));
  out.push(dim(r.tsconfigPath ? `tsconfig: ${r.tsconfigPath}` : "tsconfig: (none found)"));
  out.push("");

  if (r.findings.length === 0) {
    out.push(paint("review", "No tsgo migration risks detected in config, dependencies, or scanned source."));
    out.push(dim("This is a static heuristic scan — still run `tsgo --noEmit` and your test suite to confirm."));
    out.push("");
    return out.join("\n");
  }

  for (const f of r.findings) {
    const head = `${paint(f.severity, LABEL[f.severity])}  ${bold(f.title)}`;
    out.push(head);
    const where = loc(f);
    if (where) out.push(`   ${dim(where)}`);
    out.push(`   ${f.detail}`);
    if (f.evidence) out.push(`   ${dim("→ " + f.evidence)}`);
    if (f.docs) out.push(`   ${dim(f.docs)}`);
    out.push("");
  }

  out.push(summaryLine(r, noColor));
  out.push("");
  return out.join("\n");
}

export function summaryLine(r: ScanResult, noColor = false): string {
  const paint = noColor ? (_: Severity, s: string) => s : color;
  const parts = [
    paint("error", `${r.counts.error} error`),
    paint("warn", `${r.counts.warn} warn`),
    paint("review", `${r.counts.review} review`),
    paint("info", `${r.counts.info} info`),
  ];
  return `Summary: ${parts.join("  ")}`;
}

export function renderJson(r: ScanResult): string {
  return JSON.stringify(
    { tool: "tsgo-ready", tsconfig: r.tsconfigPath ?? null, counts: r.counts, findings: r.findings },
    null,
    2,
  );
}

export function renderMarkdown(r: ScanResult): string {
  const out: string[] = [];
  out.push("## tsgo-ready — TypeScript 7.0 / tsgo migration scan");
  out.push("");
  out.push(
    `**${r.counts.error}** error · **${r.counts.warn}** warn · **${r.counts.review}** review · **${r.counts.info}** info`,
  );
  out.push("");
  if (r.findings.length === 0) {
    out.push("No tsgo migration risks detected in config, dependencies, or scanned source.");
    out.push("");
    out.push("_Static heuristic scan — still run `tsgo --noEmit` and your tests to confirm._");
    return out.join("\n");
  }
  out.push("| Severity | Finding | Location | Fix |");
  out.push("| --- | --- | --- | --- |");
  for (const f of r.findings) {
    const where = f.file ? (f.line ? `\`${f.file}:${f.line}\`` : `\`${f.file}\``) : "";
    const fix = f.detail.replace(/\|/g, "\\|").replace(/\n/g, " ");
    out.push(`| ${f.severity} | ${md(f.title)} | ${where} | ${fix} |`);
  }
  out.push("");
  out.push("_Static heuristic scan from [tsgo-ready](https://github.com/fernforge/tsgo-ready) — confirm with `tsgo --noEmit` and your test suite._");
  return out.join("\n");
}

function md(s: string): string {
  return s.replace(/\|/g, "\\|");
}
