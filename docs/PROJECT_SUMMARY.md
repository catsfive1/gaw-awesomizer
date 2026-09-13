# GAW Awesomizer (clean fork) — project summary

**STATUS: RETIRED (2026-07-23). Do not use, load, or push here.** Superseded by the canonical source in the c5-ops monorepo: `D:\AI\_PROJECTS\GAW-awesomizer\extension\` (loaded copy: `D:\AI\_PROJECTS\dist\gaw-awesomizer-dist\gaw-awesomizer\`, current version 0.2.1). Details: `SUPERSEDED.md`.

**Purpose / users (historical):** Chrome extension (Manifest V3) adding power-user tools to greatawakening.win and patriots.win for their communities — the FOXY lineage rewritten for MV3 and dual-site. Rebrand/retarget of FOXY v1.1.1 / "Patriots Eternal v540" userscript.

**Stack / runtime:** Vanilla JS MV3 extension — service worker (`background.js`), content script (`content.js`), popup (`popup.html/js`), local storage + IndexedDB for filters/history. Packaged by `package.py` (Python zip builder).

## What the code does

- Hover-zoom previews (images, tweets, article Open Graph cards via media.scored.co).
- Age filter (2h/6h/12h/24h/off), keyword + user/flair blocklists, bulk hide-read after 24h, hide upvoted/downvoted.
- Keyboard navigation (J/K/H/U/D/C, `?` overlay), domain badges, user hover-cards, infinite scroll on `/u/` pages, scroll position memory, sidebar toggle, in-page settings panel.
- Permissions: `storage`, `clipboardWrite`, `activeTab`, broad `http(s)://*/*` host permissions (hover-preview fetch; PRIVACY.md documents the full read/send contract).

## Documentation index

`README.md` (features, manual install, shortcuts, privacy), `PRIVACY.md`, `BUILD-SPEC-v1.0.0.md` (selector evidence), `HANDOFF.md`, `SUPERSEDED.md` (retirement notice — read first), `docs/PROJECT_SUMMARY.md` (this file).

## Recent work (git log)

- `a74b2d2` 2026-07-23 RETIRED: this fork is superseded by the real source in c5-ops (GAW-awesomizer/)
- `a7d9952` 2026-07-23 v1.1.1: fix /p/ post disappearing + hide Google ads
- `47cf002` 2026-07-23 v1.1.0: fix 9-month /u/ page bug + thumbnails-only hover-zoom
- `10adef0` 2026-07-17 docs: handoff for v1.0.0
- `366f061` 2026-07-17 v1.0.0: GAW Awesomizer — dual-site MV3 extension for GAW + PDW

(5 commits total. Final commit is the retirement marker.)

## Why retired (from SUPERSEDED.md)

This repo was a cloned *copy* of the c5-ops source rather than the source itself, and it jumped the version to 1.x while Commander's real line was 0.x — its v1.x release numbers are wrong and must not be referenced. All further work went to the c5-ops original, where the four fixes were re-ported (0.2.1).

## How to run (historical only — do not load this copy)

Load `extension/` unpacked via `chrome://extensions` (Developer mode → Load unpacked). The correct folder to actually load is the c5-ops source above.

## Key files

`extension/{manifest.json,background.js,content.js,popup.html,popup.js,icons/}`, `package.py`, `tests/`, `SUPERSEDED.md`.

## Known gaps

N/A — repo is frozen. Still useful as historical reference: README/PRIVACY.md descriptions and BUILD-SPEC selector evidence remain accurate per SUPERSEDED.md.

## GitHub

https://github.com/catsfive1/gaw-awesomizer.git — branch `main`, last code commit `a74b2d220882a6c2950b75c5461d28570d8affff` (the retirement marker, 2026-07-23); 2026-09-13 docs commits sit on top.

**Env vars:** none.
