#!/usr/bin/env node
// b2i — brainstorm2idea entry point (npm bin).
// The engine lives in skills/ so agent plugins and the npm package share one source of truth.
// main() is called explicitly: npm links this file as a bare `b2i` symlink on POSIX,
// so the engine cannot rely on process.argv[1] ending in a known filename.
import { main } from '../skills/brainstorm2idea/scripts/brainstorm2idea.mjs';

process.exitCode = main();
