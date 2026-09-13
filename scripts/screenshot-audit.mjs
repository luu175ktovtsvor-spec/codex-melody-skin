#!/usr/bin/env node
/** Read-only visual snapshot of the currently open renderer. Never clicks or changes controls. */
import { mkdir, writeFile } from 'node:fs/promises';
const port = Number(process.env.CODEX_DEBUG_PORT || 9229);
const outputDir = process.env.CODEX_SCREENSHOT_DIR || 'screenshots/runtime';
const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
const targets = list.filter(target => target.type === 'page' && target.webSocketDebuggerUrl && target.url === 'app://-/index.html');
if (!targets.length) throw new Error(`No Codex renderer on 127.0.0.1:${port}`);
await mkdir(outputDir, { recursive: true });
const results = [];
for (const target of targets) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => reject(new Error(`Timed out: ${method}`)), 30000);
    const handler = event => {
      const message = JSON.parse(event.data);
      if (message.id !== requestId) return;
      clearTimeout(timer);
      ws.removeEventListener('message', handler);
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });
  try {
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    const state = await call('Runtime.evaluate', { expression: `({ url: location.href, width: innerWidth, height: innerHeight, skin: document.documentElement?.dataset.melodySkin || null, layout: document.documentElement?.dataset.melodyLayout || null })`, returnByValue: true });
    const shot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    const safeName = (state.result.value.layout || 'surface') + '-' + target.id.slice(0, 8) + '.png';
    const output = `${outputDir}/${safeName}`;
    await writeFile(output, Buffer.from(shot.data, 'base64'));
    results.push({ output, state: state.result.value });
  } finally { ws.close(); }
}
console.log(JSON.stringify({ ok: true, readOnly: true, clicked: 0, targets: results }, null, 2));
