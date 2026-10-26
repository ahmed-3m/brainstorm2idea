#!/usr/bin/env node
// b2i spark catalog and generator module.
// Zero dependencies; Node >= 18.17 built-ins only.

import { SCHEMA_VERSION } from './constants.mjs';

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
  {
    id: 'link-grabber',
    category: 'devtools',
    template: 'web',
    name: 'link-grabber',
    distilled: 'Browser extension collecting visited pages into a staging list and copying them as markdown',
    goals: [
      'Collect the current page URL and title into a staging list',
      'Copy the whole staged list as a markdown bullet block in one click',
    ],
    flows: [
      'Show popup with an add-current-page button',
      'Store staged links in browser local storage',
      'Export the staged list as a markdown bullet block',
    ],
    outOfScope: [
      'Accounts, cloud sync, or cross-device storage',
      'Reading page content beyond title and URL',
    ],
    risks: [
      'ASSUMPTION: Manifest V3 popup with storage permission is sufficient',
    ],
    notes: [
      'Vanilla JS popup; no build step',
    ],
  },
  {
    id: 'csv-cleaner',
    category: 'devtools',
    template: 'cli',
    name: 'csv-cleaner',
    distilled: 'CLI that reports and fixes duplicate rows, blank lines, and ragged columns in CSV files',
    goals: [
      'Report duplicate rows, blank lines, and inconsistent column counts without mutating the file',
      'Apply cleanup only with an explicit --write flag after previewing',
    ],
    flows: [
      'Parse header and rows from an input CSV path or stdin',
      'Detect duplicate rows and trailing whitespace per cell',
      'Print a preview table, then rewrite the file only when --write is passed',
    ],
    outOfScope: [
      'Spreadsheet (XLSX) or database import and export',
      'Pivot tables, joins, or statistical analysis',
    ],
    risks: [
      'ASSUMPTION: RFC-4180 quoted CSV fields cover the target files',
    ],
    notes: [
      'Safe by default: read-only unless --write is passed',
    ],
  },
  {
    id: 'lockfile-diff',
    category: 'devtools',
    template: 'cli',
    name: 'lockfile-diff',
    distilled: 'CLI diff inspector comparing package-lock.json dependencies across git branches or commits',
    goals: [
      'Compare dependency trees between two git refs or against local working copy',
      'Summarize added, upgraded, and removed packages with version delta tables',
    ],
    flows: [
      'Read package-lock.json from current workspace and target git commit',
      'Diff package names and resolved semver versions',
      'Print clean terminal summary highlighting major version bumps',
    ],
    outOfScope: [
      'Automated dependency vulnerability scanning',
      'Automatic package installation or lockfile mutation',
    ],
    risks: [
      'ASSUMPTION: Lockfile conforms to npm package-lock version 2 or 3 format',
    ],
    notes: [
      'Pure Node.js parser using git show to inspect target branch',
    ],
  },
  {
    id: 'md-table-align',
    category: 'devtools',
    template: 'library',
    name: 'md-table-align',
    distilled: 'Zero-dependency markdown table parser and column alignment formatter',
    goals: [
      'Parse unaligned markdown tables into structured row and column data',
      'Render pretty-printed ASCII markdown tables with uniform column widths',
    ],
    flows: [
      'parseTable(markdown: string): TableData',
      'formatTable(data: TableData, options?: FormatOptions): string',
      'alignColumns(markdown: string): string',
    ],
    outOfScope: [
      'Spreadsheet formula calculation or cell expression evaluation',
      'HTML table rendering or document conversion',
    ],
    risks: [
      'ASSUMPTION: Tables use standard GFM pipe syntax with delimiter rows',
    ],
    notes: [
      'Lightweight utility for documentation generators and CLI formatters',
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
  {
    id: 'flashcard-forge',
    category: 'productivity',
    template: 'web',
    name: 'flashcard-forge',
    distilled: 'Offline keyboard-first flashcard trainer with spaced-repetition scheduling in local storage',
    goals: [
      'Review decks with keyboard-only grading (know / do not know)',
      'Schedule each card with a simple growing interval per success',
    ],
    flows: [
      'Load a deck from an editable markdown list',
      'Flip and grade cards using single-key shortcuts',
      'Persist per-card interval and due date in local storage',
    ],
    outOfScope: [
      'Accounts, cloud sync, or shared decks',
      'Images, audio pronunciation, and rich card media',
    ],
    risks: [
      'ASSUMPTION: Leitner-style intervals suffice; no SM-2 tuning for v0',
    ],
    notes: [
      'Single-page vanilla JS app; runs from any static server',
    ],
  },
  {
    id: 'todo-collector',
    category: 'productivity',
    template: 'cli',
    name: 'todo-collector',
    distilled: 'Workspace task crawler scanning markdown files for open checkbox items and grouping them by file',
    goals: [
      'Find open and completed markdown checkboxes across workspace files',
      'Output an organized terminal checklist grouped by document path',
    ],
    flows: [
      'Scan repository for markdown files respecting ignore patterns',
      'Extract task line text and status from checkbox syntax',
      'Print grouped task list with line numbers and completion metrics',
    ],
    outOfScope: [
      'External task management service synchronization',
      'Automatic file editing or inline task status updating',
    ],
    risks: [
      'ASSUMPTION: Tasks follow standard markdown checkbox bracket conventions',
    ],
    notes: [
      'Read-only workspace crawler for rapid morning catchup',
    ],
  },
  {
    id: 'weekly-retro',
    category: 'productivity',
    template: 'cli',
    name: 'weekly-retro',
    distilled: 'Weekly reflection CLI prompting 3 structured retrospective questions and appending to markdown log',
    goals: [
      'Guide end-of-week reflection through 3 structured prompt questions',
      'Append formatted retrospective summaries to a persistent markdown journal',
    ],
    flows: [
      'Prompt user for weekly accomplishments, obstacles, and next priorities',
      'Format responses into a timestamped markdown section',
      'Append entry to journal file and display completion confirmation',
    ],
    outOfScope: [
      'Team collaboration features or remote survey synchronization',
      'Complex analytics dashboards or productivity scoring algorithms',
    ],
    risks: [
      'ASSUMPTION: Terminal supports standard interactive text line input',
    ],
    notes: [
      'Simple five-minute Friday routine helper with zero setup',
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
  {
    id: 'tool-call-parser',
    category: 'local-ai',
    template: 'library',
    name: 'tool-call-parser',
    distilled: 'Robust text parser extracting structured function tool calls and JSON arguments from model responses',
    goals: [
      'Extract named function calls and parsed JSON arguments from LLM output strings',
      'Handle partial JSON blocks and markdown code fences gracefully',
    ],
    flows: [
      'extractToolCalls(response: string): ToolInvocation[]',
      'parseJsonArguments(argsText: string): Record<string, unknown>',
      'formatToolResult(callId: string, result: unknown): string',
    ],
    outOfScope: [
      'Direct HTTP communication with remote model providers',
      'Dynamic arbitrary code execution or unvalidated eval invocations',
    ],
    risks: [
      'ASSUMPTION: Models emit identifiable tool delimiters or JSON markdown blocks',
    ],
    notes: [
      'Zero-dependency helper for building deterministic AI agent loops',
    ],
  },
  {
    id: 'context-budget',
    category: 'local-ai',
    template: 'cli',
    name: 'context-budget',
    distilled: 'CLI context window calculator estimating token usage across system prompts, history, and files',
    goals: [
      'Estimate total token consumption across prompt templates and attached context files',
      'Warn if combined token counts exceed configured model context limits',
    ],
    flows: [
      'Inspect prompt files and input references specified in config',
      'Calculate token approximations using character and word heuristics',
      'Display terminal breakdown table with visual percentage capacity bar',
    ],
    outOfScope: [
      'Model weight training or parameter optimization pipelines',
      'Remote model API calls or network requests',
    ],
    risks: [
      'ASSUMPTION: Heuristic token estimation ratio provides reliable budgeting headroom',
    ],
    notes: [
      'Run in pre-commit or CI to prevent agent context overflows',
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
      'TRUST: listens on localhost only and never executes or forwards payloads; anyone on this machine can post, so logged bodies are untrusted text',
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
  {
    id: 'discord-standup',
    category: 'automation',
    template: 'worker',
    name: 'discord-standup',
    distilled: 'Long-running chat bot collecting daily standup replies in one channel and posting a grouped summary',
    goals: [
      'Collect standup answers posted in a configured channel before a cutoff time',
      'Post a grouped per-user summary on a single command',
    ],
    flows: [
      'Listen for reply messages in the configured channel',
      'Store each user latest answers in a local JSON file',
      'Post a formatted summary when the summarize command arrives',
    ],
    outOfScope: [
      'Web dashboard or account linking',
      'Voice, video call, and streaming features',
      'Multi-server federation and moderation tooling',
    ],
    risks: [
      'ASSUMPTION: A single bot token with read/send message intent suffices',
    ],
    notes: [
      'Plain Node worker process; all state in one JSON file',
    ],
  },
  {
    id: 'site-diff-scraper',
    category: 'automation',
    template: 'cli',
    name: 'site-diff-scraper',
    distilled: 'Scheduled CLI fetcher that snapshots a list of pages and reports which ones changed',
    goals: [
      'Fetch each configured URL and hash its meaningful text',
      'Diff against the previous snapshot and list changed pages',
    ],
    flows: [
      'Read target URLs from a local list file',
      'Fetch each page and strip markup down to comparable text',
      'Store snapshots locally and print a changed or unchanged report',
    ],
    outOfScope: [
      'JavaScript-rendered single-page apps and headless browser automation',
      'Login-gated or paywalled content',
      'Distributed crawling queues and rate-limit schedulers',
    ],
    risks: [
      'ASSUMPTION: Target pages are static server-rendered markup',
      'RISK: Target sites may change structure and break text extraction',
    ],
    notes: [
      'Polite default: sequential fetches with a delay between requests',
    ],
  },
  {
    id: 'log-pruner',
    category: 'automation',
    template: 'worker',
    name: 'log-pruner',
    distilled: 'Background worker monitoring configured directories to archive or prune expired log files',
    goals: [
      'Periodically inspect target directory for files older than retention threshold',
      'Safely compress or remove expired logs while logging all operations',
    ],
    flows: [
      'Wake on configured interval and scan target folder file modification dates',
      'Identify files matching pattern that exceed max retention age in days',
      'Delete or move expired files and write operation audit entry to disk',
    ],
    outOfScope: [
      'Remote cloud storage uploads or distributed filesystem replication',
      'Database row purging or table truncation',
    ],
    risks: [
      'ASSUMPTION: Process runs with sufficient filesystem permissions on target log folder',
    ],
    notes: [
      'Lightweight daemon running on pure Node.js timer loop',
    ],
  },
  {
    id: 'file-watch-trigger',
    category: 'automation',
    template: 'worker',
    name: 'file-watch-trigger',
    distilled: 'Filesystem directory watcher triggering configured terminal scripts on change with debouncing',
    goals: [
      'Watch specified file paths for modification, creation, or deletion events',
      'Execute user-defined terminal command once change activity settles',
    ],
    flows: [
      'Initialize recursive directory watcher using native filesystem events',
      'Debounce rapid bursts of file modification signals within quiet window',
      'Spawn child process command and stream output status to terminal',
    ],
    outOfScope: [
      'Distributed network filesystem synchronization or remote triggers',
      'Graphical system tray notifications or desktop widget integrations',
    ],
    risks: [
      'ASSUMPTION: Operating system supports recursive directory watching',
    ],
    notes: [
      'Zero dependencies; pure Node.js node:fs watch implementation',
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
  {
    id: 'terminal-snake',
    category: 'cli',
    template: 'cli',
    name: 'terminal-snake',
    distilled: 'Classic snake game rendering an animated grid in the terminal with score persistence and rising speed',
    goals: [
      'Render an animated snake grid with food and score in the terminal',
      'Persist the high score between runs',
    ],
    flows: [
      'Start a game loop reading one key at a time for direction',
      'Advance the snake each tick, spawn food, detect wall and self collisions',
      'Write the final score to a local file on game over',
    ],
    outOfScope: [
      'Sound effects and color themes',
      'Networked multiplayer or online leaderboards',
    ],
    risks: [
      'ASSUMPTION: Terminal supports raw-mode key input and fast redraw',
    ],
    notes: [
      'Pure Node: no curses bindings or native modules',
    ],
  },
  {
    id: 'http-bench-ping',
    category: 'cli',
    template: 'cli',
    name: 'http-bench-ping',
    distilled: 'Local HTTP benchmark CLI sending batch requests to an endpoint and reporting latency percentiles',
    goals: [
      'Measure endpoint latency across a configurable number of repeated requests',
      'Calculate and display p50, p95, and p99 response duration percentiles',
    ],
    flows: [
      'Parse target URL, concurrency limit, and total iteration count arguments',
      'Dispatch sequential or pooled HTTP requests measuring millisecond durations',
      'Compute distribution percentiles and render clean summary table in terminal',
    ],
    outOfScope: [
      'Distributed denial of service stress testing across multiple machines',
      'Complex multipart form generation or payload scripting languages',
    ],
    risks: [
      'ASSUMPTION: Target endpoint is running locally or accepts quick test bursts',
    ],
    notes: [
      'Built with Node.js native fetch and high-resolution performance timers',
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
  {
    id: 'color-palette-lab',
    category: 'web',
    template: 'web',
    name: 'color-palette-lab',
    distilled: 'Single-page color palette generator with hex conversion and contrast accessibility ratio checks',
    goals: [
      'Generate harmonious color palettes from a base hex or RGB color value',
      'Calculate accessibility contrast ratios against white and dark backgrounds',
    ],
    flows: [
      'Input base color via picker or text input to compute complementary shades',
      'Display color swatches with hex, RGB, and contrast score badges',
      'Copy selected color codes or CSS custom property tokens in one click',
    ],
    outOfScope: [
      'Cloud accounts, color palette sharing galleries, or community voting',
      'Desktop operating system eyedropper screen color sampling',
    ],
    risks: [
      'ASSUMPTION: Browser implements standard canvas or CSS color parsing routines',
    ],
    notes: [
      'Pure client-side HTML, CSS, and JavaScript with zero external frameworks',
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
