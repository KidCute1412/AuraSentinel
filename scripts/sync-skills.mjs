#!/usr/bin/env node
// Mirrors .agents/skills (source of truth) into .claude/skills (read by Claude Code).
//   node scripts/sync-skills.mjs          write the mirror
//   node scripts/sync-skills.mjs --check  exit 1 if the mirror differs (used in CI)
// Zero dependencies; no symlinks, so it behaves the same on Windows, macOS and Linux.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, ".agents", "skills");
const DEST = join(root, ".claude", "skills");
const check = process.argv.includes("--check");

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}
const rel = (base, files) => new Map(files.map((f) => [relative(base, f).split("\\").join("/"), f]));
// Compare ignoring CRLF/LF so Windows autocrlf checkouts do not cause false diffs.
const norm = (file) => readFileSync(file).filter((b) => b !== 13);

const src = rel(SRC, walk(SRC));
const dest = rel(DEST, walk(DEST));
const problems = [];

for (const [path, file] of src) {
  const target = dest.get(path);
  if (!target) problems.push(`missing in .claude/skills: ${path}`);
  else if (!norm(file).equals(norm(target))) problems.push(`differs: ${path}`);
}
for (const path of dest.keys()) if (!src.has(path)) problems.push(`extra in .claude/skills: ${path}`);

if (check) {
  if (problems.length) {
    console.error(`.claude/skills is out of sync with .agents/skills:\n  ${problems.join("\n  ")}`);
    console.error("Edit only .agents/skills, then run: node scripts/sync-skills.mjs");
    process.exit(1);
  }
  console.log(`OK: ${src.size} files in sync`);
} else {
  if (!problems.length) {
    console.log(`Already in sync (${src.size} files)`);
  } else {
    rmSync(DEST, { recursive: true, force: true });
    for (const [path, file] of src) {
      const out = join(DEST, path);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, readFileSync(file));
    }
    console.log(`Synced ${src.size} files to .claude/skills (${problems.length} changes)`);
  }
}
