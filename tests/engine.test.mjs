import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  parseFrontmatter,
  parseSections,
  validateBrief,
  mergeSectionsIntoPrototype,
  exportBrief,
  scoreBrief,
  fixBrief,
  introspectI2pTemplates,
  HELP,
  RABBIT_HOLES,
  TRUST_TRIGGERS,
  VALID_TEMPLATES,
  SCHEMA_VERSION,
  VERSION,
} from '../skills/brainstorm2idea/scripts/brainstorm2idea.mjs';

const B2I_CLI = resolve('bin/b2i.mjs');
const MOCK_I2P = resolve('tests/fixtures/mock-i2p.mjs');
const FIXTURES_DIR = resolve('tests/fixtures');
const TMP_DIR = resolve('tests/tmp-test-sandbox');

// CLI output is asserted as plain text: a FORCE_COLOR in the caller's
// environment would otherwise leak into every spawned b2i.
delete process.env.FORCE_COLOR;

function runB2i(args, env = {}, input = null) {
  const opts = {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  };
  if (input !== null) opts.input = input;
  const res = spawnSync(process.execPath, [B2I_CLI, ...args], opts);
  return {
    code: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    all: (res.stdout || '') + (res.stderr || ''),
  };
}

describe('1. Frontmatter Parser & Section Extraction', () => {
  test('parses frontmatter and handles colon inside quoted strings', () => {
    const raw = `---
schema: b2i-brief@1
template: cli # inline comment
distilled: "Tool: parse, convert: and run" # comment after quote
---
# My Tool
## Goal
- Build it
`;
    const { meta, body } = parseFrontmatter(raw);
    assert.equal(meta.schema, 'b2i-brief@1');
    assert.equal(meta.template, 'cli');
    assert.equal(meta.distilled, 'Tool: parse, convert: and run');

    const { title, sections } = parseSections(body);
    assert.equal(title, 'My Tool');
    assert.ok(sections.Goal);
    assert.match(sections.Goal, /Build it/);
  });

  test('handles missing frontmatter gracefully', () => {
    const raw = `# No Frontmatter\nJust body`;
    const { meta, body } = parseFrontmatter(raw);
    assert.deepEqual(meta, {});
    assert.equal(body, raw);
  });
});

describe('2. Hard Check Validations (b2i check)', () => {
  test('valid-brief.md passes all 7 checks (7/7)', () => {
    const content = readFileSync(join(FIXTURES_DIR, 'valid-brief.md'), 'utf8');
    const result = validateBrief(content);
    assert.equal(result.ok, true);
    assert.equal(result.passed, 7);
    assert.equal(result.errors.length, 0);
  });

  test('library-template.md passes and accepts Public API section', () => {
    const content = readFileSync(join(FIXTURES_DIR, 'library-template.md'), 'utf8');
    const result = validateBrief(content);
    assert.equal(result.ok, true);
    assert.equal(result.passed, 7);
  });

  test('none-template.md passes check', () => {
    const content = readFileSync(join(FIXTURES_DIR, 'none-template.md'), 'utf8');
    const result = validateBrief(content);
    assert.equal(result.ok, true);
    assert.equal(result.passed, 7);
    assert.equal(result.meta.template, 'none');
  });

  test('colon-in-distilled.md parses and passes', () => {
    const content = readFileSync(join(FIXTURES_DIR, 'colon-in-distilled.md'), 'utf8');
    const result = validateBrief(content);
    assert.equal(result.ok, true);
    assert.match(result.meta.distilled, /API tool: parse/);
  });

  test('fail-no-h1.md fails check 2 (name)', () => {
    const content = readFileSync(join(FIXTURES_DIR, 'fail-no-h1.md'), 'utf8');
    const result = validateBrief(content);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('name: missing H1')));
  });

  test('fail-invalid-template.md fails check 3 (template)', () => {
    const content = readFileSync(join(FIXTURES_DIR, 'fail-invalid-template.md'), 'utf8');
    const result = validateBrief(content);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('template: invalid "mobile"')));
  });

  test('fail-goal-4-bullets.md fails check 4 (goal)', () => {
    const content = readFileSync(join(FIXTURES_DIR, 'fail-goal-4-bullets.md'), 'utf8');
    const result = validateBrief(content);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('goal: 4 bullets, max 3')));
  });

  test('fail-no-flows.md fails check 5 (flows)', () => {
    const content = readFileSync(join(FIXTURES_DIR, 'fail-no-flows.md'), 'utf8');
    const result = validateBrief(content);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('flows: 0 numbered flows found')));
  });

  test('fail-unnumbered-flows.md fails check 5 (numbered items required)', () => {
    const content = readFileSync(join(FIXTURES_DIR, 'fail-unnumbered-flows.md'), 'utf8');
    const result = validateBrief(content);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('flows: 0 numbered flows found')));
  });

  test('fail-no-out-of-scope.md fails check 6 (out-of-scope)', () => {
    const content = readFileSync(join(FIXTURES_DIR, 'fail-no-out-of-scope.md'), 'utf8');
    const result = validateBrief(content);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('out-of-scope: at least 1 bullet required')));
  });

  test('fail-distilled-too-long.md fails check 7 (distilled > 200 chars)', () => {
    const content = readFileSync(join(FIXTURES_DIR, 'fail-distilled-too-long.md'), 'utf8');
    const result = validateBrief(content);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('chars, max 200')));
  });

  test('fail-missing-schema.md fails check 1 (schema)', () => {
    const content = readFileSync(join(FIXTURES_DIR, 'fail-missing-schema.md'), 'utf8');
    const result = validateBrief(content);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('schema: missing frontmatter schema')));
  });

  test('warn-notes-overflow.md passes check with warning', () => {
    const content = readFileSync(join(FIXTURES_DIR, 'warn-notes-overflow.md'), 'utf8');
    const result = validateBrief(content);
    assert.equal(result.ok, true);
    assert.equal(result.passed, 7);
    assert.ok(result.warnings.some((w) => w.includes('notes: 7 bullets, recommended max 6')));
  });

  test('warn-schema-drift.md passes check with drift warning', () => {
    const content = readFileSync(join(FIXTURES_DIR, 'warn-schema-drift.md'), 'utf8');
    const result = validateBrief(content);
    assert.equal(result.ok, true);
    assert.equal(result.passed, 7);
    assert.ok(result.warnings.some((w) => w.includes('schema drift')));
  });
});

describe('3. CLI Commands: check, list', () => {
  test('b2i check exits 0 with compact PASS verdict', () => {
    const res = runB2i(['check', join(FIXTURES_DIR, 'valid-brief.md')]);
    assert.equal(res.code, 0);
    assert.match(res.stdout, /Brainstorm2idea check — PASS \(7\/7\)/);
  });

  test('b2i check --json outputs machine-readable result', () => {
    const res = runB2i(['check', join(FIXTURES_DIR, 'valid-brief.md'), '--json']);
    assert.equal(res.code, 0);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.passed, 7);
    assert.equal(parsed.meta.name, 'Recipe Box');
  });

  test('b2i check on failing brief prints at most 3 failure notes', () => {
    const res = runB2i(['check', join(FIXTURES_DIR, 'fail-goal-4-bullets.md')]);
    assert.equal(res.code, 1);
    assert.match(res.all, /Brainstorm2idea check — FAIL \(6\/7\)/);
    const lines = res.all.trim().split('\n');
    assert.ok(lines.length <= 4); // verdict + max 3 notes
  });

  test('b2i check on non-existent file exits 1', () => {
    const res = runB2i(['check', 'non-existent-brief.md']);
    assert.equal(res.code, 1);
    assert.match(res.all, /file not found/);
  });

  test('b2i list outputs schema and templates', () => {
    const res = runB2i(['list']);
    assert.equal(res.code, 0);
    assert.match(res.stdout, /b2i-brief@1/);
    assert.match(res.stdout, /web, api, cli, worker, library, none/);
  });

  test('b2i list --json outputs structured metadata', () => {
    const res = runB2i(['list', '--json']);
    assert.equal(res.code, 0);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.schema, 'b2i-brief@1');
    assert.deepEqual(parsed.templates, VALID_TEMPLATES);
  });
});

