#!/usr/bin/env node
/** Real-input audit for safe Codex controls and their transient overlays. */
const port = Number(process.env.CODEX_DEBUG_PORT || 9229);
const waitMs = Number(process.env.CODEX_CONTROL_WAIT_MS || 220);
const tabs = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
const target = tabs.find(t => t.type === "page" && t.url === "app://-/index.html" && t.webSocketDebuggerUrl);
if (!target) throw Error(`No Codex index renderer on ${port}`);
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const n = ++id;
  const handler = event => {
    const value = JSON.parse(event.data);
    if (value.id !== n) return;
    ws.removeEventListener("message", handler);
    value.error ? reject(Error(JSON.stringify(value.error))) : resolve(value.result);
  };
  ws.addEventListener("message", handler);
  ws.send(JSON.stringify({ id: n, method, params }));
  setTimeout(() => reject(Error(`Timed out: ${method}`)), 15000);
});
await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
const evaluate = async expression => (await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.value;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clickPoint = async point => {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  return true;
};
const pointFor = async (kind, value) => evaluate(`(() => {
  const visible = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 8 && r.height > 8 && r.x + r.width > 0 && r.y + r.height > 0 && r.x < innerWidth && r.y < innerHeight && s.visibility !== "hidden" && s.display !== "none"; };
  let e;
  if (${JSON.stringify(kind)} === "selector") e = document.querySelector(${JSON.stringify(value)});
  else if (${JSON.stringify(kind)} === "aria") e = [...document.querySelectorAll("[aria-label=" + ${JSON.stringify(value)} + "]")].find(visible);
  else { const all = [...document.querySelectorAll("button,[role=button],[role=menuitem],[role=tab],[role=checkbox],[role=switch],[role=combobox],summary,select")].filter(visible); e = all.find(x => (x.innerText || x.textContent || "").trim() === ${JSON.stringify(value)}) || all.find(x => (x.innerText || x.textContent || "").trim().includes(${JSON.stringify(value)})); }
  if (!e) return null;
  e.scrollIntoView({ block: "nearest", inline: "nearest" });
  if (!visible(e)) return null;
  const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
const clickText = async text => clickPoint(await pointFor("text", text));
const clickSelector = async selector => clickPoint(await pointFor("selector", selector));
const clickAria = async aria => clickPoint(await pointFor("aria", aria));
const escape = async () => {
  await call("Input.dispatchKeyEvent", { type: "keyDown", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27, key: "Escape", code: "Escape" });
  await call("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27, key: "Escape", code: "Escape" });
};
const openSettings = async () => {
  await escape();
  await clickText("返回应用");
  await sleep(300);
  await clickText("新对话");
  await sleep(500);
  if (!(await clickAria("打开个人资料菜单"))) throw Error("Profile menu button not found");
  await sleep(350);
  const point = await evaluate(`(() => { const e = [...document.querySelectorAll("[role=menuitem]")].find(x => { const r = x.getBoundingClientRect(), s = getComputedStyle(x); return (x.innerText || "").trim().startsWith("设置") && r.width > 8 && r.height > 8 && r.x + r.width > 0 && r.y + r.height > 0 && r.x < innerWidth && r.y < innerHeight && s.visibility !== "hidden" && s.display !== "none"; }); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!(await clickPoint(point))) throw Error("Visible settings menu item not found");
  await sleep(900);
};
const snapshot = async label => evaluate(`(() => {
  const visible = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && r.x + r.width > 0 && r.y + r.height > 0 && r.x < innerWidth && r.y < innerHeight && s.visibility !== "hidden" && s.display !== "none"; };
  const overlays = [...document.querySelectorAll("[role=dialog],[role=menu],[role=listbox],[role=popover],[data-radix-popper-content-wrapper],[popover]")].filter(visible).map(e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return { role: e.getAttribute("role"), text: (e.innerText || "").trim().replace(/\\s+/g, " ").slice(0, 100), bg: s.backgroundColor, area: Math.round(r.width * r.height), marked: e.dataset.melodyPart || e.closest("[data-melody-part]")?.dataset.melodyPart || null }; });
  const bad = overlays.filter(x => x.area > 12000 && (x.bg === "rgb(255, 255, 255)" || x.bg === "rgb(0, 0, 0)" || x.bg.startsWith("oklab(1")));
  return { label: ${JSON.stringify(label)}, skin: document.documentElement.dataset.melodySkin || null, parts: document.querySelectorAll("[data-melody-part]").length, bad, overlays };
})()`);
const danger = /删除|移除|归档|退出|注销|清除|重置|关闭账户|打开文件夹|邀请|分享|外部|VS Code|浏览器|帮助|创建项目|安装|更新|重新加载|重试|ChatGPT|返回|切换|查看|选择|导入|添加|编辑|打开|连接|购买|充值|支付|自动充值|额度|PHP|USD|优惠/i;
const pages = [];
const skipped = [];
const auditControls = async scope => {
  const controls = await evaluate(`(() => {
    const visible = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 8 && r.height > 8 && r.x > 400 && r.y >= 0 && r.y < innerHeight && r.x < innerWidth && s.visibility !== "hidden" && s.display !== "none"; };
    return [...document.querySelectorAll("button,[role=button],[role=menuitem],[role=tab],[role=checkbox],[role=switch],[role=combobox],summary,select")].filter(visible).filter(e => !e.hasAttribute("data-settings-panel-slug")).map(e => ({ aria: e.getAttribute("aria-label") || "", testid: e.getAttribute("data-testid") || "", text: (e.innerText || e.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 90) })).filter(x => x.aria || x.testid || x.text).filter((x, i, a) => a.findIndex(y => y.aria === x.aria && y.testid === x.testid && y.text === x.text) === i).slice(0, 40);
  })()`);
  if (!controls.length) throw Error(`No visible controls found on ${scope}`);
  let clicked = 0;
  for (const control of controls) {
    const label = [control.aria, control.text, control.testid].filter(Boolean).join(" / ");
    if (danger.test(label)) { skipped.push({ scope, label }); continue; }
    const point = control.aria ? await pointFor("aria", control.aria) : control.testid ? await pointFor("selector", `[data-testid=${JSON.stringify(control.testid)}]`) : await pointFor("text", control.text);
    if (!point || !(await clickPoint(point))) continue;
    clicked += 1;
    await sleep(waitMs);
    const result = await snapshot(`${scope}:${label}`);
    if (result.bad.length) throw Error(`Unstyled overlay after ${scope}:${label}: ${JSON.stringify(result.bad)}`);
    const hasOverlay = await evaluate(`[...document.querySelectorAll("[role=dialog],[role=menu],[role=listbox],[role=popover],[data-radix-popper-content-wrapper],[popover]")].some(e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && r.x + r.width > 0 && r.y + r.height > 0 && r.x < innerWidth && r.y < innerHeight && s.visibility !== "hidden" && s.display !== "none"; })`);
    if (hasOverlay) await escape();
    await sleep(100);
    if (!(await evaluate("Boolean(document.querySelector('[data-settings-panel-slug]'))"))) await openSettings();
  }
  return { controls: controls.length, clicked };
};

await openSettings();
const slugs = await evaluate(`[...document.querySelectorAll("[data-settings-panel-slug]")].map(e => e.getAttribute("data-settings-panel-slug")).filter((x, i, a) => a.indexOf(x) === i)`) || [];
if (!slugs.length) throw Error("Settings navigation did not load");
for (const slug of slugs) {
  if (!(await evaluate("Boolean(document.querySelector('[data-settings-panel-slug]'))"))) await openSettings();
  if (!(await clickSelector(`[data-settings-panel-slug=${JSON.stringify(slug)}]`))) throw Error(`Settings item not clickable: ${slug}`);
  await sleep(650);
  const page = await snapshot(`settings/${slug}`);
  const result = await auditControls(`settings/${slug}`);
  pages.push({ slug, page, controls: result.controls, clicked: result.clicked, bad: page.bad });
}
const bad = pages.flatMap(page => page.bad.map(item => ({ slug: page.slug, ...item })));
const totalControls = pages.reduce((sum, page) => sum + page.clicked, 0);
console.log(JSON.stringify({ ok: bad.length === 0 && totalControls > 0, slugs: slugs.length, controls: totalControls, bad, skipped: skipped.length, pages }, null, 2));
ws.close();
if (bad.length || totalControls === 0) process.exit(1);
