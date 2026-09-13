import { access, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const home = process.env.CODEX_HOME || join(homedir(), '.codex');
const dest = join(home, 'pets', 'melody-codex');
try { await access(dest); } catch { console.log(`Not installed: ${dest}`); process.exit(0); }
if (!process.argv.includes('--yes')) throw new Error(`Refusing to remove ${dest}; rerun with --yes`);
await rm(dest, { recursive: true, force: true });
console.log(`Removed ${dest}`);
