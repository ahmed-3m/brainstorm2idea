#!/usr/bin/env node
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, join, basename, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

export const VERSION = '0.1.0';
export const SCHEMA_VERSION = 'b2i-brief@1';
export const VALID_TEMPLATES = ['web', 'api', 'cli', 'worker', 'library', 'none'];

// ---------------------------------------------------------------------------
// Helpers & Frontmatter Parser
// ---------------------------------------------------------------------------

export function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { meta: {}, body: content };

  const rawMeta = match[1];
  const body = content.slice(match[0].length);
  const meta = {};

  const lines = rawMeta.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let val = trimmed.slice(colonIdx + 1).trim();

    // Strip inline comments only when outside quotes
    if (val.startsWith('"') || val.startsWith("'")) {
      const quoteChar = val[0];
      const endQuoteIdx = val.indexOf(quoteChar, 1);
      if (endQuoteIdx !== -1) {
        val = val.slice(1, endQuoteIdx);
      } else {
        val = val.slice(1);
      }
    } else {
      const commentIdx = val.indexOf('#');
      if (commentIdx !== -1) {
        val = val.slice(0, commentIdx).trim();
      }
    }

    meta[key] = val;
  }

  return { meta, body };
}

export function parseSections(body) {
  const lines = body.split(/\r?\n/);
  let title = '';
  const sections = {};
  let currentSection = null;
  let currentContent = [];

  for (const line of lines) {
    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match && !title) {
      title = h1Match[1].trim();
      continue;
    }

    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
      currentSection = h2Match[1].trim();
      currentContent = [];
      continue;
    }

    if (currentSection) {
      currentContent.push(line);
    }
  }

  if (currentSection) {
    sections[currentSection] = currentContent.join('\n').trim();
  }

  return { title, sections };
}

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
      .filter((l) => /^[-*]\s+.+/.test(l));
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
      .filter((l) => /^\d+\.\s+.+/.test(l));
    if (numbered.length === 0) {
      errors.push('flows: 0 numbered flows found (expected 1-3 numbered items, e.g. "1. ...")');
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
      .filter((l) => /^[-*]\s+.+/.test(l));
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
      .filter((l) => /^[-*]\s+/.test(l));
    for (const l of lines) {
      if (!/^[-*]\s+(RISK:|ASSUMPTION:)/i.test(l)) {
        warnings.push(`risks & assumptions: bullet "${l.slice(0, 40)}..." should prefix with RISK: or ASSUMPTION:`);
        break; // one warning is enough
      }
    }
  }

  const notesSec = getSection(/^Notes$/i);
  if (notesSec && notesSec.content) {
    const noteBullets = notesSec.content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^[-*]\s+.+/.test(l));
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
// Commands: check, list, handoff
// ---------------------------------------------------------------------------

export function cmdCheck(args) {
  const isJson = args.includes('--json');
  const briefPath = args.find((a) => !a.startsWith('--')) ?? './brief.md';
  const resolved = resolve(process.cwd(), briefPath);

  if (!existsSync(resolved)) {
    if (isJson) {
      console.log(JSON.stringify({ ok: false, error: `file not found: ${briefPath}` }, null, 2));
    } else {
      console.error(`Brainstorm2idea check — FAIL (0/7)\n  file not found: ${briefPath}`);
    }
    return 1;
  }

  const content = readFileSync(resolved, 'utf8');
  const result = validateBrief(content);

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.ok) {
      console.log(`Brainstorm2idea check — PASS (7/7)`);
      for (const w of result.warnings) {
        console.log(`  note: ${w}`);
      }
    } else {
      console.log(`Brainstorm2idea check — FAIL (${result.passed}/7)`);
      for (const err of result.errors.slice(0, 3)) {
        console.log(`  ${err}`);
      }
      for (const w of result.warnings) {
        console.log(`  note: ${w}`);
      }
    }
  }

  return result.ok ? 0 : 1;
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
    console.log(`brainstorm2idea v${VERSION}`);
    console.log(`  schema:    ${SCHEMA_VERSION}`);
    console.log(`  templates: ${VALID_TEMPLATES.join(', ')}`);
  }
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

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--brief' && args[i + 1]) {
      briefPath = args[++i];
    } else if (a === '--i2p' && args[i + 1]) {
      i2pOverride = args[++i];
    } else if (!a.startsWith('--') && !dir) {
      dir = a;
    }
  }

  if (!dir) {
    const err = 'usage: b2i handoff <dir> [--brief <path>] [--i2p <path>] [--dry-run] [--json]';
    if (isJson) console.log(JSON.stringify({ ok: false, error: err }, null, 2));
    else console.error(err);
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

  // Determine scaffold command & args
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

  // Dry-run mode
  if (isDryRun) {
    const flowsHeader = template === 'library' ? '## Public API\n<!-- The 1-3 functions -->\n1.' : '## Core flows\n<!-- The 1-3 user flows -->\n1.';
    const syntheticPrototype = `# Prototype spec — ${name}\n\n> Idea: ${distilled}\n\n## Goal\n<!-- Goal -->\n-\n\n${flowsHeader}\n\n## Modules (optional)\n-\n\n## Out of scope\n-\n`;
    const mergedPreview = mergeSectionsIntoPrototype(syntheticPrototype, briefResult);

    if (isJson) {
      console.log(JSON.stringify({ ok: true, dryRun: true, command: [cmd, ...cmdArgs], prototypePreview: mergedPreview }, null, 2));
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
    console.log(JSON.stringify({ ok: true, dir, template, name, prototype: targetPrototype }, null, 2));
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
// Main CLI Router
// ---------------------------------------------------------------------------

export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;

  switch (command) {
    case 'check':
      return cmdCheck(rest);
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
      console.log(`  b2i handoff <dir> [--brief <path>] [--i2p <path>] [--dry-run] [--json]`);
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
