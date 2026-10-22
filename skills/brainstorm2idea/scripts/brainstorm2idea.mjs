#!/usr/bin/env node
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { resolve, join, basename, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, parseSections, extractListItems, quoteFrontmatterValue, sanitizeInlineText } from './parser.mjs';
import { SCHEMA_VERSION, VALID_TEMPLATES } from './constants.mjs';
import { SPARK_CATEGORIES, SPARK_CATALOG, generateBriefFromSpark } from './sparks.mjs';

// Re-export for backward compatibility (tests and external consumers import from engine)
export { parseFrontmatter, parseSections, extractListItems, quoteFrontmatterValue, sanitizeInlineText };
export { SCHEMA_VERSION, VALID_TEMPLATES } from './constants.mjs';
export { SPARK_CATEGORIES, SPARK_CATALOG, generateBriefFromSpark } from './sparks.mjs';

export const VERSION = '0.4.3';

// Every CLI command the router accepts. Kept in sync with the router switch
// and asserted against SKILL.md / AGENTS.md by the consistency test suite.
export const CLI_COMMANDS = ['check', 'score', 'spark', 'init', 'dump', 'export', 'handoff', 'list'];

export const HELP = {
  check: `Usage: b2i check [brief|-] [--fix] [--json]\n\nRun 7 hard lint checks on brief.md or stdin (compact verdict, max 3 failure notes).`,
  score: `Usage: b2i score [brief|-] [--json]\n\nCompute 0–100 Doability & Rabbit-Hole score with per-category breakdown.`,
  spark: `Usage: b2i spark [category] [--seed <id>] [--output <path>] [--force] [--json]\n\nBrowse 30 curated prototype archetypes or seed a complete brief.md.`,
  init: `Usage: b2i init <name> [--template web|api|cli|worker|library|none] [--output <path>] [--json]\n\nScaffold a starter brief.md with TODO sections.`,
  dump: `Usage: b2i dump [file|-] [--template web|api|cli|worker|library|none] [--output <path>] [--force] [--json]\n\nDe-noise a raw transcript or dump into a draft brief skeleton.`,
  export: `Usage: b2i export [brief|-] [--format prompt|issues|prd|json] [--output <path>] [--json]\n\nExport approved brief to kickoff prompt, GitHub issues, PRD, or JSON.`,
  handoff: `Usage: b2i handoff <dir> [--target i2p|raw] [--brief <path>] [--i2p <path>] [--dry-run] [--json]\n\nPre-flight check and scaffold project into idea2prototype or raw PROTOTYPE.md.`,
  list: `Usage: b2i list [--json]\n\nPrint schema version (b2i-brief@1) and supported templates.`,
};

// ANSI terminal colors (strictly disabled in non-TTY or when NO_COLOR is set)
export const useColor = () => {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout && process.stdout.isTTY);
};

export const c = {
  green: (s) => (useColor() ? `\x1b[32m${s}\x1b[0m` : String(s)),
  red: (s) => (useColor() ? `\x1b[31m${s}\x1b[0m` : String(s)),
  yellow: (s) => (useColor() ? `\x1b[33m${s}\x1b[0m` : String(s)),
  cyan: (s) => (useColor() ? `\x1b[36m${s}\x1b[0m` : String(s)),
  dim: (s) => (useColor() ? `\x1b[2m${s}\x1b[0m` : String(s)),
  bold: (s) => (useColor() ? `\x1b[1m${s}\x1b[0m` : String(s)),
};

export const RABBIT_HOLES = [
  { pattern: /\b(oauth2?|oidc|saml|sso|auth(?:entication|orization)?)\b/i, label: 'OAuth/SSO', fix: 'use auth-local or mocked session context for v0' },
  { pattern: /\b(stripe|paypal|payment gateway|billing|payment)\b/i, label: 'Payment gateway', fix: 'stub checkout with a local mock webhook' },
  { pattern: /\b(kubernetes|k8s|microservices?|multi-region|kafka)\b/i, label: 'Distributed infra', fix: 'run single-process with local JSON/SQLite storage' },
  { pattern: /\b(webrtc|blockchain|fine-tun(?:e|ing)|custom neural net)\b/i, label: 'Heavy/niche tech', fix: 'mock pipeline with deterministic fixtures' },
  { pattern: /\b(full-text search|elasticsearch|fuzzy search|semantic search)\b/i, label: 'Complex search', fix: 'use simple case-insensitive substring matching' },
  { pattern: /\b(multi.?tenant|multitenant|cross.?tenant|per.?tenant)\b/i, label: 'Multi-tenancy', fix: 'single-tenant prototype with hard-coded org context' },
  { pattern: /\b(native app|mobile app|ios|android)\b/i, label: 'Native app', fix: 'web or CLI prototype first; mobile is v1' },
  { pattern: /\b(real.?time (video|audio)|live stream|video call|video chat)\b/i, label: 'Real-time media', fix: 'mock media with static fixtures or text-only fallback' },
];

// ---------------------------------------------------------------------------
// 7 Hard Checks Validator
// ---------------------------------------------------------------------------

export function validateBrief(content, options = {}) {
  const errors = [];
  const warnings = [];

  const { meta, body } = parseFrontmatter(content);
  const { title, sections, duplicates } = parseSections(body);
  // A duplicated heading is ambiguous: only the last copy would be checked.
  const duplicateOf = (pattern) => duplicates.find((d) => pattern.test(d));
  // Frontmatter must open on line 1; after blank lines it is read as body text.
  const frontmatterNotOnLine1 =
    Object.keys(meta).length === 0 && /^﻿?(?:[ \t]*\r?\n)+---\r?\n/.test(String(content || ''));

  // Helper to find section case-insensitively
  function getSection(pattern) {
    const key = Object.keys(sections).find((k) => pattern.test(k));
    return key ? { key, content: sections[key] } : null;
  }

  // 1. schema
  if (frontmatterNotOnLine1) {
    errors.push('schema: frontmatter must start on line 1 (blank lines precede the opening ---; check --fix removes them)');
  } else if (!meta.schema) {
    errors.push('schema: missing frontmatter schema (expected b2i-brief@1)');
  } else if (meta.schema !== SCHEMA_VERSION) {
    warnings.push(`schema drift: "${meta.schema}" differs from engine schema "${SCHEMA_VERSION}"`);
  }

  // 2. name (first H1)
  if (!title) {
    errors.push('name: missing H1 title (# Title)');
  }

  // 3. template
  const allowedTemplates = options?.templates ? options.templates : VALID_TEMPLATES;
  if (!meta.template) {
    errors.push(`template: missing template (must be one of: ${allowedTemplates.join(', ')})`);
  } else if (!allowedTemplates.includes(meta.template.toLowerCase())) {
    errors.push(`template: invalid "${meta.template}" (must be one of: ${allowedTemplates.join(', ')})`);
  }

  // 4. goal (1-3 bullets)
  const goalSec = getSection(/^Goal$/i);
  if (!goalSec) {
    errors.push('goal: missing ## Goal section');
  } else if (duplicateOf(/^Goal$/i)) {
    errors.push('goal: duplicate ## Goal sections (merge them into one)');
  } else {
    const bullets = (goalSec.content || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^[-*+]\s+.+/.test(l));
    if (bullets.length === 0) {
      errors.push('goal: 0 bullets found (expected 1-3)');
    } else if (bullets.length > 3) {
      errors.push(`goal: ${bullets.length} bullets, max 3`);
    }
  }

  // 5. core flows (1-3 numbered items, allows 'Public API' for library template)
  const flowsSec = getSection(/^(Core flows|Public API)$/i);
  if (!flowsSec) {
    errors.push('flows: missing ## Core flows section');
  } else if (duplicateOf(/^(Core flows|Public API)$/i)) {
    errors.push(`flows: duplicate ## ${flowsSec.key} sections (merge them into one)`);
  } else if (Object.keys(sections).filter((k) => /^(Core flows|Public API)$/i.test(k)).length > 1) {
    // Consumers read one flows section, so the other would be silently dropped.
    errors.push('flows: both ## Core flows and ## Public API present (keep one)');
  } else {
    const numbered = (flowsSec.content || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^\d+[.)]\s+.+/.test(l));
    if (numbered.length === 0) {
      errors.push('flows: 0 numbered flows found (expected 1-3 numbered items, e.g. "1. ..." or "1) ...")');
    } else if (numbered.length > 3) {
      errors.push(`flows: ${numbered.length} flows, max 3`);
    }
  }

  // 6. out of scope (>= 1 non-empty bullet)
  const outOfScopeSec = getSection(/^Out of scope$/i);
  if (!outOfScopeSec) {
    errors.push('out-of-scope: missing ## Out of scope section');
  } else if (duplicateOf(/^Out of scope$/i)) {
    errors.push('out-of-scope: duplicate ## Out of scope sections (merge them into one)');
  } else {
    const bullets = (outOfScopeSec.content || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^[-*+]\s+.+/.test(l));
    if (bullets.length === 0) {
      errors.push('out-of-scope: at least 1 bullet required');
    }
  }

  // 7. distilled (non-empty, <= 200 chars — code points, so one emoji is one char)
  const distilledLen = [...String(meta.distilled || '').trim()].length;
  if (distilledLen === 0) {
    errors.push('distilled: missing or empty distilled one-liner in frontmatter');
  } else if (distilledLen > 200) {
    errors.push(`distilled: ${distilledLen} chars, max 200`);
  }

  // Soft Warnings
  for (const d of duplicates) {
    if (!/^(Goal|Core flows|Public API|Out of scope)$/i.test(d)) {
      warnings.push(`duplicate ## ${d} section: only the last one is used`);
    }
  }
  const risksSec = getSection(/^(Risks & assumptions|Risks and assumptions)$/i);
  if (risksSec && risksSec.content) {
    const lines = risksSec.content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^[-*+]\s+/.test(l));
    for (const l of lines) {
      if (!/^[-*+]\s+(RISK:|ASSUMPTION:)/i.test(l)) {
        warnings.push(`risks & assumptions: bullet "${l.slice(0, 40)}..." should prefix with RISK: or ASSUMPTION:`);
        break;
      }
    }
  }

  const notesSec = getSection(/^Notes$/i);
  if (notesSec && notesSec.content) {
    const noteBullets = notesSec.content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^[-*+]\s+.+/.test(l));
    if (noteBullets.length > 6) {
      warnings.push(`notes: ${noteBullets.length} bullets, recommended max 6`);
    }
  }

  // Two-product smell soft warning (advisory only)
  const goalBullets = (goalSec?.content || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^[-*+]\s+.+/.test(l))
    .map((l) => l.replace(/^[-*+]\s+/, '').trim());
  const twoProductCandidates = [...goalBullets, (meta.distilled || '').trim()].filter(Boolean);
  const smellCandidate = twoProductCandidates.find(
    (t) => /\b(?:and also|but also|as well as)\b/i.test(t) || /\bboth\b[^.]{0,60}\band\b/i.test(t)
  );
  if (smellCandidate) {
    const snippet = smellCandidate.slice(0, 40);
    warnings.push(`two-product smell: "${snippet}…" joins two deliverables — brief one product and park the other in ## Out of scope`);
  }

  const passed = 7 - errors.length;
  const ok = errors.length === 0;

  return {
    ok,
    passed,
    total: 7,
    errors,
    warnings,
    meta: {
      schema: meta.schema ?? '',
      template: (meta.template ?? '').toLowerCase(),
      name: title,
      distilled: (meta.distilled ?? '').trim(),
    },
    sections,
  };
}

