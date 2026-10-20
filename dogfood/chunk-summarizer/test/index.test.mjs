import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateTokens,
  slugify,
  parseOutline,
  chunkByBudget,
} from '../src/index.mjs';

const SAMPLE_MD = `# AI Agent Architecture

This is an introduction to autonomous agent patterns.

## Core Components

The agent loop has three main subsystems:

### Perception
Analyzes inputs from the environment, user requests, and tools.

\`\`\`markdown
# Note: This is NOT a heading!
It is inside a fenced code block and should be ignored by the outline parser.
\`\`\`

### Reasoning & Planning
Breaks complex goals down into sequential tasks.

### Execution
Invokes tools, reads files, and writes outputs.

## Safety & Boundaries
Agents must respect security policies and filesystem sandbox boundaries.
`;

describe('estimateTokens', () => {
  it('returns 0 for empty or null strings', () => {
    assert.equal(estimateTokens(''), 0);
    assert.equal(estimateTokens(null), 0);
  });

  it('estimates ~4 characters per token', () => {
    assert.equal(estimateTokens('abcd'), 1);
    assert.equal(estimateTokens('12345678'), 2);
    assert.equal(estimateTokens('hello world!'), 3);
  });
});

describe('slugify', () => {
  it('converts headings into clean URL slugs', () => {
    assert.equal(slugify('Reasoning & Planning'), 'reasoning-planning');
    assert.equal(slugify('Core Components 101'), 'core-components-101');
  });
});

describe('parseOutline', () => {
  it('extracts H1 title and hierarchical sections', () => {
    const outline = parseOutline(SAMPLE_MD);
    assert.equal(outline.title, 'AI Agent Architecture');
    assert.equal(outline.sections.length, 6);

    const headings = outline.sections.map((s) => s.text);
    assert.deepEqual(headings, [
      'AI Agent Architecture',
      'Core Components',
      'Perception',
      'Reasoning & Planning',
      'Execution',
      'Safety & Boundaries',
    ]);
  });

  it('ignores fake headings inside fenced code blocks', () => {
    const outline = parseOutline(SAMPLE_MD);
    const hasFakeHeading = outline.sections.some((s) => s.text.includes('This is NOT a heading'));
    assert.equal(hasFakeHeading, false, 'headings in fenced code blocks must be excluded');
  });

  it('builds nested tree structure', () => {
    const outline = parseOutline(SAMPLE_MD);
    assert.equal(outline.tree.length, 1); // Single root H1
    const root = outline.tree[0];
    assert.equal(root.text, 'AI Agent Architecture');
    assert.equal(root.children.length, 2); // Core Components, Safety & Boundaries
    assert.equal(root.children[0].children.length, 3); // Perception, Reasoning, Execution
  });

  it('formats ASCII outline tree', () => {
    const outline = parseOutline(SAMPLE_MD);
    const ascii = outline.formatAscii();
    assert.match(ascii, /# AI Agent Architecture/);
    assert.match(ascii, /## Core Components/);
    assert.match(ascii, /### Perception/);
  });
});

describe('chunkByBudget', () => {
  it('returns single chunk if document is within budget', () => {
    const chunks = chunkByBudget(SAMPLE_MD, 5000);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].headings.length, 6);
  });

  it('splits into multiple chunks when budget is smaller than document', () => {
    const chunks = chunkByBudget(SAMPLE_MD, 80);
    assert.ok(chunks.length > 1, `expected >1 chunks, got ${chunks.length}`);

    for (const chunk of chunks) {
      assert.ok(chunk.tokenCount > 0);
      assert.ok(chunk.breadcrumb);
      assert.match(chunk.text, /<!-- Section Context:/);
    }
  });

  it('never splits a fenced code block across chunk boundaries', () => {
    const chunks = chunkByBudget(SAMPLE_MD, 60);
    for (const chunk of chunks) {
      const codeBlockStarts = (chunk.text.match(/```/g) || []).length;
      assert.equal(
        codeBlockStarts % 2,
        0,
        'fenced code blocks must be closed within each chunk'
      );
    }
  });

  it('handles markdown without headings', () => {
    const plain = 'Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.';
    const chunks = chunkByBudget(plain, 5);
    assert.ok(chunks.length >= 2, `expected >=2 chunks, got ${chunks.length}`);
  });
});
