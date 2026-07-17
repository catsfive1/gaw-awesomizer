# GAW Awesomizer — Privacy Policy

**Last updated: 2026-07-17**

GAW Awesomizer enhances greatawakening.win and patriots.win as you browse.
This policy describes exactly what the extension does and does not do with
data. Our philosophy: **transparency about what we DO, not promises about
what we don't.**

## The short version

Awesomizer reads the GAW/PDW page you're on so it can enhance it. Your
filters, blocklists, and seen-post history live on your own machine. The
extension contacts external servers only for features you actively use
(hover-previews, image zoom, in-page voting). **No accounts, no login, no
analytics, no advertising, no tracking.**

## What the extension reads (on greatawakening.win / patriots.win only)

When you browse GAW or PDW with Awesomizer enabled, it reads from the page:

- **Post titles, authors, body text, comment counts** — for filtering,
  keyword matching, badge display, hover-previews
- **Vote buttons and score displays** — for the hide-upvoted/hide-downvoted
  feature and keyboard-vote shortcuts
- **Link URLs and image src attributes** — for hover-zoom and domain badges
- **Timestamps** — for the age filter ("hide posts older than X hours")
- **Your logged-in username** *(V2 only)* — for the reputation system.
  V1 does not use this.

The content script runs **only** on `greatawakening.win` and `patriots.win`
(declared in `manifest.json` → `content_scripts.matches`). It does not run on
any other site.

## What stays on your machine (never transmitted)

- Your keyword filters and blocklists
- Your seen-post history (which posts you've viewed)
- Your hide history (which posts you've hidden)
- Your settings and preferences
- Your scroll-position memory

These live in `chrome.storage.local` and an IndexedDB database named `peCache`
on your computer only.

## What gets sent over the network

### 1. To greatawakening.win / patriots.win (scored.co)

When you use the keyboard shortcut to upvote or downvote a post, the extension
triggers the site's own vote button. This sends the same request scored.co
would send if you'd clicked the button yourself — nothing more, nothing less.

### 2. To external news sites (hover-preview feature)

When you hover over an external article link, the extension fetches that
page's Open Graph metadata (title, description, preview image) to show you a
preview popup. The request goes to the news site's own server, exactly as if
you'd opened the page. This only happens on hover — it does not pre-fetch
every link on the page.

### 3. To media.scored.co

To show full-resolution hover-zoom images, the extension requests
high-resolution versions of post images from scored.co's media CDN.

### 4. Nothing else

- No analytics (no Google Analytics, no Plausible, no nothing)
- No advertising networks
- No telemetry or usage statistics
- No third-party SDKs
- No AI providers
- No data brokers
- No server of our own in V1 (V2 will add a Cloudflare Worker for reputation;
  this policy will be updated then)

## Permissions, in plain English

From `manifest.json`:

| Permission | Why it's needed |
|------------|-----------------|
| `storage` | Remember your settings, filters, and seen-post history locally |
| `clipboardWrite` | Copy post links/titles to your clipboard when you ask |
| `activeTab` | Access the GAW/PDW tab you're currently viewing |
| `host_permissions: *://*/*` | Fetch hover-previews from arbitrary external news sites + media.scored.co for image zoom |

The broad `*://*/*` host permission is the one to scrutinize. It exists
because the hover-preview feature needs to fetch metadata from whatever news
site a post links to — and since posts link to anywhere, we can't pre-list
every domain. **We are narrowing this in V1.x** to scored.co + a curated list
of news domains once we've audited what the community actually links to. That
work is tracked and will ship before the Web Store version.

## What V2 will add (not in this version)

The reputation system (V2) will:

- Read your logged-in GAW username from the page DOM
- Send award nominations and your username to our Cloudflare Worker
- Receive back award counts and rank information for display

V2 is a separate milestone. When it ships, this policy will be updated to
describe those data flows precisely, and the V2 feature will require explicit
opt-in.

## Children's privacy

The extension is not directed at children under 13 and collects no age
information.

## Your choices

- **Disable the extension** — flip the toggle in the popup, or disable in
  `chrome://extensions`. All features stop immediately.
- **Delete your data** — remove the extension, or clear extension data in
  Chrome. All filters, history, and settings are erased.
- **Audit the code** — full source at
  [github.com/catsfive1/gaw-awesomizer](https://github.com/catsfive1/gaw-awesomizer).
  Open `extension/content.js` to see every DOM read and every network request.

## Changes to this policy

If we change what the extension does with data, we'll update this file and
note the date above. The source code is always the ground truth — if the code
and this document ever disagree, the code wins.

## Contact

Questions: **catsfive@yahoo.com**
