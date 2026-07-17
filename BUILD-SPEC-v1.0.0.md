# GAW Awesomizer v1.0.0 — Build Spec

**Date:** 2026-07-17
**Status:** Shipped (pending Commander live-load verification)
**Lineage:** FOXY v1.1.1 ← Patriots Eternal v540 userscript

---

## What this is

MV3 Chrome extension that enhances greatawakening.win (GAW) and patriots.win
(PDW) as you browse. Content script runs at `document_end` on both hosts.

## Architecture

```
extension/
├── manifest.json      MV3, content_scripts on GAW + PDW, host_permissions *://*/*
├── content.js         1391 lines — the whole feature set, one IIFE
├── background.js      60 lines — fetch relay (MV3 CORS workaround) + AbortController
├── popup.html         69 lines — status panel (visible/hidden counts, settings, help)
├── popup.js           67 lines — popup ↔ content.js bridge via chrome.tabs.sendMessage
└── icons/             16/32/48/128 PNG (reused from FOXY)
```

### MV3 shim layer (content.js L20-66)

FOXY was ported from a Tampermonkey userscript. Four GM_* shims replace the
userscript API:
- `GM_getValue` / `GM_setValue` → `chrome.storage.local`
- `GM_setClipboard` → `navigator.clipboard.writeText` + textarea fallback
- `GM_xmlhttpRequest` → `chrome.runtime.sendMessage` to background.js, which
  holds the `host_permissions` grant and relays cross-origin fetches

This lets the entire 1300-line feature set run byte-for-byte as the original
userscript, with only the four shims as new code. Behavioral parity preserved.

### Storage model

- **Config isolated per site:** `pe_config_gaw` / `pe_config_pdw`
  (keywords, hours, toggles)
- **State shared:** `pe_upvoted`, `pe_read`, etc. + IDB `peCache`
  (correct — scored.co post UUIDs are network-global)

---

## V1 feature inventory (all client-side, no backend)

| Feature | Function(s) | Notes |
|---------|-------------|-------|
| Hover-zoom (images, tweets, OG previews) | `HOVER.init`, `fetchOG`, `fetchTweet`, `preloadImage` | Fetches external metadata via background relay |
| Age filter (hide posts > Xh old) | `getPostAge`, `_filterPost` | Reads `time[datetime]`, falls back to age-text regex |
| Keyword / blocklist filters | `_filterPost`, `CONFIG.blocklist` | Per-site config |
| Bulk hide read (24h) | `peDB` (IndexedDB), `initSeenObserver` | IntersectionObserver marks seen after 1s dwell |
| Hide upvoted / downvoted | `_filterPost`, `findVoteButton` | Detects `.active` class on vote buttons |
| Keyboard navigation | keydown handlers | J/K/H/U/D/C/?/Esc |
| Domain badges | `getPostDomain`, `applyDomainBadge` | Resolves external link domain |
| User hover-cards | `fetchUser` | Pulls from scored.co user API |
| Infinite scroll (user pages) | `injectUserPageInfiniteScroll` | `/u/username` pages |
| Scroll position memory | `beforeunload` save, init restore | Per-path |
| Sidebar toggle | `pe-no-side` body class | CSS-only |
| Settings panel | `openSettingsPanel` | In-page overlay |
| Help overlay | `toggleHelpOverlay` | Keyboard shortcut reference |

## V2 reputation stub (designed-in, not built)

```js
REPUTATION.getLoggedInUsername()  // DOM identity probe — returns null when logged out
REPUTATION.queryUser(username)    // no-op stub, returns zeros
REPUTATION.probe()                // runs at init, exercises identity path
```

`probe()` is called once at init so identity extraction is exercised on every
page load. This surfaces DOM drift *before* V2 depends on it. Zero UI, zero
worker calls, zero award buttons in V1.

### Identity selectors tried (in order)

- `a[href="/u/me"]`
- `a[href^="/u/me"]`
- `.user-menu a[href^="/u/"]`
- `header a[href^="/u/"]:not([href="/u/me"])`
- `.navbar a[href^="/u/"]`
- `[data-username]`

