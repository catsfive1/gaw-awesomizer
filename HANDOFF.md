# GAW Awesomizer — Handoff (v0.1.0, 2026-07-17)

## What this is
MV3 Chrome/Brave extension for **greatawakening.win** and **patriots.win**.  
V1 = client-side QoL (FOXY feature set). V2 reputation/awards is stubbed only.

**Unified replacement for FOXY.** FOXY repo stays as historical record; do not run both.

## Where things live
- **Source:** `D:\AI\_PROJECTS\GAW-awesomizer\extension\`
- **Load-unpacked:** `D:\AI\_PROJECTS\dist\gaw-awesomizer-dist\gaw-awesomizer\`
- **Versioned zip:** `D:\AI\_PROJECTS\dist\gaw-awesomizer-v0.1.0.zip`
- **Drive archive (last 2):** `E:\My Drive\_PROJECTS\GAW-awesomizer\`
- **Lineage source:** `D:\AI\_PROJECTS\FOXY\extension\` (v1.1.1, not modified)

## Lineage
FOXY (patriots.win MV3 port of Patriots Eternal v540) already had a `SITE` adapter
that detected GAW vs PDW vs scored.co and switched community names. The FOXY
manifest only matched patriots.win. Port = retarget + rebrand + four leaf-function
fixes where `patriots.win` was hardcoded without `greatawakening.win`.

Internal prefixes kept on purpose (`pe-` CSS/IDs, `pe_` storage keys, `FOXY_*`
message types, `peCache` IDB name). Self-contained; invisible to users; changing
them risks orphaning storage and a 100+ string churn for no benefit.

## Dual-site porting fixes (v0.1.0)

| Location | Bug | Fix |
|----------|-----|-----|
| `manifest.json` matches | Only `*://patriots.win/*` | Added `*://greatawakening.win/*` |
| `content.js` `getPostDomain` `.preview-parent` selector | Missing `:not([href*="greatawakening.win"])` | Added |
| `content.js` `primeCachesFromFeedApi` ×2 `isInternal` | Missing greatawakening.win | Added |
| `content.js` `HOVER.resolveTarget` `isInternal` | Missing greatawakening.win | Added |
| `popup.js` tab URL gate | Only patriots.win regex | Both hosts + dual "Go to" buttons |

Without these, GAW internal links were misclassified as external and routed through
the external-link/tweet hover path.

## Rebrand (user-visible only)
- `name` / `SCRIPT_NAME` / popup title → **GAW Awesomizer**
- `version` → **0.1.0**
- Popup footer → "Power User for GAW + PDW"
- Icons: reused FOXY PNGs (new art is polish, not blocking)

## Storage model
- **Config isolated per site:** `pe_config_gaw` / `pe_config_pdw` (keywords, hours, toggles)
- **State shared:** `pe_upvoted`, `pe_read`, etc. + IDB `peCache`  
  Correct for scored.co: post UUIDs are global across the network.

## V2 stub contract
Module: `REPUTATION` in `content.js` (fenced `// V2-STUB`).

```
REPUTATION.getLoggedInUsername()  → string|null   // DOM identity probe
REPUTATION.queryUser(username)    → { awards: 0, rank: null, username }
REPUTATION.probe()                → logs identity at init; no UI
```

Zero award buttons, glow, ranks, or worker calls in V1.  
V2 fills `queryUser` (Cloudflare Worker), award button injection, rank CSS thresholds,
anti-Sybil rate limits. Identity extraction is already exercised so site DOM drift
is discovered before V2 depends on it.

## Packaging
```
python D:\AI\_PROJECTS\GAW-awesomizer\package.py
```
Validates MV3 + dual-host matches + icon/js presence; copies unpacked dist; zips;
mirrors Drive fail-soft (last 2).

## Not done / next
1. **Live load-unpacked** on both hosts (only Commander can click Load unpacked).
2. Confirm identity probe console line on GAW when logged in vs logged out.
3. Custom icon art.
4. V2 worker + awards (separate milestone).
5. Web Store publish (optional; community can load-unpacked).

## FOXY retirement note
Do not delete FOXY. Ship this as the replacement. Disable FOXY if both would load
on patriots.win (same DOM IDs / shortcuts).