// ---------------------------------------------------------------------------
// Doability & Rabbit-Hole Scorer (b2i score)
// ---------------------------------------------------------------------------

export function scoreBrief(content) {
  const emptyCategories = {
    scope: { score: 0, max: 30, outOfScopeBullets: 0 },
    rabbitHoles: { score: 0, max: 40, detected: [], mitigated: [] },
    alignment: { score: 0, max: 30, risksTagged: false, notesLean: false, templateMismatch: null },
  };

  const valid = validateBrief(content);
  if (!valid.ok) {
    return {
      ok: false,
      score: 0,
      grade: 'INVALID',
      notes: valid.errors,
      breakdown: { scope: 0, rabbitHoles: 0, alignment: 0 },
      categories: emptyCategories,
      warnings: valid.warnings,
      tips: ['Fix the 7 check errors first before scoring doability.'],
      meta: valid.meta,
    };
  }

  const { sections, meta } = valid;
  const getSec = (pattern) => {
    const k = Object.keys(sections).find((key) => pattern.test(key));
    return k ? sections[k] : '';
  };
  const outOfScope = getSec(/^Out of scope/i);
  const goal = getSec(/^Goal/i);
  const flows = getSec(/^(Core flows|Public API)/i);

  // 1. Scope Cut Score (30 pts max)
  const oosBullets = outOfScope
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^[-*+]\s+.+/.test(l)).length;
  let scopeScore = 0;
  if (oosBullets >= 2) scopeScore = 30;
  else if (oosBullets === 1) scopeScore = 15;

  // 2. Rabbit-Hole Immunity (40 pts max)
  const activeScope = `${meta.name} ${goal} ${flows}`;
  const detectedRabbitHoles = [];
  const mitigatedRabbitHoles = [];

  // Active scope wins: "Stripe checkout" in Core flows is a live rabbit hole even
  // when "PayPal" is listed in Out of scope (both match the payments pattern).
  for (const rh of RABBIT_HOLES) {
    if (rh.pattern.test(activeScope)) {
      detectedRabbitHoles.push(rh);
    } else if (rh.pattern.test(outOfScope)) {
      mitigatedRabbitHoles.push(rh);
    }
  }

  const penalty = detectedRabbitHoles.length * 15;
  const rabbitHoleScore = Math.max(0, 40 - penalty);

  // 3. Template-Flow Alignment & Risk Awareness (30 pts max)
  let alignmentScore = 15; // base for valid template
  const risksContent = getSec(/^Risks/i);
  const risksTagged = Boolean(risksContent) && /[-*+]\s+(ASSUMPTION:|RISK:)/i.test(risksContent);
  if (risksTagged) alignmentScore += 10;
  const notesContent = getSec(/^Notes$/i);
  const notesBulletCount = notesContent
    ? notesContent.split(/\r?\n/).filter((l) => /^[-*+]\s+.+/.test(l.trim())).length
    : 0;
  const notesLean = !notesContent || notesBulletCount <= 6;
  if (notesLean) alignmentScore += 5;

  // Template mismatch heuristic
  let templateMismatch = null;
  if (meta.template === 'cli' && /\b(browser|html|css|dom|react|component)\b/i.test(flows)) {
    templateMismatch = 'template "cli" describes browser/DOM elements in flows';
    alignmentScore = Math.max(0, alignmentScore - 10);
  } else if (meta.template === 'library') {
    const hasApiSection = Object.keys(sections).some((k) => /^Public API$/i.test(k));
    const hasApiKeywords = /\b(function|export|api|method|class|module)\b/i.test(flows);
    const hasFunctionSignatures = /\w+\s*\([^)]*\)/.test(flows);
    if (!hasApiSection && !hasApiKeywords && !hasFunctionSignatures) {
      templateMismatch = 'template "library" should describe exported functions/API in flows';
      alignmentScore = Math.max(0, alignmentScore - 5);
    }
  }

  const totalScore = Math.min(100, Math.max(0, scopeScore + rabbitHoleScore + alignmentScore));

  let letterGrade = 'F';
  if (totalScore >= 90) letterGrade = 'A';
  else if (totalScore >= 80) letterGrade = 'B';
  else if (totalScore >= 70) letterGrade = 'C';
  else if (totalScore >= 60) letterGrade = 'D';

  let grade = 'HIGH RISK';
  if (totalScore >= 90) grade = 'EXCELLENT';
  else if (totalScore >= 75) grade = 'GOOD';
  else if (totalScore >= 50) grade = 'MODERATE';

  const tips = [];
  for (const drh of detectedRabbitHoles) {
    tips.push(`⚠️ Detected ${drh.label}: ${drh.fix} (-15 pts)`);
  }
  for (const mrh of mitigatedRabbitHoles) {
    tips.push(`✓ Mitigated ${mrh.label}: explicitly marked in Out of scope`);
  }
  if (oosBullets < 2) {
    tips.push('💡 Add ≥2 non-goals to ## Out of scope to strengthen the prototype boundary.');
  }
  if (templateMismatch) {
    tips.push(`💡 Alignment notice: ${templateMismatch}`);
  }
  const twoProductWarn = valid.warnings.find((w) => w.startsWith('two-product smell: '));
  if (twoProductWarn) {
    tips.push(`💡 Two-product smell: ${twoProductWarn.slice('two-product smell: '.length)}`);
  }

  return {
    ok: true,
    score: totalScore,
    grade,
    letterGrade,
    breakdown: {
      scope: scopeScore,
      rabbitHoles: rabbitHoleScore,
      alignment: alignmentScore,
    },
    // Structured per-category detail: same numbers as `breakdown` plus the
    // evidence they were derived from, so agents can act on sub-scores
    // without re-parsing human-readable tips.
    categories: {
      scope: {
        score: scopeScore,
        max: 30,
        outOfScopeBullets: oosBullets,
      },
      rabbitHoles: {
        score: rabbitHoleScore,
        max: 40,
        detected: detectedRabbitHoles.map((rh) => ({ label: rh.label, fix: rh.fix })),
        mitigated: mitigatedRabbitHoles.map((rh) => rh.label),
      },
      alignment: {
        score: alignmentScore,
        max: 30,
        risksTagged,
        notesLean,
        templateMismatch,
      },
    },
    warnings: valid.warnings,
    tips,
    meta: valid.meta,
  };
}

// ---------------------------------------------------------------------------
// Mechanical Auto-Fixer (b2i check --fix)
// ---------------------------------------------------------------------------

/**
 * Repair mechanically broken briefs WITHOUT touching meaning.
 *
 * Fixers (all shape-only, never content-inventing):
 *  - frontmatter schema/template/distilled values that truncate on read-back
 *    (an opening quote with an earlier interior quote, or an unquoted value
 *    cut short by an inline `#`) are re-emitted so they round-trip;
 *  - a missing or empty `schema:` key is healed to the only valid schema;
 *  - trailing whitespace is stripped, trailing blank lines collapsed, and a
 *    single final newline ensured. Line endings (CRLF/LF) are preserved.
 *
 * Returns { content, fixes }: `content` is the repaired text or null when
 * nothing changed; `fixes` lists human-readable notes (uncapped — callers
 * enforce the ≤3 display discipline).
 */