**Verified 2026-07-17:** when logged out, GAW shows `/login` + `/registration`
and none of the above match — probe correctly returns `null`. When logged in,
scored.co renders the username link and one path matches.

---

## Live-DOM selector verification (2026-07-17)

Fetched `https://greatawakening.win/` via curl (browser UA) and grepped for
each selector content.js depends on:

| Selector | Status | Notes |
|----------|--------|-------|
| `.post` | ✅ Present | `<div class="post stickied mobile_guest">` |
| `.vote` container | ✅ Present | `<div class="vote">` |
| `data-direction="up/down"` | ✅ Present | On `<a>` inside `.vote` |
| `<time datetime="...">` | ✅ Present | `<time class="timeago" datetime="2026-07-17T03:05:05Z">` |
| `a[href*="/p/"]` | ✅ Present | Permalinks |
| `.stickied` class | ✅ Present | `class="post stickied"` |
| `a[href^="/u/"]` | ✅ Present | User profile links |
| `.domain` span | ✅ Present | External link domain |
| `data-author` | ✅ Present | On `.post` div |
| `data-id` | ✅ Present | Numeric post ID |
| `media.scored.co` | ✅ Present | Image CDN |
| `.title` class | ✅ Present | Post title link |
| `.count` span | ✅ Present | Vote score |
| `article.post` | ❌ N/A | GAW uses `<div>` not `<article>` — content.js queries class, works |
| `data-stickied` attr | ❌ N/A | GAW uses `.stickied` class — `isSticky()` handles both |
| `preview-parent` | ❌ N/A | Internal link detection; absence is the expected happy path |

**Sample post card (live):**

```html
<div class="post stickied mobile_guest" data-type="post" data-id="8732744" data-author="bubble_bursts">
  <div class="vote">
    <a data-direction="up" href="/registration">
      <i class="vote-delta fas fa-chevron-up"></i>
    </a>
    <span class="count">68</span>
    <a data-direction="down" href="/registration">
      <i class="vote-delta fas fa-chevron-down"></i>
    </a>
  </div>
  <div class="thumb default-thumbnail text-thumbnail" data-action="expand"></div>
  <div class="body">
    <div class="top">
      <a href="/p/1ATBvIUeY8/general-chat-for-fri-jul-17/" class="title">
        General Chat for Fri, Jul 17
      </a>
    </div>
    <div class="details">
      <span class="desktop"><span class="since"><span class="desktop">posted </span>
      <time class="timeago" datetime="2026-07-17T03:05:05Z">16 hours</time> ago by
      <a href="/u/bubble_bursts/">bubble_bursts</a></span></span>
    </div>
  </div>
</div>
```

content.js selectors match this structure exactly.

---

## Permissions audit

| Permission | Justification | Risk |
|------------|---------------|------|
| `storage` | User settings, filters, seen-history | None |
| `clipboardWrite` | Copy post link/title | None |
| `activeTab` | Access the active GAW/PDW tab | None |
| `host_permissions: *://*/*` | Hover-preview fetches external news sites | **HIGH OPTICS** — documented loudly in PRIVACY.md, narrowing in V1.x |

The broad host_permissions is the one community-flag risk. It's required
because the hover-preview feature fetches OG metadata from whatever news site
a post links to, and links go anywhere. V1.x work: audit linked domains,
curate an allowlist, narrow the permission.

---

## What's NOT shipped

- **V2 reputation system** — stubbed only. Separate milestone.
- **Custom icon art** — reusing FOXY's icons. Polish, not blocking.
- **Web Store listing** — community load-unpacked for now.
- **Narrowed host_permissions** — V1.x target.
- **Live load-unpacked smoke test** — requires Commander (UI-only step).

---

## Open questions for Commander

1. **Confirm identity probe** — when logged into GAW, does
   `[PE] V2-STUB identity: <username> on gaw` appear in the console? (Can't
   verify anonymously.)
2. **Host permissions appetite** — keep `*://*/*` for V1 launch (features
   work, but it's the #1 thing the community will flag), or narrow it before
   launch and accept that hover-preview only works on a curated domain list?
3. **Diagnostic console.logs** — V1 keeps the `[PE]` logs (useful for
   debugging, traditional in FOXY lineage). Strip for V1.x or keep?