describe('4. CLI Command: handoff', () => {
  beforeEach(() => {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test('handoff blocks and exits 1 if brief fails preflight check', () => {
    const res = runB2i(['handoff', 'target-app', '--brief', join(FIXTURES_DIR, 'fail-goal-4-bullets.md')]);
    assert.equal(res.code, 1);
    assert.match(res.all, /Handoff aborted/);
    assert.equal(existsSync('target-app'), false);
  });

  test('handoff with template: none politely declines and exits 0', () => {
    const res = runB2i(['handoff', 'brand-app', '--brief', join(FIXTURES_DIR, 'none-template.md')]);
    assert.equal(res.code, 0);
    assert.match(res.stdout, /Brief-only mode \(template: none\) — handoff skipped/);
    assert.equal(existsSync('brand-app'), false);
  });

  test('handoff --dry-run prints preview without touching filesystem', () => {
    const targetDir = join(TMP_DIR, 'dry-run-app');
    const res = runB2i(['handoff', targetDir, '--brief', join(FIXTURES_DIR, 'valid-brief.md'), '--dry-run']);
    assert.equal(res.code, 0);
    assert.match(res.stdout, /Brainstorm2idea handoff — DRY RUN/);
    assert.match(res.stdout, /Preview of merged PROTOTYPE\.md/);
    assert.equal(existsSync(targetDir), false);
  });

  test('handoff succeeds with mock-i2p, merges sections and moves brief', () => {
    const targetDir = join(TMP_DIR, 'scaffolded-app');
    const tempBrief = join(TMP_DIR, 'active-brief.md');
    copyFileSync(join(FIXTURES_DIR, 'valid-brief.md'), tempBrief);

    const res = runB2i(['handoff', targetDir, '--brief', tempBrief, '--i2p', MOCK_I2P]);
    assert.equal(res.code, 0);
    assert.match(res.stdout, /Brainstorm2idea handoff — SUCCESS/);

    // Source brief must be deleted (moved)
    assert.equal(existsSync(tempBrief), false);

    // Target PROTOTYPE.md must exist and contain merged sections
    const protoPath = join(targetDir, 'PROTOTYPE.md');
    assert.ok(existsSync(protoPath));
    const protoContent = readFileSync(protoPath, 'utf8');

    assert.match(protoContent, /# Prototype spec — Recipe Box/);
    assert.match(protoContent, /> Idea: Recipe box that lets cooks save recipes/);
    assert.match(protoContent, /## Goal\r?\n- Save recipes with tags/);
    assert.match(protoContent, /## Core flows\r?\n1\. Save recipe/);
    assert.match(protoContent, /## Modules \(optional\)/); // template section preserved
    assert.match(protoContent, /## Out of scope\r?\n- Cloud synchronization/);
    assert.match(protoContent, /## Risks & assumptions\r?\n- ASSUMPTION: browser local storage/);
    assert.match(protoContent, /## Notes\r?\n- Keep UI minimal/);
  });

  test('handoff merges properly into library template (Public API section)', () => {
    const targetDir = join(TMP_DIR, 'library-app');
    const tempBrief = join(TMP_DIR, 'lib-brief.md');
    copyFileSync(join(FIXTURES_DIR, 'library-template.md'), tempBrief);

    const res = runB2i(['handoff', targetDir, '--brief', tempBrief, '--i2p', MOCK_I2P]);
    assert.equal(res.code, 0);

    const protoContent = readFileSync(join(targetDir, 'PROTOTYPE.md'), 'utf8');
    assert.match(protoContent, /## Public API\r?\n1\. parseSections/);
    assert.match(protoContent, /## Out of scope\r?\n- Full CommonMark/);
  });

  test('handoff preserves brief if i2p new execution fails', () => {
    const targetDir = join(TMP_DIR, 'fail-app');
    const tempBrief = join(TMP_DIR, 'fail-brief.md');
    copyFileSync(join(FIXTURES_DIR, 'valid-brief.md'), tempBrief);

    const res = runB2i(['handoff', targetDir, '--brief', tempBrief, '--i2p', MOCK_I2P], {
      MOCK_FAIL_NEW: '1',
    });
    assert.equal(res.code, 1);
    assert.match(res.all, /mock error: failed to create prototype/);
    assert.equal(existsSync(tempBrief), true); // brief is preserved
  });

  test('handoff handles special characters in name and distilled safely', () => {
    const targetDir = join(TMP_DIR, 'safe-app');
    const specialBrief = join(TMP_DIR, 'special-brief.md');
    const content = `---
schema: b2i-brief@1
template: cli
distilled: "CLI 'tool': test $VAR & pipe | redirect"
---
# Special & "Safe" $App

## Goal
- Handle $special & 'quotes' cleanly

## Core flows
1. Process input with special chars: <foo> & "bar"

## Out of scope
- Shell exploits
`;
    writeFileSync(specialBrief, content, 'utf8');

    const res = runB2i(['handoff', targetDir, '--brief', specialBrief, '--i2p', MOCK_I2P]);
    assert.equal(res.code, 0);

    const proto = readFileSync(join(targetDir, 'PROTOTYPE.md'), 'utf8');
    // i2p rejects `"` in --name, so handoff passes it as `'`.
    assert.match(proto, /Special & 'Safe' \$App/);
    assert.match(proto, /CLI 'tool': test \$VAR & pipe \| redirect/);
    assert.equal(existsSync(specialBrief), false);
  });

  test('handoff --target raw creates standalone PROTOTYPE.md without i2p dependency', () => {
    const targetDir = join(TMP_DIR, 'raw-app');
    const tempBrief = join(TMP_DIR, 'raw-brief.md');
    copyFileSync(join(FIXTURES_DIR, 'valid-brief.md'), tempBrief);

    const res = runB2i(['handoff', targetDir, '--target', 'raw', '--brief', tempBrief]);
    assert.equal(res.code, 0);
    assert.match(res.stdout, /Brainstorm2idea handoff — SUCCESS \(raw target\)/);
    assert.equal(existsSync(tempBrief), false, 'source brief is moved/removed');

    const protoPath = join(targetDir, 'PROTOTYPE.md');
    assert.ok(existsSync(protoPath), 'PROTOTYPE.md created');
    const protoContent = readFileSync(protoPath, 'utf8');
    assert.match(protoContent, /# Prototype spec — Recipe Box/);
    assert.match(protoContent, /## Goal/);
    assert.match(protoContent, /## Core flows/);
    assert.match(protoContent, /## Out of scope/);
  });

  test('handoff --target raw --dry-run previews scaffold without writing disk', () => {
    const targetDir = join(TMP_DIR, 'raw-dry-run-app');
    const tempBrief = join(TMP_DIR, 'raw-dry-brief.md');
    copyFileSync(join(FIXTURES_DIR, 'valid-brief.md'), tempBrief);

    const res = runB2i(['handoff', targetDir, '--target', 'raw', '--brief', tempBrief, '--dry-run']);
    assert.equal(res.code, 0);
    assert.match(res.stdout, /Brainstorm2idea handoff — DRY RUN \(raw target\)/);
    assert.equal(existsSync(targetDir), false, 'target dir is not created on dry-run');
    assert.equal(existsSync(tempBrief), true, 'brief is untouched on dry-run');
  });

  test('handoff --target raw --json outputs structured payload', () => {
    const targetDir = join(TMP_DIR, 'raw-json-app');
    const tempBrief = join(TMP_DIR, 'raw-json-brief.md');
    copyFileSync(join(FIXTURES_DIR, 'valid-brief.md'), tempBrief);

    const res = runB2i(['handoff', targetDir, '--target', 'raw', '--brief', tempBrief, '--json']);
    assert.equal(res.code, 0);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.target, 'raw');
    assert.equal(parsed.status, 'scaffolded');
  });

  test('introspectI2pTemplates engine function unit tests', () => {
    const custom = introspectI2pTemplates(null);
    assert.equal(custom.source, 'pinned');
    assert.equal(custom.reason, 'custom-command');
    assert.deepEqual(custom.templates, ['web', 'api', 'cli', 'worker', 'library']);

    const live = introspectI2pTemplates({ cmd: process.execPath, cmdArgs: [MOCK_I2P] });
    assert.equal(live.source, 'live');
    assert.deepEqual(live.templates, ['web', 'api', 'cli', 'worker', 'library']);
  });

  test('introspectI2pTemplates live hit: mock lists templates, handoff succeeds with live source', () => {
    const targetDir = join(TMP_DIR, 'live-hit-app');
    const tempBrief = join(TMP_DIR, 'live-hit-brief.md');
    copyFileSync(join(FIXTURES_DIR, 'valid-brief.md'), tempBrief);

    const res = runB2i(['handoff', targetDir, '--brief', tempBrief, '--i2p', MOCK_I2P, '--json']);
    assert.equal(res.code, 0);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.introspection.source, 'live');
    assert.deepEqual(parsed.introspection.templates, ['web', 'api', 'cli', 'worker', 'library']);
    assert.equal(existsSync(join(targetDir, 'PROTOTYPE.md')), true);
  });

  test('future template: template not in pinned enum accepted via live introspection', () => {
    const targetDir = join(TMP_DIR, 'future-template-app');
    const tempBrief = join(TMP_DIR, 'future-brief.md');
    const briefContent = `---
schema: b2i-brief@1
template: plugin
distilled: "Plugin archetype for developer tools"
---
# Plugin System

## Goal
- Build modular plugin engine

## Core flows
1. Load plugin module from disk
2. Dispatch hook events to plugin

## Out of scope
- Plugin marketplace
`;
    writeFileSync(tempBrief, briefContent, 'utf8');

    // Plain b2i check must fail because 'plugin' is not in the pinned enum
    const checkRes = runB2i(['check', tempBrief]);
    assert.equal(checkRes.code, 1);
    assert.match(checkRes.all, /template: invalid "plugin"/);

    // Handoff with mock listing 'plugin' must succeed
    const res = runB2i(
      ['handoff', targetDir, '--brief', tempBrief, '--i2p', MOCK_I2P, '--json'],
      { MOCK_I2P_TEMPLATES: 'web,api,cli,worker,library,plugin' }
    );
    assert.equal(res.code, 0);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.introspection.source, 'live');
    assert.ok(parsed.introspection.templates.includes('plugin'));
    assert.match(parsed.note, /template accepted via live i2p introspection/);
    assert.equal(existsSync(join(targetDir, 'PROTOTYPE.md')), true);
  });

  test('early error: template not in live set fails early naming live templates', () => {
    const targetDir = join(TMP_DIR, 'early-err-app');
    const tempBrief = join(TMP_DIR, 'worker-brief.md');
    const briefContent = `---
schema: b2i-brief@1
template: worker
distilled: "Queue worker prototype"
---
# Queue Worker

## Goal
- Process background jobs

## Core flows
1. Fetch item from queue
2. Process job

## Out of scope
- Distributed locking
`;
    writeFileSync(tempBrief, briefContent, 'utf8');

    // Mock i2p only supports web and cli
    const res = runB2i(
      ['handoff', targetDir, '--brief', tempBrief, '--i2p', MOCK_I2P],
      { MOCK_I2P_TEMPLATES: 'web,cli' }
    );
    assert.equal(res.code, 1);
    assert.match(res.all, /template "worker" is not supported by the live idea2prototype generator/);
    assert.match(res.all, /available: web, cli/);
    assert.equal(existsSync(targetDir), false);
    assert.equal(existsSync(tempBrief), true);
  });

  test('fallback on garbage: invalid JSON falls back to pinned templates', () => {
    const targetDir = join(TMP_DIR, 'fallback-garbage-app');
    const tempBrief = join(TMP_DIR, 'garbage-brief.md');
    copyFileSync(join(FIXTURES_DIR, 'valid-brief.md'), tempBrief);

    const res = runB2i(
      ['handoff', targetDir, '--brief', tempBrief, '--i2p', MOCK_I2P, '--json'],
      { MOCK_I2P_MODE: 'garbage' }
    );
    assert.equal(res.code, 0);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.introspection.source, 'pinned');
    assert.equal(parsed.introspection.reason, 'invalid-json');
    assert.equal(existsSync(join(targetDir, 'PROTOTYPE.md')), true);
  });

  test('fallback on exit-1: mock error falls back to pinned templates', () => {
    const targetDir = join(TMP_DIR, 'fallback-fail-app');
    const tempBrief = join(TMP_DIR, 'fail-brief.md');
    copyFileSync(join(FIXTURES_DIR, 'valid-brief.md'), tempBrief);

    const res = runB2i(
      ['handoff', targetDir, '--brief', tempBrief, '--i2p', MOCK_I2P, '--json'],
      { MOCK_I2P_MODE: 'fail' }
    );
    assert.equal(res.code, 0);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.introspection.source, 'pinned');
    assert.equal(parsed.introspection.reason, 'non-zero');
    assert.equal(existsSync(join(targetDir, 'PROTOTYPE.md')), true);
  });

  test('fallback on hang: timeout falls back to pinned templates', () => {
    const targetDir = join(TMP_DIR, 'fallback-hang-app');
    const tempBrief = join(TMP_DIR, 'hang-brief.md');
    copyFileSync(join(FIXTURES_DIR, 'valid-brief.md'), tempBrief);

    const res = runB2i(
      ['handoff', targetDir, '--brief', tempBrief, '--i2p', MOCK_I2P, '--json'],
      { MOCK_I2P_MODE: 'hang', B2I_INTROSPECT_TIMEOUT_MS: '300' }
    );
    assert.equal(res.code, 0);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.introspection.source, 'pinned');
    assert.equal(parsed.introspection.reason, 'timeout');
    assert.equal(existsSync(join(targetDir, 'PROTOTYPE.md')), true);
  });

  test('custom command: B2I_HANDOFF_CMD skips introspection with custom-command reason', () => {
    const res = runB2i(
      ['handoff', 'custom-app', '--brief', join(FIXTURES_DIR, 'valid-brief.md'), '--dry-run', '--json'],
      { B2I_HANDOFF_CMD: 'custom-scaffold-tool' }
    );
    assert.equal(res.code, 0);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.introspection.source, 'pinned');
    assert.equal(parsed.introspection.reason, 'custom-command');
  });
});

describe('5. Doability Scorer (scoreBrief & b2i score)', () => {
  test('scoreBrief awards high score to well-scoped brief', () => {
    const content = readFileSync(join(FIXTURES_DIR, 'valid-brief.md'), 'utf8');
    const result = scoreBrief(content);
    assert.equal(result.ok, true);
    assert.ok(result.score >= 75);
    assert.ok(['GOOD', 'EXCELLENT'].includes(result.grade));
    assert.ok(result.breakdown.scope > 0);
  });

  test('scoreBrief identifies and mitigates rabbit holes in out-of-scope', () => {
    const content = readFileSync(join(FIXTURES_DIR, 'rabbit-hole-brief.md'), 'utf8');
    const result = scoreBrief(content);
    assert.equal(result.ok, true);
    assert.equal(result.breakdown.rabbitHoles, 40, 'full rabbit holes score when all mitigated');
    assert.ok(result.tips.some((t) => t.includes('Mitigated OAuth/SSO')));
    assert.ok(result.tips.some((t) => t.includes('Mitigated Payment gateway')));
  });

  test('scoreBrief penalizes unmitigated rabbit holes in core flows', () => {
    const unmitigated = `---
schema: b2i-brief@1
template: web
distilled: Shopping app with real-time Stripe checkout and OAuth SSO
---
# Dangerous App

## Goal
- Build checkout and auth

## Core flows
1. User logs in using oauth sso
2. User pays with stripe checkout

## Out of scope
- Mobile apps
`;
    const result = scoreBrief(unmitigated);
    assert.equal(result.ok, true);
    // 2 rabbit holes in flows: OAuth and Stripe (-30 pts from 40 = 10 pts)
    assert.equal(result.breakdown.rabbitHoles, 10);
    assert.ok(result.tips.some((t) => t.includes('Detected OAuth/SSO')));
    assert.ok(result.tips.some((t) => t.includes('Detected Payment gateway')));
  });

  test('scoreBrief detects multi-tenancy rabbit hole in core flows', () => {
    const content = `---
schema: b2i-brief@1
template: web
distilled: Multi-tenant SaaS dashboard
---
# SaaS Dashboard

## Goal
- Serve multiple tenants

## Core flows
1. Multi-tenant onboarding with subdomain routing
2. Cross-tenant data isolation

## Out of scope
- Custom UI theming
- Email notification service
`;
    const result = scoreBrief(content);
    assert.equal(result.ok, true);
    assert.ok(result.tips.some((t) => t.includes('Detected Multi-tenancy')));
    assert.equal(result.breakdown.rabbitHoles, 25, 'one unmitigated rabbit hole: 40 - 15 = 25');
  });

  test('scoreBrief mitigates multi-tenancy when in out-of-scope', () => {
    const content = `---
schema: b2i-brief@1
template: web
distilled: Single-tenant dashboard
---
# Dashboard

## Goal
- Show metrics for one org

## Core flows
1. View metrics dashboard

## Out of scope
- Multi-tenant subdomain routing
- Cross-org data sharing
`;
    const result = scoreBrief(content);
    assert.equal(result.ok, true);
    assert.ok(result.tips.some((t) => t.includes('Mitigated Multi-tenancy')));
    assert.equal(result.breakdown.rabbitHoles, 40, 'all mitigated: full 40 pts');
  });

  test('scoreBrief detects native app rabbit hole in core flows', () => {
    const content = `---
schema: b2i-brief@1
template: web
distilled: Mobile-first task manager
---
# Task Manager

## Goal
- Track tasks on mobile

## Core flows
1. Build native iOS and Android app
2. Sync via push notifications

## Out of scope
- Web fallback
`;
    const result = scoreBrief(content);
    assert.equal(result.ok, true);
    assert.ok(result.tips.some((t) => t.includes('Detected Native app')));
    assert.equal(result.breakdown.rabbitHoles, 25, 'one unmitigated rabbit hole: 40 - 15 = 25');
  });

  test('scoreBrief mitigates native app when in out-of-scope', () => {
    const content = `---
schema: b2i-brief@1
template: cli
distilled: CLI task manager
---
# Task CLI

## Goal
- Track tasks in terminal

## Core flows
1. Add task via command line
2. List pending tasks

## Out of scope
- Native iOS/Android mobile app
- Push notification service
`;
    const result = scoreBrief(content);
    assert.equal(result.ok, true);
    assert.ok(result.tips.some((t) => t.includes('Mitigated Native app')));
    assert.equal(result.breakdown.rabbitHoles, 40, 'all mitigated: full 40 pts');
  });

  test('scoreBrief detects real-time media rabbit hole in core flows', () => {
    const content = `---
schema: b2i-brief@1
template: web
distilled: Video chat prototype
---
# Video Chat

## Goal
- Video call between users

## Core flows
1. Start real-time video call
2. Stream audio between peers

## Out of scope
- Call recording
`;
    const result = scoreBrief(content);
    assert.equal(result.ok, true);
    assert.ok(result.tips.some((t) => t.includes('Detected Real-time media')));
    assert.equal(result.breakdown.rabbitHoles, 25, 'one unmitigated rabbit hole: 40 - 15 = 25');
  });

  test('scoreBrief catches generic auth keyword beyond OAuth/SSO', () => {
    const content = `---
schema: b2i-brief@1
template: web
distilled: App with authentication
---
# Auth App

## Goal
- User login and registration

## Core flows
1. User authenticates with password
2. Session management

## Out of scope
- Social login providers
- Hardware security keys
`;
    const result = scoreBrief(content);
    assert.equal(result.ok, true);
    assert.ok(result.tips.some((t) => t.includes('Detected OAuth/SSO')));
    assert.equal(result.breakdown.rabbitHoles, 25, 'one unmitigated rabbit hole: 40 - 15 = 25');
  });

  test('scoreBrief catches generic payment keyword beyond Stripe', () => {
    const content = `---
schema: b2i-brief@1
template: web
distilled: Store with payment processing
---
# Store

## Goal
- Accept customer payments

## Core flows
1. Process payment at checkout
2. Handle refunds

## Out of scope
- Tax calculation engine
- Invoice PDF generation
`;
    const result = scoreBrief(content);
    assert.equal(result.ok, true);
    assert.ok(result.tips.some((t) => t.includes('Detected Payment gateway')));
    assert.equal(result.breakdown.rabbitHoles, 25, 'one unmitigated rabbit hole: 40 - 15 = 25');
  });

  test('scoreBrief returns 0 and INVALID grade for broken briefs', () => {
    const content = readFileSync(join(FIXTURES_DIR, 'fail-no-h1.md'), 'utf8');
    const result = scoreBrief(content);
    assert.equal(result.ok, false);
    assert.equal(result.score, 0);
    assert.equal(result.grade, 'INVALID');
  });

  test('b2i score CLI outputs human verdict with grade', () => {
    const res = runB2i(['score', join(FIXTURES_DIR, 'valid-brief.md')]);
    assert.equal(res.code, 0);
    assert.match(res.stdout, /Brainstorm2idea score — Doability \d+\/100 \(Grade/);
  });

  test('b2i score --json CLI outputs machine-readable breakdown', () => {
    const res = runB2i(['score', join(FIXTURES_DIR, 'rabbit-hole-brief.md'), '--json']);
    assert.equal(res.code, 0);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.score >= 0);
    assert.ok(parsed.breakdown);
    assert.equal(parsed.breakdown.rabbitHoles, 40);
  });

  test('scoreBrief --json exposes structured per-category sub-scores', () => {
    const res = runB2i(['score', join(FIXTURES_DIR, 'rabbit-hole-brief.md'), '--json']);
    const parsed = JSON.parse(res.stdout);
    const { categories } = parsed;
    assert.ok(categories, 'categories object present');
    assert.equal(categories.scope.max, 30);
    assert.equal(categories.scope.outOfScopeBullets, 2);
    assert.equal(categories.rabbitHoles.max, 40);
    assert.deepEqual(categories.rabbitHoles.mitigated, ['OAuth/SSO', 'Payment gateway']);
    assert.deepEqual(categories.rabbitHoles.detected, []);
    assert.equal(categories.alignment.max, 30);
    assert.equal(typeof categories.alignment.risksTagged, 'boolean');
    assert.equal(categories.alignment.templateMismatch, null);
    // categories mirror breakdown — no drift between the two shapes
    assert.equal(categories.scope.score, parsed.breakdown.scope);
    assert.equal(categories.rabbitHoles.score, parsed.breakdown.rabbitHoles);
    assert.equal(categories.alignment.score, parsed.breakdown.alignment);
  });

  test('scoreBrief categories report detected rabbit holes with fixes', () => {
    const unmitigated = `---
schema: b2i-brief@1
template: web
distilled: Shopping app with real-time Stripe checkout and OAuth SSO
---
# Dangerous App

## Goal
- Build checkout and auth

## Core flows
1. User logs in using oauth sso
2. User pays with stripe checkout

## Out of scope
- Mobile apps
`;
    const result = scoreBrief(unmitigated);
    const labels = result.categories.rabbitHoles.detected.map((d) => d.label);
    assert.deepEqual(labels, ['OAuth/SSO', 'Payment gateway']);
    assert.ok(result.categories.rabbitHoles.detected.every((d) => d.fix.length > 0));
    assert.equal(result.categories.scope.outOfScopeBullets, 1);
  });

  test('scoreBrief INVALID result still carries a full categories shape', () => {
    const result = scoreBrief('not a brief at all');
    assert.equal(result.ok, false);
    assert.equal(result.categories.scope.score, 0);
    assert.deepEqual(result.categories.rabbitHoles.detected, []);
    assert.deepEqual(result.categories.rabbitHoles.mitigated, []);
    assert.equal(result.categories.alignment.templateMismatch, null);
  });
});

describe('5b. Mechanical Auto-Fixer (fixBrief & check --fix)', () => {
  test('fixBrief returns null content when nothing is broken', () => {
    const clean = readFileSync(join(FIXTURES_DIR, 'valid-brief.md'), 'utf8');
    const fix = fixBrief(clean);
    assert.equal(fix.content, null);
    assert.deepEqual(fix.fixes, []);
  });

  test('fixBrief re-quotes a distilled value that truncates on interior quotes', () => {
    const broken = `---
schema: b2i-brief@1
template: web
distilled: "Plant app "watering" tracker"
---
# Plant
`;
    const fix = fixBrief(broken);
    assert.ok(fix.content.includes('distilled: "Plant app \'watering\' tracker"'));
    const { meta } = parseFrontmatter(fix.content);
    assert.equal(meta.distilled, "Plant app 'watering' tracker");
  });

  test('fixBrief quotes an unquoted value cut short by an inline # comment', () => {
    const broken = `---
schema: b2i-brief@1
template: cli
distilled: Track #plant watering dates
---
# Plant
`;
    const fix = fixBrief(broken);
    const { meta } = parseFrontmatter(fix.content);
    assert.equal(meta.distilled, 'Track #plant watering dates');
  });

  test('fixBrief heals missing and empty schema keys', () => {
    const missing = fixBrief(`---\ntemplate: cli\ndistilled: "x"\n---\n# T\n`);
    assert.ok(missing.content.includes('schema: b2i-brief@1'));
    const emptied = fixBrief(`---\nschema:\ntemplate: cli\ndistilled: "x"\n---\n# T\n`);
    assert.ok(emptied.content.includes('schema: b2i-brief@1'));
    assert.ok(!emptied.content.includes('schema:\r\n'));
    for (const f of [...missing.fixes, ...emptied.fixes]) {
      assert.match(f, /^schema:/);
    }
  });

  test('fixBrief normalizes whitespace but preserves CRLF line endings', () => {
    const broken = '---\r\nschema: b2i-brief@1\r\ntemplate: cli\r\ndistilled: "x"\r\n---\r\n# T   \r\n\r\n\r\n';
    const fix = fixBrief(broken);
    assert.ok(fix.content.includes('\r\n'));
    assert.ok(!/[ \t]\r?\n/.test(fix.content), 'no trailing spaces remain');
    assert.ok(fix.content.endsWith('---\r\n# T\r\n'), 'trailing blank lines collapsed, single final newline');
    assert.ok(fix.fixes.some((f) => f.startsWith('whitespace:')));
  });

  test('b2i check --fix repairs a broken brief in place and exits 0', () => {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
    mkdirSync(TMP_DIR, { recursive: true });
    const target = join(TMP_DIR, 'brief.md');
    writeFileSync(target, `---
schema:
template: web
distilled: "Plant app "watering" tracker"
---
# PlantPulse   

## Goal
- Track watering dates   

## Core flows
1. Tap watered to reset the interval timer

## Out of scope
- Push notifications
- User accounts and authentication
`);

    const before = runB2i(['check', target]);
    assert.equal(before.code, 1);
    const after = runB2i(['check', target, '--fix']);
    assert.equal(after.code, 0, `should pass after fix:\n${after.all}`);
    assert.match(after.stdout, /PASS \(7\/7\)/);
    assert.ok((after.stdout.match(/fixed:/g) || []).length >= 2);

    const fixed = readFileSync(target, 'utf8');
    assert.ok(fixed.includes('schema: b2i-brief@1'));
    assert.ok(fixed.includes("distilled: \"Plant app 'watering' tracker\""));

    // Idempotent: a second --fix run on the healthy brief is a clean no-op.
    const again = runB2i(['check', target, '--fix']);
    assert.equal(again.code, 0);
    assert.ok(!again.stdout.includes('fixed:'));
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test('b2i check --fix on a passing brief rewrites nothing', () => {
    const target = join(FIXTURES_DIR, 'valid-brief.md');
    const before = readFileSync(target, 'utf8');
    const res = runB2i(['check', target, '--fix']);
    assert.equal(res.code, 0);
    assert.ok(!res.stdout.includes('fixed:'));
    assert.equal(readFileSync(target, 'utf8'), before, 'fixture untouched');
  });

  test('b2i check --fix rejects stdin because there is no file to rewrite', () => {
    const res = runB2i(['check', '-', '--fix'], {}, 'some brief');
    assert.equal(res.code, 1);
    assert.match(res.all, /--fix requires a file path/);
  });

  test('b2i check --fix --json reports appliedFixes and post-fix verdict', () => {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
    mkdirSync(TMP_DIR, { recursive: true });
    const target = join(TMP_DIR, 'brief.md');
    writeFileSync(target, `---
schema:
template: cli
distilled: "d"
---
# T

## Goal
- G

## Core flows
1. F

## Out of scope
- A
- B
`);
    const res = runB2i(['check', target, '--fix', '--json']);
    assert.equal(res.code, 0);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.ok, true);
    assert.ok(Array.isArray(parsed.appliedFixes) && parsed.appliedFixes.length >= 1);
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test('fixBrief never invents content: missing distilled stays missing', () => {
    const broken = `---
schema: b2i-brief@1
template: cli
---
# T
`;
    const fix = fixBrief(broken);
    const result = validateBrief(fix.content);
    assert.equal(result.ok, false, 'distilled still missing after mechanical fix');
    assert.ok(result.errors.some((e) => e.startsWith('distilled:')));
  });
});

describe('6. CLI Command: init', () => {
  beforeEach(() => {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test('b2i init generates a schema-valid brief that passes check', () => {
    const target = join(TMP_DIR, 'init-brief.md');
    const res = runB2i(['init', 'my-app', '--output', target]);
    assert.equal(res.code, 0);
    assert.match(res.stdout, /Brainstorm2idea init — SUCCESS/);
    assert.ok(existsSync(target), 'init writes the brief to disk');

    const content = readFileSync(target, 'utf8');
    const valid = validateBrief(content);
    assert.equal(valid.ok, true, `generated brief must pass 7/7 (${valid.errors.join(', ')})`);
    assert.equal(valid.meta.template, 'cli');
    assert.equal(valid.meta.name, 'my-app');
  });

  test('b2i init --template library emits the Public API section', () => {
    const target = join(TMP_DIR, 'init-lib.md');
    const res = runB2i(['init', 'mylib', '--template', 'library', '--output', target]);
    assert.equal(res.code, 0);

    const content = readFileSync(target, 'utf8');
    assert.match(content, /## Public API/, 'library briefs use the Public API section');
    assert.doesNotMatch(content, /## Core flows/, 'library briefs must not use Core flows');

    const valid = validateBrief(content);
    assert.equal(valid.ok, true);
    assert.equal(valid.meta.template, 'library');
  });

  test('b2i init library brief scores without an alignment penalty', () => {
    const target = join(TMP_DIR, 'init-lib-score.md');
    const res = runB2i(['init', 'mylib', '--template', 'library', '--output', target]);
    assert.equal(res.code, 0);

    const score = scoreBrief(readFileSync(target, 'utf8'));
    assert.equal(score.ok, true);
    assert.equal(
      score.tips.some((t) => t.includes('should describe exported functions/API')),
      false,
      'library briefs must not trigger the library/API alignment notice'
    );
  });

  test('b2i init rejects an invalid template', () => {
    const res = runB2i(['init', 'my-app', '--template', 'mobile']);
    assert.equal(res.code, 1);
    assert.match(res.all, /invalid template "mobile"/);
  });

  test('b2i init requires a name', () => {
    const res = runB2i(['init']);
    assert.equal(res.code, 1);
    assert.match(res.all, /usage: b2i init <name>/);
  });

  test('b2i init refuses to overwrite an existing brief', () => {
    const target = join(TMP_DIR, 'existing-brief.md');
    writeFileSync(target, 'existing content', 'utf8');

    const res = runB2i(['init', 'my-app', '--output', target]);
    assert.equal(res.code, 1);
    assert.match(res.all, /brief already exists/);
    assert.equal(readFileSync(target, 'utf8'), 'existing content', 'existing file is untouched');
  });

  test('b2i init --json outputs a machine-readable payload', () => {
    const target = join(TMP_DIR, 'init-json.md');
    const res = runB2i(['init', 'my-app', '--output', target, '--json']);
    assert.equal(res.code, 0);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.template, 'cli');
    assert.equal(parsed.path, resolve(target));
  });

  test('b2i init escapes quotes in the name so the frontmatter round-trips', () => {
    const target = join(TMP_DIR, 'init-quoted.md');
    const res = runB2i(['init', 'my "cool" app', '--output', target]);
    assert.equal(res.code, 0);

    const content = readFileSync(target, 'utf8');
    const { meta } = parseFrontmatter(content);
    assert.ok(
      meta.distilled.includes('cool'),
      `distilled must retain the full name, got "${meta.distilled}"`
    );
    assert.equal(validateBrief(content).ok, true, 'quoted names still produce a valid brief');
  });

  test('b2i init preserves the H1 name verbatim (quotes included)', () => {
    const target = join(TMP_DIR, 'init-h1.md');
    const res = runB2i(['init', 'My "Great" App', '--output', target]);
    assert.equal(res.code, 0);

    const content = readFileSync(target, 'utf8');
    assert.equal(validateBrief(content).meta.name, 'My "Great" App', 'H1 keeps the user-supplied name');
  });

  test('b2i init rejects a whitespace-only name instead of writing an invalid brief', () => {
    const target = join(TMP_DIR, 'init-blank.md');
    const res = runB2i(['init', '   ', '--output', target]);
    assert.equal(res.code, 1);
    assert.match(res.all, /non-whitespace character/);
    assert.equal(existsSync(target), false, 'no brief is written for a rejected name');
  });

  test('b2i init output always passes the 7 check rules', () => {
    for (const template of VALID_TEMPLATES) {
      const target = join(TMP_DIR, `init-selfcheck-${template}.md`);
      const res = runB2i(['init', 'my-app', '--template', template, '--output', target]);
      assert.equal(res.code, 0, `init --template ${template} must succeed`);
      const valid = validateBrief(readFileSync(target, 'utf8'));
      assert.equal(valid.ok, true, `init --template ${template} output must pass 7/7 (${valid.errors.join(', ')})`);
    }
  });
});

describe('7. CLI Command: dump', () => {
  beforeEach(() => {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test('b2i dump reads stdin and emits a valid draft brief', () => {
    const res = runB2i(['dump', '-'], {}, 'Um, so I want to build a recipe box that saves recipes with tags and searches them offline.');
    assert.equal(res.code, 0);
    assert.match(res.stdout, /schema: b2i-brief@1/);
    assert.match(res.stdout, /# Draft Prototype/);

    const valid = validateBrief(res.stdout);
    assert.equal(valid.ok, true, `dump output must pass 7/7 (${valid.errors.join(', ')})`);
  });

  test('b2i dump strips conversational filler from the distilled line', () => {
    const res = runB2i(['dump', '-'], {}, 'Like, I was thinking about building a log parser for messy key value log lines.');
    const { meta } = parseFrontmatter(res.stdout);
    assert.ok(!/^like\b/i.test(meta.distilled), `filler should be stripped, got "${meta.distilled}"`);
    assert.match(meta.distilled, /log parser/i);
  });

  test('b2i dump escapes quotes so the distilled round-trips', () => {
    const res = runB2i(['dump', '-'], {}, 'Build a tool called "quoted" that parses messy log lines into JSON.');
    const { meta } = parseFrontmatter(res.stdout);
    assert.ok(
      meta.distilled.includes('quoted'),
      `distilled must retain the quoted phrase, got "${meta.distilled}"`
    );
  });

  test('b2i dump --output writes the draft to disk', () => {
    const target = join(TMP_DIR, 'dumped-brief.md');
    const res = runB2i(['dump', '-', '--output', target], {}, 'Build a tool that tallies lines of code per file extension.');
    assert.equal(res.code, 0);
    assert.ok(existsSync(target), 'dump writes the draft to disk');
    assert.equal(validateBrief(readFileSync(target, 'utf8')).ok, true);
  });

  test('b2i dump exits 1 on a missing input file', () => {
    const res = runB2i(['dump', 'no-such-transcript.md']);
    assert.equal(res.code, 1);
    assert.match(res.all, /file not found/);
  });

  test('b2i dump preserves paragraph structure between ideas', () => {
    const input = 'Um, first idea is a recipe box for saving recipes.\n\nLike, the second idea is a log parser for messy key value lines.';
    const res = runB2i(['dump', '-'], {}, input);
    assert.equal(res.code, 0);
    const { meta } = parseFrontmatter(res.stdout);
    assert.match(meta.distilled, /recipe box/i, 'distilled comes from the first substantive sentence');
  });

  test('b2i dump --template sets template in frontmatter and defaults to none', () => {
    const resCli = runB2i(['dump', '-', '--template', 'cli'], {}, 'Build a CLI tool that parses logs.');
    assert.equal(resCli.code, 0);
    const { meta: metaCli } = parseFrontmatter(resCli.stdout);
    assert.equal(metaCli.template, 'cli');
    assert.match(resCli.stdout, /## Core flows/);

    const resNone = runB2i(['dump', '-'], {}, 'Build a plain idea.');
    assert.equal(resNone.code, 0);
    const { meta: metaNone } = parseFrontmatter(resNone.stdout);
    assert.equal(metaNone.template, 'none');
  });

  test('b2i dump --template library emits Public API section like init', () => {
    const res = runB2i(['dump', '-', '--template', 'library'], {}, 'Build a zero-dependency log parsing library.');
    assert.equal(res.code, 0);
    assert.match(res.stdout, /## Public API/);
    assert.doesNotMatch(res.stdout, /## Core flows/);
    const { meta } = parseFrontmatter(res.stdout);
    assert.equal(meta.template, 'library');
  });

  test('b2i dump rejects invalid template with FAIL pattern matching init', () => {
    const res = runB2i(['dump', '-', '--template', 'quantum'], {}, 'Some idea');
    assert.equal(res.code, 1);
    assert.match(res.all, /Brainstorm2idea dump — /);
    assert.match(res.all, /invalid template "quantum" \(must be one of: web, api, cli, worker, library, none\)/);
  });
});

describe('8. Two-Product Smell Detection & Help Interception', () => {
  test('validateBrief emits exact soft warning on two-product smell in Goal bullet', () => {
    const brief = `---
schema: b2i-brief@1
template: web
distilled: Shared plant watering tracker
---
# PlantPulse

## Goal
- Build a web dashboard and also a mobile app for tracking plants.

## Core flows
1. Track watering dates

## Out of scope
- Push notifications
`;
    const res = validateBrief(brief);
    assert.equal(res.ok, true, 'soft warning does not fail validation');
    assert.equal(res.passed, 7);
    const expected = 'two-product smell: "Build a web dashboard and also a mobile …" joins two deliverables — brief one product and park the other in ## Out of scope';
    assert.ok(res.warnings.includes(expected), `expected warning "${expected}", got: ${JSON.stringify(res.warnings)}`);
  });

  test('validateBrief emits soft warning on two-product smell in distilled one-liner', () => {
    const brief = `---
schema: b2i-brief@1
template: cli
distilled: Build both a CLI tool and a web server for log analysis
---
# DualTool

## Goal
- Parse log files

## Core flows
1. Run parser

## Out of scope
- GUI
`;
    const res = validateBrief(brief);
    assert.equal(res.ok, true);
    assert.equal(res.passed, 7);
    const expected = 'two-product smell: "Build both a CLI tool and a web server f…" joins two deliverables — brief one product and park the other in ## Out of scope';
    assert.ok(res.warnings.includes(expected), `expected warning "${expected}", got: ${JSON.stringify(res.warnings)}`);
  });

  test('scoreBrief appends two-product smell tip with zero deduction', () => {
    const brief = `---
schema: b2i-brief@1
template: web
distilled: Plant tracker web app
---
# PlantPulse

## Goal
- Track plant watering as well as generate plant care calendars.

## Core flows
1. Tap watered

## Out of scope
- Payments
- User accounts

## Risks & assumptions
- RISK: Users may forget
`;
    const scoreRes = scoreBrief(brief);
    assert.equal(scoreRes.ok, true);
    const expectedTip = '💡 Two-product smell: "Track plant watering as well as generate…" joins two deliverables — brief one product and park the other in ## Out of scope';
    assert.ok(scoreRes.tips.includes(expectedTip), `tips should include "${expectedTip}", got: ${JSON.stringify(scoreRes.tips)}`);
    // Assert zero deduction
    assert.equal(scoreRes.score, 100);
    assert.deepEqual(scoreRes.breakdown, { scope: 30, rabbitHoles: 40, alignment: 30 });
  });

  test('clean brief has no two-product smell warning or tip', () => {
    const brief = `---
schema: b2i-brief@1
template: web
distilled: Lightweight shared plant watering tracker showing days until next water
---
# PlantPulse

## Goal
- Track last watering date and next due date for household plants.
- Provide a single-tap button to mark a plant as watered.

## Core flows
1. View list of plants with status badge.

## Out of scope
- Push notifications
- User accounts
`;
    const val = validateBrief(brief);
    assert.ok(!val.warnings.some((w) => w.includes('two-product smell')));
    const sc = scoreBrief(brief);
    assert.ok(!sc.tips.some((t) => t.includes('Two-product smell')));
  });

  test('per-command help centrally intercepts --help and -h', () => {
    const handoffLong = runB2i(['handoff', '--help']);
    assert.equal(handoffLong.code, 0);
    assert.match(handoffLong.stdout, /Usage: b2i handoff/);

    const handoffShort = runB2i(['handoff', '-h']);
    assert.equal(handoffShort.code, 0);
    assert.match(handoffShort.stdout, /Usage: b2i handoff/);

    const checkShort = runB2i(['check', '-h']);
    assert.equal(checkShort.code, 0);
    assert.match(checkShort.stdout, /Usage: b2i check/);

    const helpCheck = runB2i(['help', 'check']);
    assert.equal(helpCheck.code, 0);
    assert.match(helpCheck.stdout, /Usage: b2i check/);
  });

  test('handoff missing <dir> prints usage message with directory preference', () => {
    const res = runB2i(['handoff']);
    assert.equal(res.code, 1);
    assert.match(res.all, /usage: b2i handoff <dir>.*\(prefer a fresh, empty directory\)/);
  });
});

// ---------------------------------------------------------------------------
// Judgment checks: prior art, trust boundaries, invariants. All are warnings or
// tips beside the 7 hard checks; the doability score stays a pure shape score.
// DevLoop is a real brief that scored 100/100 while cloning existing tools and
// auto-merging with tests run outside any sandbox.
// ---------------------------------------------------------------------------

// Fixtures check out with CRLF on Windows; the assertions below expect LF.
const DEVLOOP = readFileSync(join(FIXTURES_DIR, 'devloop-brief.md'), 'utf8').replace(/\r\n/g, '\n');
const DEVLOOP_FIXED = readFileSync(join(FIXTURES_DIR, 'devloop-fixed.md'), 'utf8').replace(/\r\n/g, '\n');
const ALTERNATIVES_MISSING = 'alternatives: no ## Alternatives section; the score checks shape, not whether this already exists';
const withAlternatives = (brief, bullets) => `${brief.trimEnd()}\n\n## Alternatives\n${bullets.join('\n')}\n`;

describe('9. Judgment: ## Alternatives (prior art)', () => {
  test('DevLoop still passes 7/7 but warns that prior art was never checked', () => {
    const res = validateBrief(DEVLOOP);
    assert.equal(res.ok, true);
    assert.equal(res.passed, 7);
    assert.equal(res.total, 7);
    assert.ok(res.warnings.includes(ALTERNATIVES_MISSING), JSON.stringify(res.warnings));
    assert.equal(res.judgment.alternatives, 'missing');
  });

  test('two bullets that each say how this differs satisfy the check', () => {
    const res = validateBrief(DEVLOOP_FIXED);
    assert.equal(res.ok, true);
    assert.ok(!res.warnings.some((w) => w.startsWith('alternatives:')), JSON.stringify(res.warnings));
    assert.equal(res.judgment.alternatives, 'ok');
  });

  test('one bullet is thin and names the count', () => {
    const res = validateBrief(withAlternatives(DEVLOOP, ['- OpenHands: open-source coding agent. Differs by: no agent runtime']));
    assert.equal(res.ok, true);
    assert.equal(res.judgment.alternatives, 'thin');
    assert.ok(res.warnings.some((w) => /^alternatives: 1 bullet\b/.test(w)), JSON.stringify(res.warnings));
  });

  test('a bullet without "Differs by:" is thin and names that bullet', () => {
    const res = validateBrief(withAlternatives(DEVLOOP, [
      '- OpenHands: open-source coding agent. Differs by: no agent runtime',
      '- Devin: hosted autonomous engineer',
    ]));
    assert.equal(res.judgment.alternatives, 'thin');
    assert.ok(res.warnings.some((w) => w.startsWith('alternatives: ') && w.includes('Devin') && w.includes('Differs by:')), JSON.stringify(res.warnings));
  });

  test('a TODO placeholder does not count as an alternative', () => {
    const res = validateBrief(withAlternatives(DEVLOOP, ['- TODO: <Name>: <what it does>. Differs by: <how this brief differs>']));
    assert.equal(res.judgment.alternatives, 'thin');
    assert.ok(res.warnings.some((w) => /^alternatives: 0 bullets\b/.test(w)), JSON.stringify(res.warnings));
  });

  test('check prints at most 3 notes, failures first', () => {
    // 5 failing checks plus a judgment warning: only 3 lines of notes.
    const res = runB2i(['check', '-'], {}, '---\nschema: b2i-brief@1\n---\n# Bare\n');
    assert.equal(res.code, 1);
    const notes = res.stdout.split(/\r?\n/).filter((l) => /^ {2}\S/.test(l) && !l.includes('more note'));
    assert.equal(notes.length, 3, res.stdout);
    assert.ok(!notes.some((l) => l.includes('note:')), 'failures fill the 3 slots before any warning');
    assert.match(res.stdout, /\(\+\d+ more notes?; b2i check --json lists all\)/);

    const ok = runB2i(['check', join(FIXTURES_DIR, 'devloop-brief.md')]);
    assert.equal(ok.code, 0);
    assert.match(ok.stdout, /Brainstorm2idea check — PASS \(7\/7\)/);
    assert.ok(ok.stdout.includes(`note: ${ALTERNATIVES_MISSING}`), ok.stdout);
  });
});

const SANDBOX_WARNING = 'out-of-scope safety: "Sandboxed execution of untrusted code in containers or VMs" is a safety control, not a feature; keep it or add a TRUST: line saying how v0 is safe without it';

describe('10. Judgment: trust boundaries', () => {
  test('TRUST_TRIGGERS is exported in the RABBIT_HOLES shape', () => {
    assert.ok(Array.isArray(TRUST_TRIGGERS) && TRUST_TRIGGERS.length > 0);
    for (const t of TRUST_TRIGGERS) {
      assert.ok(t.pattern instanceof RegExp, 'pattern is a RegExp');
      assert.equal(typeof t.label, 'string');
    }
  });

  test('DevLoop: merge + runs code in scope, no TRUST: line, sandbox scoped out', () => {
    const res = validateBrief(DEVLOOP);
    assert.equal(res.ok, true);
    assert.equal(res.passed, 7);
    assert.equal(res.judgment.trust, 'missing');
    assert.deepEqual(res.judgment.trustTriggers, ['merge/deploy', 'runs code']);
    const trust = res.warnings.find((w) => w.startsWith('trust: '));
    assert.ok(trust, JSON.stringify(res.warnings));
    for (const q of ['who acts', 'credential', 'untrusted input', 'boundary', 'configures']) {
      assert.ok(trust.includes(q), `trust warning names "${q}": ${trust}`);
    }
    assert.ok(res.warnings.includes(SANDBOX_WARNING), JSON.stringify(res.warnings));
    assert.deepEqual(res.judgment.scopedOutSafety, ['Sandboxed execution of untrusted code in containers or VMs']);
  });

  test('the fixed DevLoop variant has no judgment warnings at all', () => {
    const res = validateBrief(DEVLOOP_FIXED);
    assert.equal(res.ok, true);
    assert.deepEqual(res.warnings, []);
    assert.equal(res.judgment.trust, 'ok');
    assert.deepEqual(res.judgment.scopedOutSafety, []);
  });

  test('TRUST: lines satisfy the RISK:/ASSUMPTION: prefix rule', () => {
    const res = validateBrief(DEVLOOP_FIXED.replace(/- RISK: [^\n]*\n/g, '').replace(/- ASSUMPTION: [^\n]*\n/g, ''));
    assert.ok(!res.warnings.some((w) => w.startsWith('risks & assumptions:')), JSON.stringify(res.warnings));
  });

  test('a TRUST: line about the scoped-out control answers the safety warning', () => {
    const brief = DEVLOOP.replace(
      '- ASSUMPTION: Anthropic',
      '- TRUST: no sandbox in v0, so the loop only runs on a disposable VM with no credentials\n- ASSUMPTION: Anthropic'
    );
    const res = validateBrief(brief);
    assert.equal(res.judgment.trust, 'ok');
    assert.ok(!res.warnings.some((w) => w.startsWith('out-of-scope safety:')), JSON.stringify(res.warnings));
  });

  test('a scoped-out safety control is never reported as a mitigated rabbit hole', () => {
    const brief = `---
schema: b2i-brief@1
template: worker
distilled: Bot that deploys the main branch to staging when CI is green
---
# ShipBot

## Goal
- Deploy main to staging without a human

## Core flows
1. Poll CI for green builds on main and deploy that commit

## Out of scope
- Authorization scopes and least-privilege permissions for the deploy key
- A web dashboard

## Risks & assumptions
- RISK: a bad build reaches staging before anyone looks
`;
    const res = scoreBrief(brief);
    assert.equal(res.ok, true);
    assert.equal(res.score, 100, 'doability math is unchanged');
    assert.ok(!res.categories.rabbitHoles.mitigated.includes('OAuth/SSO'), JSON.stringify(res.categories.rabbitHoles));
    assert.ok(!res.tips.some((t) => t.includes('Mitigated OAuth/SSO')), JSON.stringify(res.tips));
    assert.ok(res.warnings.some((w) => w.startsWith('out-of-scope safety: "Authorization scopes')), JSON.stringify(res.warnings));
  });

  test('trigger patterns are word-bounded: push notifications, merged branches and token counts stay quiet', () => {
    const scope = [
      'Send push notifications when a plant needs water',
      'Identify fully merged branches ready for pruning',
      'Display side-by-side terminal diff showing token counts',
      'Running test inputs against 2 prompt variants',
      'Validate agent response payloads against structured assertions',
      'Release notes and a git checkout helper for the user-agent header',
    ].join('\n');
    const hits = TRUST_TRIGGERS.filter((t) => t.pattern.test(scope)).map((t) => t.label);
    assert.deepEqual(hits, []);
  });

  test('trigger patterns cover merge, credentials, code execution, agents, webhooks, CI and payments', () => {
    const cases = {
      'merge/deploy': ['open a PR and auto-merge it', 'merges the pull request', 'deploy to staging', 'git push to main', 'publish to npm'],
      credentials: ['store the GitHub token', 'reads OPENAI_API_KEY', 'uses AWS credentials', 'an API key per user'],
      'runs code': ['runs the test command', 'executes untrusted code', 'run user-supplied scripts'],
      agent: ['a coding agent opens PRs', 'agentic loop'],
      webhook: ['receives a webhook from GitHub'],
      'CI/workflow': ['a GitHub Actions workflow', 'waits for CI'],
      payment: ['charge customers monthly', 'Stripe checkout and refunds'],
    };
    for (const [label, phrases] of Object.entries(cases)) {
      const triggers = TRUST_TRIGGERS.filter((t) => t.label === label);
      assert.ok(triggers.length > 0, `trigger "${label}" exists`);
      for (const p of phrases) assert.ok(triggers.some((t) => t.pattern.test(p)), `"${p}" fires ${label}`);
    }
  });
});

const INVARIANTS = [
  '## Invariants',
  '- The judged PR never configures its own gate',
  '- Only the exact head SHA that passed tests is merged',
].join('\n');
const withInvariants = (brief, block = INVARIANTS) => `${brief.trimEnd()}\n\n${block}\n`;

describe('11. Judgment: ## Invariants', () => {
  test('invariants sit beside the 3-flow cap and never fail check', () => {
    const res = validateBrief(withInvariants(DEVLOOP_FIXED));
    assert.equal(res.ok, true);
    assert.equal(res.passed, 7);
    assert.deepEqual(res.warnings, []);
  });

  test('more than 5 invariants warns', () => {
    const six = ['## Invariants', ...Array.from({ length: 6 }, (_, i) => `- Rule ${i + 1} holds in every flow`)].join('\n');
    const res = validateBrief(withInvariants(DEVLOOP_FIXED, six));
    assert.equal(res.ok, true);
    assert.ok(res.warnings.includes('invariants: 6 bullets, recommended max 5'), JSON.stringify(res.warnings));
  });

  test('a trust trigger without ## Invariants earns a tip, not a warning', () => {
    const val = validateBrief(DEVLOOP_FIXED);
    assert.ok(!val.warnings.some((w) => w.startsWith('invariants')), JSON.stringify(val.warnings));
    const sc = scoreBrief(DEVLOOP_FIXED);
    assert.ok(sc.tips.some((t) => t.includes('## Invariants')), JSON.stringify(sc.tips));

    const withRules = scoreBrief(withInvariants(DEVLOOP_FIXED));
    assert.ok(!withRules.tips.some((t) => t.includes('## Invariants')), JSON.stringify(withRules.tips));
  });

  test('no trust trigger, no invariants tip', () => {
    const sc = scoreBrief(readFileSync(join(FIXTURES_DIR, 'valid-brief.md'), 'utf8'));
    assert.ok(!sc.tips.some((t) => t.includes('## Invariants')), JSON.stringify(sc.tips));
  });
});

describe('12. Judgment: honest score output', () => {
  test('DevLoop: doability stays 100 and judgment sits beside it in --json', () => {
    const sc = scoreBrief(DEVLOOP);
    assert.equal(sc.ok, true);
    assert.equal(sc.score, 100);
    assert.equal(sc.letterGrade, 'A');
    assert.equal(sc.grade, 'EXCELLENT');
    assert.deepEqual(sc.breakdown, { scope: 30, rabbitHoles: 40, alignment: 30 });
    assert.equal(sc.judgment.alternatives, 'missing');
    assert.equal(sc.judgment.trust, 'missing');
    assert.deepEqual(sc.judgment.scopedOutSafety, ['Sandboxed execution of untrusted code in containers or VMs']);

    const res = runB2i(['score', join(FIXTURES_DIR, 'devloop-brief.md'), '--json']);
    assert.equal(res.code, 0);
    const json = JSON.parse(res.stdout);
    for (const key of ['ok', 'score', 'grade', 'letterGrade', 'breakdown', 'categories', 'warnings', 'tips', 'meta']) {
      assert.ok(key in json, `existing key "${key}" is kept`);
    }
    assert.equal(json.judgment.alternatives, 'missing');
    assert.equal(json.judgment.trust, 'missing');
  });

  test('human output labels the number Doability and names what was not checked', () => {
    const res = runB2i(['score', join(FIXTURES_DIR, 'devloop-brief.md')]);
    assert.equal(res.code, 0);
    assert.match(res.stdout, /Brainstorm2idea score — Doability 100\/100 \(Grade A - EXCELLENT\)/);
    assert.ok(
      res.stdout.includes('Not checked: prior art (no ## Alternatives), trust boundaries (merge/deploy, runs code in scope, no TRUST: lines).'),
      res.stdout
    );
  });

  test('nothing extra when both checks are satisfied', () => {
    const res = runB2i(['score', join(FIXTURES_DIR, 'devloop-fixed.md')]);
    assert.equal(res.code, 0);
    assert.match(res.stdout, /Doability 100\/100/);
    assert.doesNotMatch(res.stdout, /Not checked/);
    const sc = scoreBrief(DEVLOOP_FIXED);
    assert.deepEqual(
      { alternatives: sc.judgment.alternatives, trust: sc.judgment.trust, scopedOutSafety: sc.judgment.scopedOutSafety },
      { alternatives: 'ok', trust: 'ok', scopedOutSafety: [] }
    );
  });

  test('a brief with no trust trigger only reports prior art', () => {
    const res = runB2i(['score', join(FIXTURES_DIR, 'valid-brief.md')]);
    assert.equal(res.code, 0);
    assert.ok(res.stdout.includes('Not checked: prior art (no ## Alternatives).'), res.stdout);
    assert.doesNotMatch(res.stdout, /trust boundaries/);
  });
});

describe('13. Judgment: new sections survive handoff and export', () => {
  const FULL = withInvariants(DEVLOOP_FIXED);

  beforeEach(() => {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test('mergeSectionsIntoPrototype appends Alternatives and Invariants', () => {
    const merged = mergeSectionsIntoPrototype('# Prototype spec — DevLoop\n\n## Goal\n-\n\n## Core flows\n1.\n\n## Out of scope\n-\n', validateBrief(FULL));
    assert.match(merged, /## Alternatives\n- GitHub Copilot coding agent: [^\n]*Differs by:/);
    assert.match(merged, /## Invariants\n- The judged PR never configures its own gate/);
  });

  test('handoff --target raw carries Alternatives and Invariants into PROTOTYPE.md', () => {
    const brief = join(TMP_DIR, 'devloop.md');
    writeFileSync(brief, FULL, 'utf8');
    const res = runB2i(['handoff', join(TMP_DIR, 'devloop'), '--target', 'raw', '--brief', brief]);
    assert.equal(res.code, 0, res.all);
    const proto = readFileSync(join(TMP_DIR, 'devloop', 'PROTOTYPE.md'), 'utf8');
    assert.match(proto, /## Alternatives\n- GitHub Copilot coding agent/);
    assert.match(proto, /## Invariants\n- The judged PR never configures its own gate/);
    assert.match(proto, /- TRUST: the loop merges with a fine-grained token/);
  });

  test('export prompt: invariants are hard constraints and TRUST lines are security requirements', () => {
    const res = runB2i(['export', '-', '--format', 'prompt'], {}, FULL);
    assert.equal(res.code, 0, res.all);
    assert.match(res.stdout, /## Hard Constraints \(Invariants — every flow must obey\)\n- The judged PR never configures its own gate/);
    assert.match(res.stdout, /## Security Requirements \(Trust Boundaries\)\n- 🔒 the loop merges with a fine-grained token/);
    const risks = res.stdout.split('## Key Assumptions & Risks')[1].split('\n## ')[0];
    assert.doesNotMatch(risks, /TRUST:/, 'TRUST lines move to the security section');
  });

  test('export prd adds Alternatives', () => {
    const res = runB2i(['export', '-', '--format', 'prd'], {}, FULL);
    assert.equal(res.code, 0, res.all);
    assert.match(res.stdout, /### \d+\. Alternatives \(Prior Art\)\n- \*\*GitHub Copilot coding agent\*\*: /);
  });

  test('export json includes alternatives, invariants and trust', () => {
    const res = runB2i(['export', '-', '--format', 'json'], {}, FULL);
    assert.equal(res.code, 0, res.all);
    const json = JSON.parse(res.stdout);
    assert.equal(json.alternatives.length, 2);
    assert.match(json.alternatives[0], /^GitHub Copilot coding agent: .*Differs by:/);
    assert.deepEqual(json.invariants, ['The judged PR never configures its own gate', 'Only the exact head SHA that passed tests is merged']);
    assert.equal(json.trust.length, 2);
    assert.match(json.trust[0], /^the loop merges with a fine-grained token/);
    assert.equal(json.risks.length, 7, 'existing risks key is unchanged');
  });

  test('init and dump scaffold an empty ## Alternatives with a TODO', () => {
    for (const template of VALID_TEMPLATES) {
      const out = join(TMP_DIR, `init-${template}.md`);
      const res = runB2i(['init', 'demo', '--template', template, '--output', out]);
      assert.equal(res.code, 0, res.all);
      const md = readFileSync(out, 'utf8');
      assert.match(md, /## Alternatives\n- TODO: /, `init --template ${template}`);
      assert.equal(validateBrief(md).ok, true);
      assert.equal(validateBrief(md).judgment.alternatives, 'thin');
    }
    const dump = runB2i(['dump', '-'], {}, 'A tool that renames photos by the date they were taken.');
    assert.equal(dump.code, 0, dump.all);
    assert.match(dump.stdout, /## Alternatives\n- TODO: /);
  });

  test('init adds a TODO ## Invariants only for templates that act unattended or serve requests', () => {
    for (const template of VALID_TEMPLATES) {
      const out = join(TMP_DIR, `inv-${template}.md`);
      runB2i(['init', 'demo', '--template', template, '--output', out]);
      const md = readFileSync(out, 'utf8');
      const expected = template === 'api' || template === 'worker';
      assert.equal(/## Invariants\n- TODO: /.test(md), expected, `init --template ${template}`);
    }
  });
});

describe('14. Judgment: review fixes', () => {
  const firing = (text) => [...new Set(TRUST_TRIGGERS.filter((t) => t.pattern.test(text)).map((t) => t.label))];

  test('a TRUST: line about a different control does not answer a scoped-out sandbox', () => {
    const brief = DEVLOOP.replace(
      '- ASSUMPTION: Anthropic',
      '- TRUST: the deploy token lives in a secrets manager and never reaches the LLM\n- ASSUMPTION: Anthropic'
    );
    const res = validateBrief(brief);
    assert.equal(res.judgment.trust, 'ok');
    assert.ok(res.warnings.includes(SANDBOX_WARNING), JSON.stringify(res.warnings));
    assert.deepEqual(res.judgment.scopedOutSafety, ['Sandboxed execution of untrusted code in containers or VMs']);
  });

  test('TRUST: lines under a plain ## Risks heading count, as in score and export', () => {
    const brief = DEVLOOP_FIXED.replace('## Risks & assumptions', '## Risks');
    const res = validateBrief(brief);
    assert.equal(res.judgment.trust, 'ok', JSON.stringify(res.warnings));
    const json = JSON.parse(exportBrief(brief, { format: 'json' }));
    assert.equal(json.trust.length, 2);
  });

  test('a numbered Out of scope list still surfaces a scoped-out safety control', () => {
    const brief = DEVLOOP.replace('- Sandboxed execution of untrusted code in containers or VMs', '1. Sandboxed execution of untrusted code in containers or VMs');
    const res = validateBrief(brief);
    assert.deepEqual(res.judgment.scopedOutSafety, ['Sandboxed execution of untrusted code in containers or VMs']);
  });

  test('unfilled TODO scaffolds are not content: tip stays, exports and handoff skip them', () => {
    const scaffold = '## Invariants\n- TODO: A rule every flow must obey (≤5), or delete this section';
    const brief = withInvariants(DEVLOOP_FIXED, scaffold);
    assert.ok(scoreBrief(brief).tips.some((t) => t.includes('## Invariants')), 'TODO-only Invariants still earns the tip');
    const prompt = exportBrief(brief, { format: 'prompt' });
    assert.doesNotMatch(prompt, /Hard Constraints/);
    assert.deepEqual(JSON.parse(exportBrief(brief, { format: 'json' })).invariants, []);
    assert.doesNotMatch(mergeSectionsIntoPrototype('# Prototype spec\n\n## Goal\n-\n', validateBrief(brief)), /## Invariants/);

    const todoAlts = withAlternatives(DEVLOOP, ['- TODO: <Name>: <what it does>. Differs by: <how this brief differs>']);
    assert.doesNotMatch(exportBrief(todoAlts, { format: 'prd' }), /Alternatives \(Prior Art\)|\*\*TODO\*\*/);
  });

  test('credential env vars match case-sensitively; lowercase cursors stay quiet', () => {
    assert.deepEqual(firing('follow the next_token cursor and cap max_token per call'), []);
    assert.deepEqual(firing('reads GITHUB_TOKEN from the environment'), ['credentials']);
  });

  test('"run code formatting" and non-software agents raise no trust trigger', () => {
    assert.deepEqual(firing('Run code formatting on staged files'), []);
    assert.deepEqual(firing('Let a booking agent reserve tables; a travel agent quotes trips'), []);
    assert.deepEqual(firing('runs the generated code'), ['runs code']);
    assert.deepEqual(firing('an LLM agent proposes the fix'), ['agent']);
  });

  test('the trust warning stays compact', () => {
    const trust = validateBrief(DEVLOOP).warnings.find((w) => w.startsWith('trust: '));
    assert.ok(trust.length <= 200, `${trust.length} chars: ${trust}`);
  });

  test('issues export lists invariants and security requirements', () => {
    const out = exportBrief(withInvariants(DEVLOOP_FIXED), { format: 'issues' });
    assert.match(out, /- \[ \] Invariant holds in every flow: The judged PR never configures its own gate/);
    assert.match(out, /- \[ \] Security requirement: the loop merges with a fine-grained token/);
  });
});

// Cases from the 2026-10-26 A/B re-run (cells 2A, 4A, 5A, 7A, 8A).
describe('Re-run proposals', () => {
  const brief = ({ template = 'web', name = 'Swap Desk', distilled = 'Local swap desk for a book cafe', goal, flows, oos, risks = '- RISK: demo scale only', extra = '' }) => `---
schema: b2i-brief@1
template: ${template}
distilled: ${distilled}
---
# ${name}

## Goal
${goal}

## Core flows
${flows}

## Out of scope
${oos}

## Risks & assumptions
${risks}
${extra}`;

  beforeEach(() => {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test('score ignores sample data in a code span or key=value (4A)', () => {
    const md = brief({
      template: 'cli',
      goal: '- Tail a JSON log file and group errors by service',
      flows: "1. Parse a line such as `parseLogLine('ts=1 svc=payments msg=\"payment failed\"')` into fields\n2. Print counts for svc=billing and level=error lines",
      oos: '- Remote log shipping\n- Dashboards',
    });
    const res = scoreBrief(md);
    assert.deepEqual(res.categories.rabbitHoles.detected, []);
    assert.equal(res.score, 100);
    // A bare technology name in a code span is still scope.
    const live = brief({ template: 'cli', goal: '- Charge cards through `stripe`', flows: '1. Checkout', oos: '- Refund UI\n- Dashboards' });
    assert.deepEqual(scoreBrief(live).categories.rabbitHoles.detected.map((d) => d.label), ['Payment gateway']);
  });

  test('negated mentions raise no trust trigger or rabbit hole (7A)', () => {
    const md = brief({
      goal: '- Run 100% locally with zero API keys\n- Identify members by name, no authentication',
      flows: '1. Log a donated book\n2. Take a book with no payment',
      oos: '- Accounts\n- Multi-venue support',
    });
    const res = scoreBrief(md);
    assert.deepEqual(res.judgment.trustTriggers, []);
    assert.deepEqual(res.categories.rabbitHoles.detected, []);
    // A negation stops at a conjunction, so a live mention after it still counts.
    const mixed = brief({ goal: '- No dashboards and Stripe checkout for members', flows: '1. Checkout', oos: '- Refunds\n- Accounts' });
    assert.deepEqual(scoreBrief(mixed).categories.rabbitHoles.detected.map((d) => d.label), ['Payment gateway']);
    assert.deepEqual(scoreBrief(mixed).judgment.trustTriggers, ['payment']);
  });

  test('a real-only cut with a mock in scope is mocked, not mitigated (2A)', () => {
    const md = brief({
      goal: '- Owners book a groomer slot',
      flows: '1. Book the slot and check out through a mock ledger',
      oos: '- Real money movement: Stripe is represented by a mock ledger\n- Auth and real groomer certification',
    });
    const res = scoreBrief(md);
    assert.deepEqual(res.categories.rabbitHoles.mocked, ['Payment gateway']);
    assert.deepEqual(res.categories.rabbitHoles.mitigated, ['OAuth/SSO']);
    assert.equal(res.score, 100);
    assert.ok(res.tips.some((t) => t.startsWith('◐ Mocked Payment gateway')), JSON.stringify(res.tips));
    assert.ok(!res.tips.some((t) => t.startsWith('✓ Mitigated Payment gateway')));
    // Without a mock in scope the same cut is a plain mitigation.
    const cut = brief({ goal: '- Owners book a groomer slot', flows: '1. Book the slot', oos: '- Payments: Stripe is represented by a mock ledger later\n- Auth' });
    assert.deepEqual(scoreBrief(cut).categories.rabbitHoles.mocked, []);
    assert.deepEqual(scoreBrief(cut).categories.rabbitHoles.mitigated, ['OAuth/SSO', 'Payment gateway']);
  });

  test('a merge justification is a two-product smell, wherever the brief makes it (8A)', () => {
    const md = brief({
      template: 'cli',
      name: 'dotstreak',
      distilled: 'one CLI that saves dotfiles into a git vault, restores them, and renders a streak heatmap page',
      goal: '- Back up and restore dotfiles\n- Render a public streak heatmap',
      flows: '1. save\n2. restore\n3. streak',
      oos: '- Cloud push\n- Private contributions',
      extra: '\n## Alternatives\n- chezmoi: Blossom-style all-in-one dotfile manager. Differs by: no streak page\n- yadm: git wrapper. Differs by: this brief is one tool doing both jobs\n',
    });
    const res = validateBrief(md);
    assert.equal(res.ok, true);
    assert.ok(res.warnings.includes('two-product smell: "doing both jobs…" joins two deliverables — brief one product and park the other in ## Out of scope'), JSON.stringify(res.warnings));
    // "all-in-one" describing a competitor (before "Differs by:") is not this brief's claim.
    const clean = md.replace('this brief is one tool doing both jobs', 'dotfiles only');
    assert.ok(!validateBrief(clean).warnings.some((w) => w.startsWith('two-product smell')));
  });

  test('a brief that calls its idea physical but picks a software template warns (5A)', () => {
    const md = brief({
      goal: '- Run bring-one-take-one swaps',
      flows: '1. Donate a book',
      oos: '- Coffee point-of-sale\n- Accounts',
      risks: '- ASSUMPTION: the physical café itself is not software-prototypeable; v0 targets its swap desk',
    });
    const res = scoreBrief(md);
    assert.ok(res.warnings.some((w) => w.startsWith('physical idea: ')), JSON.stringify(res.warnings));
    assert.ok(res.tips.some((t) => t.startsWith('💡 Physical idea: ')));
    assert.equal(res.score, 100);
    assert.ok(!validateBrief(md.replace('template: web', 'template: none')).warnings.some((w) => w.startsWith('physical idea')));
    // A physical thing cut in Out of scope is not the idea.
    const shop = brief({ goal: '- Sell prints online', flows: '1. Browse prints', oos: '- Physical store inventory sync\n- Accounts' });
    assert.ok(!validateBrief(shop).warnings.some((w) => w.startsWith('physical idea')));
  });

  test('review probes: double negatives, API code spans and one-product phrasing stay as before', () => {
    const fired = (b) => scoreBrief(brief({ goal: '- Do one thing', flows: '1. Do it', oos: '- Other\n- More', ...b }));
    // "never"/"not"/"without" do not negate: these still merge, deploy and run CI.
    assert.deepEqual(fired({ flows: '1. The bot never merges PRs without CI passing' }).judgment.trustTriggers, ['merge/deploy', 'CI/workflow']);
    assert.deepEqual(fired({ flows: '1. It does not deploy until the tests pass' }).judgment.trustTriggers, ['merge/deploy']);
    // A code span is scope; only the quoted sample data inside it is dropped.
    assert.deepEqual(fired({ template: 'library', flows: '1. `deploy(target)` ships the build' }).judgment.trustTriggers, ['merge/deploy']);
    // An unrelated mock in scope does not turn a cut into "mocked".
    const auth = fired({ flows: '1. Serve mock JSON responses', oos: '- Auth: replaced by a fake session header\n- Other' });
    assert.deepEqual(auth.categories.rabbitHoles.mocked, []);
    assert.deepEqual(auth.categories.rabbitHoles.mitigated, ['OAuth/SSO']);
    // One product described with "both" or "all-in-one", and a software brief saying "not software".
    for (const extra of [
      '\n## Notes\n- Import handles both CSV and JSON files\n- Covers both macOS and Linux shells\n- Ships as a single all-in-one HTML file\n- Both tools read the same config file\n',
    ]) {
      assert.ok(!fired({ extra }).warnings.some((w) => w.startsWith('two-product smell')));
    }
    assert.ok(!fired({ risks: '- RISK: adoption is a social problem, not software' }).warnings.some((w) => w.startsWith('physical idea')));
    assert.ok(!fired({ goal: '- Let customers pre-order online to complement the physical store' }).warnings.some((w) => w.startsWith('physical idea')));
  });

  test('handoff refuses a non-empty dir before calling i2p and names a fresh one', () => {
    const tempBrief = join(TMP_DIR, 'brief.md');
    copyFileSync(join(FIXTURES_DIR, 'valid-brief.md'), tempBrief);
    for (const extra of [[], ['--dry-run']]) {
      const res = runB2i(['handoff', TMP_DIR, '--brief', tempBrief, '--i2p', MOCK_I2P, '--json', ...extra]);
      assert.equal(res.code, 1);
      const out = JSON.parse(res.stdout);
      assert.match(out.error, /is not empty and idea2prototype only scaffolds into a new or empty directory — run: b2i handoff \.\/[a-z0-9-]+$/);
      assert.match(out.suggestedDir, /^\.\/[a-z0-9-]+$/);
    }
    assert.ok(existsSync(tempBrief), 'brief left intact');
    // An empty existing dir passes the guard (the mock i2p itself refuses any existing dir, so dry-run).
    const empty = join(TMP_DIR, 'empty');
    mkdirSync(empty);
    assert.equal(runB2i(['handoff', empty, '--brief', tempBrief, '--i2p', MOCK_I2P, '--dry-run']).code, 0);
  });
});
