#!/usr/bin/env node
// Generates assets/readme/demo.svg — the animated terminal demo embedded in
// the README under the hero. Zero dependencies; Node >= 18.17 built-ins only.
//
// The frames below are the verbatim output of a real session
// (init -> fill -> check -> score -> handoff, recorded with NO_COLOR=1);
// only Windows path separators were normalized to '/'.
//
// Rendering: SMIL-animated SVG. Each chunk of lines fades in on a fixed
// timeline and the whole cycle loops forever. Where SMIL is unavailable the
// SVG degrades to the full static transcript (all lines visible).
//
// Usage: node assets/readme/generate-demo.mjs   (writes demo.svg next to this file)

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 1200;
const LH = 16;            // line height
const PAD_X = 28;
const FONT = 12.5;
const TOP_BAR = 42;
const CONTENT_TOP = 86;
const CYCLE = 44;         // seconds per loop

const C = {
  bg: '#0d1117',
  border: '#30363d',
  text: '#e6edf3',
  dim: '#8b949e',
  green: '#3fb950',
  cyan: '#39c5cf',
};

const $ = '$';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A line is a list of [text, color] spans. A chunk is { t: revealSeconds, lines, sep? }
// — `sep` inserts a blank line after the chunk (logical group boundary).
const chunks = [
  {
    t: 0.6,
    lines: [
      [[$, C.green], [' b2i init plant-pulse --template web', C.text]],
    ],
  },
  {
    t: 2.2,
    sep: true,
    lines: [
      [['Brainstorm2idea init — ', C.dim], ['SUCCESS', C.green]],
      [['  brief:    brief.md', C.dim]],
      [['  template: ', C.dim], ['web', C.cyan]],
    ],
  },
  {
    t: 6.4,
    lines: [
      [[$, C.green], [' $EDITOR brief.md', C.text], ['   # fill in the TODO sections', C.dim]],
    ],
  },
  {
    t: 8.2,
    sep: true,
    lines: [
      [['---', C.dim]],
      [['schema: b2i-brief@1   template: web', C.dim]],
      [['distilled: "Lightweight shared plant watering tracker …"', C.dim]],
      [['---', C.dim]],
      [['# PlantPulse', C.text]],
      [['(sections: Goal · Core flows · Out of scope · Risks & assumptions)', C.dim]],
    ],
  },
  {
    t: 15.0,
    lines: [
      [[$, C.green], [' b2i check', C.text]],
    ],
  },
  {
    t: 16.8,
    sep: true,
    lines: [
      [['Brainstorm2idea check — ', C.dim], ['PASS', C.green], [' (7/7)', C.dim]],
    ],
  },
  {
    t: 21.0,
    lines: [
      [[$, C.green], [' b2i score', C.text]],
    ],
  },
  {
    t: 22.8,
    sep: true,
    lines: [
      [['Brainstorm2idea score — ', C.dim], ['100/100', C.green], [' (', C.dim], ['Grade A - EXCELLENT', C.green], [')', C.dim]],
      [['  breakdown: scope=30/30, infra=40/40, alignment=30/30', C.dim]],
      [['  ✓ Mitigated OAuth/SSO: explicitly marked in Out of scope', C.green]],
      [['  ✓ Mitigated Payment gateway: explicitly marked in Out of scope', C.green]],
    ],
  },
  {
    t: 29.5,
    lines: [
      [[$, C.green], [' b2i handoff plant-pulse --target raw', C.text]],
    ],
  },
  {
    t: 31.2,
    sep: true,
    lines: [
      [['Brainstorm2idea handoff — ', C.dim], ['SUCCESS', C.green], [' (raw target)', C.dim]],
      [['  project: plant-pulse (web template)', C.dim]],
      [['  spec:    plant-pulse/PROTOTYPE.md (source brief moved)', C.dim]],
      [['Next steps:', C.dim]],
      [['  cd plant-pulse', C.dim]],
      [['  Implement flows according to plant-pulse/PROTOTYPE.md', C.dim]],
    ],
  },
  {
    t: 38.5,
    lines: [
      [[$, C.green], [' head -3 plant-pulse/PROTOTYPE.md', C.text]],
    ],
  },
  {
    t: 40.2,
    sep: true,
    lines: [
      [['# Prototype spec — PlantPulse', C.cyan]],
      [['> Idea: Lightweight shared plant watering tracker showing days until next water', C.dim]],
      [['> Goal: track watering dates, one-tap "watered", add plants', C.dim]],
    ],
  },
];

