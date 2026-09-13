#!/usr/bin/env node

const port = Number(process.env.CODEX_DEBUG_PORT || 9229);
const viewports = [
  { width: 480, height: 700 },
  { width: 720, height: 700 },
  { width: 853, height: 842 },
  { width: 900, height: 700 },
  { width: 900, height: 1100 },
  { width: 1280, height: 900 },
  { width: 1600, height: 900 },
];
const deadline = Date.now() + Number(process.env.CODEX_DEBUG_WAIT_MS || 12000);
const targets = async () => {
  const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
  return list.filter(target => target.type === 'page'
    && target.webSocketDebuggerUrl
    && !String(target.url).startsWith('devtools://')
    && String(target.url).startsWith('app://-/'));
};

let list = [];
while (!list.length && Date.now() < deadline) {
  try { list = await targets(); } catch {}
  if (!list.length) await new Promise(resolve => setTimeout(resolve, 250));
}
if (!list.length) throw new Error(`No app renderer on ${port}`);

async function inspect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const call = (method, params) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => reject(new Error(`timeout ${method}`)), 5000);
    const handler = event => {
      const message = JSON.parse(event.data);
      if (message.id !== requestId) return;
      clearTimeout(timer);
      ws.removeEventListener('message', handler);
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message);
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });

  try {
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    const metrics = [];
    for (const viewport of viewports) {
      await call('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
      await new Promise(resolve => setTimeout(resolve, 120));
      const result = await call('Runtime.evaluate', {
        expression: `(() => {
          const state = window.__CODEX_MELODY_SKIN_STATE__;
          state?.ensure?.();
          const input = document.querySelector('[data-codex-composer], [contenteditable="true"]');
          const composerRequired = Boolean(document.querySelector('[data-feature="game-source"]'));
          const bounds = element => {
            if (!element) return null;
            const rect = element.getBoundingClientRect();
            return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
          };
          return {
            width: innerWidth,
            height: innerHeight,
            skin: document.body?.dataset.melodySkin || null,
            layout: document.documentElement?.dataset.melodyLayout || null,
            backgroundSize: getComputedStyle(document.body).backgroundSize,
            parts: document.querySelectorAll('[data-melody-part]').length,
            composer: Boolean(input),
            composerRequired,
            homeBounds: bounds(document.querySelector('[role="main"]:has([data-testid="home-icon"])')),
            headingBounds: bounds(document.querySelector('[data-melody-part="home-heading"]')),
            composerBounds: bounds(document.querySelector('[data-melody-part="composer-root"]')),
            overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            overflowY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
            thread: document.querySelectorAll('[data-local-conversation-user-anchor],[data-local-conversation-final-assistant],[data-testid="conversation"]').length > 0,
          };
        })()`,
        returnByValue: true,
      });
      metrics.push(result.result?.result?.value || null);
    }
    await call('Emulation.clearDeviceMetricsOverride', {});
    return { id: target.id, url: target.url, metrics };
  } finally {
    ws.close();
  }
}

const results = [];
for (const target of list) {
  try { results.push(await inspect(target)); }
  catch (error) { results.push({ id: target.id, url: target.url, error: error.message }); }
}
const relevant = results.filter(result => !result.url.includes('avatar-overlay'));
if (!relevant.length || relevant.some(result => result.error || result.metrics?.length !== viewports.length)) {
  throw new Error(`Incomplete smoke inspection: ${JSON.stringify(relevant)}`);
}
const inViewport = (bounds, width, height) => !bounds
  || (bounds.left >= -1 && bounds.top >= -1 && bounds.right <= width + 1 && bounds.bottom <= height + 1);
const failures = relevant.flatMap(result => (result.metrics || []).filter(metric => {
  if (!metric || metric.skin !== 'active' || metric.overflowX || metric.overflowY) return true;
  if (metric.composerRequired && !metric.composer) return true;
  if (!inViewport(metric.headingBounds, metric.width, metric.height)) return true;
  if (!inViewport(metric.composerBounds, metric.width, metric.height)) return true;
  if (metric.composerRequired && (!metric.homeBounds || !metric.headingBounds || !metric.composerBounds)) return true;
  if (metric.homeBounds && [metric.headingBounds, metric.composerBounds].some(bounds => bounds
    && (bounds.left < metric.homeBounds.left - 1 || bounds.right > metric.homeBounds.right + 1))) return true;
  return false;
}));
if (failures.length) throw new Error(`Smoke failures: ${JSON.stringify(failures)}`);
console.log(JSON.stringify({ ok: true, viewports, targets: results }, null, 2));
