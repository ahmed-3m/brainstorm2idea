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
  scoreBrief,
  fixBrief,
  RABBIT_HOLES,
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
    assert.match(res.stdout, /Brainstorm2idea score — \d+\/100 \(Grade/);
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
});
