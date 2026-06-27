// Loaders: tsconfig (JSONC + shallow `extends` resolution), package.json, source-file walk.
// Zero dependencies — we tolerate comments/trailing commas ourselves rather than pull in a parser.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";

// Strip // and /* */ comments and trailing commas from JSONC so JSON.parse accepts it.
// Not a full JSON5 parser — good enough for tsconfig/package.json in the wild.
export function parseJsonc(text: string): unknown {
  let out = "";
  let inStr = false;
  let strq = "";
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inLine) {
      if (c === "\n") {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === "*" && n === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      out += c;
      if (c === "\\") {
        out += n;
        i++;
      } else if (c === strq) {
        inStr = false;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      strq = c;
      out += '"'; // normalize single-quoted strings JSON can't read
      continue;
    }
    if (c === "/" && n === "/") {
      inLine = true;
      i++;
      continue;
    }
    if (c === "/" && n === "*") {
      inBlock = true;
      i++;
      continue;
    }
    out += c;
  }
  // remove trailing commas: ,}  ,]
  out = out.replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(out);
}

export interface RawTsconfig {
  path: string;
  // merged compilerOptions after following `extends`
  compilerOptions: Record<string, unknown>;
  // raw text of the leaf config, for line lookups
  text: string;
  files?: string[];
}

const TSCONFIG_CANDIDATES = ["tsconfig.json", "tsconfig.base.json"];

export function findTsconfig(projectDir: string, override?: string): string | undefined {
  if (override) {
    const p = resolve(projectDir, override);
    return existsSync(p) ? p : undefined;
  }
  for (const c of TSCONFIG_CANDIDATES) {
    const p = join(projectDir, c);
    if (existsSync(p)) return p;
  }
  return undefined;
}

// Load a tsconfig and merge any `extends` chain (shallow, best-effort, cycle-guarded).
export function loadTsconfig(tsconfigPath: string): RawTsconfig | undefined {
  const seen = new Set<string>();
  const merged: Record<string, unknown> = {};
  let leafText = "";
  let leafFiles: string[] | undefined;

  function visit(p: string, depth: number): void {
    if (depth > 10 || seen.has(p) || !existsSync(p)) return;
    seen.add(p);
    let parsed: Record<string, unknown>;
    let text: string;
    try {
      text = readFileSync(p, "utf8");
      parsed = (parseJsonc(text) as Record<string, unknown>) ?? {};
    } catch {
      return;
    }
    if (depth === 0) {
      leafText = text;
      if (Array.isArray(parsed.files)) leafFiles = parsed.files as string[];
    }
    // resolve parents first so the child overrides them
    const ext = parsed.extends;
    const parents = Array.isArray(ext) ? ext : ext ? [ext] : [];
    for (const e of parents as string[]) {
      const base = resolveExtends(p, e);
      if (base) visit(base, depth + 1);
    }
    const co = parsed.compilerOptions;
    if (co && typeof co === "object") Object.assign(merged, co);
  }

  visit(tsconfigPath, 0);
  return { path: tsconfigPath, compilerOptions: merged, text: leafText, files: leafFiles };
}

function resolveExtends(fromPath: string, ext: string): string | undefined {
  const fromDir = dirname(fromPath);
  if (ext.startsWith(".") || ext.startsWith("/")) {
    let p = resolve(fromDir, ext);
    if (!p.endsWith(".json")) p += ".json";
    return existsSync(p) ? p : undefined;
  }
  // package extends (e.g. "@tsconfig/node20/tsconfig.json") — best effort
  const p = join(fromDir, "node_modules", ext.endsWith(".json") ? ext : `${ext}/tsconfig.json`);
  return existsSync(p) ? p : undefined;
}

export interface PackageJson {
  path: string;
  deps: Record<string, string>; // dependencies + devDependencies merged
}

export function loadPackageJson(projectDir: string): PackageJson | undefined {
  const p = join(projectDir, "package.json");
  if (!existsSync(p)) return undefined;
  try {
    const parsed = parseJsonc(readFileSync(p, "utf8")) as Record<string, unknown>;
    const deps: Record<string, string> = {};
    for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      const d = parsed[key];
      if (d && typeof d === "object") {
        for (const [name, ver] of Object.entries(d as Record<string, string>)) deps[name] = ver;
      }
    }
    return { path: p, deps };
  } catch {
    return undefined;
  }
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  "vendor",
]);

export interface SourceFile {
  path: string; // relative to project root
  text: string;
}

// Walk source files (.ts/.tsx/.mts/.cts and .js/.jsx for JSDoc checks), capped for safety.
export function walkSource(projectDir: string, maxFiles = 5000): SourceFile[] {
  const out: SourceFile[] = [];
  const exts = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
  function walk(dir: string): void {
    if (out.length >= maxFiles) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (out.length >= maxFiles) return;
      if (SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
      } else if (st.isFile() && exts.some((e) => name.endsWith(e)) && !name.endsWith(".d.ts")) {
        if (st.size > 2_000_000) continue; // skip giant generated files
        try {
          out.push({ path: relative(projectDir, full), text: readFileSync(full, "utf8") });
        } catch {
          /* ignore unreadable */
        }
      }
    }
  }
  walk(projectDir);
  return out;
}

// Find the 1-based line of the first occurrence of a JSON key like "moduleResolution" in tsconfig text.
export function lineOfKey(text: string, key: string): number | undefined {
  const re = new RegExp(`["']${key}["']\\s*:`);
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return i + 1;
  }
  return undefined;
}
