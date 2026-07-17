# GAW Awesomizer — Handoff (v1.0.0, 2026-07-17)

## Status: SHIPPED (pending your live-load verification)

I powered through as many gates as I could while you slept. Here's where it
landed and what needs your eyes.

---

## What happened tonight (2026-07-17 overnight session)

**Discovery:** a sister session had already built AWESOMIZER v0.1.0 — a
dual-site retarget of FOXY (the patriots.win extension) to GAW + PDW. The work
was sitting in `D:\AI\_PROJECTS\GAW-awesomizer\` inside the c5-ops monorepo.
It was genuinely good work: the full FOXY feature set (1391-line content.js),
four leaf-function dual-site fixes documented, V2 reputation stubbed cleanly.

**What I did with it:**
1. **Extracted it from c5-ops** into its own standalone repo at
   `catsfive1/gaw-awesomizer` on GitHub (was trapped in the monorepo)
2. **Verified every selector** against live greatawakening.win DOM — 13/17
   confirmed present, 4 misses are non-issues (documented in BUILD-SPEC)
3. **Found and fixed a real bug** via the test scaffold: the AGE_TEXT regex
   (inherited from FOXY) mis-parsed "minutes" — any post under 1 hour old was
   treated as age 0, silently breaking the age filter for fresh posts. Fixed,
   tested, 18/18 green
4. **Wrote the docs**: README (install + features), PRIVACY.md (the
   transparency-over-promises contract you established), BUILD-SPEC-v1.0.0.md
   (architecture + selector evidence + open questions)
5. **Bumped to v1.0.0**, built the ZIP, published the GitHub release

## Where things live

- **Standalone repo (this one):** `D:\AI\_PROJECTS\gaw-awesomizer-clean\`
- **GitHub:** https://github.com/catsfive1/gaw-awesomizer (public)
- **Release:** https://github.com/catsfive1/gaw-awesomizer/releases/tag/v1.0.0
- **ZIP:** `D:\AI\_PROJECTS\dist\gaw-awesomizer-dist\gaw-awesomizer-v1.0.0.zip`
- **Source sister-folder (historical, in c5-ops):** `D:\AI\_PROJECTS\GAW-awesomizer\`
- **FOXY reference (read-only):** `D:\AI\_PROJECTS\FOXY\extension\`

## What shipped (V1 features, all client-side)

- Hover-zoom previews (images, tweets, external article OG previews)
- Age filter (hide posts > Xh old)
- Keyword + blocklist filters
- Bulk hide read posts (IndexedDB, 24h window)
- Hide upvoted / downvoted
- Keyboard navigation (J/K/H/U/D/C/?/Esc)
- Domain badges, user hover-cards
- Infinite scroll on user pages
- Scroll position memory, sidebar toggle, in-page settings panel

## What's NOT shipped (V2+)

- **V2 reputation system** (awards, ranks, scarcity economy) — stubbed only.
  Separate milestone, separate design pass.
- **Custom icon art** — reusing FOXY's icons (polish, not blocking).
- **Narrowed host_permissions** — see open question #2 below.

---

## THREE THINGS THAT NEED YOUR INPUT

### 1. Live-load verification (UI step, only you can do it)

The one thing I cannot do from here: **load the extension into Chrome and
confirm it actually activates on GAW.** The code is syntax-valid, selectors
match the live DOM, tests pass — but there's no substitute for clicking
"Load unpacked" and watching it run.

Steps: unzip the release ZIP → `chrome://extensions` → Developer mode →
Load unpacked → pick the `extension/` folder → go to greatawakening.win →
look for the `[PE]` console logs (F12) and the pe-status-bar at the bottom.

Report back: did it load clean? Did the status bar appear? Does hover-zoom
work on a thumbnail? Does J/K move between posts?

### 2. The host_permissions decision (community-optics risk)

The manifest has `host_permissions: ["http://*/*", "https://*/*"]` — every
site, inherited from FOXY. This is required because the hover-preview feature
fetches OG metadata from whatever news site a post links to (and posts link
anywhere). It's documented loudly in PRIVACY.md.

**The tradeoff:**
- **Keep `*://*/*`** (current): all features work, but this is the #1
  permission a privacy-conscious community will flag. Expect questions.
- **Narrow to scored.co + curated news domains**: smaller permission surface,
  better optics, but hover-preview stops working on unlisted news sites until
  the allowlist is expanded.

**My recommendation:** ship V1 as-is (keep the broad permission, document it
loudly — which I did). Start collecting the actual domains GAW posts link to
(you can see them in the domain badges the extension adds). In V1.1, narrow
the permission to that curated list. This way the launch isn't delayed by a
research phase, and the narrowing becomes a visible privacy improvement in
the first update.

Your call. It's your community and your reputation on the line.

### 3. Diagnostic console.logs — keep or strip?

V1 keeps the `[PE]` console logs (FOXY lineage, useful for debugging). They
show init state, scan counts, identity probe results. Normal users never see
them (you have to open F12). Power users and bug-reporters will use them.

Options: keep as-is (current), gate behind a debug flag, or strip entirely.
I'd keep them — they're invisible to 99% of users and invaluable for the 1%
who report bugs.

---

## What I'd do next (in priority order)

1. **You live-load and verify** (the one blocker I can't clear)
2. **Fix anything broken** from the live test
3. **Write the launch post** (same structure as RE-SEARCH's — the privacy
   section needs the transparency-over-promises framing, and the
   host_permissions needs to be disclosed upfront, not buried)
4. **Ship V1.1** with narrowed host_permissions once we've audited domains
5. **Design V2 reputation system** (separate session — the scarcity economy
   needs real game-design thinking, not a sidebar)

## The bug I caught

Worth highlighting because it validates the test discipline: the AGE_TEXT
regex `(h|hour|m|min|d|day)` had alternation-order bug where `m` matched
before `min`, so "15 minutes ago" captured as unit `m` (just the letter),
then the `startsWith('mi')` check failed, returning age 0. Every post under
an hour old was misclassified as age-0 by the age filter. Inherited from FOXY
— would have shipped broken. Fixed by reordering to
`(minute|min|hour|hr|h|day|d)` (longest-first). Test covers it.

This is why we write tests even for "simple" regexes.

---

## Quick links

- **Repo:** https://github.com/catsfive1/gaw-awesomizer
- **Release:** https://github.com/catsfive1/gaw-awesomizer/releases/tag/v1.0.0
- **README:** https://github.com/catsfive1/gaw-awesomizer#readme
- **Privacy:** https://github.com/catsfive1/gaw-awesomizer/blob/main/PRIVACY.md
- **Build spec:** https://github.com/catsfive1/gaw-awesomizer/blob/main/BUILD-SPEC-v1.0.0.md

**Companion extension:** [GAW: RE-SEARCH](https://github.com/catsfive1/gaw-research-search)
(v2.5.1, shipped + launched last week)

---

*Built overnight while you slept. The sister session did the heavy lifting on
the port; I extracted, verified, fixed, documented, tested, packaged, and
shipped. Load it up when you wake up — let me know what breaks.*
