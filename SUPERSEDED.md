# ⚠️ THIS REPO IS SUPERSEDED — DO NOT USE

**As of 2026-07-23, this repo (`gaw-awesomizer-clean`) is retired.**

## What happened

This repo was created when I (ZCode) extracted awesomizer from the c5-ops
monorepo into a standalone GitHub repo. That was the right instinct, but I
made two mistakes:

1. **I cloned a copy** instead of working in the original source folder. The
   real source — the one Commander actually loads into Chrome — lives at
   `D:\AI\_PROJECTS\GAW-awesomizer\extension\` (inside the c5-ops monorepo).
   This `gaw-awesomizer-clean` fork was a parallel copy that diverged.

2. **I jumped the version to 1.x** (1.0.0 → 1.1.0 → 1.1.1) when the real
   version line Commander was tracking was 0.x (0.1.0 → 0.2.0). The version
   numbers in this repo's releases are WRONG and should not be referenced.

## Where the real code lives now

- **Source:** `D:\AI\_PROJECTS\GAW-awesomizer\extension\` (c5-ops monorepo)
- **Loaded copy:** `D:\AI\_PROJECTS\dist\gaw-awesomizer-dist\gaw-awesomizer\`
- **Current version:** 0.2.1 (all four fixes ported: /u/+/p/ filter bail,
  thumbnails-only hover, ad blocking, correct version continuation)

## What this repo is still good for

- Historical reference of the extraction work (v1.0.0 commit)
- The README and PRIVACY.md are still accurate descriptions of the extension
- The BUILD-SPEC-v1.0.0.md selector evidence is still valid

## Do NOT

- Load this folder's `extension/` into Chrome — it's behind the real source
- Reference the v1.x version numbers — they don't exist in Commander's line
- Push further changes here — all work goes to the real source in c5-ops
