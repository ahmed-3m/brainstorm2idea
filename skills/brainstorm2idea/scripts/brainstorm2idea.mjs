#!/usr/bin/env node
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, basename, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseFrontmatter, parseSections, extractListItems } from './parser.mjs';

// Re-export for backward compatibility (tests and external consumers import from engine)
export { parseFrontmatter, parseSections, extractListItems };

export const VERSION = '0.4.1';
export const SCHEMA_VERSION = 'b2i-brief@1';
export const VALID_TEMPLATES = ['web', 'api', 'cli', 'worker', 'library', 'none'];

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

export function validateBrief(content) {
  const errors = [];
  const warnings = [];

  const { meta, body } = parseFrontmatter(content);
  const { title, sections } = parseSections(body);

  // Helper to find section case-insensitively
  function getSection(pattern) {
    const key = Object.keys(sections).find((k) => pattern.test(k));
    return key ? { key, content: sections[key] } : null;
  }

  // 1. schema
  if (!meta.schema) {
    errors.push('schema: missing frontmatter schema (expected b2i-brief@1)');
  } else if (meta.schema !== SCHEMA_VERSION) {
    warnings.push(`schema drift: "${meta.schema}" differs from engine schema "${SCHEMA_VERSION}"`);
  }

  // 2. name (first H1)
  if (!title) {
    errors.push('name: missing H1 title (# Title)');
  }

  // 3. template
  if (!meta.template) {
    errors.push(`template: missing template (must be one of: ${VALID_TEMPLATES.join(', ')})`);
  } else if (!VALID_TEMPLATES.includes(meta.template.toLowerCase())) {
    errors.push(`template: invalid "${meta.template}" (must be one of: ${VALID_TEMPLATES.join(', ')})`);
  }

  // 4. goal (1-3 bullets)
  const goalSec = getSection(/^Goal$/i);
  if (!goalSec) {
    errors.push('goal: missing ## Goal section');
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
  } else {
    const bullets = (outOfScopeSec.content || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^[-*+]\s+.+/.test(l));
    if (bullets.length === 0) {
      errors.push('out-of-scope: at least 1 bullet required');
    }
  }

  // 7. distilled (non-empty, <= 200 chars)
  if (!meta.distilled || meta.distilled.trim().length === 0) {
    errors.push('distilled: missing or empty distilled one-liner in frontmatter');
  } else if (meta.distilled.trim().length > 200) {
    errors.push(`distilled: ${meta.distilled.trim().length} chars, max 200`);
  }

  // Soft Warnings
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
  const valid = validateBrief(content);
  if (!valid.ok) {
    return {
      ok: false,
      score: 0,
      grade: 'INVALID',
      notes: valid.errors,
      breakdown: { scope: 0, rabbitHoles: 0, alignment: 0 },
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

  for (const rh of RABBIT_HOLES) {
    const inOutOfScope = rh.pattern.test(outOfScope);
    const inActiveScope = rh.pattern.test(activeScope);

    if (inOutOfScope) {
      mitigatedRabbitHoles.push(rh);
    } else if (inActiveScope) {
      detectedRabbitHoles.push(rh);
    }
  }

  const penalty = detectedRabbitHoles.length * 15;
  const rabbitHoleScore = Math.max(0, 40 - penalty);

  // 3. Template-Flow Alignment & Risk Awareness (30 pts max)
  let alignmentScore = 15; // base for valid template
  const risksContent = getSec(/^Risks/i);
  if (risksContent) {
    const hasAssumptions = /[-*+]\s+(ASSUMPTION:|RISK:)/i.test(risksContent);
    if (hasAssumptions) alignmentScore += 10;
  }
  const notesContent = getSec(/^Notes$/i);
  if (!notesContent || notesContent.split(/\r?\n/).filter((l) => /^[-*+]\s+.+/.test(l.trim())).length <= 6) {
    alignmentScore += 5;
  }

  // Template mismatch heuristic
  let templateMismatch = null;
  if (meta.template === 'cli' && /\b(browser|html|css|dom|react|component)\b/i.test(flows)) {
    templateMismatch = 'template "cli" describes browser/DOM elements in flows';
    alignmentScore = Math.max(0, alignmentScore - 10);
  } else if (meta.template === 'library') {
    const hasApiSection = Boolean(sections['Public API']);
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
    warnings: valid.warnings,
    tips,
    meta: valid.meta,
  };
}

// ---------------------------------------------------------------------------
// Commands: check, score, list, handoff
// ---------------------------------------------------------------------------

export function cmdCheck(args) {
  const isJson = args.includes('--json');
  const briefPath = args.find((a) => !a.startsWith('--')) ?? './brief.md';
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

  const result = validateBrief(content);

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.ok) {
      console.log(`Brainstorm2idea check — ${c.green('PASS')} (7/7)`);
      for (const w of result.warnings) {
        console.log(`  ${c.yellow('note:')} ${w}`);
      }
    } else {
      console.log(`Brainstorm2idea check — ${c.red('FAIL')} (${result.passed}/7)`);
      for (const err of result.errors.slice(0, 3)) {
        console.log(`  ${c.red(err)}`);
      }
      for (const w of result.warnings) {
        console.log(`  ${c.yellow('note:')} ${w}`);
      }
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

// ---------------------------------------------------------------------------
// Idea Spark & Discovery System (b2i spark)
// ---------------------------------------------------------------------------

export const SPARK_CATEGORIES = [
  'devtools',
  'productivity',
  'local-ai',
  'automation',
  'cli',
  'web',
];

export const SPARK_CATALOG = [
  // --- DEVTOOLS ---
  {
    id: 'env-diff',
    category: 'devtools',
    template: 'cli',
    name: 'env-diff',
    distilled: 'CLI tool comparing .env against .env.example to report missing, extra, or unpopulated variables',
    goals: [
      'Compare local .env against repository .env.example',
      'Report missing or empty required environment keys with non-zero exit code on failure',
    ],
    flows: [
      'Scan current directory for .env and .env.example',
      'Diff keys and values without exposing secret contents',
      'Output formatted color report and summary table',
    ],
    outOfScope: [
      'Remote secret manager integration (AWS Secrets Manager, Vault)',
      'Automatic value generation or encryption',
    ],
    risks: [
      'ASSUMPTION: standard KEY=value syntax without complex multiline bash expansion',
    ],
    notes: [
      'Zero dependencies; ideal as pre-commit or CI check',
    ],
  },
  {
    id: 'git-staleness',
    category: 'devtools',
    template: 'cli',
    name: 'git-staleness',
    distilled: 'Auditor scanning local git repository for stale, merged, or uncommitted branches with terminal summary',
    goals: [
      'List all local git branches with days since last commit',
      'Identify fully merged branches ready for pruning',
    ],
    flows: [
      'Inspect local git refs and commit dates using git CLI',
      'Categorize branches into Active, Stale (>30 days), and Merged',
      'Offer one-command prune summary of merged branches',
    ],
    outOfScope: [
      'Remote repo deletion or GitHub PR manipulation',
      'Automatic uncommitted work stashing',
    ],
    risks: [
      'ASSUMPTION: standard git executable is available on user PATH',
    ],
    notes: [
      'Safe read-only execution by default',
    ],
  },
  {
    id: 'api-stub-mock',
    category: 'devtools',
    template: 'api',
    name: 'api-stub-mock',
    distilled: 'Zero-config local HTTP server returning JSON mocks defined in a single markdown table',
    goals: [
      'Parse routes and mock JSON responses from a local markdown file',
      'Serve requests over local HTTP port with configurable delay',
    ],
    flows: [
      'Start local HTTP server listening on localhost:3000',
      'Match incoming GET/POST paths against markdown route table',
      'Return configured mock JSON body with 200 OK status',
    ],
    outOfScope: [
      'Authentication, OAuth, or rate limiting',
      'Database persistence or dynamic templating engines',
    ],
    risks: [
      'ASSUMPTION: Local developer testing only; no production exposure',
    ],
    notes: [
      'Pure Node.js built-in node:http module',
    ],
  },
  {
    id: 'md-link-checker',
    category: 'devtools',
    template: 'cli',
    name: 'md-link-checker',
    distilled: 'Fast offline markdown validator verifying relative file links and heading anchors in workspace',
    goals: [
      'Parse markdown files for relative file paths and anchor links',
      'Verify target files and headers exist on disk',
    ],
    flows: [
      'Crawl all .md files in the current repository',
      'Validate relative links against local filesystem',
      'Print broken link locations with line numbers and exit 1 on error',
    ],
    outOfScope: [
      'External HTTP/HTTPS link crawling or network requests',
      'Markdown linting beyond link validity',
    ],
    risks: [
      'ASSUMPTION: Markdown conforms to standard CommonMark link syntax',
    ],
    notes: [
      'Fast sub-second scan across large documentation sets',
    ],
  },

  // --- PRODUCTIVITY ---
  {
    id: 'focus-shelf',
    category: 'productivity',
    template: 'cli',
    name: 'focus-shelf',
    distilled: 'Minimalist single-task worklog CLI recording active sessions and writing daily markdown notes',
    goals: [
      'Start a timer for a single named task',
      'Log completed task durations into a daily markdown worklog',
    ],
    flows: [
      'Run focus start <task-name> with optional duration',
      'Display countdown or elapsed time in terminal title or output',
      'Run focus stop to log timestamp, task, and notes to worklog.md',
    ],
    outOfScope: [
      'Cloud sync, user logins, or collaboration',
      'Audio alarms or background daemon services',
    ],
    risks: [
      'ASSUMPTION: Flat-file local storage in current directory or ~/.focus-shelf.json',
    ],
    notes: [
      'Simple, distraction-free tool for solo hackers',
    ],
  },
  {
    id: 'snippet-stash',
    category: 'productivity',
    template: 'cli',
    name: 'snippet-stash',
    distilled: 'Keyboard-searchable code snippet manager storing plain-text snippets in local JSON',
    goals: [
      'Store and tag short code snippets, commands, and prompts',
      'Search snippets by tag or keyword and copy to clipboard',
    ],
    flows: [
      'Save new snippet with title, tag, and multiline content',
      'Search snippets with keyword filtering in terminal',
      'Output chosen snippet to stdout or copy buffer',
    ],
    outOfScope: [
      'Cloud sync, encrypted secret vaults, or multi-user accounts',
      'Syntax highlighting or AST analysis',
    ],
    risks: [
      'ASSUMPTION: Plain-text local JSON storage is sufficient for non-sensitive snippets',
    ],
    notes: [
      'Keyboard-first terminal speed',
    ],
  },
  {
    id: 'meeting-actions',
    category: 'productivity',
    template: 'cli',
    name: 'meeting-actions',
    distilled: 'Transcript de-noiser that extracts categorized action items, owners, and decisions into markdown',
    goals: [
      'Parse unformatted meeting transcript or notes',
      'Extract numbered action items, assigned owners, and key decisions',
    ],
    flows: [
      'Read transcript from file or stdin',
      'Identify action phrases (todo, will do, assign, agreed, decided)',
      'Output structured markdown checklist with Owner and Due tags',
    ],
    outOfScope: [
      'Audio recording or speech-to-text transcription',
      'Jira, Linear, or Trello API syncing',
    ],
    risks: [
      'ASSUMPTION: Text transcript contains natural conversational cues',
    ],
    notes: [
      'Deterministic regex/heuristic parser with zero external AI tokens needed',
    ],
  },
  {
    id: 'habit-strip',
    category: 'productivity',
    template: 'cli',
    name: 'habit-strip',
    distilled: 'Terminal habit tracker rendering horizontal ASCII completion progress streaks for 3 daily goals',
    goals: [
      'Track 1-3 daily habits over a rolling 14-day window',
      'Render visual ASCII streak bar in terminal',
    ],
    flows: [
      'Mark habit complete for today via simple toggle command',
      'Render 14-day ASCII streak chart with success percentages',
      'Persist daily completions in a local JSON state file',
    ],
    outOfScope: [
      'Mobile notifications, calendar syncing, or cloud backends',
      'Unlimited habit tracking (strictly capped at 3 habits for focus)',
    ],
    risks: [
      'ASSUMPTION: Local machine time is accurate for date calculation',
    ],
    notes: [
      'Ultra-compact terminal aesthetic',
    ],
  },

  // --- LOCAL-AI ---
  {
    id: 'prompt-diff',
    category: 'local-ai',
    template: 'cli',
    name: 'prompt-diff',
    distilled: 'Prompt evaluation tool running test inputs against 2 prompt variants and printing side-by-side diffs',
    goals: [
      'Test two prompt templates against a fixture dataset',
      'Compare outputs and highlight differences in terminal',
    ],
    flows: [
      'Load prompt A, prompt B, and inputs array from local file',
      'Execute prompts against local model or mock fixture runner',
      'Display side-by-side terminal diff showing token counts and variances',
    ],
    outOfScope: [
      'Fine-tuning models or training pipelines',
      'Paid third-party analytics dashboards',
    ],
    risks: [
      'ASSUMPTION: Model returns deterministic or temperature=0 responses for diffing',
    ],
    notes: [
      'Essential utility for prompt engineering and agent reliability',
    ],
  },
  {
    id: 'chunk-summarizer',
    category: 'local-ai',
    template: 'library',
    name: 'chunk-summarizer',
    distilled: 'Token-budgeted text chunker and outline builder for large markdown documents',
    goals: [
      'Split large markdown documents into semantic chunks preserving heading boundaries',
      'Generate hierarchical table-of-contents outline with token counts per section',
    ],
    flows: [
      'parseOutline(markdown: string): DocumentOutline',
      'chunkByBudget(markdown: string, maxTokens: number): MarkdownChunk[]',
    ],
    outOfScope: [
      'Direct LLM API calls or vector embeddings',
      'PDF/DOCX binary document parsing',
    ],
    risks: [
      'ASSUMPTION: Rough 4 characters per token estimate suffices for chunking boundaries',
    ],
    notes: [
      'Zero dependencies; standard Node.js library for agent context management',
    ],
  },
  {
    id: 'commit-drafter',
    category: 'local-ai',
    template: 'cli',
    name: 'commit-drafter',
    distilled: 'Tool that inspects staged git diffs and drafts a Conventional Commit message proposal',
    goals: [
      'Analyze staged git changes and file paths',
      'Draft concise type(scope): description commit message conforming to Conventional Commits',
    ],
    flows: [
      'Run git diff --cached to extract changed files and diff chunks',
      'Identify primary modification category (feat, fix, refactor, docs, test)',
      'Print formatted commit message with option to commit directly',
    ],
    outOfScope: [
      'Pushing to remote remotes or PR creation',
      'Interactive git rebase or history modification',
    ],
    risks: [
      'ASSUMPTION: Staged git diff is non-empty',
    ],
    notes: [
      'Rules-based heuristics with optional local LLM hook',
    ],
  },
  {
    id: 'agent-eval-harness',
    category: 'local-ai',
    template: 'library',
    name: 'agent-eval-harness',
    distilled: 'Lightweight assertion runner testing that AI agent outputs satisfy regex, schema, and length rules',
    goals: [
      'Validate agent response payloads against structured assertions',
      'Produce compact pass/fail scorecards with actionable violation notes',
    ],
    flows: [
      'defineContract(rules: ContractRule[]): ContractEvaluator',
      'evaluateOutput(output: string, contract: ContractEvaluator): EvalReport',
    ],
    outOfScope: [
      'Complex statistical LLM-as-a-judge model pipelines',
      'Distributed test cluster execution',
    ],
    risks: [
      'ASSUMPTION: Deterministic regex and structural JSON/markdown rules',
    ],
    notes: [
      'High-speed CI validator for coding agents',
    ],
  },

  // --- AUTOMATION ---
  {
    id: 'clean-downloads',
    category: 'automation',
    template: 'cli',
    name: 'clean-downloads',
    distilled: 'Rule-based desktop download directory cleaner organizing files by extension into dated folders',
    goals: [
      'Scan target directory for loose files older than N days',
      'Safely organize files into categorized subfolders (Images, Docs, Archives, Installers)',
    ],
    flows: [
      'Inspect target directory and classify files by file extension',
      'Print dry-run preview of planned file moves',
      'Execute moves with safety checks preventing destination overwrites',
    ],
    outOfScope: [
      'Permanent file deletion or unrecoverable shredding',
      'Cloud storage synchronization',
    ],
    risks: [
      'ASSUMPTION: User has write permissions on target folder',
    ],
    notes: [
      'Always runs in dry-run mode unless --force flag is passed',
    ],
  },
  {
    id: 'webhook-logger',
    category: 'automation',
    template: 'api',
    name: 'webhook-logger',
    distilled: 'Local HTTP webhook sink that logs incoming payloads to a file with terminal inspection and replay',
    goals: [
      'Accept arbitrary HTTP POST/PUT webhook payloads on configurable port',
      'Log headers, timestamp, and body to a local JSON Lines file',
    ],
    flows: [
      'Listen on localhost:4000/webhook and respond with 200 OK',
      'Append formatted request payload to ./webhooks.jsonl',
      'Provide CLI log command to inspect latest 10 received payloads',
    ],
    outOfScope: [
      'Public internet tunneling (ngrok/cloudflared integration)',
      'Complex authentication or HMAC verification',
    ],
    risks: [
      'ASSUMPTION: Payloads are JSON or plain text',
    ],
    notes: [
      'Invaluable for debugging third-party webhook integrations locally',
    ],
  },
  {
    id: 'rss-digest',
    category: 'automation',
    template: 'worker',
    name: 'rss-digest',
    distilled: 'Feed aggregator fetching 3 configured tech RSS feeds and compiling a single morning markdown digest',
    goals: [
      'Fetch and parse RSS/Atom XML feeds from configured URLs',
      'Filter posts published within the last 24 hours into a markdown digest',
    ],
    flows: [
      'Fetch feed XML using native fetch() with timeout',
      'Parse item titles, links, and publication dates with regex',
      'Write aggregated, deduplicated markdown file to ./daily-digest.md',
    ],
    outOfScope: [
      'Full-text web scraping of linked articles',
      'Email or Slack webhook dispatching',
    ],
    risks: [
      'ASSUMPTION: RSS feeds expose standard XML <item> or <entry> tags',
    ],
    notes: [
      'Zero external dependencies; built-in fetch and regex XML parsing',
    ],
  },
  {
    id: 'asset-optimizer',
    category: 'automation',
    template: 'worker',
    name: 'asset-optimizer',
    distilled: 'Directory watcher monitoring assets folder and validating image dimensions and file sizes',
    goals: [
      'Watch assets directory for newly added PNG and SVG files',
      'Report oversized assets exceeding configured byte or dimension limits',
    ],
    flows: [
      'Watch target folder using node:fs watch',
      'Parse PNG/SVG header chunks to extract image width and height',
      'Log warning if image exceeds max size or dimensions',
    ],
    outOfScope: [
      'Heavy native C++ image compression libraries (sharp, imagemagick)',
      'Lossy destructive image transcoding',
    ],
    risks: [
      'ASSUMPTION: Standard PNG IHDR and SVG viewBox header structures',
    ],
    notes: [
      'Lightweight pure Node image metadata inspector',
    ],
  },

  // --- CLI ---
  {
    id: 'port-scout',
    category: 'cli',
    template: 'cli',
    name: 'port-scout',
    distilled: 'Interactive terminal port inspector showing process names and PIDs listening on local ports',
    goals: [
      'Scan active TCP listening ports on localhost',
      'Display process name, PID, and port in a clean terminal table',
    ],
    flows: [
      'Execute system netstat or lsof to inspect active listening ports',
      'Parse output into structured array of port mappings',
      'Print table and offer kill command by port number',
    ],
    outOfScope: [
      'Remote network scanning or port exploitation',
      'Background daemon monitoring',
    ],
    risks: [
      'ASSUMPTION: Operating system netstat or lsof command is accessible',
    ],
    notes: [
      'Cross-platform: uses netstat on Windows, lsof on macOS/Linux',
    ],
  },
  {
    id: 'json-slice',
    category: 'cli',
    template: 'cli',
    name: 'json-slice',
    distilled: 'Command-line JSON extractor for pulling nested keys and arrays with dot-path notation without jq complexity',
    goals: [
      'Query JSON input from file or stdin using simple dot paths (user.profile.email)',
      'Format and colorize matching values',
    ],
    flows: [
      'Read JSON string from file argument or standard input',
      'Resolve path expression (e.g. data.items[0].id)',
      'Output formatted value with exit code 0 or 1 if path not found',
    ],
    outOfScope: [
      'Complex jq query language features or mutations',
      'Schema generation or validation',
    ],
    risks: [
      'ASSUMPTION: Valid JSON input format',
    ],
    notes: [
      'Zero dependencies; ultra-fast startup time (<30ms)',
    ],
  },
  {
    id: 'file-tally',
    category: 'cli',
    template: 'cli',
    name: 'file-tally',
    distilled: 'Fast repository code counter reporting lines of code, language breakdown, and largest files',
    goals: [
      'Recursively crawl directory ignoring gitignored paths',
      'Compute total lines, blank lines, and comment lines per file extension',
    ],
    flows: [
      'Traverse workspace directory excluding node_modules and .git',
      'Count file lines and categorize by extension (.js, .ts, .py, .md)',
      'Print formatted ASCII breakdown table with summary totals',
    ],
    outOfScope: [
      'Cyclomatic complexity or AST code analysis',
      'Git blame or historical author tracking',
    ],
    risks: [
      'ASSUMPTION: Workspace contains text files readable as UTF-8',
    ],
    notes: [
      'Pure Node.js file system crawl',
    ],
  },
  {
    id: 'scratch-pad',
    category: 'cli',
    template: 'cli',
    name: 'scratch-pad',
    distilled: 'Instant CLI scratch file creator opening a temporary date-stamped markdown buffer',
    goals: [
      'Generate a temporary date-stamped scratch markdown file in ~/.scratch',
      'Open the file in user default $EDITOR or print its file path',
    ],
    flows: [
      'Create ~/.scratch directory if not present',
      'Generate file named YYYY-MM-DD-slug.md with initial template header',
      'Output path or spawn $EDITOR for immediate notes capture',
    ],
    outOfScope: [
      'Cloud syncing, backup, or encryption',
      'Full-text search indexing',
    ],
    risks: [
      'ASSUMPTION: User home directory is writable',
    ],
    notes: [
      'Dead simple friction-free note taking',
    ],
  },

  // --- WEB ---
  {
    id: 'health-board',
    category: 'web',
    template: 'web',
    name: 'health-board',
    distilled: 'Single-page responsive status dashboard polling local HTTP endpoints and displaying live health badges',
    goals: [
      'Poll list of configured local or remote URLs at set intervals',
      'Display responsive grid of service cards with response latency and status badge',
    ],
    flows: [
      'Load monitored endpoint URLs from local JSON config',
      'Poll endpoints periodically and record HTTP status code and response time',
      'Render live status cards with green/red status indicators',
    ],
    outOfScope: [
      'SMS or pager alerts (PagerDuty, Twilio)',
      'Historical uptime percentage graphs over months',
      'User login and access control',
    ],
    risks: [
      'ASSUMPTION: Monitored endpoints allow CORS or are served from same origin',
    ],
    notes: [
      'Static vanilla JS + HTML frontend; runs with any local static server',
    ],
  },
  {
    id: 'recipe-shelf',
    category: 'web',
    template: 'web',
    name: 'recipe-shelf',
    distilled: 'Offline-first recipe box storing ingredients, tags, and instructions in browser storage with instant search',
    goals: [
      'Store recipes with title, ingredients, tags, and prep steps in browser storage',
      'Search and filter recipes offline by tag or ingredient keyword',
    ],
    flows: [
      'Add recipe through clean modal form with tag chips',
      'Filter recipe cards instantaneously via search input',
      'Click card to view formatted recipe with ingredient multiplier buttons',
    ],
    outOfScope: [
      'Cloud sync, user authentication, or social sharing',
      'Online grocery store ordering integrations',
    ],
    risks: [
      'ASSUMPTION: Browser localStorage or IndexedDB is available',
    ],
    notes: [
      'Single HTML/JS file with zero external CSS/JS framework dependencies',
    ],
  },
  {
    id: 'decision-matrix',
    category: 'web',
    template: 'web',
    name: 'decision-matrix',
    distilled: 'Interactive weighted decision matrix calculator comparing options across custom criteria',
    goals: [
      'Create custom comparison criteria with 1-5 weighting multipliers',
      'Score candidate options and view ranked winner scores in real time',
    ],
    flows: [
      'Input criteria with weight sliders (e.g. Cost: 5, Speed: 3, Ease: 4)',
      'Add candidate options and assign scores 1-10 per criterion',
      'Compute weighted totals and render live ranked scoreboard',
    ],
    outOfScope: [
      'Collaborative real-time voting rooms',
      'PDF report exports or charts',
    ],
    risks: [
      'ASSUMPTION: Session state kept in memory or localStorage',
    ],
    notes: [
      'Clean interactive prototype for team or solo decision-making',
    ],
  },
  {
    id: 'markdown-canvas',
    category: 'web',
    template: 'web',
    name: 'markdown-canvas',
    distilled: 'Split-pane local markdown documentation viewer with instant TOC navigation and code copy buttons',
    goals: [
      'Render markdown documents with clean typography and heading anchors',
      'Generate dynamic sidebar table of contents for rapid document navigation',
    ],
    flows: [
      'Paste or load markdown document into left editor pane',
      'Render live HTML preview with syntax-styled code blocks in right pane',
      'Click TOC items to smooth-scroll preview pane to matching heading',
    ],
    outOfScope: [
      'WYSIWYG rich text editing or block transforms',
      'Remote document cloud sharing',
    ],
    risks: [
      'ASSUMPTION: Built-in minimal markdown-to-HTML parser is sufficient for standard specs',
    ],
    notes: [
      'Lightweight local documentation reader',
    ],
  },
];

export function generateBriefFromSpark(spark) {
  const flowsHeader = spark.template === 'library' ? '## Public API' : '## Core flows';
  const goalsText = spark.goals.map((g) => `- ${g}`).join('\n');
  const flowsText = spark.flows.map((f, i) => `${i + 1}. ${f}`).join('\n');
  const oosText = spark.outOfScope.map((o) => `- ${o}`).join('\n');
  const risksText = (spark.risks || []).map((r) => `- ${r}`).join('\n');
  const notesText = (spark.notes || []).map((n) => `- ${n}`).join('\n');

  let md = `---
schema: ${SCHEMA_VERSION}
template: ${spark.template}
distilled: "${spark.distilled}"
---
# ${spark.name}

## Goal
${goalsText}

${flowsHeader}
${flowsText}

## Out of scope
${oosText}
`;

  if (risksText) {
    md += `\n## Risks & assumptions\n${risksText}\n`;
  }
  if (notesText) {
    md += `\n## Notes\n${notesText}\n`;
  }

  return md.trimEnd() + '\n';
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
      const resolved = resolve(process.cwd(), outputPath);
      writeFileSync(resolved, briefMd, 'utf8');
      if (isJson) {
        console.log(JSON.stringify({ ok: true, spark, path: resolved, content: briefMd }, null, 2));
      } else {
        console.log(`Brainstorm2idea spark — ${c.green('SEED CREATED')}`);
        console.log(`  id:       ${c.cyan(spark.id)}`);
        console.log(`  template: ${c.cyan(spark.template)}`);
        console.log(`  file:     ${resolved}`);
        console.log(`\nNext step:\n  b2i check ${outputPath} && b2i score ${outputPath}`);
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

export function mergeSectionsIntoPrototype(prototypeContent, briefResult) {
  let text = prototypeContent;
  const sections = briefResult.sections;

  // Replace Goal
  const goalKey = Object.keys(sections).find((k) => /^Goal$/i.test(k));
  if (goalKey) {
    const goalRegex = /(##\s+Goal\r?\n)(?:<!--[\s\S]*?-->\r?\n)?(?:[-*][\s\S]*?)?(?=\r?\n## |\r?\n$|$)/i;
    text = text.replace(goalRegex, `$1${sections[goalKey]}\n`);
  }

  // Replace Core flows (or Public API in library template)
  const flowsKey = Object.keys(sections).find((k) => /^(Core flows|Public API)$/i.test(k));
  if (flowsKey) {
    const flowsRegex = /(##\s+(?:Core flows|Public API)\r?\n)(?:<!--[\s\S]*?-->\r?\n)?(?:\d+\.[\s\S]*?)?(?=\r?\n## |\r?\n$|$)/i;
    text = text.replace(flowsRegex, `$1${sections[flowsKey]}\n`);
  }

  // Replace Out of scope
  const oosKey = Object.keys(sections).find((k) => /^Out of scope$/i.test(k));
  if (oosKey) {
    const oosRegex = /(##\s+Out of scope\r?\n)(?:<!--[\s\S]*?-->\r?\n)?(?:[-*][\s\S]*?)?(?=\r?\n## |\r?\n$|$)/i;
    text = text.replace(oosRegex, `$1${sections[oosKey]}\n`);
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
    const err = 'usage: b2i handoff <dir> [--target i2p|raw] [--brief <path>] [--i2p <path>] [--dry-run] [--json]';
    if (isJson) console.log(JSON.stringify({ ok: false, error: err }, null, 2));
    else console.error(err);
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
  const briefResult = validateBrief(briefContent);

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

    const flowsHeader = template === 'library'
      ? `## Public API\n${briefResult.sections['Public API'] || briefResult.sections['Core flows'] || ''}`
      : `## Core flows\n${briefResult.sections['Core flows'] || ''}`;

    let content = `# Prototype spec — ${name}\n\n> Idea: ${distilled}\n\n## Goal\n${briefResult.sections['Goal'] || ''}\n\n${flowsHeader}\n\n## Out of scope\n${briefResult.sections['Out of scope'] || ''}\n`;

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
        console.log(JSON.stringify({ ok: true, dryRun: true, target: 'raw', dir, prototypePreview: content }, null, 2));
      } else {
        console.log('Brainstorm2idea handoff — DRY RUN (raw target)');
        console.log(`  target dir: ${dir}`);
        console.log('\nPreview of PROTOTYPE.md:\n' + '-'.repeat(40) + '\n' + content + '-'.repeat(40));
      }
      return 0;
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
      console.log(JSON.stringify({ ok: true, status: 'scaffolded', target: 'raw', dir, template, name, prototype: targetPrototype }, null, 2));
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

  if (i2pOverride) {
    if (i2pOverride.endsWith('.mjs') || i2pOverride.endsWith('.js')) {
      cmd = process.execPath;
      cmdArgs = [resolve(process.cwd(), i2pOverride), 'new', dir, '--template', template, '--name', name, '--idea', distilled];
    } else {
      cmd = i2pOverride;
      cmdArgs = ['new', dir, '--template', template, '--name', name, '--idea', distilled];
    }
  } else if (process.env.B2I_HANDOFF_CMD) {
    const parts = process.env.B2I_HANDOFF_CMD.split(' ');
    cmd = parts[0];
    cmdArgs = [...parts.slice(1), dir, '--template', template, '--name', name, '--idea', distilled];
  } else {
    // Default: npx -y @ahmed-3m/idea2prototype@latest new ...
    if (process.platform === 'win32') {
      const npxCli = join(dirname(process.execPath), 'node_modules/npm/bin/npx-cli.js');
      if (existsSync(npxCli)) {
        cmd = process.execPath;
        cmdArgs = [npxCli, '-y', '@ahmed-3m/idea2prototype@latest', 'new', dir, '--template', template, '--name', name, '--idea', distilled];
      } else {
        cmd = 'npx';
        cmdArgs = ['-y', '@ahmed-3m/idea2prototype@latest', 'new', dir, '--template', template, '--name', name, '--idea', distilled];
      }
    } else {
      cmd = 'npx';
      cmdArgs = ['-y', '@ahmed-3m/idea2prototype@latest', 'new', dir, '--template', template, '--name', name, '--idea', distilled];
    }
  }

  // Dry-run mode for i2p
  if (isDryRun) {
    const flowsHeader = template === 'library' ? '## Public API\n<!-- The 1-3 functions -->\n1.' : '## Core flows\n<!-- The 1-3 user flows -->\n1.';
    const syntheticPrototype = `# Prototype spec — ${name}\n\n> Idea: ${distilled}\n\n## Goal\n<!-- Goal -->\n-\n\n${flowsHeader}\n\n## Modules (optional)\n-\n\n## Out of scope\n-\n`;
    const mergedPreview = mergeSectionsIntoPrototype(syntheticPrototype, briefResult);

    if (isJson) {
      console.log(JSON.stringify({ ok: true, dryRun: true, target: 'i2p', command: [cmd, ...cmdArgs], prototypePreview: mergedPreview }, null, 2));
    } else {
      console.log('Brainstorm2idea handoff — DRY RUN');
      console.log(`  command: ${cmd} ${cmdArgs.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`);
      console.log('\nPreview of merged PROTOTYPE.md:\n' + '-'.repeat(40) + '\n' + mergedPreview + '-'.repeat(40));
    }
    return 0;
  }

  // Execute scaffolding via child_process
  const useShell = cmd === 'npx' && process.platform === 'win32';
  const spawnRes = spawnSync(cmd, cmdArgs, { encoding: 'utf8', shell: useShell });

  if (spawnRes.status !== 0) {
    const stderr = (spawnRes.stderr || spawnRes.stdout || '').trim();
    // Check for offline/network failure
    const isOffline = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ERR_INTERNET_DISCONNECTED|FetchError/i.test(stderr) || spawnRes.error?.code === 'ENOENT';
    if (isOffline) {
      const retryCmd = `npx @ahmed-3m/idea2prototype@latest new ${dir} --template ${template} --name "${name}" --idea "${distilled}"`;
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
    console.log(JSON.stringify({ ok: true, status: 'scaffolded', target: 'i2p', dir, template, name, prototype: targetPrototype }, null, 2));
  } else {
    console.log(`Brainstorm2idea handoff — SUCCESS`);
    console.log(`  project: ${dir} (${template} template)`);
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

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--output' && args[i + 1]) {
      outputPath = args[++i];
    } else if (!a.startsWith('--') && !inputPath) {
      inputPath = a;
    }
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

  // De-noise: strip common conversational filler and meta-commentary
  const fillerPatterns = [
    /^(um|uh|like|you know|i mean|so|basically|actually|honestly|literally)\b/i,
    /^(hey|hi|hello|so i was thinking|you know how|well)\b/i,
    /^(okay|ok|right|sure|yeah|yep|nope)\b/i,
  ];

  const lines = content.split(/\r?\n/);
  const kept = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true; // keep blank lines for paragraph structure
    return !fillerPatterns.some((p) => p.test(trimmed));
  });

  const denoised = kept.join('\n').trim();

  // Extract a distilled one-liner (first meaningful sentence, capped at 200 chars)
  const firstSentence = denoised
    .split(/[.!?]\s+/)
    .find((s) => s.trim().length > 10)
    ?.trim() || denoised.slice(0, 100);
  const distilled = firstSentence.slice(0, 200);

  const draft = `---
schema: ${SCHEMA_VERSION}
template: none
distilled: "${distilled}"
---
# Draft Prototype

## Goal
- TODO: Define the primary user problem and solution

## Core flows
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
    const resolvedOut = resolve(process.cwd(), outputPath);
    writeFileSync(resolvedOut, output, 'utf8');
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

export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;

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
      console.log(`  b2i check [brief] [--json]`);
      console.log(`  b2i score [brief] [--json]`);
      console.log(`  b2i spark [category] [--seed <id>] [--output <path>] [--json]`);
      console.log(`  b2i export [brief] [--format prompt|issues|prd|json] [--output <path>] [--json]`);
      console.log(`  b2i dump [file|-] [--output <path>] [--json]`);
      console.log(`  b2i handoff <dir> [--target i2p|raw] [--brief <path>] [--i2p <path>] [--dry-run] [--json]`);
      console.log(`  b2i list [--json]`);
      console.log(`  b2i version`);
      return 0;
    default:
      console.error(`unknown command "${command}" — run: b2i help`);
      return 1;
  }
}

// Direct execution
if (process.argv[1] && (process.argv[1].endsWith('brainstorm2idea.mjs') || process.argv[1].endsWith('b2i.mjs'))) {
  const code = main();
  if (code !== 0) process.exit(code);
}
