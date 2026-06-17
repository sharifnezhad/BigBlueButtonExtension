// BBB Floating Controls
// Loads on every page but only activates when it detects the BigBlueButton
// HTML5 client. Controls work by clicking BBB's real buttons (located via
// data-test attributes), so state always stays in sync with the meeting.

(() => {
  "use strict";

  if (window.__bbbPipLoaded) return;
  window.__bbbPipLoaded = true;

  // --- BBB client selectors (versions 2.4 - 3.x) -----------------------------
  const SEL = {
    muteMic:    '[data-test="muteMicButton"]',
    unmuteMic:  '[data-test="unmuteMicButton"]',
    joinAudio:  '[data-test="joinAudio"]',
    leaveAudio: '[data-test="leaveAudio"], [data-test="leaveListenOnly"]',
    joinVideo:  '[data-test="joinVideo"]',
    leaveVideo: '[data-test="leaveVideo"]',
    startSS:    '[data-test="startScreenShare"]',
    stopSS:     '[data-test="stopScreenShare"]',
    reactionsBtn: '[data-test="reactionsButton"]',
    raiseHand:  '[data-test="raiseHandBtn"]',
    // Modals that need user interaction in the main tab (webcam/audio settings, ...)
    anyModal:   '[data-test="webcamSettingsModal"], [data-test="audioModal"], [aria-modal="true"], [role="dialog"]',
    appRoot:    '#app, [data-test="actionsBar"], [data-test="brandingArea"]',
  };

  const $ = (sel) => document.querySelector(sel);

  const isBBB = () =>
    !!$(SEL.appRoot) &&
    !!(
      $(SEL.muteMic) || $(SEL.unmuteMic) ||
      $(SEL.joinAudio) || $(SEL.leaveAudio) ||
      $(SEL.joinVideo) || $(SEL.leaveVideo) ||
      document.querySelector('[data-test="actionsBar"]')
    );

  // --- Current meeting state --------------------------------------------------
  function getState() {
    return {
      micMuted:       !!$(SEL.unmuteMic),
      micAvailable:   !!($(SEL.muteMic) || $(SEL.unmuteMic)),
      audioJoined:    !!($(SEL.leaveAudio) || $(SEL.muteMic) || $(SEL.unmuteMic)),
      camOn:          !!$(SEL.leaveVideo),
      camAvailable:   !!($(SEL.joinVideo) || $(SEL.leaveVideo)),
      ssOn:           !!$(SEL.stopSS),
      ssAvailable:    !!($(SEL.startSS) || $(SEL.stopSS)),
    };
  }

  // BBB's React components sometimes listen to pointer/mouse events rather
  // than click alone — simulate the full sequence so one press is enough.
  function realClick(el) {
    if (!el) return false;
    const opts = { bubbles: true, cancelable: true, composed: true, view: window };
    el.dispatchEvent(new PointerEvent("pointerdown", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.click();
    return true;
  }

  const clickIt = (sel) => realClick($(sel));

  // Return to the meeting tab — used when BBB opens a settings modal or the
  // browser asks for camera/screen permission; those are only visible there.
  function focusMeetingTab() {
    window.focus();
    closePip();
  }

  // Actions that require a dialog: focus the meeting tab first, then click
  // once the tab is visible so the modal / permission prompt opens in front.
  // Timers run in the main page, so closing the PiP does not cancel them.
  function dialogAction(sel) {
    focusMeetingTab();
    const tryClick = (left) => {
      if (clickIt(sel)) return;
      if (left > 0) setTimeout(() => tryClick(left - 1), 250);
    };
    setTimeout(() => tryClick(6), 150);
  }

  // Each reaction maps to the accessible-name / emoji-mart id fragments BBB may
  // use, so we can find the right button even when the rendered glyph differs
  // from ours (e.g. BBB's "smiley" is 😃 while a server might draw 😀).
  const REACTION_NAMES = {
    "✋": ["raisehand", "raise hand", "hand"],
    "😃": ["smiley", "smile", "grinning", "smiling"],
    "😐": ["neutral"],
    "🙁": ["sad", "frown", "slightly frowning"],
    "👍": ["thumbsup", "thumbs up", "thumbup", "+1"],
    "👎": ["thumbsdown", "thumbs down", "thumbdown", "-1"],
    "👏": ["applause", "clap"],
  };

  const VARIATION_SELECTOR = String.fromCharCode(0xfe0f);
  const stripVS = (s) =>
    (s || "").split(VARIATION_SELECTOR).join("").trim();

  // Collect every scrap of text/attribute that might carry the emoji or its
  // name — covers plain text, emoji-mart's <em-emoji native="…" id="…">, alt
  // text and aria-labels.
  function reactionBlob(el) {
    const a = (name) => (el.getAttribute && el.getAttribute(name)) || "";
    return (
      (el.textContent || "") + " " +
      a("native") + " " + a("id") + " " + a("data-id") + " " +
      a("aria-label") + " " + a("title") + " " + a("alt") + " " + a("data-test")
    );
  }

  const REACTION_CAND_SEL =
    'em-emoji, [class*="emoji"], button, [role="button"], [role="menuitem"], li, span[aria-label], img[alt]';
  const ACTIVE_SEL =
    '[aria-pressed="true"], [aria-checked="true"], [class*="selected" i], [class*="active" i]';

  // Candidate reaction elements, excluding participants' own reactions, chat
  // emojis, and the toolbar reactions button (which mirrors the active emoji).
  function reactionCandidates() {
    return [...document.querySelectorAll(REACTION_CAND_SEL)].filter(
      (c) =>
        !c.closest('[data-test^="userListItem"], [data-test="chatMessages"], [data-test="msgListItem"]') &&
        !c.closest('[data-test="reactionsButton"]')
    );
  }

  function matchesReaction(c, emoji) {
    const want = stripVS(emoji);
    const names = REACTION_NAMES[emoji] || [];
    const blob = reactionBlob(c);
    const norm = stripVS(blob).toLowerCase();
    return (
      (want && stripVS(blob).includes(want)) ||
      (names.length && names.some((n) => norm.includes(n)))
    );
  }

  // The element to actually click for a candidate. BBB toggles the reaction on
  // its menu item (a MUI <li>), so prefer that. Never return a bare container
  // div or the toolbar "Reactions" button: that button mirrors the active
  // emoji, and clicking it only opens the menu instead of toggling the
  // reaction off — which is exactly why clearing used to fail.
  function clickableFor(c) {
    const item = c.closest('li, [role="menuitem"]');
    if (item && item.offsetParent !== null) return item;
    const btn = c.closest('button, [role="button"], a');
    if (
      btn && btn.offsetParent !== null &&
      !btn.closest('[data-test="reactionsButton"]') &&
      !/reaction/i.test(btn.getAttribute("aria-label") || "")
    ) {
      return btn;
    }
    return null;
  }

  function findReaction(emoji) {
    for (const c of reactionCandidates()) {
      if (!matchesReaction(c, emoji)) continue;
      const el = clickableFor(c);
      if (el) return el;
    }
    return null;
  }

  // The element BBB marks as the *currently active* reaction, so we can clear
  // it even when re-selecting the plain emoji doesn't toggle it off.
  function findActiveReaction(emoji) {
    for (const c of reactionCandidates()) {
      if (!matchesReaction(c, emoji)) continue;
      const marked = c.matches(ACTIVE_SEL) ? c : c.closest(ACTIVE_SEL);
      if (marked) {
        const el = clickableFor(c);
        if (el) return el;
      }
    }
    return null;
  }

  // Send a reaction. The reactions bar may already be open (some BBB versions
  // keep it visible) — in that case click the emoji directly; otherwise open
  // the reactions menu first and click once it renders.
  function sendReaction(emoji) {
    const direct = findReaction(emoji);
    if (direct) { realClick(direct); return; }

    if (!clickIt(SEL.reactionsBtn)) {
      console.warn("[BBB-PiP] reactions button not found");
      return;
    }
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      const el = findReaction(emoji);
      if (el) {
        clearInterval(t);
        realClick(el);
      } else if (tries > 12) {
        clearInterval(t);
        console.warn("[BBB-PiP] reaction not found for", emoji);
      }
    }, 150);
  }

  // Clear/deactivate the active reaction. Prefers the element BBB flags as
  // selected/pressed; falls back to re-clicking the plain emoji (which toggles
  // it off on versions that support it).
  function clearReaction(emoji) {
    console.info("[BBB-PiP] clearReaction start:", emoji);
    const attempt = (where) => {
      const target = findActiveReaction(emoji) || findReaction(emoji);
      if (target) {
        console.info("[BBB-PiP] clear-click", where, "->", target.tagName,
          (target.getAttribute("class") || "").slice(0, 40));
        realClick(target);
        return true;
      }
      return false;
    };
    if (attempt("bar-open")) return;
    console.info("[BBB-PiP] menu closed; reactionsBtn present:", !!$(SEL.reactionsBtn));
    clickIt(SEL.reactionsBtn); // menu was closed — open it, then retry
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (attempt("after-reopen #" + tries)) { clearInterval(t); }
      else if (tries > 12) {
        clearInterval(t);
        console.warn("[BBB-PiP] clear failed: reaction emoji not found after reopening menu");
      }
    }, 150);
  }

  const actions = {
    toggleMic()   { $(SEL.unmuteMic) ? clickIt(SEL.unmuteMic) : clickIt(SEL.muteMic); },
    raiseHand() {
      if (!clickIt(SEL.raiseHand)) sendReaction("✋"); // some versions keep the hand inside the reactions menu
    },
    toggleAudio() {
      if ($(SEL.leaveAudio)) { clickIt(SEL.leaveAudio); }
      else { dialogAction(SEL.joinAudio); }
    },
    toggleCam() {
      if ($(SEL.leaveVideo)) { clickIt(SEL.leaveVideo); }
      else { dialogAction(SEL.joinVideo); }
    },
    toggleSS() {
      if ($(SEL.stopSS)) { clickIt(SEL.stopSS); }
      else { dialogAction(SEL.startSS); }
    },
  };

  // --- Sticker selection (10s auto-clear) -------------------------------------
  // BBB keeps a chosen reaction until you open the menu and remove it. Here the
  // sticker stays highlighted for STICKER_TIMEOUT, then we clear it on the BBB
  // side (re-selecting the same emoji toggles it off) and drop the highlight.
  const STICKER_TIMEOUT = 5000;
  let selectedSticker = null;   // the emoji currently marked as selected
  let stickerTimer = null;

  function paintSticker(emoji) {
    if (!uiRoot) return;
    // Skip the raise-hand button — it manages its own persistent highlight.
    uiRoot.querySelectorAll('.emoji:not([data-r="✋"])').forEach((b) => {
      b.classList.toggle("selected", !!emoji && b.dataset.r === emoji);
    });
  }

  function selectSticker(emoji) {
    if (stickerTimer) clearTimeout(stickerTimer);
    selectedSticker = emoji;
    paintSticker(emoji);
    console.info("[BBB-PiP] selectSticker:", emoji);
    sendReaction(emoji);
    stickerTimer = setTimeout(clearSticker, STICKER_TIMEOUT);
  }

  function clearSticker() {
    if (stickerTimer) { clearTimeout(stickerTimer); stickerTimer = null; }
    const emoji = selectedSticker;
    selectedSticker = null;
    paintSticker(null);
    if (emoji) clearReaction(emoji); // deactivate it in BBB
  }

  // --- SVG icons (Material Design paths) --------------------------------------
  const ICONS = {
    mic: '<path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5.91-3a1 1 0 0 0-1.98.18 4 4 0 0 1-7.86 0A1 1 0 0 0 6.09 11 6 6 0 0 0 11 16.92V19a1 1 0 0 0 2 0v-2.08A6 6 0 0 0 17.91 11z"/>',
    micOff: '<path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5a3 3 0 0 0-6 0v.18l5.98 5.99zM4.27 3 3 4.27l6.01 6.01V11a3 3 0 0 0 3 3c.23 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>',
    cam: '<path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/>',
    camOff: '<path d="M21 6.5l-4 4V7a1 1 0 0 0-1-1H9.82L21 17.18V6.5zM3.27 2 2 3.27 4.73 6H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z"/>',
    screen: '<path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM12 8l-4 4h3v4h2v-4h3l-4-4z"/>',
    screenOff: '<path d="M20 4H7.83l2 2H20v10.17l1.45 1.45c.34-.36.55-.85.55-1.4V6c0-1.1-.9-2-2-2zM2.81 1.39 1.39 2.81 2.59 4H2v14c0 1.1.9 2 2 2h15.17l1.61 1.61 1.42-1.42L2.81 1.39zM4 18V6h.59l5.41 5.41V13h1.59l1 1H11v2h2v-1.59L17.17 18H4z"/>',
    headset: '<path d="M12 3a9 9 0 0 0-9 9v7c0 1.1.9 2 2 2h3v-8H5v-1a7 7 0 0 1 14 0v1h-3v8h3c1.1 0 2-.9 2-2v-7a9 9 0 0 0-9-9z"/>',
    headsetOff: '<path d="M12 5a7 7 0 0 1 7 7v1h-3v3.17l5 5V12a9 9 0 0 0-14.86-6.86l1.45 1.45A6.97 6.97 0 0 1 12 5zM2.81 2.81 1.39 4.22l2.7 2.7A8.96 8.96 0 0 0 3 12v7c0 1.1.9 2 2 2h3v-8H5v-1c0-1.06.24-2.07.66-2.97L16.78 20.16l3 3 1.41-1.41L2.81 2.81z"/>',
    pip: '<path d="M19 7h-8v6h8V7zm4 12V5c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z"/>',
    back: '<path d="M19 19H5V5h7V3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>',
  };

  const svg = (name, size = 22) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICONS[name]}</svg>`;

  // --- Floating window (Document Picture-in-Picture) ---------------------------
  let pipWin = null;
  let pollTimer = null;

  // Document PiP is Chromium-only. On Firefox (and any browser without it) we
  // fall back to an in-page panel; the active surface is tracked by these.
  const hasDocPiP = "documentPictureInPicture" in window;
  let uiRoot = null; // Document (PiP) or ShadowRoot (panel) used for queries
  let uiDoc = null;  // owning Document, for createElement
  let uiBody = null; // the ".pip-surface" element (window body or panel div)

  // One fixed window size for all states. The video area simply expands into
  // the free space when a video is playing; otherwise controls are centered.
  const PIP_W = 360;
  const PIP_H = 380;

  let settled = false;   // geometry verified at target size/position?
  let adjusting = false; // a resize we triggered ourselves (vs. the user's)

  // Chrome sometimes silently ignores resizeTo/moveTo without a user gesture,
  // so we measure the real geometry and retry until the window actually sits
  // in the bottom-right corner at the right size. Once verified, we never
  // touch it again so the user can freely move or resize it.
  function applyGeometry(win) {
    if (!win || win.closed) return;
    const margin = 16;
    // availLeft/availTop matter on multi-monitor setups: moveTo takes global
    // coordinates; without the offset the window lands on the primary monitor.
    const scr = win.screen;
    const tx = (scr.availLeft ?? 0) + Math.max(0, scr.availWidth - PIP_W - margin);
    const ty = (scr.availTop ?? 0) + Math.max(0, scr.availHeight - PIP_H - margin);

    const sizeOk =
      Math.abs(win.outerWidth - PIP_W) < 40 && Math.abs(win.outerHeight - PIP_H) < 40;
    const posOk =
      Math.abs(win.screenX - tx) < 40 && Math.abs(win.screenY - ty) < 40;

    if (sizeOk && posOk) {
      settled = true;
      return;
    }
    adjusting = true;
    try { if (!sizeOk) win.resizeTo(PIP_W, PIP_H); } catch { /* needs user gesture */ }
    try { if (!posOk) win.moveTo(tx, ty); } catch { /* needs user gesture */ }
    setTimeout(() => { adjusting = false; }, 120);
  }

  // Some BBB versions always keep a visible dialog element in the page; only
  // a modal that appears *after* the PiP opened should send us back.
  let modalBaseline = new Set();
  const visibleModals = () =>
    [...document.querySelectorAll(SEL.anyModal)].filter((m) => m.offsetParent !== null);
  const hasNewModal = () => visibleModals().some((m) => !modalBaseline.has(m));

  // Component styles shared by both surfaces: the Document-PiP window (Chrome)
  // and the in-page fallback panel (Firefox). The flex container is always
  // ".pip-surface" so the same markup works inside a window body or a shadow
  // root div.
  const COMMON_CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .pip-surface {
      font-family: Vazirmatn, Tahoma, "Segoe UI", sans-serif;
      background: #131418; color: #e8eaed; direction: rtl;
      display: flex; flex-direction: column; overflow: hidden;
      user-select: none;
    }
    .pip-surface.compact { justify-content: center; }

    .video-wrap { flex: 1 1 auto; min-height: 0; background: #000; display: none; position: relative; }
    .video-wrap.show { display: block; }
    .video-wrap video, .video-wrap img.slide {
      width: 100%; height: 100%; object-fit: contain; display: none;
    }
    .video-wrap.mode-video video { display: block; object-fit: cover; }
    .video-wrap.mode-slide img.slide { display: block; }

    .header {
      flex: none; display: flex; align-items: center; gap: 8px;
      padding: 10px 14px 2px;
    }
    .live-dot {
      width: 8px; height: 8px; border-radius: 50%; flex: none;
      background: #34a853;
      box-shadow: 0 0 0 0 rgba(52,168,83,.55);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%   { box-shadow: 0 0 0 0 rgba(52,168,83,.55); }
      70%  { box-shadow: 0 0 0 7px rgba(52,168,83,0); }
      100% { box-shadow: 0 0 0 0 rgba(52,168,83,0); }
    }
    .title {
      font-size: 12px; color: #bdc1c6; flex: 1; min-width: 0;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .back {
      flex: none; display: flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 50%;
      border: none; background: transparent; color: #9aa0a6; cursor: pointer;
      transition: background .15s, color .15s;
    }
    .back:hover { background: rgba(255,255,255,.08); color: #e8eaed; }

    .reactions {
      flex: none; display: flex; gap: 6px; justify-content: center; align-items: center;
      padding: 8px 10px 0;
    }
    .emoji {
      flex: none; width: 32px; height: 32px; border-radius: 50%;
      border: none; cursor: pointer; font-size: 17px; line-height: 1;
      background: transparent; color: #e8eaed;
      display: flex; align-items: center; justify-content: center;
      transition: background .15s, transform .12s;
    }
    .emoji:hover { background: rgba(255,255,255,.1); transform: scale(1.18); }
    .emoji:active { transform: scale(.9); }
    /* Visually marks the sticker chosen from the floating window. Auto-clears
       after a timeout (see STICKER_TIMEOUT) so it mirrors BBB's own state. */
    .emoji.selected {
      background: #1a73e8; color: #fff;
      box-shadow: 0 0 0 2px rgba(138,180,248,.55);
    }
    .emoji.selected:hover { background: #1a7fe8; }

    .controls {
      flex: none; display: flex; gap: 14px; justify-content: center; align-items: flex-start;
      padding: 10px 12px 12px;
    }
    .btn-wrap { display: flex; flex-direction: column; align-items: center; gap: 5px; }
    .label { font-size: 10.5px; color: #9aa0a6; }

    .ctl {
      width: 50px; height: 50px; border-radius: 50%;
      border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      background: #303134; color: #e8eaed;
      transition: background .18s, transform .1s, box-shadow .18s;
    }
    .ctl:hover:not(:disabled) { background: #3c4043; }
    .ctl:active:not(:disabled) { transform: scale(.92); }
    .ctl:focus-visible { outline: 2px solid #8ab4f8; outline-offset: 2px; }
    .ctl.off {
      background: #ea4335; color: #fff;
      box-shadow: 0 2px 10px rgba(234,67,53,.35);
    }
    .ctl.off:hover:not(:disabled) { background: #f25b4e; }
    .ctl:disabled { opacity: .3; cursor: not-allowed; }

    #toasts {
      position: absolute; top: 8px; right: 8px; left: 8px; z-index: 10;
      display: flex; flex-direction: column; gap: 6px; pointer-events: none;
    }
    .toast {
      background: rgba(32,33,36,.96); border: 1px solid rgba(255,255,255,.09);
      border-radius: 10px; padding: 7px 10px;
      font-size: 11.5px; color: #e8eaed; line-height: 1.5;
      overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      opacity: 0; transform: translateY(-6px);
      animation: toast-in .25s forwards;
    }
    .toast b { color: #8ab4f8; font-weight: 600; margin-left: 5px; }
    @keyframes toast-in { to { opacity: 1; transform: none; } }
    .toast.hide { transition: opacity .35s, transform .35s; opacity: 0; transform: translateY(-6px); }
  `;

  // Document-PiP window: the surface fills the whole window.
  const PIP_CSS = `
    :root { color-scheme: dark; }
    html, body { height: 100%; }
    body.pip-surface { height: 100%; }
  ` + COMMON_CSS;

  // In-page fallback panel (Firefox / browsers without Document PiP): the
  // surface lives in a fixed, draggable box rendered inside a shadow root so
  // BBB's own styles can't leak in.
  const PANEL_CSS = `
    :host {
      all: initial; position: fixed; bottom: 16px; left: 16px;
      width: 340px; height: 380px; z-index: 2147483600; color-scheme: dark;
    }
    .pip-surface {
      height: 100%; border-radius: 12px;
      box-shadow: 0 10px 34px rgba(0,0,0,.55);
      border: 1px solid rgba(255,255,255,.08);
    }
    .header { cursor: move; }
  ` + COMMON_CSS;

  // The inner markup is identical for both surfaces.
  function surfaceMarkup() {
    return `
      <div id="toasts"></div>
      <div class="video-wrap"><video autoplay playsinline muted></video><img class="slide" alt=""></div>
      <div class="header">
        <span class="live-dot" title="جلسه در جریان است"></span>
        <span class="title">${escapeHtml(document.title || "BigBlueButton")}</span>
        <button class="back" id="back" title="بستن" aria-label="بستن">${svg("back", 16)}</button>
      </div>
      <div class="reactions" id="reactions">
        <button class="emoji" data-r="✋" title="بالا بردن دست" aria-label="بالا بردن دست">✋</button>
        <button class="emoji" data-r="😃" aria-label="ری‌اکشن 😃">😃</button>
        <button class="emoji" data-r="😐" aria-label="ری‌اکشن 😐">😐</button>
        <button class="emoji" data-r="🙁" aria-label="ری‌اکشن 🙁">🙁</button>
        <button class="emoji" data-r="👍" aria-label="ری‌اکشن 👍">👍</button>
        <button class="emoji" data-r="👎" aria-label="ری‌اکشن 👎">👎</button>
        <button class="emoji" data-r="👏" aria-label="ری‌اکشن 👏">👏</button>
      </div>
      <div class="controls">
        <div class="btn-wrap">
          <button class="ctl" id="mic" aria-label="میکروفون"></button>
          <div class="label" id="mic-label">میکروفون</div>
        </div>
        <div class="btn-wrap">
          <button class="ctl" id="cam" aria-label="دوربین"></button>
          <div class="label" id="cam-label">دوربین</div>
        </div>
        <div class="btn-wrap">
          <button class="ctl" id="ss" aria-label="اشتراک صفحه"></button>
          <div class="label">اشتراک صفحه</div>
        </div>
        <div class="btn-wrap">
          <button class="ctl" id="audio" aria-label="اتصال صدا"></button>
          <div class="label">صدا</div>
        </div>
      </div>
    `;
  }

  // Wire up the controls inside a surface (window document or shadow root).
  // onBack is what the close/back button does — return to the meeting tab for
  // the PiP window, or hide the panel in the fallback.
  function bindControls(root, onBack) {
    root.getElementById("mic").addEventListener("click", actions.toggleMic);
    root.getElementById("cam").addEventListener("click", actions.toggleCam);
    root.getElementById("ss").addEventListener("click", actions.toggleSS);
    root.getElementById("audio").addEventListener("click", actions.toggleAudio);
    root.getElementById("back").addEventListener("click", onBack);

    root.getElementById("reactions").addEventListener("click", (e) => {
      const btn = e.target.closest(".emoji");
      if (!btn) return;
      const emoji = btn.dataset.r;
      if (emoji === "✋") {
        // Raise hand keeps its own BBB state and must NOT auto-clear — just
        // toggle the highlight to mirror it; the user lowers it manually.
        actions.raiseHand();
        btn.classList.toggle("selected");
        return;
      }
      // Clicking the already-selected sticker clears it immediately
      if (btn.classList.contains("selected")) clearSticker();
      else selectSticker(emoji);
    });
  }

  function buildPipUI(win) {
    const doc = win.document;
    doc.documentElement.lang = "fa";
    const style = doc.createElement("style");
    style.textContent = PIP_CSS;
    doc.head.appendChild(style);

    doc.body.className = "pip-surface";
    doc.body.innerHTML = surfaceMarkup();

    uiRoot = doc; uiDoc = doc; uiBody = doc.body;
    bindControls(doc, focusMeetingTab);

    // Any user interaction is a valid gesture to apply pending geometry —
    // but only while not settled, so we never fight a user's manual resize.
    doc.addEventListener("pointerdown", () => { if (!settled) applyGeometry(win); }, true);
    doc.addEventListener("keydown", () => { if (!settled) applyGeometry(win); }, true);

    syncUI();
  }

  // --- In-page fallback panel (Firefox: no Document PiP API) -------------------
  let panelHost = null;
  let panelPoll = null;

  function openPanel() {
    if (panelHost) return;
    const host = document.createElement("div");
    host.id = "bbb-pip-panel";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = PANEL_CSS;
    shadow.appendChild(style);
    const surface = document.createElement("div");
    surface.className = "pip-surface";
    surface.innerHTML = surfaceMarkup();
    shadow.appendChild(surface);
    document.body.appendChild(host);

    panelHost = host;
    uiRoot = shadow; uiDoc = document; uiBody = surface;

    bindControls(shadow, closePip);
    enablePanelDrag(host, shadow.querySelector(".header"));

    panelPoll = setInterval(syncUI, 400);
    syncUI();
  }

  // Drag the panel by its header. Coordinates are clamped to the viewport so it
  // can never be dragged fully off screen.
  function enablePanelDrag(host, handle) {
    if (!handle) return;
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    handle.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".back")) return; // let the close button work
      dragging = true;
      const r = host.getBoundingClientRect();
      ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY;
      host.style.bottom = "auto"; host.style.left = ox + "px"; host.style.top = oy + "px";
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const w = host.offsetWidth, h = host.offsetHeight;
      const nx = Math.min(Math.max(0, ox + e.clientX - sx), innerWidth - w);
      const ny = Math.min(Math.max(0, oy + e.clientY - sy), innerHeight - h);
      host.style.left = nx + "px"; host.style.top = ny + "px";
    });
    handle.addEventListener("pointerup", () => { dragging = false; });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // --- In-window notifications (chat messages, reactions, BBB toasts) ----------
  const TOAST_LIFETIME = 6000;

  function showPipToast(title, body) {
    if (!uiRoot) return;
    const box = uiRoot.getElementById("toasts");
    if (!box) return;

    const el = uiDoc.createElement("div");
    el.className = "toast";
    el.innerHTML =
      (title ? `<b>${escapeHtml(title)}:</b> ` : "") + escapeHtml(body || "");
    box.prepend(el);

    while (box.children.length > 3) box.lastChild.remove();

    setTimeout(() => {
      el.classList.add("hide");
      setTimeout(() => el.remove(), 400);
    }, TOAST_LIFETIME);
  }

  const seenItems = new WeakSet();

  // Strip timestamps (e.g. "2:29 PM", "14:05", Persian digits) from DOM text
  const stripTime = (s) =>
    (s || "")
      .replace(/[\d۰-۹]{1,2}:[\d۰-۹]{2}\s*(AM|PM|ق\.ظ|ب\.ظ)?/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();

  // Your own display name, read from BBB's user list — the current user's
  // entry is marked with "(You)" (or its localized form).
  const YOU_RE = /\((You|شما)\)/i;
  function getOwnName() {
    const cur =
      document.querySelector('[data-test="userListItemCurrent"]') ||
      [...document.querySelectorAll('[data-test^="userListItem"], [role="listitem"]')]
        .find((el) => YOU_RE.test(el.textContent));
    return stripTime(cur?.textContent || "").replace(YOU_RE, "").trim();
  }

  // Notifications are for other people's activity — skip your own
  function isSelf(name, holder) {
    if (holder && YOU_RE.test(holder.textContent)) return true;
    if (!name) return false;
    const own = getOwnName();
    return !!own && (name === own || own.startsWith(name) || name.startsWith(own));
  }

  function watchNotifications() {
    const MSG_SEL = '[data-test="msgListItem"], [data-test="chatMessages"] [role="listitem"]';
    const REACT_SEL = '[data-test*="eaction"]';

    // Messages already on the page are baseline, not new notifications
    document.querySelectorAll(MSG_SEL).forEach((m) => seenItems.add(m));

    new MutationObserver((muts) => {
      const freshMsgs = [];
      for (const mu of muts) {
        for (const n of mu.addedNodes) {
          if (n.nodeType !== 1) continue;

          // 1) BBB's own toast notifications (react-toastify)
          const toast = n.matches?.(".Toastify__toast") ? n : n.querySelector?.(".Toastify__toast");
          if (toast && !seenItems.has(toast)) {
            seenItems.add(toast);
            const txt = toast.textContent.trim();
            if (txt) showPipToast("", txt.slice(0, 140));
            continue;
          }

          // 2) Participant reactions / stickers
          const reacts = [];
          if (n.matches?.(REACT_SEL)) reacts.push(n);
          n.querySelectorAll?.(REACT_SEL).forEach((r) => reacts.push(r));
          for (const r of reacts) {
            if (seenItems.has(r)) continue;
            seenItems.add(r);
            const txt = r.textContent.trim();
            if (!txt || txt.length > 30) continue;
            const holder = r.closest('[data-test="userListItem"], [role="listitem"]');
            const name = stripTime(
              holder?.querySelector('[data-test="userListItemName"], [aria-label]')
                ?.textContent
            );
            if (isSelf(name, holder)) continue; // your own reaction — skip
            showPipToast(name && name.length <= 40 ? name : "", txt);
          }

          // 3) Chat messages
          const items = [];
          if (n.matches?.(MSG_SEL)) items.push(n);
          n.querySelectorAll?.(MSG_SEL).forEach((i) => items.push(i));
          for (const it of items) {
            if (seenItems.has(it)) continue;
            seenItems.add(it);
            freshMsgs.push(it);
          }
        }
      }

      // A large batch means the chat panel remounted, not new messages
      if (freshMsgs.length === 0 || freshMsgs.length > 3) return;

      for (const it of freshMsgs) {
        const name = stripTime(
          it.querySelector('[data-test="chatUserName"], [data-test="chatMessageUserName"]')
            ?.textContent
        );
        let text =
          it.querySelector('[data-test="chatMessageText"], [data-test="messageContent"]')
            ?.textContent?.trim() || stripTime(it.textContent);
        // If the text came from the whole item, drop the leading sender name
        if (name && text.startsWith(name)) text = text.slice(name.length).trim();
        if (text) showPipToast(name, text.slice(0, 140));
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  // Mirror an active meeting video (webcam or screen share) into the window.
  // Only videos actually rendered on the BBB page count — hidden or leftover
  // elements with live tracks must not trigger the video area.
  function pickSourceVideo() {
    const vids = [...document.querySelectorAll("video")].filter(
      (v) =>
        v.srcObject &&
        v.srcObject.getVideoTracks?.().some((t) => t.readyState === "live") &&
        v.offsetParent !== null &&
        v.clientWidth > 40 &&
        v.clientHeight > 40
    );
    if (!vids.length) return null;
    // Largest video (usually the presentation or main webcam)
    return vids.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  }

  // A shared PDF / presentation is not a <video> — BBB renders the current
  // slide as an <image> (or <img>) inside the whiteboard. Mirror that slide
  // as a still image so the floating window shows what is being presented,
  // even when no screen share / webcam stream exists.
  function pickSlideImage() {
    const container =
      document.querySelector(
        '[data-test="presentationContainer"], [data-test="whiteboard"], svg[data-test="whiteboard"], #whiteboard'
      ) || document.body;
    const cands = [...container.querySelectorAll("image, img")].filter((im) => {
      const href = im.getAttribute("href") || im.getAttribute("xlink:href") || im.currentSrc || im.src;
      if (!href) return false;
      const r = im.getBoundingClientRect();
      return r.width > 60 && r.height > 60 && im.checkVisibility?.() !== false;
    });
    if (!cands.length) return null;
    const best = cands.sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return rb.width * rb.height - ra.width * ra.height;
    })[0];
    return best.getAttribute("href") || best.getAttribute("xlink:href") || best.currentSrc || best.src;
  }

  function syncUI() {
    const doc = uiRoot;
    if (!doc) return;
    if (pipWin) {
      if (pipWin.closed) return;
      if (!settled) applyGeometry(pipWin);
    }
    const st = getState();

    const mic = doc.getElementById("mic");
    const cam = doc.getElementById("cam");
    const ss = doc.getElementById("ss");
    const audio = doc.getElementById("audio");
    if (!mic) return;

    mic.classList.toggle("off", st.micMuted);
    mic.innerHTML = svg(st.micMuted ? "micOff" : "mic");
    mic.disabled = !st.micAvailable;
    mic.title = st.micMuted ? "وصل کردن میکروفون" : "قطع میکروفون";
    doc.getElementById("mic-label").textContent = st.micMuted ? "بی‌صدا" : "میکروفون";

    cam.classList.toggle("off", !st.camOn);
    cam.innerHTML = svg(st.camOn ? "cam" : "camOff");
    cam.disabled = !st.camAvailable;
    cam.title = st.camOn ? "خاموش کردن دوربین" : "روشن کردن دوربین";
    doc.getElementById("cam-label").textContent = st.camOn ? "دوربین" : "خاموش";

    ss.classList.toggle("off", !st.ssOn);
    ss.innerHTML = svg(st.ssOn ? "screen" : "screenOff");
    ss.disabled = !st.ssAvailable;
    ss.title = st.ssOn ? "توقف اشتراک صفحه" : "اشتراک صفحه";

    audio.classList.toggle("off", !st.audioJoined);
    audio.innerHTML = svg(st.audioJoined ? "headset" : "headsetOff");
    audio.title = st.audioJoined ? "قطع اتصال صدا" : "اتصال صدا";

    // A new modal (webcam/audio settings, ...) needs the main tab — only
    // relevant for the PiP window; the in-page panel is already on that tab.
    if (pipWin && hasNewModal()) {
      focusMeetingTab();
      return;
    }

    // Mirroring — window size never changes, the media area just fills the
    // spare space above the controls. A live <video> (webcam / screen share)
    // wins; otherwise fall back to the presentation slide image (shared PDF).
    const wrap = doc.querySelector(".video-wrap");
    const pipVideo = wrap.querySelector("video");
    const pipImg = wrap.querySelector("img.slide");
    const src = pickSourceVideo();

    if (src) {
      if (pipVideo.srcObject !== src.srcObject) pipVideo.srcObject = src.srcObject;
      wrap.classList.add("show", "mode-video");
      wrap.classList.remove("mode-slide");
    } else {
      if (pipVideo.srcObject) pipVideo.srcObject = null;
      const slide = pickSlideImage();
      if (slide) {
        if (pipImg.getAttribute("src") !== slide) pipImg.src = slide;
        wrap.classList.add("show", "mode-slide");
        wrap.classList.remove("mode-video");
      } else {
        if (pipImg.getAttribute("src")) pipImg.removeAttribute("src");
        wrap.classList.remove("show", "mode-video", "mode-slide");
      }
    }
    // Center the controls when nothing is displayed
    uiBody.classList.toggle("compact", !wrap.classList.contains("show"));
  }

  async function openPip() {
    if (!hasDocPiP) {
      // No Document PiP (e.g. Firefox) — show the in-page panel instead.
      openPanel();
      return;
    }
    if (pipWin && !pipWin.closed) return;

    // Snapshot modals that are already visible
    modalBaseline = new Set(visibleModals());

    // No preferInitialWindowPlacement on purpose: Chrome remembers the last
    // window position/size, and since we always settle the window in the
    // bottom-right corner, later opens (even without a gesture) start there.
    // Wrong geometry is corrected by the applyGeometry measuring loop.
    let win;
    try {
      win = await documentPictureInPicture.requestWindow({
        width: PIP_W,
        height: PIP_H,
      });
    } catch {
      // Document PiP needs transient user activation. When the user switches
      // away to another app without a recent gesture Chrome rejects the open;
      // the priming click and the mediaSession handler cover the common paths.
      return;
    }
    pipWin = win;

    // A resize we did not trigger ourselves means the user resized the
    // window manually — stop enforcing geometry for good so clicking a
    // button never snaps the window back to the default size.
    win.addEventListener("resize", () => {
      if (!adjusting) settled = true;
    });

    // Verify/correct geometry aggressively for the first few seconds —
    // Chrome sometimes refuses moves right after opening.
    settled = false;
    applyGeometry(win);
    let burstTries = 0;
    const burst = setInterval(() => {
      if (!pipWin || win.closed || settled || ++burstTries > 30) {
        clearInterval(burst);
        return;
      }
      applyGeometry(win);
    }, 150);
    buildPipUI(win);

    // The window may already be closed by the first sync (e.g. a new modal)
    if (!pipWin || win.closed) return;

    pollTimer = setInterval(syncUI, 400);
    win.addEventListener("pagehide", () => {
      clearInterval(pollTimer);
      if (pipWin === win) {
        pipWin = null;
        uiRoot = uiDoc = uiBody = null;
      }
    });
  }

  function closePip() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (panelPoll) { clearInterval(panelPoll); panelPoll = null; }
    if (pipWin && !pipWin.closed) pipWin.close();
    pipWin = null;
    if (panelHost) { panelHost.remove(); panelHost = null; }
    uiRoot = uiDoc = uiBody = null;
  }

  // --- Auto-open: keep a floating window available for the whole meeting -------
  function registerAutoPip() {
    // Chrome invokes this when a tab using the mic/camera is hidden and
    // allows opening a PiP window without a user click.
    try {
      navigator.mediaSession.setActionHandler("enterpictureinpicture", () => openPip());
    } catch {
      // Older Chrome doesn't know this action — the manual button still works
    }

    // The floating window opens when the user leaves the meeting tab and closes
    // again when they come back to it. It is not opened up front. Chrome's
    // mediaSession handler above opens it without a gesture on tab switch; the
    // blur listener also tries on an app switch (best-effort — Chrome may
    // require a recent gesture). Firefox has no PiP window, so its in-page
    // panel is opened on demand from the launcher button instead.
    if (hasDocPiP) {
      const onLeave = () => openPip();
      const onReturn = () => closePip();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") onReturn();
        else onLeave();
      });
      window.addEventListener("blur", onLeave);
      window.addEventListener("focus", onReturn);
    }
  }

  // --- Launcher button on the BBB page itself -----------------------------------
  function injectLauncherButton() {
    if (document.getElementById("bbb-pip-launcher")) return;
    const btn = document.createElement("button");
    btn.id = "bbb-pip-launcher";
    btn.title = "باز کردن پنجره شناور کنترل جلسه";
    btn.setAttribute("aria-label", "باز کردن پنجره شناور کنترل جلسه");
    btn.innerHTML = svg("pip", 20);
    Object.assign(btn.style, {
      position: "fixed", bottom: "16px", left: "16px", zIndex: "99999",
      width: "44px", height: "44px", borderRadius: "50%", border: "none",
      background: "#0f70d7", color: "#fff", cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 3px 10px rgba(0,0,0,.35)",
      transition: "transform .12s, box-shadow .12s, background .15s",
    });
    btn.addEventListener("mouseenter", () => {
      btn.style.transform = "scale(1.08)";
      btn.style.background = "#1a7fe8";
      btn.style.boxShadow = "0 5px 14px rgba(0,0,0,.45)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "scale(1)";
      btn.style.background = "#0f70d7";
      btn.style.boxShadow = "0 3px 10px rgba(0,0,0,.35)";
    });
    // Toggle: open the floating window / panel, or close it if already open.
    btn.addEventListener("click", () => {
      const open = (pipWin && !pipWin.closed) || panelHost;
      if (open) closePip(); else openPip();
    });
    document.body.appendChild(btn);
  }

  // --- Bootstrap: wait until the BBB client is loaded ----------------------------
  let attempts = 0;
  const detectTimer = setInterval(() => {
    attempts++;
    if (isBBB()) {
      clearInterval(detectTimer);
      console.info("[BBB-PiP] BigBlueButton client detected — floating controls active.");
      registerAutoPip();
      watchNotifications();
      injectLauncherButton();
      // Keep the launcher alive if BBB re-renders its UI mid-meeting
      new MutationObserver(() => injectLauncherButton())
        .observe(document.body, { childList: true, subtree: true });
    } else if (attempts > 60) {
      clearInterval(detectTimer); // not a BBB page
    }
  }, 2000);
})();
