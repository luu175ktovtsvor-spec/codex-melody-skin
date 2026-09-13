import { access, cp, mkdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const home = process.env.CODEX_HOME || join(homedir(), '.codex');
const dest = join(home, 'pets', 'melody-codex');
const force = process.argv.includes('--force');
const src = join(root, 'pet');
await access(join(src, 'pet.json')); await access(join(src, 'spritesheet.png'));
if (!force) { try { await access(dest); throw new Error(`${dest} already exists; use --force to replace it`); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
await mkdir(join(home, 'pets'), { recursive: true });
await cp(src, dest, { recursive: true, force });
const manifest = JSON.parse(await readFile(join(dest, 'pet.json'), 'utf8'));
const bytes = (await stat(join(dest, 'spritesheet.png'))).size;
console.log(`Installed ${manifest.displayName} to ${dest} (${bytes} bytes)`);
