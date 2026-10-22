#!/usr/bin/env node
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';

const args = process.argv.slice(2);
const command = args[0];

if (command === 'list') {
  if (process.env.MOCK_I2P_MODE === 'garbage') {
    console.log('THIS IS NOT JSON GARBAGE');
    process.exit(0);
  }
  if (process.env.MOCK_I2P_MODE === 'fail') {
    console.error('mock error: simulated list failure');
    process.exit(1);
  }
  if (process.env.MOCK_I2P_MODE === 'hang') {
    // Block the main thread until the caller's introspection timeout kills
    // us — never fall through into the `new` scaffold below. (Scheduling a
    // timer is not enough: it keeps the loop alive but does not stop the
    // current turn of execution; a never-settling top-level await makes Node
    // exit 13 the moment the loop empties.)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120000);
    process.exit(0);
  } else {
    const defaultTemplates = ['web', 'api', 'cli', 'worker', 'library'];
    const templates = process.env.MOCK_I2P_TEMPLATES
      ? process.env.MOCK_I2P_TEMPLATES.split(',').map((s) => s.trim()).filter(Boolean)
      : defaultTemplates;

    console.log(JSON.stringify({
      ok: true,
      version: 'mock',
      templates,
      features: ['templates', 'flags'],
    }, null, 2));
    process.exit(0);
  }
} else if (process.env.MOCK_FAIL_NEW === '1') {
  console.error('mock error: failed to create prototype');
  process.exit(1);
}

if (command !== 'new') {
  console.error(`unknown command "${command}"`);
  process.exit(1);
}

const dir = args[1];
if (!dir) {
  console.error('usage: idea2prototype new <dir> [--template ...] [--name "..."] [--idea "..."]');
  process.exit(1);
}

let template = 'web';
let name = basename(dir);
let idea = '';

for (let i = 2; i < args.length; i++) {
  if (args[i] === '--template' && args[i + 1]) template = args[++i];
  else if (args[i] === '--name' && args[i + 1]) name = args[++i];
  else if (args[i] === '--idea' && args[i + 1]) idea = args[++i];
}

// Same rule as the real i2p: these values land verbatim in its JSON manifest.
for (const [flag, value] of [['--name', name], ['--idea', idea]]) {
  if (/["\\\u0000-\u001f]/.test(value)) {
    console.error(`invalid ${flag} value — quotes, backslashes, and control characters are not allowed`);
    process.exit(1);
  }
}

const target = resolve(process.cwd(), dir);
if (existsSync(target)) {
  console.error(`"${target}" exists and is not empty`);
  process.exit(1);
}

mkdirSync(target, { recursive: true });

const flowsHeader = template === 'library' ? '## Public API\n<!-- The 1-3 functions -->\n1.' : '## Core flows\n<!-- The 1-3 user flows -->\n1.';

const prototypeMd = `# Prototype spec — ${name}

> Idea: ${idea}

## Goal
<!-- What "done" means for this prototype. Max 3 bullets. -->
-

${flowsHeader}

## Modules (optional)
<!-- Optional modules -->
-

## Out of scope
<!-- Non-goals -->
-
`;

writeFileSync(join(target, 'PROTOTYPE.md'), prototypeMd);
writeFileSync(join(target, 'AGENTS.md'), '# AGENTS.md for ' + name + '\nRun npm run check.\n');
writeFileSync(join(target, '.idea2prototype.json'), JSON.stringify({ version: '0.9.1', template }, null, 2));

console.log(`prototype ready: ${name} (${template} template, zero dependencies)`);
console.log(`  spec:   ${join(dir, 'PROTOTYPE.md')}`);
process.exit(0);