export function fixBrief(content) {
  const fixes = [];
  const hadBom = String(content ?? '').startsWith('\uFEFF');
  if (hadBom) fixes.push('stripped UTF-8 BOM');
  const safe = String(content ?? '').replace(/^\uFEFF/, '');
  const eol = safe.includes('\r\n') ? '\r\n' : '\n';
  let text = safe;

  // Frontmatter after blank lines is read as body text, so nothing parses.
  const leading = text.match(/^(?:[ \t]*\r?\n)+(?=---\r?\n)/);
  if (leading) {
    text = text.slice(leading[0].length);
    fixes.push('frontmatter: removed blank lines before the opening --- (it must start on line 1)');
  }

  const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fmMatch) {
    const meta = parseFrontmatter(text).meta;
    const lines = fmMatch[1].split(/\r?\n/);
    const out = [];
    let touchedSchema = false;

    for (const line of lines) {
      const m = line.match(/^(\s*)(schema|template|distilled)\s*:\s*(.*)$/);
      if (!m) {
        out.push(line);
        continue;
      }
      const [, indent, key, rawRaw] = m;
      const raw = rawRaw.trim();

      if (key === 'schema') {
        touchedSchema = true;
        if (!meta.schema) {
          out.push(`${indent}schema: ${SCHEMA_VERSION}`);
          fixes.push('schema: filled missing/empty schema key (b2i-brief@1)');
        } else {
          out.push(line);
        }
        continue;
      }

      // Detect values that do not survive a parse/read-back round-trip.
      const q = raw[0];
      let inner = raw;
      let lossy = false;
      if (q === '"' || q === "'") {
        inner = raw.endsWith(q) && raw.length > 1 ? raw.slice(1, -1) : raw.slice(1);
        lossy = inner.includes(q);
      } else if (raw.includes('#')) {
        lossy = true; // unquoted `#` is treated as a comment start by the parser
      }

      if (!lossy) {
        out.push(line);
        continue;
      }

      out.push(`${indent}${key}: "${quoteFrontmatterValue(inner)}"`);
      fixes.push(`frontmatter: re-quoted ${key} value so it round-trips (interior quote/#)`);
    }

    if (!meta.schema && !touchedSchema) {
      out.unshift(`schema: ${SCHEMA_VERSION}`);
      fixes.push('schema: injected missing schema key (b2i-brief@1)');
    }

    text = `---${eol}${out.join(eol)}${eol}---${text.slice(fmMatch[0].length)}`;
  }

  // Whitespace pass: rstrip lines, collapse trailing blank lines, final \n.
  const before = text;
  const stripped = text.split(/\r?\n/).map((l) => l.replace(/[ \t]+$/, ''));
  while (stripped.length > 1 && stripped[stripped.length - 1] === '') stripped.pop();
  const fixedText = stripped.join(eol) + eol;
  if (fixedText !== before) {
    const kinds = [];
    if (before.split(/\r?\n/).some((l) => /[ \t]+$/.test(l))) kinds.push('stripped trailing whitespace');
    if (!before.endsWith('\n')) kinds.push('ensured final newline');
    if (before.split(/\r?\n/).slice(-2).join('') === '' ) kinds.push('collapsed trailing blank lines');
    fixes.push(`whitespace: ${kinds.length ? kinds.join(', ') : 'normalized'}`);
  }

  if (fixedText === String(content ?? '')) {
    return { content: null, fixes: [] };
  }
  return { content: fixedText, fixes };
}

// ---------------------------------------------------------------------------
// Commands: check, score, list, handoff
// ---------------------------------------------------------------------------

export function cmdCheck(args) {
  const isJson = args.includes('--json');
  const isFix = args.includes('--fix');
  const briefPath = args.find((a) => !a.startsWith('--')) ?? './brief.md';

  if (isFix && briefPath === '-') {
    const err = 'check --fix requires a file path: stdin cannot be rewritten in place';
    if (isJson) console.log(JSON.stringify({ ok: false, error: err }, null, 2));
    else console.error(`Brainstorm2idea check — FAIL\n  ${err}`);
    return 1;
  }

  let content;

  if (briefPath === '-') {
    try {
      content = readFileSync(0, 'utf8');
    } catch (err) {
      if (isJson) console.log(JSON.stringify({ ok: false, error: `failed to read stdin: ${err.message}` }, null, 2));
      else console.error(`Brainstorm2idea check — FAIL (0/7)\n  failed to read stdin: ${err.message}`);
      return 1;
    }
  } else {
    const resolved = resolve(process.cwd(), briefPath);
    if (!existsSync(resolved)) {
      if (isJson) {
        console.log(JSON.stringify({ ok: false, error: `file not found: ${briefPath}` }, null, 2));
      } else {
        console.error(`Brainstorm2idea check — FAIL (0/7)\n  file not found: ${briefPath}`);
      }
      return 1;
    }
    content = readFileSync(resolved, 'utf8');
  }

  let result = validateBrief(content);
  let appliedFixes = [];

  // Mechanical repair pass: only on a failing brief, only shape-level fixes.
  if (isFix && !result.ok) {
    const fix = fixBrief(content);
    if (fix.content !== null) {
      const resolved = resolve(process.cwd(), briefPath);
      writeFileSync(resolved, fix.content, 'utf8');
      appliedFixes = fix.fixes;
      result = validateBrief(fix.content);
    }
  }

  if (isJson) {
    console.log(JSON.stringify({ ...result, ...(isFix ? { appliedFixes } : {}) }, null, 2));
  } else {
    if (result.ok) {
      console.log(`Brainstorm2idea check — ${c.green('PASS')} (7/7)`);
    } else {
      console.log(`Brainstorm2idea check — ${c.red('FAIL')} (${result.passed}/7)`);
    }
    for (const f of appliedFixes.slice(0, 3)) {
      console.log(`  ${c.cyan('fixed:')} ${f}`);
    }
    if (appliedFixes.length > 3) {
      console.log(`  ${c.dim(`(+${appliedFixes.length - 3} more mechanical fixes applied)`)}`);
    }
    if (!result.ok) {
      for (const err of result.errors.slice(0, 3)) {
        console.log(`  ${c.red(err)}`);
      }
    }
    for (const w of result.warnings) {
      console.log(`  ${c.yellow('note:')} ${w}`);
    }
  }

  return result.ok ? 0 : 1;
}

export function cmdScore(args) {
  const isJson = args.includes('--json');
  const briefPath = args.find((a) => !a.startsWith('--')) ?? './brief.md';
  let content;

  if (briefPath === '-') {
    try {
      content = readFileSync(0, 'utf8');
    } catch (err) {
      if (isJson) console.log(JSON.stringify({ ok: false, error: `failed to read stdin: ${err.message}` }, null, 2));
      else console.error(`Brainstorm2idea score — ${c.red('FAIL')}\n  failed to read stdin: ${err.message}`);
      return 1;
    }
  } else {
    const resolved = resolve(process.cwd(), briefPath);
    if (!existsSync(resolved)) {
      if (isJson) {
        console.log(JSON.stringify({ ok: false, error: `file not found: ${briefPath}` }, null, 2));
      } else {
        console.error(`Brainstorm2idea score — ${c.red('FAIL')}\n  file not found: ${briefPath}`);
      }
      return 1;
    }
    content = readFileSync(resolved, 'utf8');
  }

  const result = scoreBrief(content);

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  } else {
    if (!result.ok) {
      console.error(`Brainstorm2idea score — ${c.red('INVALID')} (0/100)`);
      for (const err of result.notes.slice(0, 3)) console.error(`  ${c.red(err)}`);
      return 1;
    }
    const colorFn = result.score >= 80 ? c.green : (result.score >= 70 ? c.yellow : c.red);
    console.log(`Brainstorm2idea score — ${colorFn(`${result.score}/100`)} (${colorFn(`Grade ${result.letterGrade}`)} - ${colorFn(result.grade)})`);
    console.log(`  breakdown: scope=${result.breakdown.scope}/30, infra=${result.breakdown.rabbitHoles}/40, alignment=${result.breakdown.alignment}/30`);
    for (const tip of result.tips) {
      console.log(`  ${tip}`);
    }
  }
  return 0;
}

export function cmdList(args) {
  const isJson = args.includes('--json');
  const info = {
    tool: 'brainstorm2idea',
    version: VERSION,
    schema: SCHEMA_VERSION,
    templates: VALID_TEMPLATES,
  };

  if (isJson) {
    console.log(JSON.stringify(info, null, 2));
  } else {
    console.log(`${c.bold('brainstorm2idea')} ${c.dim(`v${VERSION}`)}`);
    console.log(`  schema:    ${c.cyan(SCHEMA_VERSION)}`);
    console.log(`  templates: ${c.cyan(VALID_TEMPLATES.join(', '))}`);
  }
  return 0;
}

/** Resolve an --output path; an existing directory means `<dir>/brief.md`. */
export function resolveBriefOutput(outputPath) {
  const resolved = resolve(process.cwd(), outputPath);
  try {
    if (statSync(resolved).isDirectory()) return join(resolved, 'brief.md');
  } catch {
    // does not exist yet: it is the file path itself
  }
  return resolved;
}

/**
 * spark and dump, like init, never clobber an existing brief unless --force.
 * `wx` makes the no-overwrite create atomic, so two concurrent writers can't
 * both pass an existence check. Returns an error message, or null once written.
 */
function writeBriefNoClobber(path, content, force) {
  try {
    writeFileSync(path, content, { encoding: 'utf8', flag: force ? 'w' : 'wx' });
    return null;
  } catch (e) {
    if (e.code === 'EEXIST') return `brief already exists at ${path} (pass --force to overwrite it)`;
    throw e;
  }
}

