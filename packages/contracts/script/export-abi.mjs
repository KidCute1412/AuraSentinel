#!/usr/bin/env node
// Writes the committed ABIs in ../abi from `forge inspect` (D5). CI re-runs this and fails on `git diff abi/`.
// Interfaces are the source for contracts that do not exist yet (factory, MockUSDC, L3); the real contract replaces
// them here once it implements the interface, with no change to the output file name.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'abi');

/** output file -> contract name to inspect */
const TARGETS = {
  AgentPolicyModule: 'AgentPolicyModule',
  AgentShieldFactory: 'IAgentShieldFactory',
  MockUSDC: 'IMockUSDC',
};

mkdirSync(outDir, { recursive: true });
for (const [file, contract] of Object.entries(TARGETS)) {
  const raw = execFileSync('forge', ['inspect', contract, 'abi', '--json'], { cwd: root, encoding: 'utf8' });
  const abi = JSON.parse(raw);
  writeFileSync(join(outDir, `${file}.json`), `${JSON.stringify(abi, null, 2)}\n`);
  console.log(`abi/${file}.json  <-  ${contract} (${abi.length} entries)`);
}
