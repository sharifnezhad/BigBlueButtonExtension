# BBB Floating Controls — Picture-in-Picture Controls for BigBlueButton

> A free, open-source **Chrome and Firefox extension for BigBlueButton** that adds a floating, always-on-top **picture-in-picture control bar** to your meetings. Mute your **microphone**, toggle your **camera**, start **screen sharing**, send **reactions**, and raise your hand from any tab — or even while working in another application — with a single click.

**Keywords:** BigBlueButton extension · BigBlueButton Chrome extension · BigBlueButton Firefox add-on · BigBlueButton floating controls · BigBlueButton picture-in-picture · BBB mute microphone from any tab · BigBlueButton always-on-top mic camera controls · BBB reactions and raise hand.

<p align="center">
  <img src="assets/preview.svg" alt="BigBlueButton floating picture-in-picture control window showing a chat notification toast, a reactions and raise-hand row, and round microphone, camera, screen-share and audio buttons" width="420">
</p>

---

## What is BBB Floating Controls?

**BigBlueButton (BBB)** is a great open-source web conferencing platform for online teaching and meetings, but it has one everyday gap: **the moment you switch to another browser tab — or to another app — you lose all visual connection to the meeting.** You can't see whether your mic is live, and muting means hunting for the meeting tab, clicking, and switching back.

**BBB Floating Controls** fixes this. It opens a small, always-on-top floating window (using the browser's **Document Picture-in-Picture API**) with full meeting controls, so you keep complete control of your microphone, camera, screen share and reactions no matter what you're doing on your computer.

This extension is **unofficial** and not affiliated with BigBlueButton Inc. It works entirely in your browser, talks to **no external server**, and requires no account.

---

## Features

| Feature | What it does |
| --- | --- |
| 🎤 **Microphone control** | Mute/unmute from the floating window with one click, with a clear live/muted indicator. |
| 📷 **Camera control** | Turn your webcam on/off from the window. |
| 🖥️ **Screen sharing** | Start and stop screen sharing in one click. |
| 🔊 **Audio connection** | Join or leave the meeting audio. |
| 🙋 **Raise hand** | Raise and lower your hand; the button stays highlighted until you lower it. |
| 😀 **Reactions / stickers** | Send BBB's native reactions (😀 😐 🙁 👍 👎 👏). The chosen sticker is highlighted and **auto-clears after 5 seconds**, just like in BBB. |
| 🖼️ **Live mirroring** | Mirrors the active webcam or screen share into the floating window — and now also shows the current **shared PDF / presentation slide** when no video stream is present. |
| 🔔 **Notifications** | Chat messages and other participants' reactions pop up as toast cards inside the window and fade out automatically. |
| 🪟 **Tab-independent window** | Opens when you switch away from the meeting tab and stays on top across later **tab and app switches** — it is not tied to the BigBlueButton tab. |

---

## Installation

### Google Chrome / Microsoft Edge / Brave (Chromium)

1. Download or clone this repository.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and select the project folder.

### Mozilla Firefox

1. Download or clone this repository.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and select the `manifest.json` file.

> **Firefox note:** Firefox does **not** yet support the Document Picture-in-Picture API, so the always-on-top floating *window* (that stays visible over other apps) is **Chromium-only**. On Firefox the extension instead shows an **in-page floating panel** (click the blue launcher button) with the same controls and reactions. The cross-application overlay will become available on Firefox once it ships Document PiP.

---

## Usage

1. Join a BigBlueButton meeting. After a few seconds a round blue **launcher button** appears at the bottom-left of the page.
2. **Chrome:** the floating window opens automatically when you switch to another tab, and stays available when you then move to another application. You can also click the launcher button to open it manually. **Firefox:** click the launcher button to toggle the in-page panel.
3. Click a **reaction/sticker** to send it; it highlights and clears itself after 5 seconds. Click **raise hand** to raise it (it stays until you lower it).

---

## Requirements

- **Chrome / Edge / Brave 116+** for the full always-on-top floating window (Document Picture-in-Picture API).
- **Firefox 128+** for the in-page panel and `world: "MAIN"` content scripts.
- **BigBlueButton HTML5 client 2.4+** (controls are located via `data-test` attributes, kept in sync with the live meeting).

---

## Privacy

This extension collects **no data**, uses **no analytics**, and makes **no network requests**. It runs a content script only on pages where it detects the BigBlueButton client, and all actions are performed by clicking BBB's own buttons in the page.

---

## How it works (technical notes)

- **Real-button clicking:** the floating controls dispatch the full pointer/mouse event sequence on BBB's actual buttons (found via `data-test` selectors), so mic/camera/screen state always stays in sync with the meeting.
- **Cross-surface UI:** the same markup renders either inside a Document-PiP window (Chromium) or inside a shadow-DOM in-page panel (Firefox fallback), keeping BBB's styles isolated.
- **Slide mirroring:** when there is no live `<video>`, the extension finds the current presentation slide image in BBB's whiteboard and shows it, so a shared PDF is visible in the window.
- **Geometry self-correction:** Chromium sometimes ignores gesture-less `resizeTo`/`moveTo`, so the window measures its real position and retries until it lands in the bottom-right corner, then leaves it alone for manual dragging.

---

## Contributing

Issues and pull requests are welcome. If you test against a specific BigBlueButton version and a selector needs updating, please open an issue with the BBB version number.

## License

See the repository for license details.
