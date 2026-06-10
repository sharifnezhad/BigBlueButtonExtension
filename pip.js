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

  // Send a reaction: open BBB's reactions menu in the main page and click
  // the matching emoji inside it.
  function sendReaction(emoji) {
    if (!clickIt(SEL.reactionsBtn)) return;
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      const el = [...document.querySelectorAll('[role="menuitem"], button, li, [role="button"]')]
        .find((b) => b.textContent.trim() === emoji && b.offsetParent !== null);
      if (el) {
        clearInterval(t);
        realClick(el);
        showPipToast("شما", emoji);
      } else if (tries > 8) {
        clearInterval(t);
        clickIt(SEL.reactionsBtn); // close the menu — emoji not available on this server
      }
    }, 150);
  }

  const actions = {
    toggleMic()   { $(SEL.unmuteMic) ? clickIt(SEL.unmuteMic) : clickIt(SEL.muteMic); },
    raiseHand() {
      if (clickIt(SEL.raiseHand)) showPipToast("شما", "✋");
      else sendReaction("✋"); // some versions keep the hand inside the reactions menu
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

  // One fixed window size for all states. The video area simply expands into
  // the free space when a video is playing; otherwise controls are centered.
  const PIP_W = 360;
  const PIP_H = 380;

  let settled = false; // geometry verified at target size/position?

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
    try { if (!sizeOk) win.resizeTo(PIP_W, PIP_H); } catch { /* needs user gesture */ }
    try { if (!posOk) win.moveTo(tx, ty); } catch { /* needs user gesture */ }
  }

  // Some BBB versions always keep a visible dialog element in the page; only
  // a modal that appears *after* the PiP opened should send us back.
  let modalBaseline = new Set();
  const visibleModals = () =>
    [...document.querySelectorAll(SEL.anyModal)].filter((m) => m.offsetParent !== null);
  const hasNewModal = () => visibleModals().some((m) => !modalBaseline.has(m));

  const PIP_CSS = `
    :root { color-scheme: dark; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Vazirmatn, Tahoma, "Segoe UI", sans-serif;
      background: #131418; color: #e8eaed; direction: rtl;
      display: flex; flex-direction: column; height: 100vh; overflow: hidden;
      user-select: none;
    }
    body.compact { justify-content: center; }

    .video-wrap { flex: 1 1 auto; min-height: 0; background: #000; display: none; position: relative; }
    .video-wrap.show { display: block; }
    .video-wrap video { width: 100%; height: 100%; object-fit: cover; }

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

  function buildPipUI(win) {
    const doc = win.document;
    doc.documentElement.lang = "fa";
    const style = doc.createElement("style");
    style.textContent = PIP_CSS;
    doc.head.appendChild(style);

    doc.body.innerHTML = `
      <div id="toasts"></div>
      <div class="video-wrap"><video autoplay playsinline muted></video></div>
      <div class="header">
        <span class="live-dot" title="جلسه در جریان است"></span>
        <span class="title">${escapeHtml(document.title || "BigBlueButton")}</span>
        <button class="back" id="back" title="بازگشت به تب جلسه" aria-label="بازگشت به تب جلسه">${svg("back", 16)}</button>
      </div>
      <div class="reactions" id="reactions">
        <button class="emoji" data-r="✋" title="بالا بردن دست" aria-label="بالا بردن دست">✋</button>
        <button class="emoji" data-r="👍" aria-label="ری‌اکشن 👍">👍</button>
        <button class="emoji" data-r="👎" aria-label="ری‌اکشن 👎">👎</button>
        <button class="emoji" data-r="👏" aria-label="ری‌اکشن 👏">👏</button>
        <button class="emoji" data-r="😄" aria-label="ری‌اکشن 😄">😄</button>
        <button class="emoji" data-r="😮" aria-label="ری‌اکشن 😮">😮</button>
        <button class="emoji" data-r="❤️" aria-label="ری‌اکشن ❤️">❤️</button>
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

    doc.getElementById("mic").addEventListener("click", actions.toggleMic);
    doc.getElementById("cam").addEventListener("click", actions.toggleCam);
    doc.getElementById("ss").addEventListener("click", actions.toggleSS);
    doc.getElementById("audio").addEventListener("click", actions.toggleAudio);
    doc.getElementById("back").addEventListener("click", focusMeetingTab);

    doc.getElementById("reactions").addEventListener("click", (e) => {
      const btn = e.target.closest(".emoji");
      if (!btn) return;
      const emoji = btn.dataset.r;
      if (emoji === "✋") actions.raiseHand();
      else sendReaction(emoji);
    });

    // Keyboard shortcut: M toggles the microphone
    doc.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "m") actions.toggleMic();
    });

    // Any user interaction is a valid gesture to apply pending geometry —
    // but only while not settled, so we never fight a user's manual resize.
    doc.addEventListener("pointerdown", () => { if (!settled) applyGeometry(win); }, true);
    doc.addEventListener("keydown", () => { if (!settled) applyGeometry(win); }, true);

    syncPipUI();
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // --- In-window notifications (chat messages, reactions, BBB toasts) ----------
  const TOAST_LIFETIME = 6000;

  function showPipToast(title, body) {
    if (!pipWin || pipWin.closed) return;
    const doc = pipWin.document;
    const box = doc.getElementById("toasts");
    if (!box) return;

    const el = doc.createElement("div");
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

  function syncPipUI() {
    if (!pipWin || pipWin.closed) return;
    if (!settled) applyGeometry(pipWin);
    const doc = pipWin.document;
    const st = getState();

    const mic = doc.getElementById("mic");
    const cam = doc.getElementById("cam");
    const ss = doc.getElementById("ss");
    const audio = doc.getElementById("audio");
    if (!mic) return;

    mic.classList.toggle("off", st.micMuted);
    mic.innerHTML = svg(st.micMuted ? "micOff" : "mic");
    mic.disabled = !st.micAvailable;
    mic.title = st.micMuted ? "وصل کردن میکروفون (M)" : "قطع میکروفون (M)";
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

    // A new modal (webcam/audio settings, ...) needs the main tab
    if (hasNewModal()) {
      focusMeetingTab();
      return;
    }

    // Video mirroring — window size never changes, the video area just
    // fills the spare space above the controls.
    const wrap = doc.querySelector(".video-wrap");
    const pipVideo = wrap.querySelector("video");
    const src = pickSourceVideo();
    if (src && pipVideo.srcObject !== src.srcObject) {
      pipVideo.srcObject = src.srcObject;
      wrap.classList.add("show");
    } else if (!src && wrap.classList.contains("show")) {
      pipVideo.srcObject = null;
      wrap.classList.remove("show");
    }
    // Center the controls when no video is displayed
    doc.body.classList.toggle("compact", !wrap.classList.contains("show"));
  }

  async function openPip() {
    if (!("documentPictureInPicture" in window)) {
      console.warn("[BBB-PiP] Document PiP not supported (Chrome 116+ required).");
      return;
    }
    if (pipWin && !pipWin.closed) return;

    // Snapshot modals that are already visible
    modalBaseline = new Set(visibleModals());

    // No preferInitialWindowPlacement on purpose: Chrome remembers the last
    // window position/size, and since we always settle the window in the
    // bottom-right corner, later opens (even without a gesture) start there.
    // Wrong geometry is corrected by the applyGeometry measuring loop.
    const win = await documentPictureInPicture.requestWindow({
      width: PIP_W,
      height: PIP_H,
    });
    pipWin = win;

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

    pollTimer = setInterval(syncPipUI, 400);
    win.addEventListener("pagehide", () => {
      clearInterval(pollTimer);
      if (pipWin === win) pipWin = null;
    });
  }

  function closePip() {
    if (pipWin && !pipWin.closed) pipWin.close();
    pipWin = null;
  }

  // Chrome opens the very first PiP window of a session at its own default
  // spot (often top-right) and ignores gestureless moveTo, so the first
  // auto-open lands in the wrong corner. Fix: on the user's first click in
  // the meeting page (a valid gesture) open a PiP window for a split second,
  // park it in the bottom-right corner and close it. Chrome remembers that
  // placement, so every later open — including the first automatic one —
  // starts from the right spot.
  let primed = false;
  async function primePlacement() {
    if (primed || pipWin || !("documentPictureInPicture" in window)) return;
    if (visibleModals().length) return; // mid-dialog (e.g. echo test) — try on a later click
    primed = true;
    try {
      const win = await documentPictureInPicture.requestWindow({ width: PIP_W, height: PIP_H });
      win.document.body.style.background = "#131418";
      const margin = 16;
      const scr = win.screen;
      const tx = (scr.availLeft ?? 0) + Math.max(0, scr.availWidth - PIP_W - margin);
      const ty = (scr.availTop ?? 0) + Math.max(0, scr.availHeight - PIP_H - margin);
      try { win.resizeTo(PIP_W, PIP_H); } catch { /* ignore */ }
      try { win.moveTo(tx, ty); } catch { /* ignore */ }
      setTimeout(() => {
        try { win.close(); } catch { /* ignore */ }
        window.focus();
      }, 350);
    } catch {
      primed = false; // gesture got consumed or denied — retry on the next click
    }
  }

  // --- Auto-open on tab switch -------------------------------------------------
  function registerAutoPip() {
    // Chrome invokes this when a tab using the mic/camera is hidden and
    // allows opening a PiP window without a user click.
    try {
      navigator.mediaSession.setActionHandler("enterpictureinpicture", () => openPip());
    } catch {
      // Older Chrome doesn't know this action — the manual button still works
    }

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        closePip(); // back on the meeting tab — the floating window isn't needed
      }
    });

    // Prime Chrome's remembered PiP placement on the first in-page click
    document.addEventListener("pointerdown", () => primePlacement(), true);
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
    btn.addEventListener("click", openPip);
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