export function cmdSpark(args) {
  const isJson = args.includes('--json');
  let category = null;
  let seedId = null;
  let outputPath = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--seed' && args[i + 1]) {
      seedId = args[++i];
    } else if (a === '--output' && args[i + 1]) {
      outputPath = args[++i];
    } else if (!a.startsWith('--') && !category) {
      category = a.toLowerCase();
    }
  }

  // 1. Seed Mode: output a complete prototype brief for an archetype
  if (seedId) {
    const spark = SPARK_CATALOG.find((s) => s.id.toLowerCase() === seedId.toLowerCase());
    if (!spark) {
      const err = `spark archetype "${seedId}" not found. Run "b2i spark" to view available sparks.`;
      if (isJson) console.log(JSON.stringify({ ok: false, error: err }, null, 2));
      else console.error(`Brainstorm2idea spark — FAIL\n  ${err}`);
      return 1;
    }

    const briefMd = generateBriefFromSpark(spark);

    if (outputPath) {
      const resolved = resolveBriefOutput(outputPath);
      const exists = writeBriefNoClobber(resolved, briefMd, args.includes('--force'));
      if (exists) {
        if (isJson) console.log(JSON.stringify({ ok: false, error: exists }, null, 2));
        else console.error(`Brainstorm2idea spark — ${c.red('FAIL')}\n  ${exists}`);
        return 1;
      }
      if (isJson) {
        console.log(JSON.stringify({ ok: true, spark, path: resolved, content: briefMd }, null, 2));
      } else {
        console.log(`Brainstorm2idea spark — ${c.green('SEED CREATED')}`);
        console.log(`  id:       ${c.cyan(spark.id)}`);
        console.log(`  template: ${c.cyan(spark.template)}`);
        console.log(`  file:     ${resolved}`);
        console.log(`\nNext step:\n  b2i check ${resolved} && b2i score ${resolved}`);
      }
    } else {
      if (isJson) {
        console.log(JSON.stringify({ ok: true, spark, content: briefMd }, null, 2));
      } else {
        console.log(briefMd);
      }
    }
    return 0;
  }

  // Filter by category if requested
  let filtered = SPARK_CATALOG;
  if (category && category !== 'all' && category !== 'help') {
    filtered = SPARK_CATALOG.filter((s) => s.category.toLowerCase() === category);
    if (filtered.length === 0) {
      const err = `unknown category "${category}". Available: ${SPARK_CATEGORIES.join(', ')}`;
      if (isJson) console.log(JSON.stringify({ ok: false, error: err }, null, 2));
      else {
        console.error(`Brainstorm2idea spark — ${err}`);
        console.log(`Run "b2i spark" to see all available ideation categories.`);
      }
      return 1;
    }
  }

  if (isJson) {
    console.log(JSON.stringify({
      ok: true,
      categories: SPARK_CATEGORIES,
      total: SPARK_CATALOG.length,
      filtered: filtered.length,
      sparks: filtered,
    }, null, 2));
    return 0;
  }

  console.log(`Brainstorm2idea spark — ${c.green(String(filtered.length))} curated prototype archetypes`);
  if (!category || category === 'all') {
    console.log(`Categories: ${c.cyan(SPARK_CATEGORIES.join(', '))}\n`);
  } else {
    console.log(`Category: ${c.cyan(category)}\n`);
  }

  for (const s of filtered) {
    console.log(`  • ${c.bold(s.id.padEnd(20))} [${c.cyan(s.template.padEnd(7))}] ${s.distilled}`);
  }

  console.log(`\nUsage tips:`);
  console.log(`  b2i spark <category>                filter by category (e.g. b2i spark devtools)`);
  console.log(`  b2i spark --seed <id>               print complete b2i-brief@1 markdown`);
  console.log(`  b2i spark --seed <id> --output .    write to ./brief.md`);
  console.log(`  b2i spark --json                    machine-readable catalog for agents & UI`);

  return 0;
}

/**
 * Escape one argument for a `shell: true` spawn on Windows (cmd.exe /d /s /c).
 * Double quotes alone are not enough: cmd still expands %VAR% inside them, and
 * a trailing backslash escapes the closing quote for the child's argv parser.
 * So: replace interior `"` (as quoteFrontmatterValue does), double trailing
 * backslashes, quote, then caret-escape every cmd metacharacter — quotes and
 * % included — so cmd passes the whole argument through literally.
 */
