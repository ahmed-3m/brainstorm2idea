import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  validateBrief,
  scoreBrief,
  exportBrief,
  useColor,
  c,
  VERSION,
  SCHEMA_VERSION,
} from '../skills/brainstorm2idea/scripts/brainstorm2idea.mjs';

const binPath = resolve(process.cwd(), 'bin/b2i.mjs');

// CLI output is asserted as plain text: a FORCE_COLOR in the caller's
// environment would otherwise leak into every spawned b2i.
delete process.env.FORCE_COLOR;

function runCli(args, input = null, env = {}) {
  const mergedEnv = { ...process.env, ...env };
  const res = spawnSync(process.execPath, [binPath, ...args], {
    encoding: 'utf8',
    input: input !== null ? input : undefined,
    env: mergedEnv,
  });
  return {
    code: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    all: (res.stdout || '') + (res.stderr || ''),
  };
}

// ---------------------------------------------------------------------------
// Canonical Scenarios from benchmarks/specs.md
// ---------------------------------------------------------------------------

const SCENARIO_1_PLANTPULSE = `---
schema: b2i-brief@1
template: web
distilled: Lightweight shared plant watering tracker showing days until next water
---
# PlantPulse

## Goal
- Track last watering date and next due date for household plants.
- Provide a single-tap button to mark a plant as watered.

## Core flows
1. View list of plants with status badge (Good, Water Soon, Overdue).
2. Tap "Watered" to reset the interval timer for a selected plant.
3. Add a new plant with name and watering frequency in days.

## Out of scope
- Computer vision leaf health diagnosis
- Push notifications and mobile home screen widgets
- User accounts, authentication, and community forums
- Paid subscriptions or payment processing

## Risks & assumptions
- ASSUMPTION: Single shared local device or public URL without login suffices for prototype.
- RISK: Users may forget to open the web app without push reminders.

## Notes
- Keep UI minimal: large tap targets and clear color-coded countdown days.
`;

const SCENARIO_2_PAWSONDEMAND = `---
schema: b2i-brief@1
template: web
distilled: On-demand directory for pet owners to browse nearby pet groomers and request a booking
---
# PawsOnDemand

## Goal
- Allow pet owners to search groomers by postal code and service type.
- Enable submitting a direct booking request to a chosen groomer.

## Core flows
1. Search groomers by zip code and view service menu with flat prices.
2. Select an available time slot and submit pet details.
3. Receive a confirmation code and reservation summary.

## Out of scope
- Stripe payments, Solana, crypto wallets, and escrow handling
- Real-time GPS van tracking and live maps
- Swipe-based Tinder matching UI
- Groomer employee payroll, tax calculations, and inventory management
- Native iOS/Android mobile applications

## Risks & assumptions
- ASSUMPTION: Static mock data for 5 groomers is sufficient for the first interactive prototype.
- RISK: Booking conflict resolution requires real-time calendar syncing in production.

## Notes
- Single-page responsive web app optimized for mobile viewports.
`;

const SCENARIO_3_COLLABMARK = `---
schema: b2i-brief@1
template: web
distilled: Split-screen markdown editor with live peer-to-peer room collaboration
---
# CollabMark

## Goal
- Provide instant split-screen markdown editing and live HTML preview.
- Support multi-user collaborative typing inside a shared room ID.

## Core flows
1. Create or join a named room URL (/room/:id).
2. Type in markdown editor and see edits synchronized in real time across open browser tabs.
3. Export current markdown buffer to a .md file.

## Out of scope
- OAuth login, user accounts, and permission management
- Multi-region distributed clustering, Redis, Raft, or Kubernetes
- Git-backed revision trees and branch merging
- Rich-text WYSIWYG block transforms

## Risks & assumptions
- ASSUMPTION: In-memory WebSocket broadcast or WebRTC is adequate for prototype demo.
- RISK: Network partition handling without persistent storage may cause unmerged state on reload.

## Notes
- Standalone Node.js server with native WebSocket or simple browser sync.
`;

