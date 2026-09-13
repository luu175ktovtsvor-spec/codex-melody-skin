#!/usr/bin/env node
/** Launch Codex with the Melody runtime injector. This script never stops Codex. */
import { spawn, spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const backgroundArg = process.argv.find(arg => arg.startsWith('--background='))?.split('=')[1]
  || (process.argv.includes('--background') ? process.argv[process.argv.indexOf('--background') + 1] : undefined);
if (backgroundArg && !['centered', 'right'].includes(backgroundArg)) {
  throw new Error('Usage: npm run launch [-- --background centered|right]');
}
const buildEnv = { ...process.env };
if (backgroundArg) buildEnv.MELODY_BACKGROUND = backgroundArg;
const build = spawnSync(process.execPath, ['scripts/build-injector.mjs'], { stdio: 'inherit', env: buildEnv });
if (build.status !== 0) process.exit(build.status || 1);

const appPath = process.env.CODEX_APP || '/Applications/ChatGPT.app';
const appExecutable = join(appPath, 'Contents', 'MacOS', 'ChatGPT');
const dataDir = process.env.CODEX_USER_DATA_DIR || join(homedir(), 'Library/Application Support/Codex');
const port = Number(process.env.CODEX_DEBUG_PORT || 9229);
const processList = spawnSync('ps', ['-axo', 'args='], { encoding: 'utf8' }).stdout || '';
const running = processList.split('\n').some(line => line.trim().startsWith(appExecutable));
if (running) {
  console.error('Codex is already running. Quit it normally with ⌘Q, then run npm run launch again.');
  process.exit(2);
}
await access(appExecutable);
await access(dataDir);
// The app outlives this launcher. Do not inherit its terminal pipe: once the
// launcher exits, Electron logging to a closed TTY can raise `write EIO` in
// the main process during window shutdown.
const child = spawn(appExecutable, [`--user-data-dir=${dataDir}`, `--remote-debugging-port=${port}`], { stdio: 'ignore', detached: true });
child.unref();
process.env.CODEX_DEBUG_PORT = String(port);
const injector = spawn(process.execPath, ['scripts/inject-theme.mjs'], { stdio: 'inherit', env: process.env });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
injector.on('exit', (code, signal) => {
  if (code !== 0) console.error(`Theme injection failed (${signal || code}).`);
  process.exitCode = code || 0;
});