export function quoteCmdArg(arg) {
  const quoted = `"${String(arg).replace(/"/g, "'").replace(/(\\+)$/, '$1$1')}"`;
  return quoted.replace(/([()\][%!^"`<>&|;, *?=])/g, '^$1');
}

/**
 * Escape the command itself (e.g. an --i2p path to a .cmd shim) for the same
 * spawn. cmd resolves the program name after caret processing, so escaping —
 * not quoting — keeps spaces and `&` in the path literal (as cross-spawn does).
 */
export function quoteCmdCommand(command) {
  return String(command).replace(/([()\][%!^"`<>&|;, *?=])/g, '^$1');
}

/**
 * i2p rejects `"`, `\` and control characters in --name/--idea (they land in its
 * JSON manifest), but check accepts them in a title or distilled line. Neutralise
 * them so a brief that passes check also hands off.
 */
export function toI2pArg(value) {
  return String(value).replace(/"/g, "'").replace(/\\/g, '/').replace(/[\u0000-\u001f]+/g, ' ').trim();
}

export function mergeSectionsIntoPrototype(prototypeContent, briefResult) {
  let text = prototypeContent;
  const sections = briefResult.sections;

  // Replace Goal
  const goalKey = Object.keys(sections).find((k) => /^Goal$/i.test(k));
  if (goalKey) {
    const goalRegex = /(##\s+Goal\r?\n)(?:<!--[\s\S]*?-->\r?\n)?(?:[-*][\s\S]*?)?(?=\r?\n## |\r?\n$|$)/i;
    // Function replacers: brief text containing `$&` or `$$` must land verbatim.
    text = text.replace(goalRegex, (_, head) => `${head}${sections[goalKey]}\n`);
  }

  // Replace Core flows (or Public API in library template)
  const flowsKey = Object.keys(sections).find((k) => /^(Core flows|Public API)$/i.test(k));
  if (flowsKey) {
    const flowsRegex = /(##\s+(?:Core flows|Public API)\r?\n)(?:<!--[\s\S]*?-->\r?\n)?(?:\d+\.[\s\S]*?)?(?=\r?\n## |\r?\n$|$)/i;
    text = text.replace(flowsRegex, (_, head) => `${head}${sections[flowsKey]}\n`);
  }

  // Replace Out of scope
  const oosKey = Object.keys(sections).find((k) => /^Out of scope$/i.test(k));
  if (oosKey) {
    const oosRegex = /(##\s+Out of scope\r?\n)(?:<!--[\s\S]*?-->\r?\n)?(?:[-*][\s\S]*?)?(?=\r?\n## |\r?\n$|$)/i;
    text = text.replace(oosRegex, (_, head) => `${head}${sections[oosKey]}\n`);
  }

  // Append Risks & assumptions if present
  const risksKey = Object.keys(sections).find((k) => /^Risks/i.test(k));
  if (risksKey && !/##\s+Risks/i.test(text)) {
    text = text.trimEnd() + `\n\n## Risks & assumptions\n${sections[risksKey]}\n`;
  }

  // Append Notes if present
  const notesKey = Object.keys(sections).find((k) => /^Notes$/i.test(k));
  if (notesKey && !/##\s+Notes/i.test(text)) {
    text = text.trimEnd() + `\n\n## Notes\n${sections[notesKey]}\n`;
  }

  return text.trimEnd() + '\n';
}

/**
 * Resolve the i2p invocation command and arguments (without subcommand).
 * Returns null if B2I_HANDOFF_CMD is set (do not introspect).
 * @param {string|null} i2pOverride
 * @returns {{ cmd: string, cmdArgs: string[] } | null}
 */
export function resolveI2pInvocation(i2pOverride) {
  if (process.env.B2I_HANDOFF_CMD) {
    return null;
  }
  if (i2pOverride) {
    if (i2pOverride.endsWith('.mjs') || i2pOverride.endsWith('.js')) {
      return { cmd: process.execPath, cmdArgs: [resolve(process.cwd(), i2pOverride)] };
    }
    return { cmd: i2pOverride, cmdArgs: [] };
  }
  if (process.platform === 'win32') {
    const npxCli = join(dirname(process.execPath), 'node_modules/npm/bin/npx-cli.js');
    if (existsSync(npxCli)) {
      return { cmd: process.execPath, cmdArgs: [npxCli, '-y', '@ahmed-3m/idea2prototype@latest'] };
    }
  }
  return { cmd: 'npx', cmdArgs: ['-y', '@ahmed-3m/idea2prototype@latest'] };
}

/**
 * Introspect idea2prototype templates from a live i2p invocation.
 * Queries `<invocation> list --json`. Never throws and never prints.
 * @param {{ cmd: string, cmdArgs: string[] } | null} i2pInvocation
 * @returns {{ source: 'live', templates: string[] } | { source: 'pinned', reason: 'offline'|'non-zero'|'invalid-json'|'timeout'|'custom-command', templates: string[] }}
 */
export function introspectI2pTemplates(i2pInvocation) {
  const pinnedTemplates = VALID_TEMPLATES.filter((t) => t !== 'none');

  if (!i2pInvocation || !i2pInvocation.cmd) {
    return { source: 'pinned', reason: 'custom-command', templates: pinnedTemplates };
  }

  try {
    const { cmd, cmdArgs = [] } = i2pInvocation;
    const fullArgs = [...cmdArgs, 'list', '--json'];

    // B2I_INTROSPECT_TIMEOUT_MS: test-only knob for introspection timeout (default: 15000ms)
    const timeoutEnv = process.env.B2I_INTROSPECT_TIMEOUT_MS;
    const timeout = (timeoutEnv !== undefined && Number.isFinite(Number(timeoutEnv)))
      ? Math.max(1, Number(timeoutEnv))
      : 15000;

    const useShell = process.platform === 'win32' && (cmd === 'npx' || /\.(cmd|bat)$/i.test(cmd));
    const spawnOpts = { encoding: 'utf8', timeout };

    const spawnRes = useShell
      ? spawnSync([quoteCmdCommand(cmd), ...fullArgs.map(quoteCmdArg)].join(' '), { ...spawnOpts, shell: true })
      : spawnSync(cmd, fullArgs, spawnOpts);

    // On Windows a spawnSync timeout kills the child without setting
    // error.code ETIMEDOUT — it leaves status null and a signal instead.
    if (spawnRes.error?.code === 'ETIMEDOUT' || (spawnOpts.timeout > 0 && spawnRes.status === null && spawnRes.signal)) {
      return { source: 'pinned', reason: 'timeout', templates: pinnedTemplates };
    }

    const combinedStderr = (spawnRes.stderr || spawnRes.stdout || spawnRes.error?.message || '').trim();
    const isOffline = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ERR_INTERNET_DISCONNECTED|FetchError/i.test(combinedStderr) || spawnRes.error?.code === 'ENOENT';
    if (isOffline) {
      return { source: 'pinned', reason: 'offline', templates: pinnedTemplates };
    }

    if (spawnRes.status !== 0 || spawnRes.error) {
      return { source: 'pinned', reason: 'non-zero', templates: pinnedTemplates };
    }

    let data;
    try {
      data = JSON.parse(spawnRes.stdout);
    } catch {
      return { source: 'pinned', reason: 'invalid-json', templates: pinnedTemplates };
    }

    if (
      data &&
      typeof data === 'object' &&
      data.ok === true &&
      Array.isArray(data.templates) &&
      data.templates.length > 0 &&
      data.templates.every((t) => typeof t === 'string' && t.trim().length > 0)
    ) {
      return { source: 'live', templates: data.templates.map((t) => t.trim()) };
    }

    return { source: 'pinned', reason: 'invalid-json', templates: pinnedTemplates };
  } catch {
    return { source: 'pinned', reason: 'offline', templates: pinnedTemplates };
  }
}

export function cmdHandoff(args) {
  const isJson = args.includes('--json');
  const isDryRun = args.includes('--dry-run');

  // Parse flags
  let dir = null;
  let briefPath = './brief.md';
  let i2pOverride = null;
  let targetMode = 'i2p'; // 'i2p' | 'raw'

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--brief' && args[i + 1]) {
      briefPath = args[++i];
    } else if (a === '--i2p' && args[i + 1]) {
      i2pOverride = args[++i];
    } else if (a === '--target' && args[i + 1]) {
      targetMode = args[++i].toLowerCase();
    } else if (!a.startsWith('--') && !dir) {
      dir = a;
    }
  }

  if (!dir) {
    const err = 'usage: b2i handoff <dir> [--target i2p|raw] [--brief <path>] [--i2p <path>] [--dry-run] [--json] (prefer a fresh, empty directory)';
    if (isJson) console.log(JSON.stringify({ ok: false, error: err }, null, 2));
    else console.error(err);
    return 1;
  }

  if (targetMode !== 'i2p' && targetMode !== 'raw') {
    const err = `unknown --target "${targetMode}" (must be i2p or raw)`;
    if (isJson) console.log(JSON.stringify({ ok: false, error: err }, null, 2));
    else console.error(`Brainstorm2idea handoff — FAIL\n  ${err}`);
    return 1;
  }

  // Security & filesystem guards on target directory
  const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
  const baseDirName = basename(dir);
  if (WINDOWS_RESERVED.test(baseDirName)) {
    const err = `invalid directory name "${dir}": reserved system device name (${baseDirName.toUpperCase()})`;
    if (isJson) console.log(JSON.stringify({ ok: false, error: err }, null, 2));
    else console.error(`Brainstorm2idea handoff — FAIL\n  ${err}`);
    return 1;
  }

  if (/[<>:"|?*]/.test(baseDirName) && baseDirName !== '.') {
    const err = `invalid directory name "${dir}": contains illegal filesystem characters`;
    if (isJson) console.log(JSON.stringify({ ok: false, error: err }, null, 2));
    else console.error(`Brainstorm2idea handoff — FAIL\n  ${err}`);
    return 1;
  }

  const resolvedBrief = resolve(process.cwd(), briefPath);
  if (!existsSync(resolvedBrief)) {
    const msg = `file not found: ${briefPath}`;
    if (isJson) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else console.error(`Brainstorm2idea handoff — FAIL\n  ${msg}`);
    return 1;
  }

  const briefContent = readFileSync(resolvedBrief, 'utf8');

  // Introspection (computed before pre-flight verdict is finalized, but after brief is loaded)
  const pinnedI2pTemplates = VALID_TEMPLATES.filter((t) => t !== 'none');
  let introspection;
  let i2pInvocation = null;
  if (targetMode === 'raw') {
    introspection = { source: 'pinned', reason: 'not-appplied', templates: pinnedI2pTemplates };
  } else {
    i2pInvocation = resolveI2pInvocation(i2pOverride);
    introspection = introspectI2pTemplates(i2pInvocation);
  }

  let briefResult = validateBrief(briefContent);
  let liveTemplateAcceptedNote = null;

  // Two-step template validation:
  // If pinned validation failed, but every error is a template-enum error,
  // introspection is live, and the brief's template is in the live set:
  // re-validate with live templates.
  if (!briefResult.ok && targetMode === 'i2p' && introspection.source === 'live') {
    const isTemplateEnumError = (e) => e.startsWith('template: invalid');
    if (briefResult.errors.length > 0 && briefResult.errors.every(isTemplateEnumError)) {
      if (introspection.templates.includes(briefResult.meta.template)) {
        const liveAllowed = Array.from(new Set([...introspection.templates, 'none']));
        const liveRecheck = validateBrief(briefContent, { templates: liveAllowed });
        if (liveRecheck.ok) {
          briefResult = liveRecheck;
          liveTemplateAcceptedNote = 'template accepted via live i2p introspection — `b2i check` pins the shipped set until b2i is updated';
        }
      }
    }
  }

  // Pre-flight check: must pass 7/7
  if (!briefResult.ok) {
    if (isJson) {
      console.log(JSON.stringify({ ok: false, preflight: briefResult }, null, 2));
    } else {
      console.error(`Brainstorm2idea check — FAIL (${briefResult.passed}/7)`);
      for (const err of briefResult.errors.slice(0, 3)) console.error(`  ${err}`);
      console.error('Handoff aborted: fix brief before scaffolding.');
    }
    return 1;
  }

  // If pinned validation passed, but introspection is live and template is NOT in the live set:
  // fail early with an actionable error naming the live templates (exit 1).
  if (targetMode === 'i2p' && briefResult.meta.template !== 'none') {
    if (introspection.source === 'live' && !introspection.templates.includes(briefResult.meta.template)) {
      const err = `template "${briefResult.meta.template}" is not supported by the live idea2prototype generator (available: ${introspection.templates.join(', ')})`;
      if (isJson) console.log(JSON.stringify({ ok: false, error: err }, null, 2));
      else console.error(`Brainstorm2idea handoff — FAIL\n  ${err}`);
      return 1;
    }
  }

  // Brief-only mode
  if (briefResult.meta.template === 'none') {
    if (isJson) {
      console.log(JSON.stringify({ ok: true, status: 'brief_only', message: 'Brief-only mode (template: none) — handoff skipped.' }, null, 2));
    } else {
      console.log('Brief-only mode (template: none) — handoff skipped.');
    }
    return 0;
  }

  const { name, distilled, template } = briefResult.meta;

  // -------------------------------------------------------------------------
  // TARGET: RAW (Universal standalone handoff for Next.js, Vite, FastAPI, Go, etc.)
  // -------------------------------------------------------------------------
  if (targetMode === 'raw') {
    const targetDir = resolve(process.cwd(), dir);
    const targetPrototype = join(targetDir, 'PROTOTYPE.md');

    // Section headings are matched case-insensitively by `check`, so they must be
    // here too — an exact-key lookup wrote empty sections and then deleted the brief.
    const section = (pattern) => {
      const key = Object.keys(briefResult.sections).find((k) => pattern.test(k));
      return key ? briefResult.sections[key] : '';
    };
    const flowsHeader = `## ${template === 'library' ? 'Public API' : 'Core flows'}\n${section(/^(Core flows|Public API)$/i)}`;

    let content = `# Prototype spec — ${name}\n\n> Idea: ${distilled}\n\n## Goal\n${section(/^Goal$/i)}\n\n${flowsHeader}\n\n## Out of scope\n${section(/^Out of scope$/i)}\n`;

    const risksKey = Object.keys(briefResult.sections).find((k) => /^Risks/i.test(k));
    if (risksKey && briefResult.sections[risksKey]) {
      content += `\n## Risks & assumptions\n${briefResult.sections[risksKey]}\n`;
    }

    const notesKey = Object.keys(briefResult.sections).find((k) => /^Notes$/i.test(k));
    if (notesKey && briefResult.sections[notesKey]) {
      content += `\n## Notes\n${briefResult.sections[notesKey]}\n`;
    }

    if (isDryRun) {
      if (isJson) {
        console.log(JSON.stringify({
          ok: true,
          dryRun: true,
          target: 'raw',
          dir,
          prototypePreview: content,
          introspection: { source: 'pinned', reason: 'not-appplied', templates: pinnedI2pTemplates },
        }, null, 2));
      } else {
        console.log('Brainstorm2idea handoff — DRY RUN (raw target)');
        console.log(`  target dir: ${dir}`);
        console.log(`  templates: pinned fallback (not-appplied)`);
        console.log('\nPreview of PROTOTYPE.md:\n' + '-'.repeat(40) + '\n' + content + '-'.repeat(40));
      }
      return 0;
    }

    if (existsSync(targetPrototype)) {
      const err = `${join(dir, 'PROTOTYPE.md')} already exists — refusing to overwrite it (brief left intact). Remove it or choose another <dir>.`;
      if (isJson) console.log(JSON.stringify({ ok: false, error: err }, null, 2));
      else console.error(`Brainstorm2idea handoff — FAIL\n  ${err}`);
      return 1;
    }
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }
    writeFileSync(targetPrototype, content.trimEnd() + '\n', 'utf8');

    try {
      unlinkSync(resolvedBrief);
    } catch {
      // ignore unlink failure
    }

    if (isJson) {
      console.log(JSON.stringify({
        ok: true,
        status: 'scaffolded',
        target: 'raw',
        dir,
        template,
        name,
        prototype: targetPrototype,
        introspection: { source: 'pinned', reason: 'not-appplied', templates: pinnedI2pTemplates },
      }, null, 2));
    } else {
      console.log('Brainstorm2idea handoff — SUCCESS (raw target)');
      console.log(`  project: ${dir} (${template} template)`);
      console.log(`  spec:    ${join(dir, 'PROTOTYPE.md')} (source brief moved)`);
      console.log(`\nNext steps:`);
      console.log(`  cd ${dir}`);
      console.log(`  Implement flows according to ${join(dir, 'PROTOTYPE.md')}`);
    }
    return 0;
  }

  // -------------------------------------------------------------------------
  // TARGET: I2P (idea2prototype scaffold + merge)
  // -------------------------------------------------------------------------
  let cmd = '';
  let cmdArgs = [];
  const i2pName = toI2pArg(name);
  const i2pIdea = toI2pArg(distilled);

  if (process.env.B2I_HANDOFF_CMD) {
    const parts = process.env.B2I_HANDOFF_CMD.split(' ');
    cmd = parts[0];
    cmdArgs = [...parts.slice(1), dir, '--template', template, '--name', i2pName, '--idea', i2pIdea];
  } else if (i2pInvocation) {
    cmd = i2pInvocation.cmd;
    cmdArgs = [...i2pInvocation.cmdArgs, 'new', dir, '--template', template, '--name', i2pName, '--idea', i2pIdea];
  }

  const introspectionPayload = {
    source: introspection.source,
    templates: introspection.templates,
    ...(introspection.reason ? { reason: introspection.reason } : {}),
  };

  // Dry-run mode for i2p
  if (isDryRun) {
    const flowsHeader = template === 'library' ? '## Public API\n<!-- The 1-3 functions -->\n1.' : '## Core flows\n<!-- The 1-3 user flows -->\n1.';
    const syntheticPrototype = `# Prototype spec — ${i2pName}\n\n> Idea: ${i2pIdea}\n\n## Goal\n<!-- Goal -->\n-\n\n${flowsHeader}\n\n## Modules (optional)\n-\n\n## Out of scope\n-\n`;
    const mergedPreview = mergeSectionsIntoPrototype(syntheticPrototype, briefResult);

    if (isJson) {
      const dryRunJson = {
        ok: true,
        dryRun: true,
        target: 'i2p',
        command: [cmd, ...cmdArgs],
        prototypePreview: mergedPreview,
        introspection: introspectionPayload,
      };
      if (liveTemplateAcceptedNote) {
        dryRunJson.note = liveTemplateAcceptedNote;
      }
      console.log(JSON.stringify(dryRunJson, null, 2));
    } else {
      console.log('Brainstorm2idea handoff — DRY RUN');
      console.log(`  command: ${cmd} ${cmdArgs.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`);
      if (introspection.source === 'live') {
        console.log(`  templates: live (${introspection.templates.join(', ')})`);
      } else {
        console.log(`  templates: pinned fallback (${introspection.reason})`);
      }
      if (liveTemplateAcceptedNote) {
        console.log(`  note:    ${liveTemplateAcceptedNote}`);
      }
      console.log('\nPreview of merged PROTOTYPE.md:\n' + '-'.repeat(40) + '\n' + mergedPreview + '-'.repeat(40));
    }
    return 0;
  }

  // Execute scaffolding via child_process. On Windows, npx (and any --i2p
  // .cmd/.bat) is a batch shim that can only be spawned through cmd.exe; Node
  // then joins args unescaped, so brief text (name, distilled) must be escaped
  // or `&`/`|`/`%VAR%` would be interpreted by cmd.
  const useShell = process.platform === 'win32' && (cmd === 'npx' || /\.(cmd|bat)$/i.test(cmd));
  // One pre-escaped command line: Node 24 deprecates args alongside shell:true (DEP0190).
  const spawnRes = useShell
    ? spawnSync([quoteCmdCommand(cmd), ...cmdArgs.map(quoteCmdArg)].join(' '), { encoding: 'utf8', shell: true })
    : spawnSync(cmd, cmdArgs, { encoding: 'utf8' });

  if (spawnRes.status !== 0) {
    const stderr = (spawnRes.stderr || spawnRes.stdout || '').trim();
    // Check for offline/network failure
    const isOffline = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ERR_INTERNET_DISCONNECTED|FetchError/i.test(stderr) || spawnRes.error?.code === 'ENOENT';
    if (isOffline) {
      const retryCmd = `npx @ahmed-3m/idea2prototype@latest new ${dir} --template ${template} --name "${i2pName}" --idea "${i2pIdea}"`;
      if (isJson) {
        console.log(JSON.stringify({ ok: false, status: 'degraded_offline', retryCommand: retryCmd, error: stderr }, null, 2));
      } else {
        console.warn(`Brainstorm2idea handoff — DEGRADED (network offline)`);
        console.warn(`  Could not reach npm registry to run idea2prototype.`);
        console.warn(`  Your brief remains intact at: ${briefPath}`);
        console.warn(`  Run manually when back online:\n    ${retryCmd}`);
      }
      return 2;
    }

    if (isJson) {
      console.log(JSON.stringify({ ok: false, error: stderr || 'i2p new failed' }, null, 2));
    } else {
      console.error(`Brainstorm2idea handoff — FAIL\n${stderr || 'i2p new failed'}`);
    }
    return 1;
  }

  // Merge sections into <dir>/PROTOTYPE.md
  const targetPrototype = resolve(process.cwd(), dir, 'PROTOTYPE.md');
  if (!existsSync(targetPrototype)) {
    const err = `scaffold succeeded but ${targetPrototype} was not found`;
    if (isJson) console.log(JSON.stringify({ ok: false, error: err }, null, 2));
    else console.error(`Brainstorm2idea handoff — FAIL: ${err}`);
    return 1;
  }

  const existingPrototype = readFileSync(targetPrototype, 'utf8');
  const merged = mergeSectionsIntoPrototype(existingPrototype, briefResult);
  writeFileSync(targetPrototype, merged, 'utf8');

  // Delete source brief only on full success
  try {
    unlinkSync(resolvedBrief);
  } catch {
    // If delete fails, do not fail the handoff
  }

  if (isJson) {
    const successPayload = {
      ok: true,
      status: 'scaffolded',
      target: 'i2p',
      dir,
      template,
      name,
      prototype: targetPrototype,
      introspection: introspectionPayload,
    };
    if (liveTemplateAcceptedNote) {
      successPayload.note = liveTemplateAcceptedNote;
    }
    console.log(JSON.stringify(successPayload, null, 2));
  } else {
    console.log(`Brainstorm2idea handoff — SUCCESS`);
    console.log(`  project: ${dir} (${template} template)`);
    if (liveTemplateAcceptedNote) {
      console.log(`  note:    ${liveTemplateAcceptedNote}`);
    }
    console.log(`  brief:   merged into ${dir}/PROTOTYPE.md (source brief moved)`);
    console.log(`\nNext steps:`);
    console.log(`  cd ${dir}`);
    console.log(`  npm run check`);
    console.log(`  Read ${dir}/AGENTS.md and start building Core Flow 1!`);
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Export Engine: Prompt, GitHub Issues, PRD, JSON (b2i export)
// ---------------------------------------------------------------------------

export function exportBrief(content, options = {}) {
  const format = (options.format || 'prompt').toLowerCase();
  const validFormats = ['prompt', 'issues', 'prd', 'json'];
  if (!validFormats.includes(format)) {
    throw new Error(`unknown export format "${format}". Supported formats: ${validFormats.join(', ')}`);
  }

  const { meta, body } = parseFrontmatter(content);
  const { title, sections } = parseSections(body);

  const valid = validateBrief(content);
  if (!valid.ok) {
    throw new Error(`cannot export invalid brief: ${valid.errors.join('; ')}`);
  }

  const name = title || 'Untitled Prototype';
  const template = meta.template || 'web';
  const distilled = meta.distilled || '';

  const getSectionContent = (pattern) => {
    const key = Object.keys(sections).find((k) => pattern.test(k));
    return key ? sections[key] : '';
  };

  const goals = extractListItems(getSectionContent(/^Goal/i));
  const flows = extractListItems(getSectionContent(/^(Core flows|Public API)/i));
  const outOfScope = extractListItems(getSectionContent(/^Out of scope/i));
  const risks = extractListItems(getSectionContent(/^Risks/i));
  const notes = extractListItems(getSectionContent(/^Notes/i));

  const scoreRes = scoreBrief(content);

  if (format === 'json') {
    return JSON.stringify({
      ok: true,
      schema: meta.schema || SCHEMA_VERSION,
      name,
      template,
      distilled,
      goals,
      flows,
      outOfScope,
      risks,
      notes,
      score: {
        total: scoreRes.score,
        grade: scoreRes.grade,
        letterGrade: scoreRes.letterGrade,
        breakdown: scoreRes.breakdown,
      },
    }, null, 2);
  }

  if (format === 'prompt') {
    let out = `# Agent Kickoff Prompt: ${name}\n\n`;
    out += `You are an expert full-stack developer and prototyping specialist. Your task is to build a minimal, working prototype for **${name}**.\n\n`;
    out += `## Prototype Brief\n`;
    out += `- **Idea**: ${distilled}\n`;
    out += `- **Template Archetype**: \`${template}\`\n\n`;
    out += `## Primary Goals\n`;
    out += goals.map((g) => `- ${g}`).join('\n') + '\n\n';
    out += `## Core User Flows / Implementation Scope\n`;
    out += flows.map((f, i) => `${i + 1}. ${f}`).join('\n') + '\n\n';
    out += `## Strict Non-Goals (Out of Scope — DO NOT IMPLEMENT)\n`;
    out += outOfScope.map((o) => `- ❌ ${o}`).join('\n') + '\n';
    if (risks.length > 0) {
      out += `\n## Key Assumptions & Risks\n`;
      out += risks.map((r) => `- ⚠️ ${r}`).join('\n') + '\n';
    }
    if (notes.length > 0) {
      out += `\n## Development Notes\n`;
      out += notes.map((n) => `- ℹ️ ${n}`).join('\n') + '\n';
    }
    out += `\n## Implementation Instructions for AI Agent\n`;
    out += `1. **Template & Setup**: Use the standard minimal \`${template}\` architecture with zero external runtime dependencies where possible.\n`;
    out += `2. **Iterative Build**: Implement Flow 1 first end-to-end and test it before moving to Flow 2.\n`;
    out += `3. **Hard Scope Discipline**: Under no circumstances build features listed in Non-Goals. Stub any external integrations with mock data.\n`;
    out += `4. **Verification**: Verify that all core flows function with tests or a local runnable demo.\n`;
    return out;
  }

  if (format === 'issues') {
    let out = `# [Prototype] ${name}: ${distilled}\n\n`;
    out += `> **Template**: \`${template}\` | **Spec**: \`${SCHEMA_VERSION}\`\n\n`;
    out += `## Overview\n${distilled}\n\n`;
    out += `## Task Checklist\n\n`;
    out += `### Phase 1: Foundations & Scaffolding\n`;
    out += `- [ ] Initialize repository structure for \`${template}\` template\n`;
    out += `- [ ] Configure local build/run scripts and test runner\n`;
    out += `- [ ] Add basic smoke test ensuring harness runs cleanly\n\n`;
    out += `### Phase 2: Core User Flows\n`;
    out += flows.map((f) => `- [ ] ${f}`).join('\n') + '\n\n';
    out += `### Phase 3: Scope Guard & Hardening\n`;
    out += outOfScope.map((o) => `- [ ] Confirm excluded: ${o}`).join('\n') + '\n';
    out += `- [ ] End-to-end verification of all core flows\n`;
    out += `- [ ] Document quickstart in README\n\n`;
    out += `## Acceptance Criteria\n`;
    out += goals.map((g) => `- [ ] **Goal Met**: ${g}`).join('\n') + '\n';
    out += flows.map((f) => `- [ ] **Flow Verified**: ${f}`).join('\n');
    return out.trimEnd() + '\n';
  }

  if (format === 'prd') {
    let out = `# Product Requirements Document (PRD)\n## Project: ${name}\n\n`;
    out += `| Field | Detail |\n`;
    out += `|---|---|\n`;
    out += `| **Status** | Approved Prototype Spec |\n`;
    out += `| **Template** | \`${template}\` |\n`;
    out += `| **Schema** | \`${SCHEMA_VERSION}\` |\n`;
    out += `| **Doability Score** | ${scoreRes.score}/100 (Grade ${scoreRes.letterGrade}) |\n`;
    out += `| **Summary** | ${distilled} |\n\n`;
    out += `---\n\n`;
    out += `### 1. Executive Summary & Problem\n${distilled}\n\n`;
    out += `### 2. Goals & Success Metrics\n`;
    out += goals.map((g) => `- **Goal**: ${g}`).join('\n') + '\n\n';
    out += `### 3. Non-Goals (Strictly Out of Scope)\n`;
    out += `The following are deliberately excluded from this prototype milestone to maintain velocity:\n`;
    out += outOfScope.map((o) => `- ⛔ **Non-Goal**: ${o}`).join('\n') + '\n\n';
    out += `### 4. Functional Requirements & Flows\n`;
    out += flows.map((f, i) => `${i + 1}. **Flow ${i + 1}**: ${f}`).join('\n') + '\n\n';
    out += `### 5. Technical Architecture (${template.toUpperCase()})\n`;
    out += `- **Template Archetype**: \`${template}\`\n`;
    out += `- **Data & State**: Keep in-memory or single local file (JSON/SQLite). No external database clusters or cloud infrastructure for prototype.\n`;
    out += `- **Dependencies**: Keep runtime dependencies minimal or zero.\n\n`;
    if (risks.length > 0) {
      out += `### 6. Assumptions & Risks\n`;
      out += risks.map((r) => `- ⚠️ ${r}`).join('\n') + '\n\n';
    }
    if (notes.length > 0) {
      out += `### 7. Implementation Notes\n`;
      out += notes.map((n) => `- ℹ️ ${n}`).join('\n') + '\n\n';
    }
    out += `---\n*Generated by [brainstorm2idea](https://github.com/Ahmed-3M/brainstorm2idea) v${VERSION}*\n`;
    return out;
  }

  throw new Error(`unhandled format "${format}"`);
}

export function cmdDump(args) {
  const isJson = args.includes('--json');
  let outputPath = null;
  let inputPath = null;
  let template = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--output' && args[i + 1]) {
      outputPath = args[++i];
    } else if (a === '--template' && args[i + 1]) {
      template = args[++i].toLowerCase();
    } else if (!a.startsWith('--') && !inputPath) {
      inputPath = a;
    }
  }

  if (template && !VALID_TEMPLATES.includes(template)) {
    const err = `invalid template "${template}" (must be one of: ${VALID_TEMPLATES.join(', ')})`;
    if (isJson) console.log(JSON.stringify({ ok: false, error: err }, null, 2));
    else console.error(`Brainstorm2idea dump — ${c.red('FAIL')}\n  ${err}`);
    return 1;
  }

  let content;
  if (!inputPath || inputPath === '-') {
    try {
      content = readFileSync(0, 'utf8');
    } catch (err) {
      const msg = `failed to read stdin: ${err.message}`;
      if (isJson) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
      else console.error(`Brainstorm2idea dump — ${c.red('FAIL')}\n  ${msg}`);
      return 1;
    }
  } else {
    const resolved = resolve(process.cwd(), inputPath);
    if (!existsSync(resolved)) {
      const msg = `file not found: ${inputPath}`;
      if (isJson) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
      else console.error(`Brainstorm2idea dump — ${c.red('FAIL')}\n  ${msg}`);
      return 1;
    }
    content = readFileSync(resolved, 'utf8');
  }

  // De-noise: strip leading conversational filler and meta-commentary.
  // The filler is removed from the FRONT of a line rather than dropping the
  // whole line — otherwise a single-line dump starting with "Um," loses
  // the entire idea.
  const FILLER_PREFIX = /^(?:(?:um|uh|er|like|you know|i mean|so|basically|actually|honestly|literally|hey|hi|hello|well|okay|ok|right|sure|yeah|yep|nope)\b[\s,:-]*)+/i;

  const lines = content.split(/\r?\n/);
  const kept = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      kept.push(''); // preserve blank lines for paragraph structure
      continue;
    }
    const stripped = trimmed.replace(FILLER_PREFIX, '').trim();
    // Only drop the line if stripping left nothing meaningful behind.
    if (stripped.length > 0) kept.push(stripped);
  }

  const denoised = kept.join('\n').trim();

  // Extract a distilled one-liner (first meaningful sentence, capped at 200 chars)
  const firstSentence = denoised
    .split(/[.!?]\s+/)
    .find((s) => s.trim().length > 10)
    ?.trim() || denoised.slice(0, 100);
  const distilled = [...quoteFrontmatterValue(firstSentence)].slice(0, 200).join('');

  const chosenTemplate = template || 'none';
  const flowsHeader = chosenTemplate === 'library' ? '## Public API' : '## Core flows';

  const draft = `---
schema: ${SCHEMA_VERSION}
template: ${chosenTemplate}
distilled: "${distilled}"
---
# Draft Prototype

## Goal
- TODO: Define the primary user problem and solution

${flowsHeader}
1. TODO: Smallest demoable flow (1-3 numbered items)

## Out of scope
- TODO: Non-goals to exclude from prototype

## Risks & assumptions
- ASSUMPTION: Inferred from input dump; needs human confirmation

## Notes
- Source: ${inputPath || 'stdin'}
- De-noised by b2i dump; fill in all TODO sections before running b2i check.
`;

  const output = draft.trimEnd() + '\n';

  if (outputPath) {
    const resolvedOut = resolveBriefOutput(outputPath);
    const exists = writeBriefNoClobber(resolvedOut, output, args.includes('--force'));
    if (exists) {
      if (isJson) console.log(JSON.stringify({ ok: false, error: exists }, null, 2));
      else console.error(`Brainstorm2idea dump — ${c.red('FAIL')}\n  ${exists}`);
      return 1;
    }
    if (isJson) {
      console.log(JSON.stringify({ ok: true, output: resolvedOut }, null, 2));
    } else {
      console.log(`Brainstorm2idea dump — ${c.green('SUCCESS')}`);
      console.log(`  output: ${resolvedOut}`);
    }
  } else {
    process.stdout.write(output.endsWith('\n') ? output : output + '\n');
  }

  return 0;
}

export function cmdInit(args) {
  const isJson = args.includes('--json');
  let outputPath = null;
  let name = null;
  let template = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--output' && args[i + 1]) {
      outputPath = args[++i];
    } else if (a === '--template' && args[i + 1]) {
      template = args[++i].toLowerCase();
    } else if (!a.startsWith('--') && !name) {
      name = a;
    }
  }

  if (!name) {
    const err = 'usage: b2i init <name> [--template web|api|cli|worker|library|none] [--output <path>] [--json]';
    if (isJson) console.log(JSON.stringify({ ok: false, error: err }, null, 2));
    else console.error(`Brainstorm2idea init — ${c.red('FAIL')}\n  ${err}`);
    return 1;
  }

  if (template && !VALID_TEMPLATES.includes(template)) {
    const err = `invalid template "${template}" (must be one of: ${VALID_TEMPLATES.join(', ')})`;
    if (isJson) console.log(JSON.stringify({ ok: false, error: err }, null, 2));
    else console.error(`Brainstorm2idea init — ${c.red('FAIL')}\n  ${err}`);
    return 1;
  }

  const chosenTemplate = template || 'cli';
  const flowsHeader = chosenTemplate === 'library' ? '## Public API' : '## Core flows';
  // The H1 is parsed verbatim, so it keeps the user's quotes; only the
  // frontmatter value needs quote-escaping.
  const heading = sanitizeInlineText(name);
  if (!heading) {
    const err = 'name must contain at least one non-whitespace character';
    if (isJson) console.log(JSON.stringify({ ok: false, error: err }, null, 2));
    else console.error(`Brainstorm2idea init — ${c.red('FAIL')}\n  ${err}`);
    return 1;
  }
  const distilled = [...quoteFrontmatterValue(`${chosenTemplate} prototype for ${heading}`)].slice(0, 200).join('');
  const briefPath = outputPath || resolve(process.cwd(), 'brief.md');

  const briefMd = `---
schema: ${SCHEMA_VERSION}
template: ${chosenTemplate}
distilled: "${distilled}"
---
# ${heading}

## Goal
- TODO: Define the primary user problem this prototype solves

${flowsHeader}
1. TODO: Smallest demoable flow (1-3 numbered items)

## Out of scope
- TODO: Non-goals to exclude from the prototype milestone

## Risks & assumptions
- ASSUMPTION: Inferred from project context; needs human confirmation

## Notes
- Created by \`b2i init\`; fill in all TODO sections before running \`b2i check\`.
`;

  // Self-verify: never write a brief that would fail the tool's own check.
  const selfCheck = validateBrief(briefMd);
  if (!selfCheck.ok) {
    const err = `generated brief is invalid: ${selfCheck.errors.join('; ')}`;
    if (isJson) console.log(JSON.stringify({ ok: false, error: err }, null, 2));
    else console.error(`Brainstorm2idea init — ${c.red('FAIL')}\n  ${err}`);
    return 1;
  }

  const resolvedOut = outputPath ? resolveBriefOutput(outputPath) : briefPath;
  if (existsSync(resolvedOut)) {
    const err = `brief already exists at ${resolvedOut}`;
    if (isJson) console.log(JSON.stringify({ ok: false, error: err }, null, 2));
    else console.error(`Brainstorm2idea init — ${c.red('FAIL')}\n  ${err}\n  Remove it first or use a different --output path.`);
    return 1;
  }

  writeFileSync(resolvedOut, briefMd.trimEnd() + '\n', 'utf8');

  if (isJson) {
    console.log(JSON.stringify({ ok: true, path: resolvedOut, template: chosenTemplate }, null, 2));
  } else {
    console.log(`Brainstorm2idea init — ${c.green('SUCCESS')}`);
    console.log(`  brief:   ${resolvedOut}`);
    console.log(`  template: ${c.cyan(chosenTemplate)}`);
    console.log(`\nNext steps:`);
    console.log(`  1. Edit ${resolvedOut} to fill in the TODO sections`);
    console.log(`  2. b2i check ${resolvedOut}`);
    console.log(`  3. b2i score ${resolvedOut}`);
    console.log(`  4. b2i handoff <dir>`);
  }

  return 0;
}

export function cmdExport(args) {
  const isJson = args.includes('--json');
  let format = isJson ? 'json' : 'prompt';
  let outputPath = null;
  let briefPath = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--format' && args[i + 1]) {
      format = args[++i].toLowerCase();
    } else if (a === '--output' && args[i + 1]) {
      outputPath = args[++i];
    } else if (a === '--json') {
      format = 'json';
    } else if (!a.startsWith('--') && !briefPath) {
      briefPath = a;
    }
  }

  briefPath = briefPath || './brief.md';
  let content;

  if (briefPath === '-') {
    try {
      content = readFileSync(0, 'utf8');
    } catch (err) {
      const msg = `failed to read stdin: ${err.message}`;
      if (isJson || format === 'json') console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
      else console.error(`Brainstorm2idea export — ${c.red('FAIL')}\n  ${msg}`);
      return 1;
    }
  } else {
    const resolved = resolve(process.cwd(), briefPath);
    if (!existsSync(resolved)) {
      const msg = `file not found: ${briefPath}`;
      if (isJson || format === 'json') console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
      else console.error(`Brainstorm2idea export — ${c.red('FAIL')}\n  ${msg}`);
      return 1;
    }
    content = readFileSync(resolved, 'utf8');
  }

  try {
    const rendered = exportBrief(content, { format });
    if (outputPath) {
      const resolvedOut = resolve(process.cwd(), outputPath);
      writeFileSync(resolvedOut, rendered, 'utf8');
      if (isJson) {
        console.log(JSON.stringify({ ok: true, format, output: resolvedOut }, null, 2));
      } else {
        console.log(`Brainstorm2idea export — ${c.green('SUCCESS')}`);
        console.log(`  format: ${c.cyan(format)}`);
        console.log(`  output: ${resolvedOut}`);
      }
    } else {
      if (format === 'json') {
        console.log(rendered);
      } else {
        process.stdout.write(rendered.endsWith('\n') ? rendered : rendered + '\n');
      }
    }
    return 0;
  } catch (err) {
    if (isJson || format === 'json') {
      console.log(JSON.stringify({ ok: false, error: err.message }, null, 2));
    } else {
      console.error(`Brainstorm2idea export — ${c.red('FAIL')}\n  ${err.message}`);
    }
    return 1;
  }
}

// ---------------------------------------------------------------------------
// Main CLI Router
// ---------------------------------------------------------------------------

/**
 * Turn a filesystem error into a one-line, agent-readable note.
 * Node's raw messages ("EISDIR: illegal operation on a directory, read") omit
 * which argument was wrong, and an uncaught one prints a stack trace.
 */
export function describeFsError(err) {
  const where = err?.path ? `: ${err.path}` : '';
  switch (err?.code) {
    case 'EISDIR': return `expected a file but got a directory${where}`;
    case 'ENOENT': return `no such file or directory${where}`;
    case 'ENOTDIR': return `a parent of this path is not a directory${where}`;
    case 'EACCES':
    case 'EPERM': return `permission denied${where}`;
    case 'EROFS': return `read-only file system${where}`;
    default: return err?.message || String(err);
  }
}

export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  try {
    return route(command, rest);
  } catch (err) {
    const msg = describeFsError(err);
    if (rest.includes('--json')) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else console.error(`Brainstorm2idea ${command} — FAIL\n  ${msg}`);
    return 1;
  }
}

function route(command, rest = []) {
  if (command === 'help' && rest[0] && HELP[rest[0]]) {
    console.log(HELP[rest[0]]);
    return 0;
  }
  if (CLI_COMMANDS.includes(command) && (rest.includes('--help') || rest.includes('-h'))) {
    console.log(HELP[command]);
    return 0;
  }

  switch (command) {
    case 'check':
      return cmdCheck(rest);
    case 'score':
      return cmdScore(rest);
    case 'spark':
      return cmdSpark(rest);
    case 'export':
      return cmdExport(rest);
    case 'dump':
      return cmdDump(rest);
    case 'init':
      return cmdInit(rest);
    case 'list':
      return cmdList(rest);
    case 'handoff':
      return cmdHandoff(rest);
    case '--version':
    case '-v':
    case 'version':
      console.log(VERSION);
      return 0;
    case '--help':
    case '-h':
    case 'help':
    case undefined:
      console.log(`brainstorm2idea v${VERSION} — turn fuzzy ideas into linted prototype briefs`);
      console.log(`\nUsage:`);
      console.log(`  b2i check [brief] [--fix] [--json]`);
      console.log(`  b2i score [brief] [--json]`);
      console.log(`  b2i spark [category] [--seed <id>] [--output <path>] [--force] [--json]`);
      console.log(`  b2i export [brief] [--format prompt|issues|prd|json] [--output <path>] [--json]`);
      console.log(`  b2i dump [file|-] [--template web|api|cli|worker|library|none] [--output <path>] [--force] [--json]`);
      console.log(`  b2i init <name> [--template web|api|cli|worker|library|none] [--output <path>] [--json]`);
      console.log(`  b2i handoff <dir> [--target i2p|raw] [--brief <path>] [--i2p <path>] [--dry-run] [--json]`);
      console.log(`  b2i list [--json]`);
      console.log(`  b2i version`);
      return 0;
    default:
      console.error(`unknown command "${command}" — run: b2i help`);
      return 1;
  }
}

// Direct execution (`node .../brainstorm2idea.mjs <cmd>`, the path SKILL.md documents).
// Compare real paths rather than filename suffixes: npm's POSIX bin is a symlink
// named `b2i`, and bin/b2i.mjs calls main() itself.
export function isDirectRun(argv1 = process.argv[1], self = fileURLToPath(import.meta.url)) {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(self);
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  // exitCode (not exit()) so piped stdout is fully flushed before the process ends.
  process.exitCode = main();
}
