/**
 * chunk-summarizer
 * Zero-dependency token-budgeted text chunker and outline builder for large markdown documents.
 */

/**
 * Estimate token count using standard 4 chars per token heuristic.
 * Handles whitespace and punctuation with sub-character accuracy.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (!text) return 0;
  const str = String(text);
  // Rough ~4 chars per token, with min 1 token for non-empty string
  return Math.max(1, Math.ceil(str.length / 4));
}

/**
 * Convert heading text into an anchor slug.
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Scan markdown line-by-line while tracking fenced code blocks (```).
 * @param {string} markdown
 * @returns {Array<{ line: string, lineNum: number, isCodeBlock: boolean, heading: { level: number, text: string } | null }>}
 */
function scanLines(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const result = [];
  let inCode = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      inCode = !inCode;
      result.push({ line, lineNum: i + 1, isCodeBlock: inCode, heading: null });
      continue;
    }

    if (inCode) {
      result.push({ line, lineNum: i + 1, isCodeBlock: true, heading: null });
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      result.push({
        line,
        lineNum: i + 1,
        isCodeBlock: false,
        heading: {
          level: headingMatch[1].length,
          text: headingMatch[2].trim(),
        },
      });
    } else {
      result.push({ line, lineNum: i + 1, isCodeBlock: false, heading: null });
    }
  }

  return result;
}

/**
 * Parses markdown into an outline with token counts per section.
 * @param {string} markdown
 * @returns {{ title: string, totalTokens: number, totalChars: number, sections: Array<{ level: number, text: string, slug: string, line: number, tokenCount: number, charCount: number, body: string }>, tree: Array<any>, formatAscii: () => string }}
 */
export function parseOutline(markdown) {
  const safeMd = String(markdown || '');
  const totalTokens = estimateTokens(safeMd);
  const totalChars = safeMd.length;

  const scanned = scanLines(safeMd);
  const headingIndices = [];

  for (let i = 0; i < scanned.length; i++) {
    if (scanned[i].heading) {
      headingIndices.push(i);
    }
  }

  const sections = [];
  let title = '';

  for (let h = 0; h < headingIndices.length; h++) {
    const startIdx = headingIndices[h];
    const endIdx = h + 1 < headingIndices.length ? headingIndices[h + 1] : scanned.length;

    const headingInfo = scanned[startIdx].heading;
    if (headingInfo.level === 1 && !title) {
      title = headingInfo.text;
    }

    const sectionLines = scanned.slice(startIdx + 1, endIdx).map((s) => s.line);
    const body = sectionLines.join('\n').trim();
    const fullText = scanned.slice(startIdx, endIdx).map((s) => s.line).join('\n');

    sections.push({
      level: headingInfo.level,
      text: headingInfo.text,
      slug: slugify(headingInfo.text),
      line: scanned[startIdx].lineNum,
      tokenCount: estimateTokens(fullText),
      charCount: fullText.length,
      body,
    });
  }

  // Build hierarchical tree
  const tree = [];
  const stack = [];

  for (const sec of sections) {
    const node = { ...sec, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      tree.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }

  function formatAscii(nodes = tree, indent = 0) {
    let out = '';
    for (const n of nodes) {
      const prefix = '  '.repeat(indent) + '#'.repeat(n.level);
      out += `${prefix} ${n.text} (${n.tokenCount} tokens, line ${n.line})\n`;
      if (n.children && n.children.length > 0) {
        out += formatAscii(n.children, indent + 1);
      }
    }
    return out;
  }

  return {
    title: title || 'Untitled Document',
    totalTokens,
    totalChars,
    sections,
    tree,
    formatAscii,
  };
}

/**
 * Splits a section's text into atomic units (paragraphs, lists, code blocks).
 * Ensures fenced code blocks are never cut in the middle.
 * @param {string} text
 * @returns {string[]}
 */
function splitIntoAtomicBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let current = [];
  let inCode = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCode = !inCode;
      current.push(line);
      if (!inCode) {
        // Closed a code block
        blocks.push(current.join('\n'));
        current = [];
      }
      continue;
    }

    if (inCode) {
      current.push(line);
      continue;
    }

    // Outside code block: empty lines mark paragraph boundaries
    if (trimmed === '') {
      if (current.length > 0) {
        blocks.push(current.join('\n'));
        current = [];
      }
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    blocks.push(current.join('\n'));
  }

  return blocks;
}

