#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile, access, unlink, stat, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const configPath = process.env.CODEX_CONFIG || join(homedir(), '.codex', 'config.toml');
const stateDir = process.env.CODEX_MELODY_STATE || join(homedir(), '.codex', 'melody-skin');
const backupPath = join(stateDir, 'appearance-backup.json');
const mode = process.argv[2] || '--status';
const text = await readFile(configPath, 'utf8');
const match = text.match(/^([ \t]*)appearanceTheme\s*=\s*"(light|dark)"\s*$/m);
if (!match) throw new Error(`appearanceTheme not found in ${configPath}`);
const writeAtomic = async value => {
  const tmp = `${configPath}.melody-tmp-${process.pid}`;
  const mode = (await stat(configPath)).mode & 0o777;
  try {
    await writeFile(tmp, value, { encoding: 'utf8', mode });
    await chmod(tmp, mode);
    await rename(tmp, configPath);
  } catch (error) {
    await unlink(tmp).catch(() => {});
    throw error;
  }
};
if (mode === '--status') { console.log(JSON.stringify({appearanceTheme: match[1], configPath, backup: await access(backupPath).then(()=>true).catch(()=>false)})); process.exit(0); }
if (mode === '--apply') {
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  try { await access(backupPath); } catch { await writeFile(backupPath, JSON.stringify({appearanceTheme: match[1], line: match[0]}, null, 2)+'\n', { mode: 0o600 }); }
  if (match[1] !== 'light') await writeAtomic(text.replace(match[0], 'appearanceTheme = "light"'));
  console.log(JSON.stringify({ok:true,appearanceTheme:'light',backup:backupPath})); process.exit(0);
}
if (mode === '--restore') {
  const backup = JSON.parse(await readFile(backupPath, 'utf8'));
  const restored = text.replace(match[0], String(backup.line || `appearanceTheme = "${backup.appearanceTheme}"`));
  await writeAtomic(restored); await unlink(backupPath).catch(()=>{}); console.log(JSON.stringify({ok:true,appearanceTheme:backup.appearanceTheme})); process.exit(0);
}
throw new Error('Usage: --status | --apply | --restore');
