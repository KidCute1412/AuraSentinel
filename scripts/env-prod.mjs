#!/usr/bin/env node
/**
 * pnpm env:prod [--rotate-session]
 *
 * Creates infra/.env.prod from infra/.env.prod.example and fills the generated secrets (SESSION_SECRET,
 * POSTGRES_PASSWORD, WEB_PROXY_SECRET) with fresh random values. On an existing file it only fills the ones that are
 * still empty: a value already there is never changed (POSTGRES_PASSWORD must match the database volume), except
 * SESSION_SECRET with --rotate-session (signs everyone out once).
 *
 * It never prints a secret, and never touches AGENT_PRIVATE_KEY: you paste the agent key yourself.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'infra', '.env.prod');
const EXAMPLE = join(ROOT, 'infra', '.env.prod.example');
const GENERATED = ['SESSION_SECRET', 'POSTGRES_PASSWORD', 'WEB_PROXY_SECRET'];
const NEEDED = ['AGENT_PRIVATE_KEY', 'ADMIN_ADDRESSES', 'SIWE_DOMAINS'];
const rotateSession = process.argv.includes('--rotate-session');

const created = !existsSync(FILE);
let text = readFileSync(created ? EXAMPLE : FILE, 'utf8');
const eol = text.includes('\r\n') ? '\r\n' : '\n';

const valueOf = (key) => text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim() ?? null;
function set(key, value) {
  const line = new RegExp(`^${key}=.*$`, 'm');
  text = line.test(text) ? text.replace(line, `${key}=${value}`) : `${text.replace(/\s*$/, '')}${eol}${key}=${value}${eol}`;
}

const filled = [];
for (const key of GENERATED) {
  const rotate = key === 'SESSION_SECRET' && rotateSession;
  if (!valueOf(key) || rotate) {
    set(key, randomBytes(32).toString('hex')); // hex: safe inside the Postgres URL, 64 chars
    filled.push(rotate && !created ? `${key} (rotated)` : key);
  }
}
writeFileSync(FILE, text);

console.log(`${created ? 'Created' : 'Updated'} infra/.env.prod`);
console.log(filled.length ? `  generated: ${filled.join(', ')}` : '  generated: nothing (all secrets already set)');
const missing = NEEDED.filter((k) => !valueOf(k));
if (missing.length) console.log(`  still empty, fill in yourself: ${missing.join(', ')}`);
console.log('  On Vercel, set WEB_PROXY_SECRET to the same value as in infra/.env.prod (open the file, copy it).');