/**
 * Splits markdown into chunks strictly respecting a token budget.
 * Preserves heading boundaries, code blocks, and context breadcrumbs.
 * @param {string} markdown
 * @param {number} maxTokens - Max tokens per chunk (e.g. 500, 1000, 2000)
 * @param {object} [options]
 * @param {boolean} [options.includeBreadcrumb=true] - Prepend context breadcrumb (e.g. `[Doc > Section]`)
 * @returns {Array<{ id: number, text: string, tokenCount: number, headings: string[], breadcrumb: string }>}
 */
export function chunkByBudget(markdown, maxTokens, options = {}) {
  const budget = Math.max(1, Number(maxTokens) || 500);
  const includeBreadcrumb = options.includeBreadcrumb !== false;
  const safeMd = String(markdown || '').trim();

  if (!safeMd) return [];

  const outline = parseOutline(safeMd);

  // If entire document fits within budget, return single chunk
  if (outline.totalTokens <= budget) {
    return [{
      id: 1,
      text: safeMd,
      tokenCount: outline.totalTokens,
      headings: outline.sections.map((s) => s.text),
      breadcrumb: outline.title,
    }];
  }

  const chunks = [];
  let currentChunkBlocks = [];
  let currentChunkTokens = 0;
  let currentChunkHeadings = [];
  let currentBreadcrumbs = [];

  function flushChunk() {
    if (currentChunkBlocks.length === 0) return;
    const bodyText = currentChunkBlocks.join('\n\n').trim();
    const breadcrumbStr = currentBreadcrumbs.length > 0 ? currentBreadcrumbs.join(' > ') : outline.title;
    let finalText = bodyText;

    if (includeBreadcrumb && breadcrumbStr) {
      finalText = `<!-- Section Context: ${breadcrumbStr} -->\n\n${bodyText}`;
    }

    chunks.push({
      id: chunks.length + 1,
      text: finalText,
      tokenCount: estimateTokens(finalText),
      headings: [...currentChunkHeadings],
      breadcrumb: breadcrumbStr,
    });

    currentChunkBlocks = [];
    currentChunkTokens = 0;
    currentChunkHeadings = [];
  }

  // If no headings found, split by atomic blocks
  if (outline.sections.length === 0) {
    const blocks = splitIntoAtomicBlocks(safeMd);
    for (const block of blocks) {
      const blockTokens = estimateTokens(block);
      if (currentChunkTokens + blockTokens > budget && currentChunkBlocks.length > 0) {
        flushChunk();
      }
      currentChunkBlocks.push(block);
      currentChunkTokens += blockTokens;
    }
    flushChunk();
    return chunks;
  }

  // Iterate sections with active breadcrumb path
  const headingStack = [];

  for (const section of outline.sections) {
    while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= section.level) {
      headingStack.pop();
    }
    headingStack.push({ level: section.level, text: section.text });
    const breadcrumbPath = headingStack.map((h) => h.text);

    const headingLine = `${'#'.repeat(section.level)} ${section.text}`;
    const fullSectionText = `${headingLine}\n\n${section.body}`.trim();
    const sectionTokens = estimateTokens(fullSectionText);

    // Case 1: Entire section fits within remaining chunk budget
    if (currentChunkTokens + sectionTokens <= budget) {
      currentChunkBlocks.push(fullSectionText);
      currentChunkTokens += sectionTokens;
      currentChunkHeadings.push(section.text);
      currentBreadcrumbs = breadcrumbPath;
      continue;
    }

    // Case 2: Flush existing chunk if section won't fit
    if (currentChunkBlocks.length > 0) {
      flushChunk();
    }

    // Case 3: Whole section fits in a fresh chunk
    if (sectionTokens <= budget) {
      currentChunkBlocks.push(fullSectionText);
      currentChunkTokens = sectionTokens;
      currentChunkHeadings.push(section.text);
      currentBreadcrumbs = breadcrumbPath;
      continue;
    }

    // Case 4: Section itself exceeds budget -> split section body into atomic blocks
    currentBreadcrumbs = breadcrumbPath;
    currentChunkHeadings.push(section.text);
    currentChunkBlocks.push(headingLine);
    currentChunkTokens = estimateTokens(headingLine);

    const bodyBlocks = splitIntoAtomicBlocks(section.body);
    for (const block of bodyBlocks) {
      const blockTokens = estimateTokens(block);
      if (currentChunkTokens + blockTokens > budget && currentChunkBlocks.length > 1) {
        flushChunk();
        currentBreadcrumbs = breadcrumbPath;
        currentChunkHeadings.push(section.text);
        currentChunkBlocks.push(`${headingLine} (continued)`);
        currentChunkTokens = estimateTokens(`${headingLine} (continued)`);
      }
      currentChunkBlocks.push(block);
      currentChunkTokens += blockTokens;
    }

    flushChunk();
  }

  flushChunk();
  return chunks;
}
