#!/usr/bin/env node
// b2i parser module — pure frontmatter and section extraction.
// Zero dependencies; Node >= 18.17 built-ins only.
// Exported for reuse by dogfood projects and external consumers.

import { readFileSync } from 'node:fs';

export function parseFrontmatter(content) {
  const safeContent = String(content || '').replace(/^\uFEFF/, '');
  const match = safeContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { meta: {}, body: safeContent };

  const rawMeta = match[1];
  const body = safeContent.slice(match[0].length);
  const meta = {};

  const lines = rawMeta.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    if (!key) continue;
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
  const safeBody = String(body || '');
  const lines = safeBody.split(/\r?\n/);
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
      currentSection = h2Match[1].trim().replace(/:\s*$/, '');
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

export function extractListItems(text) {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^[-*]\s+|\d+[.)]\s+/.test(l))
    .map((l) => l.replace(/^[-*]\s+|\d+[.)]\s+/, '').trim())
    .filter(Boolean);
}

export function readBriefFile(path) {
  return readFileSync(path, 'utf8');
}

/**
 * Collapse a value onto a single line.
 *
 * A newline ends the current heading/list item, so any user-supplied text that
 * lands in a heading or a bullet must not contain one. Unlike
 * `quoteFrontmatterValue` this leaves quotes intact — headings are parsed
 * verbatim, so there is no need to mutate them.
 */
export function sanitizeInlineText(value) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

/**
 * Make an arbitrary string safe to interpolate into a quoted frontmatter value.
 *
 * The frontmatter parser stops at the first interior quote and treats a newline
 * as a key/value boundary, so both must be neutralised before interpolation —
 * otherwise a value like `Tool called "x"` silently truncates on read-back.
 */
export function quoteFrontmatterValue(value) {
  return sanitizeInlineText(value).replace(/"/g, "'");
}

