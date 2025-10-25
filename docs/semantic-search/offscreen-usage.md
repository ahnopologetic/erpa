Here’s a minimal, working pattern for using Chrome’s **Offscreen API** from a **Plasmo** background service worker.

---

# 1) Add the permission (Plasmo manifest override)

In your `package.json`, enable the Offscreen API:

```json
{
  "manifest": {
    "permissions": ["offscreen"]
  }
}
```

Plasmo merges this into the generated MV3 manifest. ([Plasmo Docs][1])

---

# 2) Create an offscreen document the Plasmo way

Create a *bundled HTML page* that Chrome can open offscreen. With Plasmo, any page file becomes an HTML at the same path, so the easiest is a **tab page**:

`src/tabs/offscreen.tsx` (or `tabs/offscreen.tsx` if you don’t use `src/`)

```tsx
// src/tabs/offscreen.tsx
import { useEffect } from "react"

// This runs in the offscreen document (has DOM, window, etc.)
// Only chrome.runtime.* API is available here per Offscreen rules.
const Offscreen = () => {
  useEffect(() => {
    // Receive work from the SW
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.target !== "offscreen") return

      // Example: clipboard, DOM parsing, audio, etc.
      if (msg.type === "PING") {
        sendResponse({ ok: true, from: "offscreen" })
      }

      // Return true if you’ll respond asynchronously
      return false
    })
  }, [])

  return null
}

export default Offscreen
```

At build time this becomes `tabs/offscreen.html`, which we’ll open via `chrome.offscreen.createDocument`. (This “tab page as offscreen doc” trick is a common Plasmo approach.) ([Stephen Siegert][2])

> Offscreen docs require a **static bundled HTML** page, and exactly one offscreen document can be open per profile. Only `chrome.runtime` messaging is allowed inside offscreen. ([Chrome for Developers][3])

---

# 3) Background service worker: create/ensure the offscreen doc

`src/background.ts`:

```ts
// src/background.ts
export {}

const OFFSCREEN_PATH = "tabs/offscreen.html"
let creating: Promise<void> | null = null

async function ensureOffscreen() {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH)

  // Check if it already exists (Chrome 116+)
  const contexts = await chrome.runtime.getContexts?.({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [url]
  })

  if (contexts && contexts.length > 0) return

  if (!creating) {
    creating = chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      // Pick the reason(s) you actually need:
      reasons: ["DOM_PARSER"], // e.g., "CLIPBOARD", "AUDIO_PLAYBACK", "USER_MEDIA", etc.
      justification: "Run DOM APIs without a visible page"
    })
    await creating
    creating = null
  } else {
    await creating
  }
}

// Example entry point
chrome.runtime.onInstalled.addListener(async () => {
  await ensureOffscreen()
})

// Example: ping the offscreen page on command
chrome.action.onClicked.addListener(async () => {
  await ensureOffscreen()
  const res = await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "PING"
  })
  console.log("Offscreen replied:", res)
})

// Optional: close when truly not needed
async function closeOffscreen() {
  await chrome.offscreen.closeDocument()
}
```

Notes & gotchas (per Chrome docs):

* Use `runtime.getContexts` to avoid creating duplicates.
* Reasons control lifecycle (e.g., `AUDIO_PLAYBACK` auto-closes after ~30s of silence).
* Only one offscreen doc at a time (per normal/incognito profile). ([Chrome for Developers][3])

---

# 4) Message passing in Plasmo

You can use raw `chrome.runtime.sendMessage` as above, or Plasmo’s messaging helpers if you prefer. Plasmo’s docs cover one-shot request/response patterns between pages and the background worker. ([Plasmo Docs][4])

---

# 5) Dev/prod lifecycle tips (service worker)

* In **dev**, Plasmo keeps the SW active; in **prod**, Chrome will idle/terminate it—so always call `ensureOffscreen()` before sending messages. Persist any state you need via storage or your own backend. ([Plasmo Docs][5])

---

# 6) When you need extra assets/scripts

If your offscreen workflow needs an extra script loaded *outside* the extension context (e.g., special auth flows), expose it via `web_accessible_resources` and load it in an iframe inside the offscreen page. (This is a common pattern with Plasmo + offscreen.) ([Stephen Siegert][2])

Example manifest override:

```json
{
  "manifest": {
    "web_accessible_resources": [
      {
        "resources": ["~my-helper.min.js"],
        "matches": ["https://example.com/*"]
      }
    ]
  }
}
```

---

# 7) Why/when to use Offscreen

* Service workers have **no DOM**. Offscreen lets you run DOM APIs (DOMParser, canvas, audio, clipboard, getUserMedia, etc.) headlessly, driven by the SW. Choose the appropriate `reasons` enum(s) like `DOM_PARSER`, `CLIPBOARD`, `AUDIO_PLAYBACK`, `USER_MEDIA`, etc. ([Chrome for Developers][3])

---

## Quick checklist

* [x] `package.json` → `"manifest.permissions": ["offscreen"]` (and `web_accessible_resources` if needed). ([Plasmo Docs][1])
* [x] Create `src/tabs/offscreen.tsx` → becomes `tabs/offscreen.html`. ([Stephen Siegert][2])
* [x] In `background.ts`, call `ensureOffscreen()` then message it. Use `runtime.getContexts` to detect existing doc. ([Chrome for Developers][3])
* [x] Remember SW sleep/kill behavior; re-ensure before messaging. ([Plasmo Docs][5])

If you tell me your exact use case (clipboard? TTS/audio? DOM parsing? camera/mic?), I’ll swap in the correct `reasons` and a tiny offscreen handler tailored to it.

[1]: https://docs.plasmo.com/framework/customization/manifest "Overriding the Manifest – Plasmo"
[2]: https://xiegerts.com/post/firebase-offscreen-auth-chrome-extension/ "Using Firebase Auth in a Chrome Extension with Offscreen Documents and Plasmo"
[3]: https://developer.chrome.com/docs/extensions/reference/api/offscreen "chrome.offscreen  |  API  |  Chrome for Developers"
[4]: https://docs.plasmo.com/framework/messaging?utm_source=chatgpt.com "Messaging API"
[5]: https://docs.plasmo.com/framework/background-service-worker "Background Service Worker – Plasmo"
