# GAW Awesomizer

Power-user tools for **greatawakening.win** and **patriots.win**. Makes the site
feel like a serious research cockpit instead of a feed.

**Current version: 1.0.0**

From the same team that brought you [GAW: RE-SEARCH](https://github.com/catsfive1/gaw-research-search).

---

## What it does

GAW Awesomizer is a Chrome extension that runs *on* greatawakening.win and
patriots.win and enhances the page as you browse. It is the spiritual successor
to **FOXY** — rewritten for Manifest V3, retargeted to both GAW and PDW, with
the rough edges polished.

**Feature list (V1):**

- **Hover-zoom previews** — hover any image link or thumbnail, see the full
  image inline without clicking through. Also handles tweets and external
  article previews.
- **Age filter** — hide posts older than X hours (configurable: 2h / 6h /
  12h / 24h / off). Surfacing fresh content, hiding stale.
- **Keyword & blocklist filters** — hide posts matching keywords or from
  users/flairs you've blocked. Your list, your feed.
- **Bulk hide read posts** — once you've seen a post, it can auto-hide after
  24 hours so your feed stays clean. Tracked locally via IndexedDB.
- **Hide upvoted / downvoted** — auto-hide posts you've already voted on.
- **Keyboard navigation** — J/K to jump post-to-post, H to hide, U to upvote,
  and more. Like Reddit Enhancement Suite.
- **Domain badges** — small label showing the source domain on each post
  (e.g. `twitter.com`, `rumble.com`) so you know where a link goes before
  clicking.
- **User hover-cards** — hover a username to see join date, karma, recent
  activity. Useful for spotting brand-new accounts.
- **Infinite scroll on user pages** — `/u/username` pages load continuously
  instead of paginating.
- **Scroll position memory** — close a tab, come back, you're where you left off.
- **Sidebar toggle** — collapse the right sidebar for a wider reading view.
- **Settings panel** — in-page settings overlay, no separate options page.

**Coming in V2 (reputation system):** scarcity-based community awards (4 votes
per 30 days, rollover, bold usernames, glow effects, military-style rank
progression). Separate milestone.

---

## 📥 How to install

This extension is NOT on the Chrome Web Store — it's a manual install from
GitHub. Same workflow as GAW: RE-SEARCH. Takes about 2 minutes.

1. **Download the ZIP** from the
   [Releases page](https://github.com/catsfive1/gaw-awesomizer/releases).
   Click the newest `gaw-awesomizer-vX.X.X.zip` at the top under **Assets**.
2. **Unzip it** somewhere you'll remember (Desktop, Documents, wherever).
3. Open Chrome (or Brave, Edge, Opera — any Chromium browser) and type
   `chrome://extensions` into the address bar.
4. Flip on **Developer mode** (top-right toggle).
5. Click **Load unpacked** (top-left), pick the folder you unzipped.
6. Done. Browse to greatawakening.win — the features activate automatically.

> **How updates work.** Chrome won't auto-update "Load unpacked" extensions.
> When a new version is out, grab the new ZIP, overwrite your folder, and hit
> ↻ **Reload** on the GAW Awesomizer card in `chrome://extensions`.

---

## ⌨️ Keyboard shortcuts

| Key | Action |
|-----|--------|
| `J` / `K` | Next / previous post |
| `H` | Hide post |
| `U` | Upvote |
| `D` | Downvote |
| `C` | Open comments |
| `?` | Show full keyboard overlay |
| `Esc` | Close any overlay |

---

## 🔧 For power users

### Install via `git clone` (instead of the ZIP)

If you have `git` installed, updates become one command:

```bash
git clone https://github.com/catsfive1/gaw-awesomizer.git
```

Then **Load unpacked** in `chrome://extensions` → select the `extension/`
folder inside what `git clone` created.

**Update later:**

```bash
cd gaw-awesomizer
git pull
```

Hit ↻ **Reload** on the extension card. Done.

---

## 🔒 Privacy — read this

GAW Awesomizer is open source. Every byte it reads and sends is disclosed here
in plain English. Nothing hidden.

**This extension is different from GAW: RE-SEARCH.** RE-SEARCH never touches
the page you're browsing — it's a search popup. Awesomizer *enhances* the page
you're browsing, which means it has to read the page. Different tool, different
contract, same transparency standard.

### What the extension reads

- **The greatawakening.win / patriots.win page you're viewing** — post titles,
  authors, body text, comment counts, vote buttons, links. It has to, to do
  its job (filter, badge, hover-preview, keyboard-navigate).
- **Which posts you've seen, hidden, upvoted, or downvoted** — stored locally
  on your machine so the filters work across sessions.

### What the extension sends where

- **To the site itself (greatawakening.win, patriots.win)** — when you use the
  built-in keyboard upvote/downvote, the extension clicks the site's own vote
  button for you. That request goes to scored.co exactly as if you'd clicked
  it yourself. The extension does not cast votes you didn't initiate.
- **To external news sites (article previews)** — when you hover an external
  article link, the extension fetches that page's Open Graph metadata
  (title, description, image) to show you a preview. The request goes to the
  news site's server, same as if you'd visited the page. Used only for the
  hover-preview feature.
- **To media.scored.co** — to resolve full-resolution versions of post images
  for hover-zoom. This is scored.co's own CDN.
- **To anything else? No.** No analytics. No advertising. No telemetry. No
  third-party SDKs. No AI providers. No data brokers.

### What stays on your machine

Everything except the above. Your blocklists, your keyword filters, your
seen-post history, your settings — all in Chrome's local storage and
IndexedDB. Never transmitted.

### What V2 will add (not in V1)

The reputation system (V2) will read your logged-in GAW username from the page
and send award/vote data to our Cloudflare Worker so community recognition can
work. That's not in V1. When V2 ships, this privacy policy will be updated to
describe it precisely.

### Permissions, explained

- **`storage`** — remember your settings, filters, and seen-post history.
- **`clipboardWrite`** — copy post links/titles to your clipboard.
- **`activeTab`** — access the GAW/PDW tab you're on when you invoke the extension.
- **`host_permissions: http://*/*` and `https://*/*`** — needed for the
  hover-preview feature on external article links (it fetches the article's
  preview metadata). This is the broadest permission and we know it. V1.x
  will narrow this to known news domains + scored.co's CDN once we've
  audited which domains the community actually links to.

See [`PRIVACY.md`](PRIVACY.md) for the complete policy.

---

## 🐞 Bugs, feedback, questions

Drop a comment in the announcement thread on greatawakening.win, or email
**catsfive@yahoo.com**. If something's broken, open the browser console on GAW
(F12) and look for lines starting with `[PE]` — those are diagnostic logs from
the extension; include them in your report.

---

## 👤 Maintainer

**Commander Cats** — [catsfive@yahoo.com](mailto:catsfive@yahoo.com)

Unofficial community tool, not affiliated with greatawakening.win, patriots.win,
or scored.co.

## Lineage

GAW Awesomizer is a rebrand + dual-site retarget of **FOXY v1.1.1**, which was
itself a Manifest V3 port of the "Patriots Eternal v540" userscript. The FOXY
repo remains as a historical record. Internal storage keys and CSS prefixes
(`pe-*`) are kept intentionally to avoid orphaning existing user data.
