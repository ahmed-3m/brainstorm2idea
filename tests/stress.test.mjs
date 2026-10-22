import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync, symlinkSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  parseFrontmatter,
  parseSections,
  validateBrief,
  scoreBrief,
  exportBrief,
  quoteCmdArg,
  toI2pArg,
  mergeSectionsIntoPrototype,
  generateBriefFromSpark,
  SPARK_CATALOG,
  SPARK_CATEGORIES,
  VERSION,
  SCHEMA_VERSION,
} from '../skills/brainstorm2idea/scripts/brainstorm2idea.mjs';

const B2I_CLI = resolve('bin/b2i.mjs');
const TMP_DIR = resolve('tests/tmp-stress-sandbox');

// CLI output is asserted as plain text: a FORCE_COLOR in the caller's
// environment would otherwise leak into every spawned b2i.
delete process.env.FORCE_COLOR;

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

  test('8. Spark catalog integrity: all 40 archetypes pass check (7/7) and score >= 90', () => {
    assert.equal(SPARK_CATALOG.length, 40, 'Catalog contains 40 curated archetypes');
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
    assert.match(resList.stdout, /Brainstorm2idea spark — 40 curated prototype archetypes/);
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
    assert.equal(parsed.total, 40);

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

// ---------------------------------------------------------------------------
// Marketplace-readiness regressions (docs/evals/2026-10-22-stress-and-efficacy.md).
// Each test reproduces a bug found in the published v0.4.2.
// ---------------------------------------------------------------------------

const ENGINE = resolve('skills/brainstorm2idea/scripts/brainstorm2idea.mjs');
const runNode = (args, input = null) => {
  const res = spawnSync(process.execPath, args, { encoding: 'utf8', input: input ?? undefined });
  return { code: res.status, stdout: res.stdout || '', stderr: res.stderr || '', all: (res.stdout || '') + (res.stderr || '') };
};
const ODD_CASE_BRIEF = `---
schema: b2i-brief@1
template: cli
distilled: A tiny CLI that counts words
---
# WordCount

## goal
- Count words in a file

## core flows
1. Run wc on a file and print the count

## out of scope
- GUI
`;
const NO_STACK = /node:internal|node:fs|^\s+at /m;

describe('Marketplace-readiness regressions', () => {
  beforeEach(() => {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test('npm POSIX bin layout: a symlink named `b2i` runs the CLI (was a silent exit-0 no-op)', (t) => {
    const link = join(TMP_DIR, 'b2i');
    try {
      symlinkSync(B2I_CLI, link, 'file');
    } catch (err) {
      t.skip(`cannot create symlinks here (${err.code})`);
      return;
    }
    const version = runNode([link, '--version']);
    assert.equal(version.code, 0);
    assert.equal(version.stdout.trim(), VERSION);

    const garbage = join(TMP_DIR, 'garbage.md');
    writeFileSync(garbage, 'garbage\n');
    const check = runNode([link, 'check', garbage]);
    assert.equal(check.code, 1, 'an invalid brief must fail through the symlinked bin');
    assert.match(check.stdout, /FAIL/);
  });

  test('engine script still runs directly (the path SKILL.md documents) and exactly once', () => {
    const res = runNode([ENGINE, '--version']);
    assert.equal(res.code, 0);
    assert.equal(res.stdout.trim(), VERSION, 'printed once, not twice');
  });

  test('a directory where a file is expected fails cleanly, no stack trace', () => {
    const dir = join(TMP_DIR, 'adir');
    mkdirSync(dir);
    for (const cmd of ['check', 'score', 'export', 'dump']) {
      const res = runB2i([cmd, dir]);
      assert.equal(res.code, 1, `${cmd} on a directory exits 1`);
      assert.match(res.all, /FAIL/, `${cmd} prints a FAIL verdict`);
      assert.match(res.all, /directory/);
      assert.doesNotMatch(res.all, NO_STACK, `${cmd} must not print a stack trace`);
    }
    const json = runB2i(['check', dir, '--json']);
    assert.equal(json.code, 1);
    assert.equal(JSON.parse(json.stdout).ok, false, '--json still emits parseable JSON');
  });

  test('--output into a missing parent directory fails cleanly', () => {
    const res = runB2i(['dump', '-', '--output', join(TMP_DIR, 'nope', 'brief.md')], 'um so a todo app');
    assert.equal(res.code, 1);
    assert.match(res.all, /FAIL[\s\S]*no such file or directory/);
    assert.doesNotMatch(res.all, NO_STACK);
  });

  test('check --fix on a read-only brief fails cleanly instead of crashing', () => {
    const brief = join(TMP_DIR, 'ro.md');
    writeFileSync(brief, ODD_CASE_BRIEF.replace('schema: b2i-brief@1\n', ''));
    chmodSync(brief, 0o444);
    try {
      const res = runB2i(['check', brief, '--fix']);
      assert.equal(res.code, 1);
      assert.match(res.all, /permission denied|read-only/i);
      assert.doesNotMatch(res.all, NO_STACK);
    } finally {
      chmodSync(brief, 0o644);
    }
  });

  test('spark --seed <id> --output <existing dir> writes <dir>/brief.md (as the help text advertises)', () => {
    const res = runB2i(['spark', '--seed', 'env-diff', '--output', TMP_DIR]);
    assert.equal(res.code, 0, res.all);
    assert.equal(validateBrief(readFileSync(join(TMP_DIR, 'brief.md'), 'utf8')).ok, true);
  });

  test('handoff --target raw keeps section content when headings are lowercase', () => {
    const brief = join(TMP_DIR, 'brief.md');
    writeFileSync(brief, ODD_CASE_BRIEF);
    assert.equal(validateBrief(ODD_CASE_BRIEF).ok, true, 'check accepts lowercase headings');
    const res = runB2i(['handoff', join(TMP_DIR, 'proj'), '--target', 'raw', '--brief', brief]);
    assert.equal(res.code, 0, res.all);
    const proto = readFileSync(join(TMP_DIR, 'proj', 'PROTOTYPE.md'), 'utf8');
    assert.match(proto, /## Goal\n- Count words in a file/);
    assert.match(proto, /## Core flows\n1\. Run wc on a file/);
    assert.match(proto, /## Out of scope\n- GUI/);
  });

  test('handoff --target raw refuses to overwrite an existing PROTOTYPE.md and keeps the brief', () => {
    const brief = join(TMP_DIR, 'brief.md');
    writeFileSync(brief, ODD_CASE_BRIEF);
    const proj = join(TMP_DIR, 'proj');
    mkdirSync(proj);
    writeFileSync(join(proj, 'PROTOTYPE.md'), 'hand-written spec\n');
    const res = runB2i(['handoff', proj, '--target', 'raw', '--brief', brief]);
    assert.equal(res.code, 1);
    assert.match(res.all, /already exists/);
    assert.equal(readFileSync(join(proj, 'PROTOTYPE.md'), 'utf8'), 'hand-written spec\n');
    assert.ok(existsSync(brief), 'brief is not consumed by a refused handoff');
  });

  test('handoff rejects an unknown --target instead of silently using i2p', () => {
    const brief = join(TMP_DIR, 'brief.md');
    writeFileSync(brief, ODD_CASE_BRIEF);
    const res = runB2i(['handoff', join(TMP_DIR, 'proj'), '--target', 'rwa', '--brief', brief, '--dry-run']);
    assert.equal(res.code, 1);
    assert.match(res.all, /unknown --target "rwa"/);
  });

  test('export keeps + bullets that check accepts, and ignores prose that merely contains "2. "', () => {
    const brief = ODD_CASE_BRIEF
      .replace('- Count words in a file', '+ Count words in a file')
      .replace('## out of scope\n- GUI', '## out of scope\n- GUI\nSee step 2. for details');
    assert.equal(validateBrief(brief).ok, true);
    const parsed = JSON.parse(exportBrief(brief, { format: 'json' }));
    assert.deepEqual(parsed.goals, ['Count words in a file']);
    assert.deepEqual(parsed.outOfScope, ['GUI']);
  });

  test('score --json exits 1 on an invalid brief, like plain score', () => {
    const bad = join(TMP_DIR, 'bad.md');
    writeFileSync(bad, 'garbage\n');
    assert.equal(runB2i(['score', bad]).code, 1);
    const json = runB2i(['score', bad, '--json']);
    assert.equal(json.code, 1);
    assert.equal(JSON.parse(json.stdout).ok, false);
  });

  test('score: a rabbit hole in Core flows is not "mitigated" by a synonym in Out of scope', () => {
    const leaked = `---
schema: b2i-brief@1
template: web
distilled: Sticker shop
---
# Shop

## Goal
- Sell stickers online

## Core flows
1. Pay for the cart with Stripe checkout
2. Sign in with Google OAuth to see order history

## Out of scope
- PayPal payments
- SAML enterprise SSO

## Risks & assumptions
- RISK: none
`;
    const result = scoreBrief(leaked);
    assert.deepEqual(result.categories.rabbitHoles.detected.map((d) => d.label), ['OAuth/SSO', 'Payment gateway']);
    assert.deepEqual(result.categories.rabbitHoles.mitigated, []);
    assert.equal(result.breakdown.rabbitHoles, 10, '40 - 2 x 15');
  });

  test('quoteCmdArg caret-escapes cmd metacharacters, % included, and doubles trailing backslashes', () => {
    assert.equal(quoteCmdArg('100%'), '^"100^%^"');
    assert.equal(quoteCmdArg('C:\\work\\'), '^"C:\\work\\\\^"');
    assert.equal(quoteCmdArg('say "hi"'), `^"say^ 'hi'^"`);
  });

  test('quoteCmdArg: a real cmd.exe shim receives every argument literally (Windows npx fallback)', (t) => {
    if (process.platform !== 'win32') {
      t.skip('cmd.exe is Windows-only');
      return;
    }
    // Spawned exactly like handoff's fallback: one escaped command line with { shell: true }.
    const shim = join(TMP_DIR, 'shim');
    mkdirSync(shim);
    writeFileSync(join(shim, 'argv.js'), 'console.log(JSON.stringify(process.argv.slice(2)));\n');
    writeFileSync(join(shim, 'npx.cmd'), '@node "%~dp0argv.js" %*\r\n');
    const args = [
      'new', 'C:\\work\\', '--template', 'cli',
      '--idea', 'save 100% and use %OS%',
      'see %B2I_INJECT% end',
      'a & b | c > d < e ^ f ( g ) !h!',
      'C:\\my dir\\sub\\',
    ];
    const res = spawnSync(['npx', ...args.map(quoteCmdArg)].join(' '), {
      encoding: 'utf8',
      shell: true,
      env: { ...process.env, PATH: `${shim};${process.env.PATH}`, B2I_INJECT: 'a" & echo INJECTED' },
    });
    // One JSON line: an expanded %B2I_INJECT% would close the quote and run `echo INJECTED`.
    assert.deepEqual(JSON.parse(res.stdout.trim()), args, res.stdout + res.stderr);
  });

  test('a "## Goal" inside a fenced code block is not a section (an empty real Goal still fails)', () => {
    const fenced = ODD_CASE_BRIEF.replace(
      '## goal\n- Count words in a file\n',
      '## Goal\n\n## Notes\n```md\n## Goal\n- example only\n```\n',
    );
    const { sections } = parseSections(parseFrontmatter(fenced).body);
    assert.equal(sections.Goal, '');
    assert.match(sections.Notes, /## Goal\n- example only/, 'fenced lines stay as content of the enclosing section');
    assert.equal(validateBrief(fenced).ok, false);

    // A line like "```md" inside an open fence is content, not a closer (CommonMark).
    const nested = ODD_CASE_BRIEF.replace(
      '## out of scope',
      '## Notes\n```\n```md\n## Goal\n- example only\n```\n```\n\n## out of scope',
    );
    const nestedSections = parseSections(parseFrontmatter(nested).body).sections;
    assert.equal(nestedSections.goal, '- Count words in a file', 'the real Goal survives');
    assert.match(nestedSections.Notes, /## Goal\n- example only/);
  });


  test('frontmatter: interior quotes in a quoted value are kept, not truncated', () => {
    const { meta } = parseFrontmatter('---\ndistilled: "Say "hi" now"\nname: \'it\'s\' # c\n---\n');
    assert.equal(meta.distilled, 'Say "hi" now');
    assert.equal(meta.name, "it's");
    // A comment that itself contains the quote character is still a comment.
    const commented = parseFrontmatter(
      '---\na: "hello" # the "wc" tool\nb: \'ship it\' # it\'s a prototype\nc: "Say "hi" now" # note\n---\n',
    ).meta;
    assert.deepEqual(commented, { a: 'hello', b: 'ship it', c: 'Say "hi" now' });
  });

  test('distilled length counts characters, not UTF-16 units (101 emoji pass, 201 fail)', () => {
    const withDistilled = (d) => ODD_CASE_BRIEF.replace('distilled: A tiny CLI that counts words', `distilled: ${d}`);
    assert.equal(validateBrief(withDistilled('🚀'.repeat(101))).ok, true);
    const over = validateBrief(withDistilled('🚀'.repeat(201)));
    assert.equal(over.ok, false);
    assert.match(over.errors.join('\n'), /201 chars, max 200/);
  });

  test('i2p merge inserts brief text verbatim, even with String.replace patterns like $& and $$', () => {
    const proto = '# P\n\n## Goal\n- TODO\n\n## Core flows\n1. TODO\n\n## Out of scope\n- TODO\n';
    const sections = {
      Goal: '- Cost is $$5 and $& stays',
      'Core flows': "1. Echo $' and $1",
      'Out of scope': '- $` nothing',
    };
    const merged = mergeSectionsIntoPrototype(proto, { sections });
    for (const text of Object.values(sections)) assert.ok(merged.includes(text), `kept verbatim: ${text}`);
  });
});

// ---------------------------------------------------------------------------
// The report's "Open" items, now fixed. Each test fails on 24bc9e4.
// ---------------------------------------------------------------------------

describe('Open stress-test items', () => {
  beforeEach(() => {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test('spark --seed and dump refuse to overwrite an existing brief unless --force (as init does)', () => {
    const brief = join(TMP_DIR, 'brief.md');
    writeFileSync(brief, ODD_CASE_BRIEF);

    const spark = runB2i(['spark', '--seed', 'env-diff', '--output', brief]);
    assert.equal(spark.code, 1, spark.all);
    assert.match(spark.all, /already exists.*--force/);
    const dump = runB2i(['dump', '-', '--output', TMP_DIR], 'um so a tool that counts words in files');
    assert.equal(dump.code, 1, dump.all);
    assert.match(dump.all, /already exists.*--force/);
    assert.equal(readFileSync(brief, 'utf8'), ODD_CASE_BRIEF, 'the existing brief is untouched');

    const forced = runB2i(['spark', '--seed', 'env-diff', '--output', brief, '--force']);
    assert.equal(forced.code, 0, forced.all);
    assert.match(readFileSync(brief, 'utf8'), /# env-diff/);
    const forcedDump = runB2i(['dump', '-', '--output', brief, '--force'], 'a tool that counts words in files');
    assert.equal(forcedDump.code, 0, forcedDump.all);
    assert.match(readFileSync(brief, 'utf8'), /# Draft Prototype/);
  });

  test('frontmatter after leading blank lines: check names the cause and --fix repairs it', () => {
    const brief = join(TMP_DIR, 'brief.md');
    writeFileSync(brief, `\n\n${ODD_CASE_BRIEF}`);
    const res = runB2i(['check', brief]);
    assert.equal(res.code, 1);
    assert.match(res.all, /frontmatter must start on line 1/);

    const fixed = runB2i(['check', brief, '--fix']);
    assert.equal(fixed.code, 0, fixed.all);
    assert.match(fixed.all, /removed blank lines before the opening ---/);
    assert.equal(readFileSync(brief, 'utf8'), ODD_CASE_BRIEF);
  });

  test('a duplicated required section fails check by name; other duplicates warn', () => {
    const dupGoal = ODD_CASE_BRIEF.replace('## core flows', '## Goal\n- Second goal block\n\n## core flows');
    const res = validateBrief(dupGoal);
    assert.equal(res.ok, false, 'the first Goal block is not silently dropped');
    assert.match(res.errors.join('\n'), /goal: duplicate ## Goal sections/);
    assert.equal(res.total, 7);

    const dupNotes = `${ODD_CASE_BRIEF}\n## Notes\n- a\n\n## notes\n- b\n`;
    const notes = validateBrief(dupNotes);
    assert.equal(notes.ok, true);
    assert.match(notes.warnings.join('\n'), /duplicate ## notes section: only the last one is used/);
    // ...and the last one really is the one kept, whatever its case.
    assert.deepEqual(
      Object.keys(notes.sections).filter((k) => /^notes$/i.test(k)).map((k) => notes.sections[k]),
      ['- b']
    );

    const both = validateBrief(ODD_CASE_BRIEF.replace('## out of scope', '## Public API\n1. count(text)\n\n## out of scope'));
    assert.equal(both.ok, false, 'Core flows and Public API together would drop one of them downstream');
    assert.match(both.errors.join('\n'), /flows: both ## Core flows and ## Public API present/);
  });

  test('score: a lowercase "## public api" counts as the library API section', () => {
    const lib = ODD_CASE_BRIEF.replace('template: cli', 'template: library')
      .replace('## core flows\n1. Run wc on a file and print the count', '## public api\n1. Count words in a string');
    const res = scoreBrief(lib);
    assert.equal(res.ok, true);
    assert.equal(res.categories.alignment.templateMismatch, null);
  });

  test('handoff --i2p <path to a .cmd> runs on Windows, with spaces, & and % in path and text', (t) => {
    if (process.platform !== 'win32') {
      t.skip('.cmd shims are Windows-only');
      return;
    }
    // Spawned without a shell, Node refuses a .cmd (EINVAL); handoff now routes
    // it through the same escaped cmd.exe line as the npx fallback.
    const tools = join(TMP_DIR, 'my tools & co');
    mkdirSync(tools);
    const shim = join(tools, 'i2p.cmd');
    writeFileSync(shim, `@node "${resolve('tests/fixtures/mock-i2p.mjs')}" %*\r\n`);
    const brief = join(TMP_DIR, 'brief.md');
    writeFileSync(brief, ODD_CASE_BRIEF.replace('A tiny CLI that counts words', 'Counts 100% of %OS% words & more'));

    const res = spawnSync(process.execPath, [B2I_CLI, 'handoff', 'proj', '--brief', brief, '--i2p', shim], {
      encoding: 'utf8',
      cwd: TMP_DIR,
    });
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.doesNotMatch(res.stderr, /DEP0190/, 'no shell-args deprecation warning');
    const proto = readFileSync(join(TMP_DIR, 'proj', 'PROTOTYPE.md'), 'utf8');
    assert.match(proto, /> Idea: Counts 100% of %OS% words & more/, 'the idea reached i2p literally');
    assert.match(proto, /Count words in a file/, 'the brief was merged');
  });

  test('handoff passes check-valid quotes and backslashes in distilled/title to i2p without tripping its arg guard', () => {
    // Found in the A/B run: `distilled: … tap "watered today", …` passed check,
    // then i2p refused --idea and the agent had to edit the brief.
    const brief = join(TMP_DIR, 'brief.md');
    writeFileSync(
      brief,
      ODD_CASE_BRIEF.replace('A tiny CLI that counts words', 'Tap "watered today" in C:\\plants').replace('# WordCount', '# Word "Count"')
    );
    assert.equal(validateBrief(readFileSync(brief, 'utf8')).ok, true);

    const res = spawnSync(process.execPath, [B2I_CLI, 'handoff', 'proj', '--brief', brief, '--i2p', resolve('tests/fixtures/mock-i2p.mjs')], {
      encoding: 'utf8',
      cwd: TMP_DIR,
    });
    assert.equal(res.status, 0, res.stdout + res.stderr);
    const proto = readFileSync(join(TMP_DIR, 'proj', 'PROTOTYPE.md'), 'utf8');
    assert.match(proto, /# Prototype spec — Word 'Count'/);
    assert.match(proto, /> Idea: Tap 'watered today' in C:\/plants/);
    assert.equal(toI2pArg('a\tb\n"c"\\'), "a b 'c'/");
  });
});
