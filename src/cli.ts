#!/usr/bin/env node
// tsgo-ready CLI — scan a TypeScript project for what breaks on the move to tsgo (TypeScript 7.0).

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { scan } from "./index.js";
import { renderConsole, renderJson, renderMarkdown, renderSarif, summaryLine } from "./report.js";

const VERSION = "0.2.0";

interface Args {
  project: string;
  tsconfig?: string;
  format: "console" | "json" | "markdown" | "sarif";
  out?: string;
  noSource: boolean;
  noColor: boolean;
  // exit nonzero when findings at or above this severity exist; default "warn"
  failOn: "error" | "warn" | "review" | "never";
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    project: ".",
    format: "console",
    noSource: false,
    noColor: false,
    failOn: "warn",
    help: false,
    version: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    const next = () => argv[++i];
    switch (t) {
      case "--project":
      case "-p":
        a.project = next() ?? ".";
        break;
      case "--tsconfig":
        a.tsconfig = next();
        break;
      case "--format":
        a.format = next() as Args["format"];
        break;
      case "--json":
        a.format = "json";
        break;
      case "--markdown":
        a.format = "markdown";
        break;
      case "--sarif":
        a.format = "sarif";
        break;
      case "--out":
        a.out = next();
        break;
      case "--no-source":
        a.noSource = true;
        break;
      case "--no-color":
        a.noColor = true;
        break;
      case "--fail-on":
        a.failOn = next() as Args["failOn"];
        break;
      case "-h":
      case "--help":
        a.help = true;
        break;
      case "-v":
      case "--version":
        a.version = true;
        break;
      default:
        if (!t.startsWith("-") && a.project === ".") a.project = t;
    }
  }
  return a;
}

const HELP = `tsgo-ready ${VERSION}
Scan a TypeScript project for what breaks on the move to the native Go compiler (tsgo / TS 7.0).

Usage:
  tsgo-ready [path] [options]
  npx github:fernforge/tsgo-ready

Options:
  -p, --project <dir>   Project directory to scan (default: ".")
      --tsconfig <path> Explicit tsconfig path (default: auto-discover)
      --format <fmt>    console | json | markdown | sarif (default: console)
      --json            Shorthand for --format json
      --markdown        Shorthand for --format markdown
      --sarif           Shorthand for --format sarif (GitHub code scanning)
      --out <file>      Write the report to a file instead of stdout
      --no-source       Skip the source-file walk (config + deps only)
      --no-color        Disable ANSI colors
      --fail-on <sev>   Exit nonzero when findings >= this severity exist:
                        error | warn | review | never (default: warn)
  -h, --help            Show this help
  -v, --version         Show version

Severity:
  error   will hard-error / stop compiling under tsgo
  warn    removed or deprecated surface that very likely needs a change
  review  documented behavior change — verify your project, don't assume
  info    minor or context-dependent note

This is a static heuristic scan. Always confirm with \`tsgo --noEmit\` and your test suite.
`;

function exitThreshold(failOn: Args["failOn"], counts: Record<string, number>): boolean {
  if (failOn === "never") return false;
  if (failOn === "error") return counts.error > 0;
  if (failOn === "warn") return counts.error + counts.warn > 0;
  return counts.error + counts.warn + counts.review > 0; // review
}

function main(): void {
  const a = parseArgs(process.argv.slice(2));
  if (a.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  if (a.version) {
    process.stdout.write(VERSION + "\n");
    process.exit(0);
  }

  const projectDir = resolve(a.project);
  const result = scan({ projectDir, tsconfig: a.tsconfig, noSource: a.noSource });

  const noColor = a.noColor || !!a.out || a.format !== "console" || !process.stdout.isTTY;
  let report: string;
  if (a.format === "json") report = renderJson(result);
  else if (a.format === "markdown") report = renderMarkdown(result);
  else if (a.format === "sarif") report = renderSarif(result, VERSION);
  else report = renderConsole(result, noColor);

  if (a.out) {
    writeFileSync(a.out, report);
    process.stderr.write(`tsgo-ready: wrote ${a.format} report to ${a.out}\n`);
    process.stderr.write(summaryLine(result, true) + "\n");
  } else {
    process.stdout.write(report + (report.endsWith("\n") ? "" : "\n"));
  }

  process.exit(exitThreshold(a.failOn, result.counts) ? 1 : 0);
}

main();
