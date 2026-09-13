#!/usr/bin/env node
/** Launch Codex with the Melody runtime injector and clean up the child app on exit. */
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
const child = spawn(appExecutable, [`--user-data-dir=${dataDir}`, `--remote-debugging-port=${port}`], { stdio: 'inherit' });
let stopping = false;
process.env.CODEX_DEBUG_PORT = String(port);
const injector = spawn(process.execPath, ['scripts/inject-theme.mjs'], { stdio: 'inherit', env: process.env });
let watcher = null;
const stop = () => {
  if (stopping) return;
  stopping = true;
  injector.kill('SIGINT');
  watcher?.kill('SIGINT');
  if (!child.killed) child.kill('SIGTERM');
  setTimeout(() => process.exit(process.exitCode ?? 0), 250).unref();
};
child.on('error', error => { console.error(error.message); process.exitCode = 1; stop(); });
child.on('exit', (code, signal) => {
  if (!stopping) {
    console.error(`Codex exited (${signal || code}).`);
    process.exitCode = code || 1;
    stop();
  }
});
injector.on('exit', (code, signal) => {
  if (stopping) return;
  if (code !== 0) { console.error(`Theme injection failed (${signal || code}).`); process.exitCode = code || 1; stop(); }
  else {
    watcher = spawn(process.execPath, ['scripts/watch-theme.mjs'], { stdio: 'inherit', env: process.env });
    watcher.on('exit', (watchCode, watchSignal) => {
      if (stopping) return;
      process.exitCode = watchCode ?? (watchSignal ? 1 : 0);
      stop();
    });
  }
});
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
