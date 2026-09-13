((cssText, selectorContract, theme, artDataUrl, petIconDataUrl) => {
  const STATE_KEY = "__CODEX_MELODY_SKIN_STATE__";
  const STYLE_ID = "codex-melody-theme-v2";
  const PART_ATTR = "data-melody-part";
  const root = document.documentElement;
  const body = document.body;
  const path = String(location.pathname || "");
  const route = new URLSearchParams(String(location.search || "")).get("initialRoute") || "";
  const isPetSurface = route === "/avatar-overlay" || route.startsWith("/avatar-overlay/")
    || path.includes("avatar-overlay-composition-surface");
  const layout = String(theme?.image || "").includes("standard-right") ? "right" : "centered";
  const previous = window[STATE_KEY];
  if (isPetSurface) {
    if (typeof previous?.cleanup === "function") previous.cleanup();
    // The compact quick-input surface intentionally stays outside the full
    // skin so the native pet renderer remains untouched. It still inherits
    // Codex's vertical fade-mask on the rich-text shell, which appears as
    // two pink edge bars over the centered background. Remove only that
    // decoration on the compact composer.
    const compactStyleId = "codex-melody-compact-fixes";
    let compactStyle = document.getElementById(compactStyleId);
    if (!compactStyle) {
      compactStyle = document.createElement("style");
      compactStyle.id = compactStyleId;
      compactStyle.dataset.owner = "codex-melody-skin";
    }
    compactStyle.textContent = `
      html.compact-window :is(input, textarea, [contenteditable="true"], [class*="_ComposerLayoutRoot_"], [class*="_ComposerLayoutBody_"], [class*="_ComposerLayoutInput_"], [class*="_RichTextInput_"], [class*="vertical-scroll-fade-mask"], [class*="_Material_"], [class*="_QuickChatMaterial_"], .ProseMirror, .placeholder),
      html.compact-window :is(input, textarea, [contenteditable="true"], [class*="_ComposerLayoutRoot_"], [class*="_ComposerLayoutBody_"], [class*="_ComposerLayoutInput_"], [class*="_RichTextInput_"], [class*="vertical-scroll-fade-mask"], [class*="_Material_"], [class*="_QuickChatMaterial_"], .ProseMirror, .placeholder)::before,
      html.compact-window :is(input, textarea, [contenteditable="true"], [class*="_ComposerLayoutRoot_"], [class*="_ComposerLayoutBody_"], [class*="_ComposerLayoutInput_"], [class*="_RichTextInput_"], [class*="vertical-scroll-fade-mask"], [class*="_Material_"], [class*="_QuickChatMaterial_"], .ProseMirror, .placeholder)::after {
        border: 0 !important;
        background-color: rgba(255, 249, 252, .20) !important;
        background-image: none !important;
        mask-image: none !important;
        -webkit-mask-image: none !important;
        outline: none !important;
        box-shadow: none !important;
      }
    `;
    if (!compactStyle.parentElement) (document.head || root).appendChild(compactStyle);
    return { ok: false, excluded: true, reason: "pet-surface", compactFix: true };
  }
  if (!root) return { ok: false, excluded: true, reason: "no-document-root" };

  // The watcher may revisit the same renderer every few seconds. Reusing the
  // installed sheet is essential: tearing it down first creates a visible
  // one-frame unstyled gap, which is perceived as a screen flash. A tiny hash
  // lets a genuinely changed build take the replacement path.
  const hash = input => { let h = 2166136261; for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 16777619); return (h >>> 0).toString(16); };
  const cssHash = hash(`${cssText}\u0000${JSON.stringify(theme || {})}\u0000${artDataUrl || ""}\u0000${petIconDataUrl || ""}`);
  if (previous?.themeId === (theme?.id || "melody-sakura-desk") && previous?.cssHash === cssHash && previous.isAlive?.()) {
    previous.ensure?.();
    return { ok: true, reused: true, themeId: previous.themeId, styleMode: previous.styleMode, markedParts: previous.markedParts };
  }
  if (typeof previous?.cleanup === "function") previous.cleanup();

  let styleNode = null;
  let styleSheet = null;
  let observer = null;
  let refreshTimer = null;
  let navigation = null;
  let bodyReadyHandler = null;
  const marked = new Set();
  const contract = Array.isArray(selectorContract?.selectors) ? selectorContract.selectors : [];
  const objectUrl = dataUrl => dataUrl ? (() => {
    try {
      const comma = dataUrl.indexOf(",");
      const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] || "image/png";
      const binary = atob(dataUrl.slice(comma + 1));
      const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
      return URL.createObjectURL(new Blob([bytes], { type: mime }));
    } catch { return null; }
  })() : null;
  const artUrl = objectUrl(artDataUrl);
  const petIconUrl = objectUrl(petIconDataUrl);

  const cleanup = () => {
    observer?.disconnect();
    if (refreshTimer) clearInterval(refreshTimer);
    if (navigation) try { navigation.removeEventListener("navigate", schedule); } catch {}
    if (bodyReadyHandler) document.removeEventListener("DOMContentLoaded", bodyReadyHandler);
    for (const node of marked) node.removeAttribute(PART_ATTR);
    marked.clear();
    root.removeAttribute("data-melody-skin");
    root.removeAttribute("data-melody-shell");
    root.removeAttribute("data-melody-layout");
    body?.removeAttribute("data-melody-skin");
    for (const property of [...root.style]) if (property.startsWith("--melody-") || property === "--codex-titlebar-tint") root.style.removeProperty(property);
    if (styleSheet) try { document.adoptedStyleSheets = [...document.adoptedStyleSheets].filter(s => s !== styleSheet); } catch {}
    styleNode?.remove();
    if (artUrl) URL.revokeObjectURL(artUrl);
    if (petIconUrl) URL.revokeObjectURL(petIconUrl);
    if (window[STATE_KEY]?.cleanup === cleanup) delete window[STATE_KEY];
    return true;
  };

  const installStyle = () => {
    try {
      if (!("adoptedStyleSheets" in document) || typeof CSSStyleSheet !== "function") throw new Error("no adoptedStyleSheets");
      styleSheet = new CSSStyleSheet();
      styleSheet.replaceSync(cssText);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, styleSheet];
    } catch {
      styleSheet = null;
      styleNode = document.getElementById(STYLE_ID) || document.createElement("style");
      styleNode.id = STYLE_ID;
      styleNode.dataset.owner = "codex-melody-skin";
      styleNode.textContent = cssText;
      if (!styleNode.parentElement) (document.head || root).appendChild(styleNode);
    }
  };
  const isAlive = () => Boolean((styleSheet && document.adoptedStyleSheets?.includes(styleSheet)) || (styleNode && styleNode.isConnected));
  const ensureStyle = () => {
    if (styleSheet) {
      try {
        if (!document.adoptedStyleSheets.includes(styleSheet)) {
          document.adoptedStyleSheets = [...document.adoptedStyleSheets, styleSheet];
        }
      } catch {}
      return;
    }
    if (styleNode && !styleNode.isConnected) (document.head || root).appendChild(styleNode);
  };

  const query = selector => { try { return [...document.querySelectorAll(selector)]; } catch { return []; } };
  const applyParts = () => {
    ensureStyle();
    root.setAttribute("data-melody-skin", "active");
    root.setAttribute("data-melody-layout", layout);
    body?.setAttribute("data-melody-skin", "active");
    if (artUrl) root.style.setProperty("--melody-art", `url("${artUrl}")`);
    root.style.setProperty("--codex-titlebar-tint", "rgba(255, 226, 239, .64)");
    if (petIconUrl) root.style.setProperty("--melody-pet-icon", `url("${petIconUrl}")`);
    const next = new Set();
    for (const entry of contract) {
      for (const node of query(entry.selector)) {
        if (node === root || node === body || node.closest?.("[data-avatar-overlay-native-surface-id], [data-avatar-mascot]")) continue;
        node.setAttribute(PART_ATTR, entry.key);
        next.add(node);
      }
    }
    for (const node of marked) if (!next.has(node)) node.removeAttribute(PART_ATTR);
    marked.clear(); for (const node of next) marked.add(node);
    if (window[STATE_KEY]) window[STATE_KEY].markedParts = marked.size;
  };
  let timer = null;
  function schedule() { if (timer) return; timer = setTimeout(() => { timer = null; applyParts(); }, 80); }
  installStyle();
  applyParts();
  if (typeof MutationObserver === "function") {
    observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true });
  }
  // Some Codex route panels are rendered through a portal without a mutation
  // visible to the original shell observer. Reconcile semantic parts cheaply
  // so settings, PR and plugin panels receive the skin after route switches.
  refreshTimer = setInterval(applyParts, 600);
  if (window.navigation && typeof window.navigation.addEventListener === "function") {
    navigation = window.navigation; navigation.addEventListener("navigate", schedule);
  }
  window[STATE_KEY] = {
    cleanup, ensure: applyParts, selectorsSchema: selectorContract?.schema || null,
    themeId: theme?.id || "melody-sakura-desk", version: theme?.version || "1.0.0",
    cssHash, isAlive,
    styleMode: styleSheet ? "adopted" : "style", markedParts: marked.size,
    artUrl, petIconUrl, layout, runtime: "semantic-parts-v1"
  };
  return { ok: true, themeId: theme?.id || "melody-sakura-desk", styleMode: styleSheet ? "adopted" : "style", markedParts: marked.size };
})(__MELODY_CSS__, __MELODY_SELECTORS__, __MELODY_THEME__, __MELODY_ART__, __MELODY_PET_ICON__)
