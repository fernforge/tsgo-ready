import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scan } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const broken = join(here, "fixtures", "broken");
const clean = join(here, "fixtures", "clean");

test("broken fixture: flags removed flags as errors", () => {
  const r = scan({ projectDir: broken });
  const ids = r.findings.map((f) => f.id);
  assert.ok(r.counts.error >= 2, "expects multiple hard errors");
  const removed = r.findings.filter((f) => f.id === "tsconfig/removed-flag");
  const titles = removed.map((f) => f.title);
  assert.ok(titles.some((t) => t.includes("importsNotUsedAsValues")));
  assert.ok(titles.some((t) => t.includes("keyofStringsOnly")));
  assert.ok(ids.includes("tsconfig/ignore-deprecations"));
});

test("broken fixture: flags Compiler-API tooling and decorator frameworks", () => {
  const r = scan({ projectDir: broken });
  const ids = r.findings.map((f) => f.id);
  assert.ok(ids.includes("tooling/compiler-api"), "ts-morph should be flagged");
  assert.ok(ids.includes("tooling/decorator-framework"), "nestjs/typeorm should be flagged");
  assert.ok(ids.includes("tooling/type-aware-eslint"), "typescript-eslint should be flagged");
  assert.ok(ids.includes("tsconfig/decorators"), "decorator config should be flagged");
});

test("broken fixture: scans source for const enum and JSDoc", () => {
  const r = scan({ projectDir: broken });
  const ids = r.findings.map((f) => f.id);
  assert.ok(ids.includes("source/const-enum"), "const enum under isolatedModules");
  assert.ok(ids.includes("source/jsdoc-tag"), "JSDoc @enum in JS");
  const ce = r.findings.find((f) => f.id === "source/const-enum");
  assert.equal(ce?.file, "src/model.ts");
  assert.equal(ce?.line, 1);
});

test("removed-flag findings carry a tsconfig line number", () => {
  const r = scan({ projectDir: broken });
  const f = r.findings.find((x) => x.title.includes("keyofStringsOnly"));
  assert.ok(f?.line && f.line > 0, "should resolve a line in tsconfig.json");
  assert.equal(f?.file, "tsconfig.json");
});

test("clean fixture: no errors or warnings", () => {
  const r = scan({ projectDir: clean });
  assert.equal(r.counts.error, 0, JSON.stringify(r.findings, null, 2));
  assert.equal(r.counts.warn, 0);
});

test("noSource skips the source walk", () => {
  const r = scan({ projectDir: broken, noSource: true });
  assert.ok(!r.findings.some((f) => f.category === "source"));
});
