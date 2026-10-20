import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  parseFrontmatter,
  parseSections,
  validateBrief,
  scoreBrief,
  generateBriefFromSpark,
  SPARK_CATALOG,
  SPARK_CATEGORIES,
  VERSION,
  SCHEMA_VERSION,
} from '../skills/brainstorm2idea/scripts/brainstorm2idea.mjs';

const B2I_CLI = resolve('bin/b2i.mjs');
const TMP_DIR = resolve('tests/tmp-stress-sandbox');

function runB2i(args, input = null, env = {}) {
  const opts = {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  };
  if (input !== null) {
    opts.input = input;
  }
  const res = spawnSync(process.execPath, [B2I_CLI, ...args], opts);
  return {
    code: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    all: (res.stdout || '') + (res.stderr || ''),
  };
}

describe('Stress & Robustness Suite', () => {
  beforeEach(() => {
    if (existsSync(TMP_DIR)) {
      rmSync(TMP_DIR, { recursive: true, force: true });
    }
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TMP_DIR)) {
      rmSync(TMP_DIR, { recursive: true, force: true });
    }
  });

  test('1. UTF-8 BOM resilience (Windows Notepad artifact)', () => {
    const raw = '\uFEFF---\nschema: b2i-brief@1\ntemplate: cli\ndistilled: Tool with UTF8 BOM\n---\n# BOM Tool\n\n## Goal\n- Handle BOM\n\n## Core flows\n1. Run cleanly\n\n## Out of scope\n- Crashes\n';
    const result = validateBrief(raw);
    assert.equal(result.ok, true, 'BOM does not prevent frontmatter parsing');
    assert.equal(result.meta.schema, 'b2i-brief@1');
    assert.equal(result.meta.name, 'BOM Tool');
  });

  test('2. Extreme inputs: null, undefined, and empty string', () => {
    const emptyResult = validateBrief('');
    assert.equal(emptyResult.ok, false);
    assert.equal(emptyResult.passed, 0);

    const whitespaceResult = validateBrief('   \n\n  \t  \n');
    assert.equal(whitespaceResult.ok, false);
  });

  test('3. Large file benchmark (5,000 lines)', () => {
    const filler = Array.from({ length: 5000 }, (_, i) => `- note item ${i}`).join('\n');
    const largeBrief = `---
schema: b2i-brief@1
template: cli
distilled: Stress testing 5000 lines
---
# Big App

## Goal
- Handle scale

## Core flows
1. Process large input

## Out of scope
- Memory leaks

## Notes
${filler}
`;
    const start = Date.now();
    const result = validateBrief(largeBrief);
    const duration = Date.now() - start;

    assert.equal(result.ok, true);
    assert.ok(duration < 500, `Large file validation took ${duration}ms (must be < 500ms)`);
  });

  test('4. Heading with trailing colon and formatting variants', () => {
    const content = `---
schema: b2i-brief@1
template: web
distilled: App with trailing colons in headings
---
# Colon App

## Goal:
- Achieve target

## Core flows:
1. First flow

## Out of scope:
- Extra complexity
`;
    const result = validateBrief(content);
    assert.equal(result.ok, true, 'Trailing colons in H2 headers are accepted');
  });

  test('5. Alternative bullet styles (+ and *) and flow numbering format (1))', () => {
    const content = `---
schema: b2i-brief@1
template: web
distilled: Alternative bullet styles
---
# Bullet App

## Goal
+ Bullet with plus
* Bullet with asterisk

## Core flows
1) Flow with parenthesis delimiter
2. Flow with dot delimiter

## Out of scope
+ No extra deps
`;
    const result = validateBrief(content);
    assert.equal(result.ok, true, 'Plus bullets and parenthesis numbering pass validation');
  });

  test('6. Piping via stdin (b2i check - and b2i score -)', () => {
    const validBrief = `---
schema: b2i-brief@1
template: cli
distilled: Brief piped through standard input
---
# Stdin Tool

## Goal
- Accept piped input

## Core flows
1. Read from stdin

## Out of scope
- Interactive prompts
`;
    const resCheck = runB2i(['check', '-'], validBrief);
    assert.equal(resCheck.code, 0);
    assert.match(resCheck.stdout, /Brainstorm2idea check — PASS \(7\/7\)/);

    const resScore = runB2i(['score', '-'], validBrief);
    assert.equal(resScore.code, 0);
    assert.match(resScore.stdout, /Brainstorm2idea score — \d+\/100/);
  });

  test('7. Path traversal and reserved device names protection in handoff', () => {
    const tempBrief = join(TMP_DIR, 'brief.md');
    const validContent = `---
schema: b2i-brief@1
template: cli
distilled: Safe handoff
---
# Safe Tool

## Goal
- Be safe

## Core flows
1. Check names

## Out of scope
- Exploits
`;
    writeFileSync(tempBrief, validContent, 'utf8');

    // Windows reserved device names
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1'];
    for (const name of reservedNames) {
      const res = runB2i(['handoff', name, '--target', 'raw', '--brief', tempBrief]);
      assert.equal(res.code, 1, `Reserved name ${name} must be rejected`);
      assert.match(res.all, /reserved/i);
    }
  });

  test('8. Spark catalog integrity: all 24 archetypes pass check (7/7) and score >= 90', () => {
    assert.equal(SPARK_CATALOG.length, 24, 'Catalog contains 24 curated archetypes');
    assert.equal(SPARK_CATEGORIES.length, 6, 'Catalog spans 6 categories');

    for (const spark of SPARK_CATALOG) {
      assert.ok(SPARK_CATEGORIES.includes(spark.category), `${spark.id} has valid category`);
      const briefMd = generateBriefFromSpark(spark);
      const valResult = validateBrief(briefMd);
      assert.equal(valResult.ok, true, `Spark ${spark.id} must pass 7/7 checks (${valResult.errors.join(', ')})`);

      const scoreResult = scoreBrief(briefMd);
      assert.equal(scoreResult.ok, true, `Spark ${spark.id} must score cleanly`);
      assert.ok(scoreResult.score >= 90, `Spark ${spark.id} score (${scoreResult.score}) must be >= 90`);
      assert.equal(scoreResult.grade, 'EXCELLENT', `Spark ${spark.id} grade must be EXCELLENT`);
    }
  });

  test('9. CLI b2i spark command: listing, filtering, and seeding', () => {
    // Basic listing
    const resList = runB2i(['spark']);
    assert.equal(resList.code, 0);
    assert.match(resList.stdout, /Brainstorm2idea spark — 24 curated prototype archetypes/);
    assert.match(resList.stdout, /devtools, productivity/);

    // Filter by category
    const resDevtools = runB2i(['spark', 'devtools']);
    assert.equal(resDevtools.code, 0);
    assert.match(resDevtools.stdout, /env-diff/);
    assert.match(resDevtools.stdout, /git-staleness/);

    // JSON export
    const resJson = runB2i(['spark', '--json']);
    assert.equal(resJson.code, 0);
    const parsed = JSON.parse(resJson.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.total, 24);

    // Seed output to stdout
    const resSeed = runB2i(['spark', '--seed', 'env-diff']);
    assert.equal(resSeed.code, 0);
    assert.match(resSeed.stdout, /schema: b2i-brief@1/);
    assert.match(resSeed.stdout, /# env-diff/);

    // Seed output to file
    const targetBrief = join(TMP_DIR, 'seeded-brief.md');
    const resSeedFile = runB2i(['spark', '--seed', 'env-diff', '--output', targetBrief]);
    assert.equal(resSeedFile.code, 0);
    assert.ok(existsSync(targetBrief), 'seeded file created on disk');

    const fileContent = readFileSync(targetBrief, 'utf8');
    const checkRes = validateBrief(fileContent);
    assert.equal(checkRes.ok, true, 'seeded brief on disk passes 7/7 validation');
  });
});
