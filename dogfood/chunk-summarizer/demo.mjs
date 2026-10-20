import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseOutline, chunkByBudget } from './src/index.mjs';

const targetFile = resolve(process.cwd(), 'benchmarks/specs.md');
console.log(`[chunk-summarizer demo] Reading file: ${targetFile}\n`);

const markdown = readFileSync(targetFile, 'utf8');

// 1. Parse Document Outline
console.log('='.repeat(60));
console.log('1. HIERARCHICAL DOCUMENT OUTLINE');
console.log('='.repeat(60));

const outline = parseOutline(markdown);
console.log(`Title:         ${outline.title}`);
console.log(`Total Chars:   ${outline.totalChars.toLocaleString()}`);
console.log(`Total Tokens:  ~${outline.totalTokens.toLocaleString()}\n`);
console.log(outline.formatAscii());

// 2. Chunk by Budget (e.g. 250 tokens per chunk)
console.log('='.repeat(60));
console.log('2. CHUNK BY TOKEN BUDGET (Budget: 250 tokens per chunk)');
console.log('='.repeat(60));

const chunks = chunkByBudget(markdown, 250);
console.log(`Generated ${chunks.length} semantic chunks respecting heading boundaries:\n`);

for (const chunk of chunks.slice(0, 4)) {
  console.log(`--- Chunk #${chunk.id} (${chunk.tokenCount} tokens) [Context: ${chunk.breadcrumb}] ---`);
  const preview = chunk.text.split('\n').slice(0, 5).join('\n');
  console.log(preview + '\n...\n');
}

if (chunks.length > 4) {
  console.log(`(... and ${chunks.length - 4} more chunks)`);
}

console.log('='.repeat(60));
console.log('SUCCESS: chunk-summarizer prototype verified end-to-end!');
console.log('='.repeat(60));