// ---- layout -----------------------------------------------------------------

const laidOut = [];
let y = CONTENT_TOP;
for (const chunk of chunks) {
  const lines = [];
  for (const spans of chunk.lines) {
    lines.push({ y, spans });
    y += LH;
  }
  laidOut.push({ t: chunk.t, lines, lastY: y - LH });
  if (chunk.sep) y += LH; // blank line between logical groups
}
// Cursor sits on the open input line: on the first prompt before anything
// reveals, then directly below the newest revealed chunk.
const cursorPath = [{ t: 0, y: laidOut[0].lines[0].y }];
for (const chunk of laidOut) {
  cursorPath.push({ t: chunk.t, y: chunk.lastY + LH });
}
const H = Math.ceil(cursorPath[cursorPath.length - 1].y + LH + 18);

// ---- svg --------------------------------------------------------------------

const parts = [];
parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" font-family="ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace" role="img" aria-label="Terminal demo: b2i init, fill the brief, b2i check PASS 7/7, b2i score 100/100 Grade A, b2i handoff scaffolds plant-pulse/PROTOTYPE.md">`);
parts.push(`<title>b2i: fuzzy idea to running prototype in four commands</title>`);

// window chrome
parts.push(`<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="10" fill="${C.bg}" stroke="${C.border}" stroke-width="1"/>`);
parts.push(`<line x1="1" y1="${TOP_BAR}" x2="${W - 1}" y2="${TOP_BAR}" stroke="${C.border}" stroke-width="1"/>`);
for (const [cx, col] of [[24, '#ff5f56'], [46, '#ffbd2e'], [68, '#27c93f']]) {
  parts.push(`<circle cx="${cx}" cy="${TOP_BAR / 2}" r="6" fill="${col}"/>`);
}
parts.push(`<text x="${W / 2}" y="${TOP_BAR / 2 + 4.5}" text-anchor="middle" font-size="12" fill="${C.dim}">b2i — fuzzy idea → brief.md → running prototype</text>`);

// content chunks with reveal animation
for (const chunk of laidOut) {
  const t0 = (chunk.t / CYCLE).toFixed(4);
  const t1 = (Math.min(CYCLE - 0.2, chunk.t + 0.35) / CYCLE).toFixed(4);
  parts.push(`<g>`);
  parts.push(`<animate attributeName="opacity" values="0;0;1;1" keyTimes="0;${t0};${t1};1" dur="${CYCLE}s" calcMode="discrete" repeatCount="indefinite"/>`);
  for (const line of chunk.lines) {
    const tspans = line.spans
      .map(([txt, col]) => `<tspan fill="${col}">${esc(txt)}</tspan>`)
      .join('');
    parts.push(`<text x="${PAD_X}" y="${line.y}" font-size="${FONT}">${tspans}</text>`);
  }
  parts.push(`</g>`);
}

// cursor: steps down to the open input line as chunks reveal, blinks forever
{
  const times = cursorPath.map((p) => p.t / CYCLE);
  const values = cursorPath.map((p) => p.y);
  times.push(1);
  values.push(values[values.length - 1]);
  const kt = times.map((n) => n.toFixed(4)).join(';');
  const vs = values.map((n) => n.toFixed(1)).join(';');
  parts.push(`<g>`);
  parts.push(`<animate attributeName="opacity" values="1;0" keyTimes="0;0.5" dur="1.06s" calcMode="discrete" repeatCount="indefinite"/>`);
  parts.push(`<rect x="${PAD_X + 1}" y="${values[0] - FONT + 1}" width="8" height="${FONT + 2}" fill="${C.text}">`);
  parts.push(`<animate attributeName="y" values="${vs}" keyTimes="${kt}" dur="${CYCLE}s" calcMode="discrete" repeatCount="indefinite"/>`);
  parts.push(`</rect>`);
  parts.push(`</g>`);
}

parts.push(`</svg>`);

const out = resolve(dirname(fileURLToPath(import.meta.url)), 'demo.svg');
writeFileSync(out, parts.join('\n') + '\n', 'utf8');
console.log(`wrote ${out} (${(parts.join('\n').length / 1024).toFixed(1)} KiB, ${H}px tall, ${chunks.length} chunks, ${CYCLE}s loop)`);
