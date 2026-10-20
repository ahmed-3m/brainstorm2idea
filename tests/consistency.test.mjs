import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  VALID_TEMPLATES,
  SCHEMA_VERSION,
  VERSION,
} from '../skills/brainstorm2idea/scripts/brainstorm2idea.mjs';

describe('Consistency Guards', () => {
  test('VERSION matches package.json and .zcode-plugin/plugin.json', () => {
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
    assert.equal(pkg.version, VERSION, 'package.json version matches engine VERSION');

    const zcode = JSON.parse(readFileSync(resolve('.zcode-plugin/plugin.json'), 'utf8'));
    assert.equal(zcode.version, VERSION, '.zcode-plugin/plugin.json version matches engine VERSION');
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
});
