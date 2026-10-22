import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  VALID_TEMPLATES,
  SCHEMA_VERSION,
  VERSION,
  CLI_COMMANDS,
} from '../skills/brainstorm2idea/scripts/brainstorm2idea.mjs';

describe('Consistency Guards', () => {
  test('VERSION matches package.json and .zcode-plugin/plugin.json', () => {
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
    assert.equal(pkg.version, VERSION, 'package.json version matches engine VERSION');

    const zcode = JSON.parse(readFileSync(resolve('.zcode-plugin/plugin.json'), 'utf8'));
    assert.equal(zcode.version, VERSION, '.zcode-plugin/plugin.json version matches engine VERSION');
  });

  test('command frontmatter values are YAML scalars (an unquoted [ or { breaks the whole block)', () => {
    // An unquoted `argument-hint: [--format a|b]` is a YAML parse error, and
    // Claude Code then loads the command with all its frontmatter dropped.
    for (const f of readdirSync(resolve('commands')).filter((n) => n.endsWith('.md'))) {
      const fm = readFileSync(resolve('commands', f), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
      assert.ok(fm, `commands/${f} has a frontmatter block`);
      for (const line of fm[1].split(/\r?\n/)) {
        const value = line.slice(line.indexOf(':') + 1).trim();
        assert.doesNotMatch(value, /^[[{]/, `commands/${f}: quote the value in "${line}"`);
      }
    }
  });

  test('SCHEMA_VERSION is consistent across code, SKILL.md, and README.md', () => {
    assert.equal(SCHEMA_VERSION, 'b2i-brief@1');

    const skill = readFileSync(resolve('skills/brainstorm2idea/SKILL.md'), 'utf8');
    assert.ok(skill.includes(SCHEMA_VERSION), 'SKILL.md references SCHEMA_VERSION');

    const readme = readFileSync(resolve('README.md'), 'utf8');
    assert.ok(readme.includes(SCHEMA_VERSION), 'README.md references SCHEMA_VERSION');

    const cmd = readFileSync(resolve('commands/b2i.md'), 'utf8');
    assert.ok(cmd.includes(SCHEMA_VERSION), 'commands/b2i.md references SCHEMA_VERSION');
  });

  test('VALID_TEMPLATES matches templates listed in SKILL.md and README.md', () => {
    const skill = readFileSync(resolve('skills/brainstorm2idea/SKILL.md'), 'utf8');
    const readme = readFileSync(resolve('README.md'), 'utf8');

    for (const t of VALID_TEMPLATES) {
      assert.ok(skill.includes(t), `SKILL.md mentions template "${t}"`);
      assert.ok(readme.includes(t), `README.md mentions template "${t}"`);
    }
  });

  test('VALID_TEMPLATES covers all idea2prototype templates + none', () => {
    const i2pTemplates = ['web', 'api', 'cli', 'worker', 'library'];
    for (const t of i2pTemplates) {
      assert.ok(VALID_TEMPLATES.includes(t), `VALID_TEMPLATES contains i2p template "${t}"`);
    }
    assert.ok(VALID_TEMPLATES.includes('none'), 'VALID_TEMPLATES contains "none"');
  });

  test('marketplace.json registers brainstorm2idea', () => {
    const mktPath = resolve('../marketplace.json');
    if (existsSync(mktPath)) {
      const mkt = JSON.parse(readFileSync(mktPath, 'utf8'));
      const found = mkt.plugins?.find((p) => p.name === 'brainstorm2idea');
      assert.ok(found, 'marketplace.json contains brainstorm2idea plugin');
      assert.equal(found.version, VERSION);
    }
  });

  test('all command files exist and are well-formed', () => {
    const cmds = ['b2i.md', 'b2i-dump.md', 'b2i-spark.md', 'b2i-export.md'];
    for (const cmdFile of cmds) {
      const p = resolve('commands', cmdFile);
      assert.ok(existsSync(p), `command file ${cmdFile} exists`);
      const content = readFileSync(p, 'utf8');
      assert.match(content, /^---\r?\ndescription:/, `${cmdFile} has frontmatter description`);
    }
  });

  test('every CLI command is documented in SKILL.md and AGENTS.md', () => {
    const skill = readFileSync(resolve('skills/brainstorm2idea/SKILL.md'), 'utf8');
    const agents = readFileSync(resolve('AGENTS.md'), 'utf8');

    for (const cmd of CLI_COMMANDS) {
      assert.ok(
        skill.includes(`\`${cmd} `) || skill.includes(`\`${cmd}\``),
        `SKILL.md documents the "${cmd}" command`
      );
      assert.ok(
        agents.includes(`b2i.mjs ${cmd} `) || agents.includes(`b2i.mjs ${cmd}`),
        `AGENTS.md documents the "${cmd}" command`
      );
    }
  });

  test('the CLI router accepts exactly the documented commands', () => {
    // Guards against the router and CLI_COMMANDS drifting apart.
    const res = spawnSync(process.execPath, [resolve('bin/b2i.mjs'), 'help'], { encoding: 'utf8' });
    assert.equal(res.status, 0);
    for (const cmd of CLI_COMMANDS) {
      assert.match(res.stdout, new RegExp(`b2i ${cmd}\\b`), `help output lists "${cmd}"`);
    }
  });

  test('the publish workflow fails loudly instead of silently skipping npmjs', () => {
    // Regression guard: an earlier publish.yml skipped the npmjs job with
    // `exit 0` when NPM_TOKEN was missing. Every release run went green while
    // nothing reached npmjs.org, so `npx @ahmed-3m/brainstorm2idea` 404'd.
    const publish = readFileSync(resolve('.github/workflows/publish.yml'), 'utf8');

    assert.ok(
      publish.includes('::error::NPM_TOKEN not configured'),
      'publish.yml must error when NPM_TOKEN is missing on a release'
    );

    // The release branch must bail out with a non-zero code BEFORE the
    // manual-dispatch warning path can be reached.
    const errorIdx = publish.indexOf('::error::NPM_TOKEN not configured');
    const failIdx = publish.indexOf('exit 1', errorIdx);
    const warnIdx = publish.indexOf('::warning::NPM_TOKEN secret not configured');
    const skipIdx = publish.indexOf('exit 0', warnIdx);

    assert.ok(errorIdx >= 0, 'the release error branch exists');
    assert.ok(failIdx > errorIdx, 'the release error branch exits non-zero');
    assert.ok(warnIdx > failIdx, 'the warning path comes after the release bail-out');
    assert.ok(skipIdx > warnIdx, 'the warning path exits zero only for manual dispatch');

    // And the release bail-out must be conditioned on a release event.
    assert.match(
      publish,
      /GITHUB_EVENT_NAME"?\s*"?\]?[^]*?=.*release[^]*?::error::NPM_TOKEN not configured/s,
      'the missing-token error must be gated on a release event'
    );
  });

  test('the publish workflow guards the tag against the package.json version', () => {
    const publish = readFileSync(resolve('.github/workflows/publish.yml'), 'utf8');
    assert.match(
      publish,
      /does not match package\.json version/,
      'publish.yml must verify the release tag matches package.json version'
    );
  });

  test('the CI workflow smoke-tests the packed tarball', () => {
    // A missing entry in package.json "files" breaks `npx` without breaking
    // any in-repo test, so the packed artifact needs its own check.
    const ci = readFileSync(resolve('.github/workflows/ci.yml'), 'utf8');
    assert.match(ci, /package-smoke:/, 'ci.yml defines a package-smoke job');
    assert.match(ci, /npm pack/, 'the smoke job packs the tarball');
    assert.match(ci, /npm install/, 'the smoke job installs the packed tarball');
    assert.match(ci, /parser\.mjs/, 'the smoke job asserts parser.mjs ships in the tarball');
  });

  test('CI exercises the handoff contract against the published idea2prototype', () => {
    // b2i handoff drives `npx @ahmed-3m/idea2prototype@latest` — a package we
    // do not control. The i2p-contract job must keep feeding real handoff
    // output into the published i2p so interface drift fails CI, not users.
    const ci = readFileSync(resolve('.github/workflows/ci.yml'), 'utf8');
    assert.match(ci, /i2p-contract:/, 'ci.yml defines the i2p-contract job');
    assert.match(ci, /handoff contract-demo/, 'the job runs a real b2i handoff');
    assert.match(ci, /PROTOTYPE\.md/, 'the job verifies the merged PROTOTYPE.md');
    assert.match(ci, /cron:/, 'the workflow runs on a schedule to catch i2p drift');
  });

  test('package.json ships every file the engine needs at runtime', () => {
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
    const files = pkg.files;
    assert.ok(files.includes('bin/'), 'bin/ is published');
    assert.ok(
      files.includes('skills/brainstorm2idea/scripts/'),
      'skills/brainstorm2idea/scripts/ is published (engine + parser module)'
    );
    assert.ok(files.includes('skills/brainstorm2idea/SKILL.md'), 'SKILL.md is published');
    assert.ok(files.includes('agents/'), 'agents/ is published');
    assert.ok(files.includes('commands/'), 'commands/ is published');
  });
});