const SCENARIO_4_KVLOGPARSE = `---
schema: b2i-brief@1
template: library
distilled: Zero-dependency parser converting semi-structured key-value log strings into typed JSON
---
# kv-log-parse

## Goal
- Parse log strings with key-value pairs into JSON objects.
- Handle quoted values, escapes, numbers, and ISO timestamps without external dependencies.

## Public API
1. parseLine(line: string): Record<string, unknown> - parse a single log line into a key-value record.
2. parseStream(readable: ReadableStream): AsyncIterable<Record<string, unknown>> - transform a stream of lines.

## Out of scope
- Log shipping, remote aggregation, or Elastic/OpenTelemetry exporters
- Custom regex grammar definition languages
- Log formatting or terminal colorizing

## Risks & assumptions
- ASSUMPTION: Standard key=value and key="quoted value" conventions cover 95% of target logs.
- RISK: Deeply nested object syntax requires special escape handling.

## Notes
- Pure Node.js / TypeScript with zero runtime dependencies.
- Sub-millisecond parse benchmark per 1,000 lines.
`;

const SCENARIO_5_KREUZBERG_CAFE = `---
schema: b2i-brief@1
template: none
distilled: Conceptual brief for a physical community book swap cafe and event space in Berlin
---
# Kreuzberg Book Swap Cafe

## Goal
- Define the operational model and community membership structure for a physical book swap cafe.
- Outline weekly event schedules and host curator rotations.

## Core flows
1. Visitor drops off 1-3 books in exchange for coffee credits or swap tokens.
2. Visitor browses curated shelves and selects books to take home.
3. Community members RSVP for Sunday reading salons.

## Out of scope
- Custom software, mobile apps, or web applications
- Online bookstore inventory management software
- POS hardware and payment processing systems

## Risks & assumptions
- ASSUMPTION: Physical token/stamp card suffices; no digital software required.
- RISK: Commercial lease and municipal food service licensing in Berlin.

## Notes
- Brief-only mode. Not suitable for software prototyping via idea2prototype.
`;

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe('Canonical Benchmark Specs (5 Scenarios)', () => {
  it('Scenario 1: PlantPulse (Voice Memo De-Noiser) satisfies rubric', () => {
    const valid = validateBrief(SCENARIO_1_PLANTPULSE);
    assert.equal(valid.ok, true, 'passes 7/7 schema checks');

    const score = scoreBrief(SCENARIO_1_PLANTPULSE);
    assert.equal(score.ok, true);
    assert.equal(score.score, 100);
    assert.equal(score.letterGrade, 'A');

    // Export test
    const prompt = exportBrief(SCENARIO_1_PLANTPULSE, { format: 'prompt' });
    assert.match(prompt, /# Agent Kickoff Prompt: PlantPulse/);
    assert.match(prompt, /Lightweight shared plant watering tracker/);
    assert.match(prompt, /❌ User accounts, authentication, and community forums/);
  });

  it('Scenario 2: PawsOnDemand (Frankenstein SaaS Scope-Cut) quarantines rabbit holes', () => {
    const valid = validateBrief(SCENARIO_2_PAWSONDEMAND);
    assert.equal(valid.ok, true);

    const score = scoreBrief(SCENARIO_2_PAWSONDEMAND);
    assert.equal(score.ok, true);
    assert.equal(score.score, 100);
    assert.equal(score.letterGrade, 'A');

    const issues = exportBrief(SCENARIO_2_PAWSONDEMAND, { format: 'issues' });
    assert.match(issues, /# \[Prototype\] PawsOnDemand/);
    assert.match(issues, /Confirm excluded: Stripe payments, Solana, crypto wallets/);
  });

  it('Scenario 3: CollabMark (Infra Simplicity Challenge) sanitizes distributed stack', () => {
    const valid = validateBrief(SCENARIO_3_COLLABMARK);
    assert.equal(valid.ok, true);

    const score = scoreBrief(SCENARIO_3_COLLABMARK);
    assert.equal(score.ok, true);
    assert.equal(score.score, 100);
    assert.equal(score.letterGrade, 'A');

    const prd = exportBrief(SCENARIO_3_COLLABMARK, { format: 'prd' });
    assert.match(prd, /# Product Requirements Document \(PRD\)/);
    assert.match(prd, /CollabMark/);
    assert.match(prd, /Multi-region distributed clustering, Redis, Raft, or Kubernetes/);
  });

  it('Scenario 4: kv-log-parse (Library Utility) validates Public API section', () => {
    const valid = validateBrief(SCENARIO_4_KVLOGPARSE);
    assert.equal(valid.ok, true);
    assert.equal(valid.meta.template, 'library');

    const score = scoreBrief(SCENARIO_4_KVLOGPARSE);
    assert.equal(score.ok, true);
    assert.equal(score.score, 100);

    const json = JSON.parse(exportBrief(SCENARIO_4_KVLOGPARSE, { format: 'json' }));
    assert.equal(json.name, 'kv-log-parse');
    assert.equal(json.template, 'library');
    assert.equal(json.flows.length, 2);
  });

  it('Scenario 5: Kreuzberg Book Swap Cafe (Non-Software Honesty) passes with template: none', () => {
    const valid = validateBrief(SCENARIO_5_KREUZBERG_CAFE);
    assert.equal(valid.ok, true);
    assert.equal(valid.meta.template, 'none');

    const score = scoreBrief(SCENARIO_5_KREUZBERG_CAFE);
    assert.equal(score.ok, true);
    assert.equal(score.score, 100);
  });
});

describe('Export Function (exportBrief)', () => {
  it('exports format "prompt" with comprehensive kickoff instructions', () => {
    const out = exportBrief(SCENARIO_1_PLANTPULSE, { format: 'prompt' });
    assert.match(out, /# Agent Kickoff Prompt: PlantPulse/);
    assert.match(out, /## Primary Goals/);
    assert.match(out, /## Core User Flows \/ Implementation Scope/);
    assert.match(out, /## Strict Non-Goals \(Out of Scope — DO NOT IMPLEMENT\)/);
    assert.match(out, /## Key Assumptions & Risks/);
    assert.match(out, /## Implementation Instructions for AI Agent/);
  });

  it('exports format "issues" with GitHub markdown checklist phases', () => {
    const out = exportBrief(SCENARIO_1_PLANTPULSE, { format: 'issues' });
    assert.match(out, /# \[Prototype\] PlantPulse/);
    assert.match(out, /### Phase 1: Foundations & Scaffolding/);
    assert.match(out, /### Phase 2: Core User Flows/);
    assert.match(out, /### Phase 3: Scope Guard & Hardening/);
    assert.match(out, /## Acceptance Criteria/);
    assert.match(out, /- \[ \] View list of plants with status badge/);
  });

  it('exports format "prd" with one-page table and architectural constraints', () => {
    const out = exportBrief(SCENARIO_1_PLANTPULSE, { format: 'prd' });
    assert.match(out, /# Product Requirements Document \(PRD\)/);
    assert.match(out, /Project: PlantPulse/);
    assert.match(out, /### 1\. Executive Summary & Problem/);
    assert.match(out, /### 2\. Goals & Success Metrics/);
    assert.match(out, /### 3\. Non-Goals \(Strictly Out of Scope\)/);
    assert.match(out, /### 5\. Technical Architecture \(WEB\)/);
  });

  it('exports format "json" with score and parsed metadata', () => {
    const out = exportBrief(SCENARIO_1_PLANTPULSE, { format: 'json' });
    const parsed = JSON.parse(out);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.name, 'PlantPulse');
    assert.equal(parsed.template, 'web');
    assert.equal(parsed.score.total, 100);
    assert.equal(parsed.goals.length, 2);
    assert.equal(parsed.flows.length, 3);
  });

  it('throws on unsupported export format', () => {
    assert.throws(
      () => exportBrief(SCENARIO_1_PLANTPULSE, { format: 'yaml' }),
      /unknown export format "yaml"/
    );
  });

  it('throws when exporting invalid brief', () => {
    assert.throws(
      () => exportBrief('# Missing Everything\nNo frontmatter here'),
      /cannot export invalid brief/
    );
  });
});

describe('CLI b2i export Command', () => {
  const tmpFile = join(tmpdir(), `b2i-bench-brief-${Date.now()}.md`);
  const tmpOut = join(tmpdir(), `b2i-bench-out-${Date.now()}.md`);

  before(() => {
    writeFileSync(tmpFile, SCENARIO_1_PLANTPULSE, 'utf8');
  });

  after(() => {
    try { unlinkSync(tmpFile); } catch {}
    try { unlinkSync(tmpOut); } catch {}
  });

  it('b2i export defaults to prompt format output to stdout', () => {
    const res = runCli(['export', tmpFile]);
    assert.equal(res.code, 0);
    assert.match(res.stdout, /# Agent Kickoff Prompt: PlantPulse/);
  });

  it('b2i export --format issues outputs GitHub checklist', () => {
    const res = runCli(['export', tmpFile, '--format', 'issues']);
    assert.equal(res.code, 0);
    assert.match(res.stdout, /### Phase 2: Core User Flows/);
  });

  it('b2i export --format prd outputs PRD markdown', () => {
    const res = runCli(['export', tmpFile, '--format', 'prd']);
    assert.equal(res.code, 0);
    assert.match(res.stdout, /# Product Requirements Document \(PRD\)/);
  });

  it('b2i export --format json outputs machine-readable JSON', () => {
    const res = runCli(['export', tmpFile, '--format', 'json']);
    assert.equal(res.code, 0);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.name, 'PlantPulse');
  });

  it('b2i export --json flag behaves identically to --format json', () => {
    const res = runCli(['export', tmpFile, '--json']);
    assert.equal(res.code, 0);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.name, 'PlantPulse');
  });

  it('b2i export --output <file> writes rendered content to file', () => {
    const res = runCli(['export', tmpFile, '--format', 'prd', '--output', tmpOut]);
    assert.equal(res.code, 0);
    assert.match(res.stdout, /Brainstorm2idea export — SUCCESS/);
    assert.equal(existsSync(tmpOut), true);
    const content = readFileSync(tmpOut, 'utf8');
    assert.match(content, /# Product Requirements Document \(PRD\)/);
  });

  it('b2i export - reads brief from stdin', () => {
    const res = runCli(['export', '-', '--format', 'issues'], SCENARIO_1_PLANTPULSE);
    assert.equal(res.code, 0);
    assert.match(res.stdout, /# \[Prototype\] PlantPulse/);
  });

  it('b2i export exits 1 on missing file', () => {
    const res = runCli(['export', './non-existent-path.md']);
    assert.equal(res.code, 1);
    assert.match(res.all, /file not found/);
  });

  it('b2i export exits 1 on unknown format', () => {
    const res = runCli(['export', tmpFile, '--format', 'xml']);
    assert.equal(res.code, 1);
    assert.match(res.all, /unknown export format/);
  });
});

describe('ANSI Color & Terminal Safety', () => {
  it('useColor respects NO_COLOR environment variable', () => {
    const prevNoColor = process.env.NO_COLOR;
    const prevForceColor = process.env.FORCE_COLOR;
    try {
      delete process.env.FORCE_COLOR;
      process.env.NO_COLOR = '1';
      assert.equal(useColor(), false);
      assert.equal(c.green('hello'), 'hello');
      assert.equal(c.red('error'), 'error');
    } finally {
      if (prevNoColor !== undefined) process.env.NO_COLOR = prevNoColor;
      else delete process.env.NO_COLOR;
      if (prevForceColor !== undefined) process.env.FORCE_COLOR = prevForceColor;
      else delete process.env.FORCE_COLOR;
    }
  });

  it('useColor respects FORCE_COLOR environment variable', () => {
    const prevNoColor = process.env.NO_COLOR;
    const prevForceColor = process.env.FORCE_COLOR;
    try {
      delete process.env.NO_COLOR;
      process.env.FORCE_COLOR = '1';
      assert.equal(useColor(), true);
      assert.equal(c.green('PASS'), '\x1b[32mPASS\x1b[0m');
      assert.equal(c.red('FAIL'), '\x1b[31mFAIL\x1b[0m');
      assert.equal(c.yellow('WARN'), '\x1b[33mWARN\x1b[0m');
      assert.equal(c.cyan('CLI'), '\x1b[36mCLI\x1b[0m');
      assert.equal(c.bold('BOLD'), '\x1b[1mBOLD\x1b[0m');
    } finally {
      if (prevNoColor !== undefined) process.env.NO_COLOR = prevNoColor;
      else delete process.env.NO_COLOR;
      if (prevForceColor !== undefined) process.env.FORCE_COLOR = prevForceColor;
      else delete process.env.FORCE_COLOR;
    }
  });
});
