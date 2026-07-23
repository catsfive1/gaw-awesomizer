// GAW Awesomizer — Chrome MV3 content script
// Lineage: FOXY (MV3) ← Patriots Eternal v540 userscript.
// Dual-site: greatawakening.win (GAW) + patriots.win (PDW). Both are scored.co.
// Internal pe-/FOXY_ prefixes kept (self-contained, invisible, no rebrand risk).

(async function() {
    'use strict';

    const VERSION = '1.1.1';
    const SCRIPT_NAME = 'GAW Awesomizer';

    if (window.__PE_INIT) return;
    window.__PE_INIT = true;

    // =========================================================================
    // MV3 SHIM LAYER — replaces Tampermonkey's GM_* API surface.
    // Every GM_getValue/GM_setValue/GM_setClipboard/GM_xmlhttpRequest call site
    // below is untouched from the original script; only these four shims are
    // new, so the whole rest of the port is a byte-for-byte behavioral match.
    // =========================================================================
    const STORAGE = await chrome.storage.local.get(null);

    function GM_getValue(key, def) { return STORAGE[key] !== undefined ? STORAGE[key] : def; }
    function GM_setValue(key, value) { STORAGE[key] = value; chrome.storage.local.set({ [key]: value }); }

    function GM_setClipboard(text) {
        navigator.clipboard.writeText(text).catch(() => {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
                document.body.appendChild(ta);
                ta.focus(); ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            } catch {}
        });
    }

    // Cross-origin fetch relay — MV3 content scripts are still subject to page
    // CORS, so every request is relayed through background.js, which holds the
    // host_permissions grant needed to fetch any origin (site API, fxtwitter,
    // arbitrary linked-article OG scrape, media CDN hi-res lookups).
    function GM_xmlhttpRequest(config) {
        const { method = 'GET', url, timeout, headers, onload, onerror, ontimeout } = config;
        // Belt-and-suspenders: the service worker has its own AbortController timeout,
        // but if it's evicted/crashes mid-fetch sendResponse never fires and this call
        // would otherwise hang forever. A local backstop guarantees ontimeout still runs.
        let settled = false;
        const backstop = setTimeout(() => { if (!settled) { settled = true; if (ontimeout) ontimeout(); } }, (timeout || 12000) + 2000);
        chrome.runtime.sendMessage({ type: 'FOXY_FETCH', url, method, headers, timeout }, (response) => {
            if (settled) return;
            settled = true; clearTimeout(backstop);
            if (chrome.runtime.lastError || !response) { if (onerror) onerror(); return; }
            if (response.error === 'timeout') { if (ontimeout) ontimeout(); return; }
            if (response.error) { if (onerror) onerror(); return; }
            if (onload) onload({ status: response.status, responseText: response.text });
        });
    }

    // =========================================================================
    // USER PAGE INFINITE SCROLL — defined first, before early return.
    // Scrapes the actual NEXT button href from each page instead of guessing
    // ?page=N. Also tries the scored.co API as fallback. Unchanged from the
    // original: it only uses same-origin fetch(), which content scripts can
    // do directly without the background relay.
    // =========================================================================
    function injectUserPageInfiniteScroll() {
        console.log('[PE] User page infinite scroll: starting');
        const pathMatch = window.location.pathname.match(/^\/u\/([^\/]+)/i);
        if (!pathMatch) return;
        const username = pathMatch[1];
        const host = window.location.hostname;
        const base = `https://${host}`;

        let loading = false;
        let allDone = false;
        let postsContainer = null;
        let nextUrl = null;
        let totalLoaded = 0;
        let pageNum = 1;

        const style = document.createElement('style');
        style.textContent = `
            .pe-up-loader { text-align:center;padding:20px;color:#4A9EFF;font:13px -apple-system,system-ui,sans-serif; }
            .pe-up-spinner { width:20px;height:20px;border:2px solid #2a2a2a;border-top-color:#4A9EFF;border-radius:50%;animation:pe-up-spin .8s linear infinite;display:inline-block;margin-right:8px;vertical-align:middle; }
            @keyframes pe-up-spin { to { transform:rotate(360deg); } }
            .pe-up-end { text-align:center;padding:20px;color:#555;font:12px -apple-system,system-ui,sans-serif; }
            .pe-up-count { position:fixed;bottom:12px;right:16px;z-index:99999;background:#111;border:1px solid #2a2a2a;padding:4px 12px;border-radius:20px;font:11px -apple-system,system-ui,sans-serif;color:#4A9EFF;box-shadow:0 4px 12px rgba(0,0,0,.4); }
            /* Hide native NEXT/pagination */
            .view-more-holder, a.next, .next-page, nav.pagination { display:none !important; }
        `;
        document.head.appendChild(style);

        function findPostsContainer() {
            const selectors = ['.content .post-listing', '.content .post-list', '.content .posts', '.user-page .posts', '.profile-page .posts', '#posts', '.post-listing', 'main .posts'];
            for (const sel of selectors) { const c = document.querySelector(sel); if (c) return c; }
            const firstPost = document.querySelector('.post');
            if (firstPost) return firstPost.parentElement;
            return null;
        }

        function findNextUrl(doc) {
            const candidates = [
                doc.querySelector('.view-more-holder a'),
                doc.querySelector('a.next'),
                doc.querySelector('.next-page'),
                doc.querySelector('a[href*="page="]'),
                doc.querySelector('a[href*="after="]'),
            ];
            for (const a of candidates) {
                if (a) {
                    let href = a.getAttribute('href');
                    if (href && !href.startsWith('http')) href = base + href;
                    if (href) return href;
                }
            }
            const allLinks = doc.querySelectorAll('a[href]');
            for (const a of allLinks) {
                const text = (a.textContent || '').trim().toLowerCase();
                if ((text.includes('next') || text === '>') && a.getAttribute('href')) {
                    let href = a.getAttribute('href');
                    if (!href.startsWith('http')) href = base + href;
                    return href;
                }
            }
            return null;
        }

        function updateCounter() {
            let counter = document.getElementById('pe-up-counter');
            if (!counter) {
                counter = document.createElement('div');
                counter.id = 'pe-up-counter';
                counter.className = 'pe-up-count';
                document.body.appendChild(counter);
            }
            counter.textContent = `PE: ${totalLoaded} posts loaded` + (allDone ? ' (all)' : ` (page ${pageNum})`);
        }

        async function loadNextPage() {
            if (loading || allDone || !nextUrl) return;
            loading = true;

            const loader = document.createElement('div');
            loader.className = 'pe-up-loader';
            loader.innerHTML = '<span class="pe-up-spinner"></span>Loading more posts...';
            if (postsContainer) postsContainer.appendChild(loader);

            pageNum++;
            try {
                console.log(`[PE] User page: fetching ${nextUrl}`);
                const resp = await fetch(nextUrl);
                if (!resp.ok) { allDone = true; loader.remove(); loading = false; return; }
                const html = await resp.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const newPosts = doc.querySelectorAll('.post');

                nextUrl = findNextUrl(doc);

                loader.remove();

                if (newPosts.length === 0) {
                    allDone = true;
                    const end = document.createElement('div');
                    end.className = 'pe-up-end';
                    end.textContent = `All of ${username}'s posts loaded (${totalLoaded} total).`;
                    if (postsContainer) postsContainer.appendChild(end);
                    updateCounter();
                } else {
                    newPosts.forEach(post => {
                        post.querySelectorAll('a[href^="/"]').forEach(a => {
                            a.setAttribute('href', base + a.getAttribute('href'));
                        });
                        if (postsContainer) postsContainer.appendChild(post);
                    });
                    totalLoaded += newPosts.length;
                    updateCounter();
                    console.log(`[PE] User page: page ${pageNum} loaded (${newPosts.length} posts, ${totalLoaded} total, nextUrl: ${nextUrl ? 'yes' : 'none'})`);

                    if (!nextUrl) {
                        allDone = true;
                        const end = document.createElement('div');
                        end.className = 'pe-up-end';
                        end.textContent = `All of ${username}'s posts loaded (${totalLoaded} total).`;
                        if (postsContainer) postsContainer.appendChild(end);
                        updateCounter();
                    } else {
                        setTimeout(() => {
                            if (!allDone && document.documentElement.scrollHeight <= window.innerHeight + 400) loadNextPage();
                        }, 200);
                    }
                }
            } catch (e) {
                console.error('[PE] User page load error:', e);
                loader.remove();
                allDone = true;
            }
            loading = false;
        }

        function start() {
            postsContainer = findPostsContainer();
            if (!postsContainer) {
                console.warn('[PE] User page: no posts container found, retrying...');
                setTimeout(start, 500);
                return;
            }

            totalLoaded = postsContainer.querySelectorAll('.post').length;
            nextUrl = findNextUrl(document);
            console.log(`[PE] User page: container found, ${totalLoaded} initial posts, nextUrl: ${nextUrl || 'none'}`);

            if (!nextUrl) {
                console.log('[PE] User page: no NEXT button found, trying API fallback');
                loadViaApi();
                return;
            }

            updateCounter();

            window.addEventListener('scroll', () => {
                if (allDone || loading) return;
                const scrollBottom = window.innerHeight + window.scrollY;
                const docHeight = document.documentElement.scrollHeight;
                if (scrollBottom >= docHeight - 800) loadNextPage();
            }, { passive: true });

            setTimeout(() => {
                if (!allDone && document.documentElement.scrollHeight <= window.innerHeight + 400) loadNextPage();
            }, 500);
        }

        async function loadViaApi() {
            const apiBase = `https://${host}`;
            let apiPage = 1;
            let apiLoading = false;

            async function fetchApiPage() {
                if (apiLoading || allDone) return;
                apiLoading = true;

                const loader = document.createElement('div');
                loader.className = 'pe-up-loader';
                loader.innerHTML = '<span class="pe-up-spinner"></span>Loading via API...';
                if (postsContainer) postsContainer.appendChild(loader);

                apiPage++;
                try {
                    const url = `${apiBase}/api/v2/user/posts.json?user=${encodeURIComponent(username)}&sort=new&page=${apiPage}`;
                    console.log(`[PE] User page API: ${url}`);
                    const resp = await fetch(url);
                    if (!resp.ok) { allDone = true; loader.remove(); apiLoading = false; return; }
                    const data = await resp.json();
                    loader.remove();

                    if (!data.posts || data.posts.length === 0) {
                        allDone = true;
                        const end = document.createElement('div');
                        end.className = 'pe-up-end';
                        end.textContent = `All of ${username}'s posts loaded (${totalLoaded} total).`;
                        if (postsContainer) postsContainer.appendChild(end);
                    } else {
                        for (const post of data.posts) {
                            const div = document.createElement('div');
                            div.className = 'post pe-api-post';
                            div.style.cssText = 'padding:12px 16px;border-bottom:1px solid #2a2a2a;';
                            const postUrl = `${base}/p/${post.uuid || post.id}`;
                            const age = post.created ? Math.round((Date.now() / 1000 - post.created) / 3600) : '?';
                            div.innerHTML = `
                                <div style="display:flex;gap:12px;align-items:flex-start;">
                                    <div style="text-align:center;min-width:40px;">
                                        <div style="color:#FF4500;font-weight:bold;font-size:14px;">${post.score || 0}</div>
                                    </div>
                                    <div style="flex:1;">
                                        <a href="${postUrl}" style="color:#4A9EFF;text-decoration:none;font-size:15px;font-weight:600;line-height:1.3;">${escHtml(post.title || 'Untitled')}</a>
                                        ${post.link ? `<div style="font-size:11px;color:#555;margin-top:2px;">${escHtml(post.link.substring(0, 80))}</div>` : ''}
                                        <div style="font-size:11px;color:#888;margin-top:4px;">${age}h ago • ${post.comment_count || 0} comments</div>
                                    </div>
                                    ${post.preview?.url ? `<img src="${post.preview.url}" style="width:70px;height:50px;object-fit:cover;border-radius:4px;">` : ''}
                                </div>`;
                            if (postsContainer) postsContainer.appendChild(div);
                        }
                        totalLoaded += data.posts.length;
                        updateCounter();
                        console.log(`[PE] User page API: page ${apiPage} (${data.posts.length} posts, ${totalLoaded} total)`);

                        setTimeout(() => {
                            if (!allDone && document.documentElement.scrollHeight <= window.innerHeight + 400) fetchApiPage();
                        }, 200);
                    }
                } catch (e) {
                    console.error('[PE] User page API error:', e);
                    loader?.remove();
                    allDone = true;
                }
                apiLoading = false;
            }

            updateCounter();

            window.addEventListener('scroll', () => {
                if (allDone || apiLoading) return;
                if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 800) fetchApiPage();
            }, { passive: true });

            setTimeout(() => {
                if (!allDone && document.documentElement.scrollHeight <= window.innerHeight + 400) fetchApiPage();
            }, 500);
        }

        function escHtml(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

        if (document.readyState === 'complete') setTimeout(start, 100);
        else window.addEventListener('load', () => setTimeout(start, 300));
    }

    // =========================================================================
    // USER PAGE EARLY EXIT
    // =========================================================================
    const path = window.location.pathname.toLowerCase();
    if (path.startsWith('/u/')) {
        console.log('[PE] User profile page — infinite scroll mode');
        injectUserPageInfiniteScroll();
        return;
    }

    // Console error capture
    const consoleErrors = [];
    const origError = console.error;
    console.error = function(...args) {
        consoleErrors.push({ ts: Date.now(), msg: args.map(a => String(a).substring(0, 300)).join(' ') });
        if (consoleErrors.length > 30) consoleErrors.shift();
        origError.apply(console, args);
    };
    window.addEventListener('error', e => {
        consoleErrors.push({ ts: Date.now(), msg: `${e.message} @ ${e.filename}:${e.lineno}` });
    });

    // =========================================================================
    // SITE ADAPTER
    // =========================================================================
    const SITE = (() => {
        const host = window.location.hostname;
        const isScored = host === 'scored.co' || host.endsWith('.scored.co');
        const isGAW = host.includes('greatawakening');
        const base = isScored ? 'https://scored.co' : `https://${host}`;
        const apiBase = isScored ? 'https://scored.co' : `https://${host}`;
        const siteKey = isGAW ? 'gaw' : isScored ? 'scored' : 'pdw';
        return { host, isScored, isGAW, siteKey, base,
            api: (ep) => `${apiBase}/api/v2/${ep}`,
            postUrl: (uuid) => `${base}/p/${uuid}`,
            submitUrl: () => `${base}/submit`,
            commentsApi: (nid) => `${apiBase}/api/v2/post/post.json?id=${nid}&comments=true`,
            postApi: (nid) => `${apiBase}/api/v2/post/post.json?id=${nid}&comments=false`,
            userApi: (u) => `${apiBase}/api/v2/user/about.json?user=${encodeURIComponent(u)}`,
            userPostsApi: (u) => `${apiBase}/api/v2/user/posts.json?user=${encodeURIComponent(u)}&sort=new`,
            // The feed API the site's own React app uses. Returns all visible posts
            // with uuid + numeric id + external link + domain in one call. Used by
            // primeCachesFromFeedApi() to replace the dead XHR-interception path
            // (MV3 isolated world can't patch the page's XHR). Community name is
            // derived from host: patriots.win -> TheDonald, gaw -> greatawakening,
            // generic scored.co subdomains use the subdomain.
            community: isGAW ? 'greatawakening' : isScored ? host.split('.')[0] : 'TheDonald',
            feedApi: (sort) => `${apiBase}/api/v2/post/${sort || 'hotv2'}.json?community=${isGAW ? 'greatawakening' : isScored ? host.split('.')[0] : 'TheDonald'}`,
        };
    })();

    // =========================================================================
    // V2-STUB: REPUTATION (designed-in, not built)
    // Identity extraction + no-op award query. Zero UI decoration in V1.
    // V2 fills in queryUser (worker backend) + award buttons / rank badges.
    // =========================================================================
    const REPUTATION = {
        _self: null,
        // Read logged-in username from DOM. scored.co header patterns vary;
        // try several known anchors. Returns lowercase username or null.
        getLoggedInUsername() {
            if (this._self !== null) return this._self || null;
            const candidates = [
                document.querySelector('a[href="/u/me"]'),
                document.querySelector('a[href^="/u/me"]'),
                document.querySelector('.user-menu a[href^="/u/"]'),
                document.querySelector('header a[href^="/u/"]:not([href="/u/me"])'),
                document.querySelector('.navbar a[href^="/u/"]'),
                document.querySelector('[data-username]'),
            ];
            for (const el of candidates) {
                if (!el) continue;
                const attr = el.getAttribute('data-username');
                if (attr && attr !== 'me') { this._self = attr.toLowerCase(); return this._self; }
                const href = el.getAttribute('href') || '';
                const m = href.match(/^\/u\/([^\/\?]+)/);
                if (m && m[1] && m[1] !== 'me') { this._self = m[1].toLowerCase(); return this._self; }
            }
            this._self = '';
            return null;
        },
        // V2-STUB: no-op. Real impl will call worker for awards/rank.
        async queryUser(username) {
            if (!username) return { awards: 0, rank: null, username: null };
            return { awards: 0, rank: null, username: String(username).toLowerCase() };
        },
        // Call once at init so identity path is exercised on both sites.
        probe() {
            const u = this.getLoggedInUsername();
            console.log(`[PE] V2-STUB identity: ${u || '(not logged in)'} on ${SITE.siteKey}`);
            return u;
        },
    };

    // =========================================================================
    // INDEXEDDB (24h read window)
    // =========================================================================
    const IDB_TTL_MS = 7 * 24 * 60 * 60 * 1000;
    const IDB_MAX_ENTRIES = 5000;
    const peDB = {
        db: null,
        async init() { return new Promise(resolve => { const req = indexedDB.open('peCache', 1); req.onupgradeneeded = e => { const db = e.target.result; if (!db.objectStoreNames.contains('posts')) db.createObjectStore('posts', { keyPath: 'uuid' }); }; req.onsuccess = e => { this.db = e.target.result; resolve(); }; req.onerror = () => resolve(); }); },
        async set(uuid, data) { if (!this.db) return; try { const tx = this.db.transaction('posts', 'readwrite'); tx.objectStore('posts').put({ uuid, ...data, ts: Date.now() }); } catch (e) { console.error('[PE] IDB set', e); } },
        async get(uuid) { if (!this.db) return null; return new Promise(r => { try { const tx = this.db.transaction('posts', 'readonly'); const req = tx.objectStore('posts').get(uuid); req.onsuccess = () => r(req.result || null); req.onerror = () => r(null); } catch { r(null); } }); },
        async deleteMany(uuids) { if (!this.db || !uuids.length) return; try { const tx = this.db.transaction('posts', 'readwrite'); const s = tx.objectStore('posts'); for (const u of uuids) s.delete(u); } catch {} },
        async setMany(entries) { if (!this.db || !entries.length) return; try { const tx = this.db.transaction('posts', 'readwrite'); const s = tx.objectStore('posts'); for (const { uuid, data } of entries) s.put({ uuid, ...data, ts: Date.now() }); } catch {} },
        async getAllReadUUIDs() { if (!this.db) return []; return new Promise(r => { try { const tx = this.db.transaction('posts', 'readonly'); const req = tx.objectStore('posts').openCursor(); const res = []; const maxAge = 24 * 3600000; const now = Date.now(); req.onsuccess = e => { const c = e.target.result; if (c) { const v = c.value; if ((v.read || v.bulkHidden) && v.ts && (now - v.ts) < maxAge) res.push(v.uuid); c.continue(); } else r(res); }; req.onerror = () => r([]); } catch { r([]); } }); },
        async clear() { if (!this.db) return; try { const tx = this.db.transaction('posts', 'readwrite'); tx.objectStore('posts').clear(); } catch {} },
        async cleanup() { if (!this.db) return; try { const tx = this.db.transaction('posts', 'readwrite'); const s = tx.objectStore('posts'); const all = s.getAll(); all.onsuccess = () => { const now = Date.now(); const recs = all.result || []; const exp = recs.filter(r => r.ts && (now - r.ts) > IDB_TTL_MS); if (exp.length) { const dtx = this.db.transaction('posts', 'readwrite'); const ds = dtx.objectStore('posts'); exp.forEach(r => ds.delete(r.uuid)); } console.log(`[PE] IDB cleanup: ${exp.length} expired`); }; } catch {} }
    };

    // =========================================================================
    // CONSTANTS & CONFIG
    // =========================================================================
    const RE = { UUID_LINK: /\/p\/([a-zA-Z0-9_-]+)/, NUMERIC_ID_6: /^\d{6,}$/, NUMERIC_ID: /^\d+$/, NUMERIC_ID_7: /^\d{7,}$/, AGE_TEXT: /(\d+)\s*(minute|min|hour|hr|h|day|d)[s]?\s+ago/i, TWEET_URL: /(?:twitter|x)\.com\/\w+\/status\/(\d+)/, IMG_EXT: /\.(jpg|jpeg|png|gif|webp)/i, COMMENT_TEXT: /^\d+\s*comment/, JSON_ID: /"id"\s*:\s*(\d{7,})/, DATA_ID: /data-id="(\d{7,})"/, MEDIA_PATH: /\/(preview|thumb|icon|small|medium)\//, USER_LINK: /^\/u\/([^\/\?]+)/ };

    const DOMAIN_BADGES = { 'twitter.com': { icon: '\u{1D54F}', color: '#1DA1F2' }, 'x.com': { icon: '\u{1D54F}', color: '#1DA1F2' }, 'youtube.com': { icon: '▶', color: '#FF0000' }, 'youtu.be': { icon: '▶', color: '#FF0000' }, 'rumble.com': { icon: '🟢', color: '#85c742' }, 'bitchute.com': { icon: '₿', color: '#EF4136' }, 'gab.com': { icon: 'G', color: '#21cf7a' }, 'truthsocial.com': { icon: 'T', color: '#5448ee' }, 'gettr.com': { icon: 'G', color: '#FF0000' }, 'instagram.com': { icon: '📷', color: '#E4405F' }, 'tiktok.com': { icon: '♪', color: '#000000' }, 'reddit.com': { icon: 'r/', color: '#FF4500' }, 'foxnews.com': { icon: 'FOX', color: '#003366' }, 'breitbart.com': { icon: 'BB', color: '#F37021' }, 'thegatewaypundit.com': { icon: 'TGP', color: '#C41230' }, 'zerohedge.com': { icon: 'ZH', color: '#F7931A' }, 'dailycaller.com': { icon: 'DC', color: '#00A4E4' }, 'nypost.com': { icon: 'NYP', color: '#C4122F' }, 'epochtimes.com': { icon: 'ET', color: '#1a3668' } };

    const TT = { IMG: 'img', TWEET: 'tweet', COMMENTS: 'comments', USER: 'user', LINK: 'link' };
    const NET = { COMMENTS_TIMEOUT: 10000, TWEET_TIMEOUT: 8000, OG_TIMEOUT: 12000, USER_TIMEOUT: 8000, PAGE_FETCH_TIMEOUT: 8000 };
    const CACHE_LIMITS = { images: 200, tweets: 100, comments: 100, users: 100, links: 100, uuidMap: 500, postLinks: 300 };
    const DEFAULT_CONFIG = { enabled: true, maxHours: 8, hideUpvoted: true, hideDownvoted: true, hideSidebar: true, hoverZoom: true, safeMode: false, debugMode: true, autoAdvance: true, showDomainBadges: true, showVoteIndicators: true, keywords: [], blocklist: [], minScore: 0 };

    const CONFIG_STORAGE_KEY = 'pe_config_' + SITE.siteKey;
    function loadSiteConfig() { const s = GM_getValue(CONFIG_STORAGE_KEY, null); if (s) return { ...DEFAULT_CONFIG, ...s }; return { ...DEFAULT_CONFIG, ...GM_getValue('pe_config', {}) }; }
    let CONFIG = loadSiteConfig();
    // safeMode is a session-only toggle, never persisted across reloads
    CONFIG.safeMode = false;
    if (typeof CONFIG.maxHours !== 'number' || CONFIG.maxHours < 0) CONFIG.maxHours = 8;
    if (!Array.isArray(CONFIG.keywords)) CONFIG.keywords = [];
    if (!Array.isArray(CONFIG.blocklist)) CONFIG.blocklist = [];
    if (typeof CONFIG.minScore !== 'number') CONFIG.minScore = 0;

    const MAX_VOTES = 2000;
    const READ_HIDE_TTL_MS = 24 * 3600000;

    const STATE = {
        upvotedIDs: new Set(GM_getValue('pe_upvoted', [])), downvotedIDs: new Set(GM_getValue('pe_downvoted', [])),
        upvoteTimestamps: new Map(GM_getValue('pe_upvote_timestamps', [])),
        readIDs: new Set(GM_getValue('pe_read', [])), readTimestamps: new Map(GM_getValue('pe_read_timestamps', [])),
        seenIDs: new Set(), visibleCount: 0, hiddenCount: 0, isHydrated: false,
        prefetchedImages: new Map(), tweetCache: new Map(), textPostCache: new Map(),
        linkCache: new Map(), commentCache: new Map(), userCache: new Map(), uuidToIdMap: new Map(),
        postLinkCache: new Map(), // uuid -> {link, domain} | null (resolved-nothing) — populated via API, see fetchPostLinkInfo
        settingsPanelOpen: false, isPostPage: window.location.pathname.includes('/p/'),
        // v1.1.0 FIX: isUserPage detects /u/<username> profile pages. Feed
        // filters (age, hideUpvoted, hideDownvoted, read-history, keywords,
        // blocklist, minScore) are DISABLED here — they are feed conveniences
        // and are actively hostile on a user's history page (e.g. a user
        // reviewing their own old posts would see everything >8h old vanish).
        // This was the 9-month "posts eat themselves" bug: filters applied
        // indiscriminately blanked every history post within seconds of load.
        isUserPage: /^\/u\//i.test(window.location.pathname),
        currentPostUuid: null, currentPostNumericId: null, hoveredPostEl: null,
        currentVideo: null, lastHovered: [], voteLog: [], lastVote: null,
        sessionProcessed: 0, currentPostIndex: -1, visiblePosts: [],
        hoverPinned: false, scrollPos: GM_getValue('pe_scrollPos', 0),
        helpOverlayOpen: false, undoPending: null, undoTimer: null, idbHiddenCount: 0,
        scanStats: { total: 0, newPosts: 0, filtered: 0, decorated: 0, lastMs: 0 }, filterDirty: false
    };

    // Purge expired readIDs on startup
    { const now = Date.now(); const exp = []; for (const [u, ts] of STATE.readTimestamps) { if (now - ts > READ_HIDE_TTL_MS) exp.push(u); } for (const u of exp) { STATE.readIDs.delete(u); STATE.readTimestamps.delete(u); } if (exp.length) console.log(`[PE] Purged ${exp.length} expired readIDs`); }

    const _inflight = new Map();
    function dedupedFetch(key, fn) { if (_inflight.has(key)) return _inflight.get(key); const p = fn().finally(() => _inflight.delete(key)); _inflight.set(key, p); return p; }

    // =========================================================================
    // UTILITIES
    // =========================================================================
    function lruTrim(m, l) { while (m.size > l) m.delete(m.keys().next().value); }
    // MEMORY LEAK FIX: uuidToIdMap had a CACHE_LIMITS.uuidMap cap defined but was
    // never actually trimmed at any of its call sites - it grew by one entry per
    // post ever seen, for the life of the tab, unbounded. Every write now goes
    // through this helper so the cap is actually enforced everywhere.
    function setUuidId(uuid, nid) { STATE.uuidToIdMap.set(uuid, nid); lruTrim(STATE.uuidToIdMap, CACHE_LIMITS.uuidMap); }
    // Same bug pattern in postLinkCache (added for the hoverzoom fix): only the
    // success branch trimmed, so the far-more-common "resolved nothing" (null)
    // writes on failure paths grew it unbounded. Centralized here too.
    function setPostLink(uuid, info) { STATE.postLinkCache.set(uuid, info); lruTrim(STATE.postLinkCache, CACHE_LIMITS.postLinks); }
    function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
    function apiCall(url, opts = {}) { return new Promise(r => { GM_xmlhttpRequest({ method: opts.method || 'GET', url, timeout: opts.timeout || NET.OG_TIMEOUT, headers: opts.json ? { 'Accept': 'application/json' } : undefined, onload: (res) => r({ ok: res.status >= 200 && res.status < 400, status: res.status, text: res.responseText }), onerror: () => r({ ok: false, error: 'network' }), ontimeout: () => r({ ok: false, error: 'timeout' }) }); }); }

    function showSnack(msg, type, duration) {
        document.getElementById('pe-snack')?.remove();
        const el = document.createElement('div'); el.id = 'pe-snack'; el.className = `pe-snack pe-snack-${type || 'info'}`;
        if (typeof msg === 'string' && msg.includes('<')) el.innerHTML = msg; else el.textContent = msg;
        document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('pe-snack-show'));
        setTimeout(() => { el.classList.remove('pe-snack-show'); setTimeout(() => el.remove(), 300); }, duration || 2000);
        return el;
    }

    let _saveTimer = null, _stateDirty = false;
    function scheduleSave() { if (!_stateDirty || _saveTimer) return; _saveTimer = setTimeout(() => { _saveTimer = null; _doSave(); }, 2000); }
    function markDirty() { _stateDirty = true; scheduleSave(); }
    function _doSave() { try {
        [STATE.upvotedIDs, STATE.downvotedIDs, STATE.readIDs].forEach(s => { if (s.size > MAX_VOTES) { const a = [...s].slice(-MAX_VOTES); s.clear(); a.forEach(i => s.add(i)); } });
        [STATE.upvoteTimestamps, STATE.readTimestamps].forEach(m => { if (m.size > MAX_VOTES) { const e = [...m].slice(-MAX_VOTES); m.clear(); e.forEach(([k,v]) => m.set(k,v)); } });
        GM_setValue(CONFIG_STORAGE_KEY, CONFIG); GM_setValue('pe_upvoted', [...STATE.upvotedIDs]); GM_setValue('pe_downvoted', [...STATE.downvotedIDs]);
        GM_setValue('pe_upvote_timestamps', [...STATE.upvoteTimestamps]); GM_setValue('pe_read', [...STATE.readIDs]); GM_setValue('pe_read_timestamps', [...STATE.readTimestamps]);
        _stateDirty = false;
    } catch (e) { console.error('[PE] Save', e); } }
    function saveState() { markDirty(); }

    // executeClick — jQuery first for GAW, React for PDW
    function executeClick(el) {
        if (!el) return { success: false, reason: 'no element' };
        try {
            if (window.jQuery || window.$) { try { (window.jQuery || window.$)(el).trigger('click'); return { success: true, method: 'jquery' }; } catch {} }
            const keys = Object.keys(el);
            for (const k of keys) { if (k.startsWith('__reactProps') || k.startsWith('__reactEventHandlers')) { const p = el[k]; if (p?.onClick) { p.onClick({ stopPropagation(){}, preventDefault(){}, nativeEvent: new MouseEvent('click'), target: el, currentTarget: el }); return { success: true, method: 'react' }; } } }
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            return { success: true, method: 'dispatch' };
        } catch (e) { return { success: false, reason: String(e).substring(0, 80) }; }
    }

    // =========================================================================
    // POST UTILITIES
    // =========================================================================
    function getPostUUID(p) { if (!p) return null; if (p.dataset.peUuid) return p.dataset.peUuid; const l = p.querySelector('a[href*="/p/"]'); if (!l) return null; const m = l.getAttribute('href').match(RE.UUID_LINK); if (m) { p.dataset.peUuid = m[1]; return m[1]; } return null; }
    function getNumericPostId(p) { if (!p) return null; if (p.dataset.peNumericId) return p.dataset.peNumericId; const d = p.getAttribute('data-id'); if (d && RE.NUMERIC_ID_6.test(d)) { p.dataset.peNumericId = d; return d; } let el = p; for (let i = 0; i < 6; i++) { if (el.id && RE.NUMERIC_ID_6.test(el.id)) { p.dataset.peNumericId = el.id; return el.id; } el = el.parentElement; if (!el) break; } const uuid = getPostUUID(p); if (uuid && STATE.uuidToIdMap.has(uuid)) { const n = STATE.uuidToIdMap.get(uuid); p.dataset.peNumericId = n; return n; } if (STATE.isPostPage && STATE.currentPostNumericId) { p.dataset.peNumericId = STATE.currentPostNumericId; return STATE.currentPostNumericId; } return null; }
    function getPostAge(p) { const t = p.querySelector('time'); if (t) { const d = t.getAttribute('datetime'); if (d) return (Date.now() - new Date(d).getTime()) / 3600000; } const m = p.innerText.replace(/\n/g, ' ').match(RE.AGE_TEXT); if (m) { const v = parseInt(m[1]), u = m[2].toLowerCase(); if (u.startsWith('h')) return v; if (u.startsWith('mi')) return v / 60; if (u.startsWith('d')) return v * 24; } return 0; }
    // Use getAttribute('class') not .className — SVG elements have className as SVGAnimatedString object which crashes .toLowerCase()
    function findVoteButton(p, dir) { const c = p.querySelector('.vote, .voting, .score') || p; for (const b of c.querySelectorAll('a[data-direction], button, [class*="vote"]')) { const dd = b.getAttribute('data-direction'); if (dd === dir) return b; const cls = (b.getAttribute('class') || '').toLowerCase(); if (cls.includes('count') || cls.includes('score')) continue; if (dir === 'up' && cls.includes('up') && !cls.includes('down')) return b; if (dir === 'down' && cls.includes('down') && !cls.includes('up')) return b; } return null; }

    // getPostExternalUrl — FIXED 2026-07-14: the site source code reveals the
    // external URL is on <div class="preview-parent" href="..."> and <div class="flLuNk"
    // href="..."> — NOT on <a> tags. The title <a> always points to the internal /p/
    // permalink. The old code only checked <a> tags and data-link, so it NEVER found
    // the external URL from the DOM — it fell through to the API cache (which was
    // itself broken under MV3). Now we check div[href] first, which is synchronous
    // and works for every post without any API call.
    function getPostExternalUrl(p) {
        if (!p) return null;
        const dl = p.getAttribute('data-link');
        if (dl && dl.startsWith('http') && !dl.includes('greatawakening.win') && !dl.includes('patriots.win') && !dl.includes('scored.co')) return dl;
        // PRIMARY (current skin): the external URL is on a <div href> — .preview-parent
        // and .flLuNk both carry it. Check these BEFORE the <a> tag fallbacks.
        const divHref = p.querySelector('.preview-parent[href^="http"], [class*="flLuNk"][href^="http"]');
        if (divHref) {
            const h = divHref.getAttribute('href');
            if (h && !h.includes('greatawakening.win') && !h.includes('patriots.win') && !h.includes('scored.co')) return h;
        }
        // Fallback: old-skin <a> tags (harmless if current skin doesn't use them)
        const tl = p.querySelector('.title a[href^="http"], a.title[href^="http"]');
        if (tl) { const h = tl.getAttribute('href'); if (h && !h.includes('greatawakening.win') && !h.includes('patriots.win') && !h.includes('scored.co')) return h; }
        const uuid = getPostUUID(p);
        const cached = uuid ? STATE.postLinkCache.get(uuid) : null;
        if (cached && cached.link) return cached.link;
        return null;
    }

    // getPostDomain — the primary `.domain span` selector never matches the current
    // skin: the live DOM renders `<span class="... domain">(nypost.com)</span>` —
    // the "domain" class is on the span itself, not a parent wrapping a nested span.
    // Checked both (old-skin-compatible first, then the confirmed-live shape), strip
    // the decorative parens, and fall back to the API-resolved cache.
    function getPostDomain(p) {
        const ds = p.querySelector('.domain span') || p.querySelector('.domain, [class*="domain"]');
        if (ds) { const d = ds.textContent.trim().replace(/^\(|\)$/g, '').replace(/^www\./, ''); if (d) return d; }
        const uuid = getPostUUID(p);
        const cached = uuid ? STATE.postLinkCache.get(uuid) : null;
        if (cached && cached.domain) return cached.domain;
        const eu = getPostExternalUrl(p);
        if (eu) { try { return new URL(eu).hostname.replace(/^www\./, ''); } catch {} }
        // Check div[href] too (the external URL is on a <div href>, not <a href>)
        const l = p.querySelector('a[href^="http"]:not([href*="patriots.win"]):not([href*="scored.co"]):not([href*="greatawakening.win"]), .preview-parent[href^="http"]:not([href*="patriots.win"]):not([href*="scored.co"]):not([href*="greatawakening.win"])');
        if (!l) return null;
        try { return new URL(l.getAttribute('href') || l.href).hostname.replace(/^www\./, ''); } catch { return null; }
    }

    function getPostTitle(p) { const t = p.querySelector('.title, [class*="title"]'); return t ? (t.textContent || '').trim().toLowerCase() : ''; }
    function getPostAuthor(p) { const da = p.getAttribute('data-author'); if (da) return da.toLowerCase(); const l = p.querySelector('a[href^="/u/"]'); if (!l) return ''; const m = l.getAttribute('href').match(RE.USER_LINK); return m ? m[1].toLowerCase() : ''; }
    function getPostScore(p) { const s = p.querySelector('.vote .count, .score .count, .score-display, [class*="score"]'); if (!s) return 0; const t = (s.textContent || '').trim().toLowerCase().replace(/,/g, ''); if (t.endsWith('k')) return Math.round(parseFloat(t) * 1000) || 0; if (t.endsWith('m')) return Math.round(parseFloat(t) * 1000000) || 0; const v = parseFloat(t); return isNaN(v) ? 0 : v; }
    function isSticky(p) { if (!p) return false; if (p.getAttribute('data-stickied') === 'true' || p.classList.contains('stickied')) return true; if (p.querySelector('.stickied, .sticky, [class*="sticky"], [class*="pinned"]')) return true; const m = p.querySelector('.meta, .details, .tagline'); return m && (m.textContent || '').includes('Stickied'); }
    function getVisiblePosts() { return [...document.querySelectorAll('.post:not(.pe-hidden)')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top); }

    // NOTE (MV3 constraint, not a bug): content scripts run in an isolated JS
    // world, so patching XMLHttpRequest.prototype here no longer intercepts the
    // page's own React app traffic the way it did under Tampermonkey's shared-
    // prototype sandbox. This was purely a free-performance-boost cache-warmer
    // for uuid<->numericId lookups; getNumericPostId()'s DOM ancestor-id walk
    // (confirmed working against the live site) and fetchNumericIdForUuid()'s
    // on-demand network fallback fully cover correctness on their own. Left in
    // place as harmless dead code rather than removed, since it costs nothing.
    function interceptNetworkForIds() { const orig = XMLHttpRequest.prototype.send; XMLHttpRequest.prototype.send = function(...a) { this.addEventListener('load', function() { try { if (this.responseText?.startsWith('{')) { const d = JSON.parse(this.responseText); if (d.posts && Array.isArray(d.posts)) d.posts.forEach(p => { if (p.uuid && p.id) setUuidId(p.uuid, String(p.id)); }); if (d.post?.uuid && d.post?.id) { setUuidId(d.post.uuid, String(d.post.id)); if (STATE.isPostPage && d.post.uuid === STATE.currentPostUuid) STATE.currentPostNumericId = String(d.post.id); } } } catch {} }); return orig.apply(this, a); }; }
    async function fetchNumericIdForUuid(uuid) { if (STATE.uuidToIdMap.has(uuid)) return STATE.uuidToIdMap.get(uuid); return dedupedFetch('uuid:' + uuid, () => new Promise(r => { GM_xmlhttpRequest({ method: 'GET', url: SITE.postUrl(uuid), timeout: NET.PAGE_FETCH_TIMEOUT, onload: (res) => { const m1 = res.responseText.match(RE.JSON_ID); if (m1) { setUuidId(uuid, m1[1]); r(m1[1]); return; } const m2 = res.responseText.match(RE.DATA_ID); if (m2) { setUuidId(uuid, m2[1]); r(m2[1]); return; } r(null); }, onerror: () => r(null), ontimeout: () => r(null) }); })); }
    function getHiResUrl(s) { return s?.includes('media.scored.co') ? s.replace(RE.MEDIA_PATH, '/post/') : s; }
    function isImgUrl(u) { return u ? (RE.IMG_EXT.test(u) || u.includes('media.scored.co')) : false; }
    function extractTweetId(u) { const m = u.match(RE.TWEET_URL); return m ? m[1] : null; }

    // fetchPostLinkInfo — resolves a post's real external link + domain via the
    // site's own post API (the same numeric-ID machinery already used for
    // comments hover). This is the fix for HOVERZOOM/domain-badges never
    // resolving external-domain posts: confirmed live that 0/29 sampled feed
    // posts expose an external href anywhere in the DOM, only via this API.
    async function fetchPostLinkInfo(uuid) {
        if (STATE.postLinkCache.has(uuid)) return STATE.postLinkCache.get(uuid);
        return dedupedFetch('link:' + uuid, async () => {
            let nid = STATE.uuidToIdMap.get(uuid);
            if (!nid) nid = await fetchNumericIdForUuid(uuid);
            if (!nid) { setPostLink(uuid, null); return null; }
            const r = await apiCall(SITE.postApi(nid), { timeout: NET.USER_TIMEOUT, json: true });
            if (!r.ok) { setPostLink(uuid, null); return null; }
            try {
                const d = JSON.parse(r.text);
                const post = d.posts && d.posts[0];
                if (!post || !post.link) { setPostLink(uuid, null); return null; }
                const isInternal = post.link.includes('media.scored.co') || post.link.includes('patriots.win') || post.link.includes('greatawakening.win') || post.link.includes('scored.co');
                const info = isInternal ? null : { link: post.link, domain: (post.domain || '').replace(/^www\./, '') };
                setPostLink(uuid, info);
                return info;
            } catch { setPostLink(uuid, null); return null; }
        });
    }

    // primeCachesFromFeedApi — THE FIX for the dead interceptNetworkForIds().
    // Under MV3, content scripts run in an isolated world and cannot patch the
    // page's XMLHttpRequest, so the old uuid<->id harvester is inert. This
    // function replaces it by fetching the SAME feed API the site's React app
    // uses (hotv2.json) via the background relay, which CAN do cross-origin.
    // One call returns every visible post with uuid + numeric id + external
    // link + domain, populating uuidToIdMap + postLinkCache directly — so
    // domain badges render and HOVERZOOM can resolve tweet/link previews
    // without the per-post API round-trips the old chain needed.
    // (Confirmed live: hotv2.json returns ~130 posts with link+domain for ~93.)
    let _feedPrimedAt = 0;
    async function primeCachesFromFeedApi() {
        // Throttle: re-prime at most every 60s so feed rescans don't hammer it.
        if (Date.now() - _feedPrimedAt < 60000) return;
        _feedPrimedAt = Date.now();
        try {
            const r = await apiCall(SITE.feedApi('hotv2'), { timeout: NET.OG_TIMEOUT, json: true });
            if (!r.ok) return;
            const d = JSON.parse(r.text);
            const posts = d.posts || [];
            let idCount = 0, linkCount = 0;
            for (const p of posts) {
                if (p.uuid && p.id) { setUuidId(p.uuid, String(p.id)); idCount++; }
                if (p.uuid && p.link && !STATE.postLinkCache.has(p.uuid)) {
                    const isInternal = p.link.includes('media.scored.co') || p.link.includes('patriots.win') || p.link.includes('greatawakening.win') || p.link.includes('scored.co');
                    if (!isInternal) { setPostLink(p.uuid, { link: p.link, domain: (p.domain || '').replace(/^www\./, '') }); linkCount++; }
                    else setPostLink(p.uuid, null);
                }
            }
            console.log(`[PE] Feed API primed: ${idCount} uuid->id, ${linkCount} external links from ${posts.length} posts`);
            // Force a full re-decoration: clear the tweaked flag on every post so
            // _decoratePost runs again with the now-populated postLinkCache. This is
            // what makes domain badges render (the badge logic inside _decoratePost
            // only fires when the cache MISSes and calls fetchPostLinkInfo — but now
            // the cache is pre-populated, so we must re-enter decoration to apply it).
            document.querySelectorAll('.post[data-pe-tweaked]').forEach(p => delete p.dataset.peTweaked);
            scheduleFullRescan();
        } catch (e) { console.log('[PE] Feed API prime failed:', e.message); }
    }

    // =========================================================================
    // FETCHERS
    // =========================================================================
    function fetchComments(nid) { if (!nid) return Promise.resolve([]); if (STATE.commentCache.has(nid)) return Promise.resolve(STATE.commentCache.get(nid)); return dedupedFetch('c:' + nid, () => new Promise(r => { GM_xmlhttpRequest({ method: 'GET', url: SITE.commentsApi(nid), timeout: NET.COMMENTS_TIMEOUT, onload: (res) => { try { const d = JSON.parse(res.responseText); if (d.comments?.length) { const p = d.comments.filter(c => !c.is_deleted && !c.is_removed && c.raw_content).sort((a, b) => (b.score||0) - (a.score||0)).slice(0, 14).map(c => { let b2 = (c.raw_content||'').replace(/\s+/g, ' ').trim(); const w = b2.split(/\s+/).length; if (w > 120) b2 = b2.split(/\s+/).slice(0, 120).join(' ') + '...'; return { author: c.author||'anon', score: c.score||0, body: b2, wordCount: Math.min(w, 120), isNested: c.comment_parent_id !== 0 }; }).filter(c => c.body.length > 5); STATE.commentCache.set(nid, p); lruTrim(STATE.commentCache, CACHE_LIMITS.comments); r(p); } else { STATE.commentCache.set(nid, []); r([]); } } catch { STATE.commentCache.set(nid, []); r([]); } }, onerror: () => { STATE.commentCache.set(nid, []); r([]); }, ontimeout: () => { STATE.commentCache.set(nid, []); r([]); } }); })); }

    // fetchTweetFrom / fetchTweet — added a vxtwitter.com fallback endpoint
    // (same fxtwitter-compatible API shape) for when the primary fxtwitter.com
    // API fails or rate-limits a specific tweet, before giving up.
    function fetchTweetFrom(apiUrl) {
        return new Promise(r => {
            GM_xmlhttpRequest({ method: 'GET', url: apiUrl, timeout: NET.TWEET_TIMEOUT,
                onload: (res) => { try { const d = JSON.parse(res.responseText).tweet; const td = { text: d.text, author: d.author.name, handle: d.author.screen_name, avatar: d.author.avatar_url, media: d.media?.photos?.[0]?.url||'', video: d.media?.videos?.[0]?.url||d.media?.video?.url||'', videoThumb: d.media?.videos?.[0]?.thumbnail_url||d.media?.video?.thumbnail_url||'', quote: null, replyingTo: null }; if (d.quote) td.quote = { text: d.quote.text||'', author: d.quote.author?.name||'', handle: d.quote.author?.screen_name||'' }; if (!td.quote && d.replying_to) td.replyingTo = d.replying_to; r(td); } catch { r(null); } },
                onerror: () => r(null), ontimeout: () => r(null) });
        });
    }
    function fetchTweet(url) {
        const tid = extractTweetId(url);
        if (!tid) return Promise.resolve(null);
        if (STATE.tweetCache.has(tid)) return Promise.resolve(STATE.tweetCache.get(tid));
        return dedupedFetch('t:' + tid, async () => {
            const primary = await fetchTweetFrom(`https://api.fxtwitter.com/status/${tid}`);
            const result = primary || await fetchTweetFrom(`https://api.vxtwitter.com/status/${tid}`);
            STATE.tweetCache.set(tid, result);
            lruTrim(STATE.tweetCache, CACHE_LIMITS.tweets);
            return result;
        });
    }

    async function fetchOG(url) { if (STATE.linkCache.has(url)) return STATE.linkCache.get(url); return dedupedFetch('og:' + url, async () => { const r = await apiCall(url); if (!r.ok) { STATE.linkCache.set(url, { error: true }); return { error: true }; } try { const doc = new DOMParser().parseFromString(r.text, 'text/html'); const og = { title: doc.querySelector('meta[property="og:title"]')?.content || doc.querySelector('title')?.textContent || '', desc: doc.querySelector('meta[property="og:description"]')?.content || '', image: doc.querySelector('meta[property="og:image"]')?.content || '', body: '', wordCount: 0 }; const sels = ['article', '[itemprop="articleBody"]', '.article-body', '.article-content', '.post-content', '.entry-content', '[role="main"]', 'main']; let ce = null; for (const s of sels) { ce = doc.querySelector(s); if (ce?.textContent.trim().length > 200) break; } const src = ce || doc.body; if (src) { src.querySelectorAll('script,style,nav,footer,aside,form,header,.ad,.sidebar,.comments').forEach(e => e.remove()); const ps = []; src.querySelectorAll('p').forEach(p => { const t = p.textContent.trim(); if (t.length >= 25) ps.push(t); }); let acc = ''; for (const p of ps) { acc += p + '\n\n'; if (acc.split(/\s+/).length >= 300) break; } og.body = acc.trim(); og.wordCount = acc.split(/\s+/).filter(Boolean).length; } STATE.linkCache.set(url, og); lruTrim(STATE.linkCache, CACHE_LIMITS.links); return og; } catch (e) { STATE.linkCache.set(url, { error: true }); return { error: true }; } }); }
    async function fetchUser(username) { if (STATE.userCache.has(username)) return STATE.userCache.get(username); return dedupedFetch('u:' + username, async () => { const r = await apiCall(SITE.userApi(username), { timeout: NET.USER_TIMEOUT, json: true }); if (!r.ok) { STATE.userCache.set(username, { error: true }); return { error: true }; } try { const d = JSON.parse(r.text); if (d?.users?.[0]) { const u = d.users[0]; const ud = { username: u.username, created: u.created, postKarma: u.post_score||0, commentKarma: u.comment_score||0, isAdmin: u.is_admin, isSuspended: u.is_suspended, moderates: u.moderates||[], error: false, activity: null }; try { const pr = await apiCall(SITE.userPostsApi(username), { timeout: NET.USER_TIMEOUT, json: true }); if (pr.ok) { const pd = JSON.parse(pr.text); if (pd.posts?.length > 1) { const ts = pd.posts.map(p => p.created).filter(Boolean).sort((a,b) => b-a); if (ts.length > 1) { const iv = []; for (let i = 0; i < ts.length-1; i++) iv.push(ts[i]-ts[i+1]); const avg = iv.reduce((a,b) => a+b, 0) / iv.length; ud.activity = { lastPost: new Date(ts[0]*1000).toLocaleDateString('en-US',{month:'short',day:'numeric'}), middlePost: new Date(ts[Math.floor(ts.length/2)]*1000).toLocaleDateString('en-US',{month:'short',day:'numeric'}), avgIntervalHours: Math.round(avg/3600), postCount: ts.length }; } } } } catch {} STATE.userCache.set(username, ud); lruTrim(STATE.userCache, CACHE_LIMITS.users); return ud; } } catch {} STATE.userCache.set(username, { error: true }); return { error: true }; }); }

    // preloadImage — added a fallback-to-original-src retry: if the hi-res
    // media.scored.co rewrite 404s (no hi-res variant was ever generated for
    // that upload, a real observed failure mode), retry the original raw src
    // before giving up. HOVER.show() below reads back the actually-working URL.
    function preloadImage(url, fallbackUrl) {
        if (STATE.prefetchedImages.has(url)) return Promise.resolve(STATE.prefetchedImages.get(url));
        return new Promise(r => {
            const img = new Image();
            img.onload = () => { const d = { loaded: true, w: img.naturalWidth, h: img.naturalHeight, src: url }; STATE.prefetchedImages.set(url, d); lruTrim(STATE.prefetchedImages, CACHE_LIMITS.images); r(d); };
            img.onerror = () => {
                if (fallbackUrl && fallbackUrl !== url) {
                    const img2 = new Image();
                    img2.onload = () => { const d = { loaded: true, w: img2.naturalWidth, h: img2.naturalHeight, src: fallbackUrl }; STATE.prefetchedImages.set(url, d); lruTrim(STATE.prefetchedImages, CACHE_LIMITS.images); r(d); };
                    img2.onerror = () => { STATE.prefetchedImages.set(url, { loaded: false }); r({ loaded: false }); };
                    img2.src = fallbackUrl;
                    return;
                }
                STATE.prefetchedImages.set(url, { loaded: false }); r({ loaded: false });
            };
            img.src = url;
        });
    }

    // =========================================================================
    // HOVER ZOOM (includes 50px margin + external-link resolution fix)
    // =========================================================================
    const C = { BG: '#111', BG2: '#1a1a1a', BG3: '#242424', BORDER: '#2a2a2a', BORDER2: '#3a3a3a', TEXT: '#E0E0E0', TEXT2: '#888', TEXT3: '#555', ACCENT: '#4A9EFF', GREEN: '#34C759', RED: '#FF453A', WARN: '#FF9F0A', QUOTE_BG: '#1e2a38' };
    const HOVER_MARGIN = 50;

    const HOVER = {
        box: null, currentKey: null, _showTimer: null, _hideTimer: null, _pendingTarget: null, _pendingEvent: null, _anchorEl: null,
        // Load-integrity: while _loadingKey is set, hide() only records intent
        // (_wantHide) and must NOT null currentKey. Post-fetch re-show depends on
        // currentKey surviving the await. v1.1.0 lost it to 450ms grace; v1.1.1
        // lost it to a re-armed hide timer racing re-show.
        _pointerOverBox: false, _docBound: false, _loadingKey: null, _wantHide: false,
        bindDocument() {
            if (this._docBound) return;
            this._docBound = true;
            document.addEventListener('mouseover', e => this._onOver(e));
            document.addEventListener('mouseout', e => {
                if (STATE.hoverPinned) return;
                const rt = e.relatedTarget;
                if (rt && rt.closest && rt.closest('#pe-hover-box')) { clearTimeout(this._hideTimer); return; }
                clearTimeout(this._hideTimer);
                this._hideTimer = setTimeout(() => {
                    if (STATE.hoverPinned || STATE.currentVideo) return;
                    if (this._pointerOverBox) return;
                    this.hide();
                }, 1500);
            });
        },
        init() {
            if (this.box) return;
            this.box = document.createElement('div');
            this.box.id = 'pe-hover-box';
            document.body.appendChild(this.box);
            this.bindDocument();
            this.box.addEventListener('mouseenter', () => { this._pointerOverBox = true; this._wantHide = false; clearTimeout(this._hideTimer); });
            this.box.addEventListener('mouseleave', () => {
                this._pointerOverBox = false;
                if (STATE.hoverPinned || STATE.currentVideo) return;
                clearTimeout(this._hideTimer);
                this._hideTimer = setTimeout(() => this.hide(), 1500);
            });
            this.box.addEventListener('click', e => {
                if (e.target.closest('.pe-hover-action')) return;
                STATE.hoverPinned = !STATE.hoverPinned;
                this.box.classList.toggle('pe-pinned', STATE.hoverPinned);
                if (STATE.hoverPinned) this._wantHide = false;
                showSnack(STATE.hoverPinned ? '📌 Pinned' : 'Unpinned', 'info');
            });
            this.box.addEventListener('wheel', e => {
                e.preventDefault();
                const s = this.box.querySelector('.pe-hz-comments, .pe-hz-link-body');
                if (s) s.scrollTop += e.deltaY;
            }, { passive: false });
        },
        // Soft self-heal: recreate orphaned box without wiping currentKey/load state.
        ensureBox() {
            if (this.box && document.body.contains(this.box)) return;
            this.box = null;
            this._pointerOverBox = false;
            this.init();
        },
        async _onOver(e) {
            if (!CONFIG.hoverZoom || STATE.hoverPinned) return;
            this.ensureBox();
            // Ignore mouseovers inside the box so vote/video/scroll don't re-arm hide.
            if (this.box && this.box.contains(e.target)) { clearTimeout(this._hideTimer); this._wantHide = false; return; }
            clearTimeout(this._hideTimer);
            this._wantHide = false;
            STATE.lastHovered.unshift({ ts: Date.now(), tag: e.target.tagName, classes: e.target.className?.substring?.(0,80)||'' });
            if (STATE.lastHovered.length > 2) STATE.lastHovered.pop();
            const target = await this.resolveTarget(e.target);
            if (!target) { clearTimeout(this._showTimer); if (this.currentKey) this._hideTimer = setTimeout(() => this.hide(), 1500); return; }
            if (target.key === this.currentKey) return;
            this._pendingTarget = target; this._pendingEvent = e;
            this._anchorEl = e.target.closest('img') || e.target.closest('[href]') || e.target;
            clearTimeout(this._showTimer);
            this._showTimer = setTimeout(() => { if (this._pendingTarget) { this.currentKey = this._pendingTarget.key; this.show(this._pendingTarget, this._pendingEvent); } }, 150);
        },
        // True if the pointer is still engaged with this hover (box, anchor, or post).
        _pointerStillEngaged() {
            if (this._pointerOverBox) return true;
            try {
                if (this._anchorEl && this._anchorEl.matches && this._anchorEl.matches(':hover')) return true;
                if (STATE.hoveredPostEl && STATE.hoveredPostEl.matches && STATE.hoveredPostEl.matches(':hover')) return true;
            } catch {}
            return false;
        },
        // force=true bypasses pin + load lock (Escape / explicit dismiss after load).
        hide(force) {
            if (!force && STATE.hoverPinned) return;
            if (!force && this._loadingKey) {
                // During an in-flight fetch: never null currentKey (that was the
                // "Loading tweet..." stuck state). Only record intent-to-leave.
                // Do NOT schedule a racing hide timer (v1.1.1 bug).
                this._wantHide = true;
                return;
            }
            clearTimeout(this._showTimer);
            this._pendingTarget = null;
            this._anchorEl = null;
            this._wantHide = false;
            this._loadingKey = null;
            if (STATE.currentVideo) try { STATE.currentVideo.pause(); } catch {}
            STATE.currentVideo = null;
            const box = this.box;
            if (box) {
                box.classList.remove('pe-visible', 'pe-pinned');
                box.classList.add('pe-hiding');
                setTimeout(() => {
                    if (box === this.box || !document.body.contains(box)) {
                        box.classList.remove('pe-hiding');
                        box.innerHTML = '';
                    }
                }, 400);
            }
            this.currentKey = null;
        },
        // Shared post-fetch gate for all async hover branches.
        _afterLoad(key, target, e) {
            if (this._loadingKey === key) this._loadingKey = null;
            if (this.currentKey !== key) return;
            // If a hide was requested mid-load but the pointer is still on the
            // post/anchor/box, the leave was a jitter false-positive — paint.
            if (this._wantHide && this._pointerStillEngaged()) this._wantHide = false;
            if (this._wantHide && !STATE.hoverPinned) {
                this._wantHide = false;
                this.hide(true);
                return;
            }
            this._wantHide = false;
            this.show(target, e);
        },
        async resolveTarget(t) {
            const postEl = t.closest('.post'); if (postEl) STATE.hoveredPostEl = postEl;
            // COMMANDER DIRECTIVE 2026-07-22: hover-zoom fires ONLY on post
            // thumbnails (.thumb), nowhere else. Every link-based hover path
            // (titles, comment counts, user cards, external article previews,
            // tweets resolved from anchors) is disabled. Hover the thumbnail
            // image to get the zoom; hover anything else and nothing happens.
            if (!t.closest('.thumb')) return null;
            const link = t.closest('[href]'); const src = t.getAttribute?.('src');
            if (link) { const h = link.getAttribute('href')||''; const um = h.match(RE.USER_LINK); if (um && um[1] !== 'me') return { type: TT.USER, username: um[1], key: 'user:' + um[1] }; }
            if (link) { const lt = (t.textContent||'').trim().toLowerCase(); const ft = (link.textContent||'').trim().toLowerCase(); const h = link.getAttribute('href')||''; if ((RE.COMMENT_TEXT.test(lt) || RE.COMMENT_TEXT.test(ft)) && h.includes('/p/')) { let nid = postEl ? getNumericPostId(postEl) : null; if (!nid) { const um = h.match(/\/p\/([a-zA-Z0-9]+)/); if (um) nid = STATE.uuidToIdMap.get(um[1]) || await fetchNumericIdForUuid(um[1]); } if (nid) return { type: TT.COMMENTS, numericId: nid, key: 'comments:' + nid }; } }
            if (link) { const h = link.getAttribute('href')||''; if (h.includes('twitter.com') || h.includes('x.com')) { const tid = extractTweetId(h); if (tid) return { type: TT.TWEET, url: h, key: 'tweet:' + tid }; } if (isImgUrl(h) && !(t.tagName === 'IMG' && t.width > 425)) return { type: TT.IMG, url: getHiResUrl(h), fallbackUrl: h, key: 'img:' + h }; if (h.startsWith('http') && !h.includes('patriots.win') && !h.includes('scored.co') && !h.includes('greatawakening.win')) return { type: TT.LINK, url: h, key: 'link:' + h }; }
            // FIX: the current site skin never puts the real external URL on any
            // in-post anchor (confirmed live) — every internal-href hover (title,
            // permalink timestamp, etc.) falls through to here. Now that
            // getPostExternalUrl reads the <div href> from .preview-parent directly,
            // check it FIRST — synchronous, works for every post without any API call.
            // The cache/API fallbacks below only fire if the DOM doesn't expose it.
            if (link && postEl) {
                const h = link.getAttribute('href') || '';
                const isInternal = h.startsWith('/') || h.includes('patriots.win') || h.includes('greatawakening.win') || h.includes('scored.co');
                if (isInternal) {
                    // PRIMARY: read external URL directly from the post's div[href]
                    const eu = getPostExternalUrl(postEl);
                    if (eu) {
                        if (eu.includes('twitter.com') || eu.includes('x.com')) { const tid = extractTweetId(eu); if (tid) return { type: TT.TWEET, url: eu, key: 'tweet:' + tid }; }
                        return { type: TT.LINK, url: eu, key: 'link:' + eu };
                    }
                    // FALLBACK: API-backed cache (for any skin that doesn't expose div[href])
                    const uuid = getPostUUID(postEl);
                    if (uuid) {
                        const cached = STATE.postLinkCache.get(uuid);
                        if (cached && cached.link) {
                            const eu2 = cached.link;
                            if (eu2.includes('twitter.com') || eu2.includes('x.com')) { const tid = extractTweetId(eu2); if (tid) return { type: TT.TWEET, url: eu2, key: 'tweet:' + tid }; }
                            return { type: TT.LINK, url: eu2, key: 'link:' + eu2 };
                        } else if (cached === undefined) {
                            fetchPostLinkInfo(uuid);
                        }
                    }
                }
            }
            if (t.tagName === 'IMG' && src && t.width >= 40 && t.height >= 40) {
                const pl = t.closest('a[href]');
                if (pl) { const ph = pl.getAttribute('href')||''; if (ph.includes('twitter.com') || ph.includes('x.com')) { const tid = extractTweetId(ph); if (tid) return { type: TT.TWEET, url: ph, key: 'tweet:' + tid }; } if (ph.startsWith('http') && !ph.includes('patriots.win') && !ph.includes('scored.co') && !ph.includes('greatawakening.win')) return { type: TT.LINK, url: ph, key: 'link:' + ph }; if (isImgUrl(ph) && t.width <= 425) return { type: TT.IMG, url: getHiResUrl(ph), fallbackUrl: ph, key: 'img:' + ph };
                    if (postEl && (ph.includes('/p/') || ph.startsWith('/'))) { const eu = getPostExternalUrl(postEl); if (eu) { if (eu.includes('twitter.com') || eu.includes('x.com')) { const tid = extractTweetId(eu); if (tid) return { type: TT.TWEET, url: eu, key: 'tweet:' + tid }; } return { type: TT.LINK, url: eu, key: 'link:' + eu }; } }
                }
                // FIX: on the current skin the thumbnail <img> is NOT wrapped in an
                // anchor at all (confirmed live — imgClosestA is always null), so `pl`
                // above is always null and this used to fall straight to a raw-image
                // zoom of a tiny 66x66 preview. Prefer the post's resolved external
                // link/tweet card — much higher value than the small raw thumbnail —
                // and only fall back to the plain image when there's nothing resolved.
                if (!pl && postEl) {
                    const uuid = getPostUUID(postEl);
                    if (uuid) {
                        const cached = STATE.postLinkCache.get(uuid);
                        if (cached && cached.link) {
                            const eu = cached.link;
                            if (eu.includes('twitter.com') || eu.includes('x.com')) { const tid = extractTweetId(eu); if (tid) return { type: TT.TWEET, url: eu, key: 'tweet:' + tid }; }
                            return { type: TT.LINK, url: eu, key: 'link:' + eu };
                        } else if (cached === undefined) {
                            fetchPostLinkInfo(uuid);
                        }
                    }
                }
                // Large images with nothing resolvable are the only ones we skip
                // (moved from a blanket early-return so it never suppresses the
                // richer link/tweet cards above).
                if (isImgUrl(src) && t.width <= 425) return { type: TT.IMG, url: getHiResUrl(src), fallbackUrl: src, key: 'img:' + src };
            }
            return null;
        },
        positionToAnchor() { if (!this._anchorEl) return; const ar = this._anchorEl.getBoundingClientRect(); const bw = this.box.offsetWidth||400; const bh = this.box.offsetHeight||300; const ww = window.innerWidth; const wh = window.innerHeight; const M = HOVER_MARGIN; let x = ar.right + 15; if (x + bw + M > ww) x = ar.left - bw - 15; x = Math.max(M, Math.min(x, ww - bw - M)); let y = Math.max(M, Math.min(ar.top, wh - bh - M)); if (bh > wh - M*2) y = M; this.box.style.left = x + 'px'; this.box.style.top = y + 'px'; },
        reveal() { this.box.style.visibility = 'hidden'; this.box.style.left = '0'; this.box.style.top = '0'; requestAnimationFrame(() => { this.positionToAnchor(); this.box.style.visibility = 'visible'; this.box.classList.add('pe-visible'); setTimeout(() => this.positionToAnchor(), 50); setTimeout(() => this.positionToAnchor(), 150); setTimeout(() => this.positionToAnchor(), 300); }); },
        async show(target, e) {
            this.ensureBox();
            const box = this.box, key = target.key;
            clearTimeout(this._hideTimer);
            STATE.currentVideo = null; STATE.hoverPinned = false;
            box.innerHTML = ''; box.classList.remove('pe-visible', 'pe-hiding', 'pe-pinned');
            const actionBar = `<div class="pe-hover-actions"><button class="pe-hover-action pe-hvote-up" data-action="voteup">▲</button><button class="pe-hover-action pe-hvote-dn" data-action="votedown">▼</button><span class="pe-hover-sep"></span><button class="pe-hover-action" data-action="read">•</button><button class="pe-hover-action" data-action="copy">📋</button><button class="pe-hover-action" data-action="open">↗</button></div>`;
            if (target.type === TT.IMG) {
                const c = STATE.prefetchedImages.get(target.url);
                if (c?.loaded) {
                    if (c.w < 200) return;
                    const mw = Math.min(c.w, window.innerWidth-HOVER_MARGIN*2-20);
                    const mh = Math.min(c.h, window.innerHeight-HOVER_MARGIN*2-20);
                    box.innerHTML = `<img src="${esc(c.src || target.url)}" style="max-width:${mw}px;max-height:${mh}px;width:auto;height:auto;display:block;border-radius:6px;">`;
                    this.reveal();
                } else if (c && !c.loaded) {
                    box.innerHTML = '<span class="pe-hz-error">Image failed</span>'; this.reveal();
                } else {
                    box.innerHTML = '<div class="pe-spinner"></div><span class="pe-hz-loading">Loading...</span>'; this.reveal();
                    this._loadingKey = key;
                    try { await preloadImage(target.url, target.fallbackUrl); }
                    finally { this._afterLoad(key, target, e); }
                    return;
                }
            } else if (target.type === TT.TWEET) {
                const tid = extractTweetId(target.url);
                const c = STATE.tweetCache.get(tid);
                if (c) {
                    box.innerHTML = this.renderTweet(c) + actionBar; this.reveal();
                    const vid = box.querySelector('video');
                    if (vid) {
                        STATE.currentVideo = vid;
                        // Auto-pin only after content paints (never during load).
                        if (!STATE.hoverPinned) { STATE.hoverPinned = true; box.classList.add('pe-pinned'); }
                        vid.addEventListener('play', () => { STATE.currentVideo = vid; });
                        vid.addEventListener('ended', () => { STATE.currentVideo = null; });
                    }
                } else if (c === null) {
                    box.innerHTML = '<span class="pe-hz-warn">Tweet unavailable</span>'; this.reveal();
                } else {
                    box.innerHTML = '<div class="pe-spinner"></div>Loading tweet...'; this.reveal();
                    this._loadingKey = key;
                    try { await fetchTweet(target.url); }
                    finally { this._afterLoad(key, target, e); }
                    return;
                }
            } else if (target.type === TT.COMMENTS) {
                const c = STATE.commentCache.get(target.numericId);
                if (c !== undefined) {
                    box.innerHTML = c.length ? this.renderComments(c) : '<span class="pe-hz-warn">No comments</span>'; this.reveal();
                } else {
                    box.innerHTML = '<div class="pe-spinner"></div>Loading comments...'; this.reveal();
                    this._loadingKey = key;
                    try { await fetchComments(target.numericId); }
                    finally { this._afterLoad(key, target, e); }
                    return;
                }
            } else if (target.type === TT.USER) {
                const c = STATE.userCache.get(target.username);
                if (c && !c.error) { box.innerHTML = this.renderUser(c); this.reveal(); }
                else if (c?.error) { box.innerHTML = '<span class="pe-hz-warn">User not found</span>'; this.reveal(); }
                else {
                    box.innerHTML = '<div class="pe-spinner"></div>Loading user...'; this.reveal();
                    this._loadingKey = key;
                    try { await fetchUser(target.username); }
                    finally { this._afterLoad(key, target, e); }
                    return;
                }
            } else if (target.type === TT.LINK) {
                const c = STATE.linkCache.get(target.url);
                if (c && !c.error) { box.innerHTML = this.renderLink(c, target.url) + actionBar; this.reveal(); }
                else if (c?.error) { box.innerHTML = '<span class="pe-hz-warn">Preview unavailable</span>'; this.reveal(); }
                else {
                    box.innerHTML = '<div class="pe-spinner"></div>Loading preview...'; this.reveal();
                    this._loadingKey = key;
                    try { await fetchOG(target.url); }
                    finally { this._afterLoad(key, target, e); }
                    return;
                }
            }
            box.querySelectorAll('.pe-hover-action').forEach(btn => { btn.onclick = ev => { ev.stopPropagation(); const a = btn.dataset.action; if (a === 'copy') { GM_setClipboard(target.url || (STATE.hoveredPostEl ? SITE.postUrl(getPostUUID(STATE.hoveredPostEl)) : '')); showSnack('Copied!', 'success'); } else if (a === 'open') { const u = target.url || (STATE.hoveredPostEl ? SITE.postUrl(getPostUUID(STATE.hoveredPostEl)) : ''); if (u) window.open(u, '_blank'); } else if (a === 'voteup') handleVote('up'); else if (a === 'votedown') handleVote('down'); else if (a === 'read') markAsRead(); }; });
        },
        renderLink(og, url) { const d = url.replace(/^https?:\/\//,'').split('/')[0]; let bh = og.body ? `<div class="pe-hz-link-body">${og.body.split('\n\n').filter(p=>p.trim()).map(p=>`<p>${esc(p)}</p>`).join('')}</div>` : (og.desc ? `<div class="pe-hz-link-desc">${esc(og.desc)}</div>` : ''); return `<div class="pe-hz-link-card">${og.image?`<div class="pe-hz-link-img-wrap"><img src="${esc(og.image)}" class="pe-hz-link-img"><div class="pe-hz-link-caption">${esc(d)}${og.wordCount?` • ${og.wordCount}w`:''}</div></div>`:''}<div class="pe-hz-link-content"><div class="pe-hz-link-title">${esc(og.title)}</div>${bh}</div></div>`; },
        // NOTE: og.image / t.avatar / t.media / t.video / t.videoThumb are all attacker-reachable
        // (arbitrary linked-article og:image, or fxtwitter/vxtwitter third-party JSON) — esc()
        // them even inside a src="" attribute position to prevent a quote-breakout + onerror=
        // injection, matching the escaping discipline already used for every text field here.
        renderTweet(t) { let mh = ''; if (t.video) mh = `<video src="${esc(t.video)}" poster="${esc(t.videoThumb||'')}" class="pe-hz-tweet-media" controls playsinline></video><div class="pe-hz-video-hint">SPACE play/pause</div>`; else if (t.media) mh = `<img src="${esc(t.media)}" class="pe-hz-tweet-media">`; let qh = ''; if (t.quote?.text) qh = `<div class="pe-hz-tweet-quote"><div class="pe-hz-tq-head"><span class="pe-hz-tq-name">${esc(t.quote.author)}</span><span class="pe-hz-tq-handle">@${esc(t.quote.handle)}</span></div><div class="pe-hz-tq-body">${esc(t.quote.text)}</div></div>`; else if (t.replyingTo) qh = `<div class="pe-hz-tweet-quote"><span style="color:${C.TEXT3}">Replying to @${esc(t.replyingTo)}</span></div>`; return `<div class="pe-hz-tweet"><div class="pe-hz-tweet-header">${t.avatar?`<img src="${esc(t.avatar)}" class="pe-hz-tweet-avatar">`:''}<div><div class="pe-hz-tweet-name">${esc(t.author)}</div><div class="pe-hz-tweet-handle">@${esc(t.handle)}</div></div></div><div class="pe-hz-tweet-body">${esc(t.text)}</div>${qh}${mh}</div>`; },
        renderComments(comments) { const tw = comments.reduce((s,c) => s+c.wordCount, 0); const rm = Math.max(1, Math.round(tw/230)); return `<div class="pe-hz-comments"><div class="pe-hz-comments-header"><span>TOP ${comments.length} COMMENTS</span><span class="pe-hz-comments-wc">~${rm} min</span></div><ul class="pe-hz-comments-list">${comments.map((c,i) => `<li class="pe-hz-comment ${i===0?'pe-top':''} ${c.isNested?'pe-nested':''}"><div class="pe-hz-cmeta"><span class="pe-hz-cauthor">${esc(c.author)}</span><span class="pe-hz-cscore">${c.score}pts</span></div><div class="pe-hz-cbody">${esc(c.body)}</div></li>`).join('')}</ul></div>`; },
        renderUser(u) { const days = Math.floor((Date.now()-u.created)/86400000); const age = days < 30 ? days+'d' : days < 365 ? Math.floor(days/30)+'mo' : Math.floor(days/365)+'y'; const badges = []; if (u.isAdmin) badges.push('<span class="pe-badge-admin">ADMIN</span>'); if (u.isSuspended) badges.push('<span class="pe-badge-susp">SUSPENDED</span>'); if (u.moderates?.length) badges.push('<span class="pe-badge-mod">MOD</span>'); let ah = ''; if (u.activity) { const avg = u.activity.avgIntervalHours < 24 ? u.activity.avgIntervalHours+'h' : Math.round(u.activity.avgIntervalHours/24)+'d'; ah = `<div class="pe-hz-user-activity"><div class="pe-hz-ua-title">Activity (${u.activity.postCount})</div><ul class="pe-hz-ua-list"><li><span>Last:</span><b>${u.activity.lastPost}</b></li><li><span>Mid:</span><b>${u.activity.middlePost}</b></li><li><span>Avg:</span><b>${avg}</b></li></ul></div>`; } return `<div class="pe-hz-user"><div class="pe-hz-user-head"><div class="pe-hz-user-av">👤</div><div><div class="pe-hz-user-name">${esc(u.username)}</div><div class="pe-hz-user-badges">${badges.join('')}</div></div></div><div class="pe-hz-user-stats"><div class="pe-hz-ustat"><b>${age}</b><span>Age</span></div><div class="pe-hz-ustat"><b>${u.postKarma.toLocaleString()}</b><span>Karma</span></div><div class="pe-hz-ustat"><b>${u.commentKarma.toLocaleString()}</b><span>Comment</span></div></div>${ah}</div>`; }
    };

    // =========================================================================
    // SEEN OBSERVER
    // =========================================================================
    let _seenObserver = null; const _seenTimers = new Map();
    function initSeenObserver() { if (_seenObserver) return; _seenObserver = new IntersectionObserver(entries => { for (const e of entries) { const p = e.target; const uuid = getPostUUID(p); if (!uuid) continue; if (e.isIntersecting) { if (!_seenTimers.has(uuid)) _seenTimers.set(uuid, setTimeout(() => { STATE.seenIDs.add(uuid); p.classList.add('pe-seen'); _seenObserver.unobserve(p); _seenTimers.delete(uuid); }, 1000)); } else { const t = _seenTimers.get(uuid); if (t) { clearTimeout(t); _seenTimers.delete(uuid); } } } }, { threshold: 0.5 }); }
    function observePostForSeen(p) { if (!_seenObserver) return; const u = getPostUUID(p); if (!u || STATE.seenIDs.has(u)) return; _seenObserver.observe(p); }

    // =========================================================================
    // FEED SCANNER
    // =========================================================================
    let _scanScheduled = false; function scheduleScan() { if (_scanScheduled) return; _scanScheduled = true; requestAnimationFrame(() => { _scanScheduled = false; _doScanFeed(false); }); }
    function scheduleFullRescan() { STATE.filterDirty = true; scheduleScan(); }
    let _lastScanMs = 0;

    // applyDomainBadge — adds a domain badge (▶ 𝕏 FOX etc.) to a post's title
    // if the domain matches a known badge. Idempotent (skips if badge exists).
    // Extracted so it can be called from the sync, cache-populated, and async-
    // fetch paths without duplicating the badge-creation logic.
    function applyDomainBadge(p, domain) {
        if (!domain || p.querySelector('.pe-domain-badge')) return;
        for (const [d, badge] of Object.entries(DOMAIN_BADGES)) {
            if (domain.includes(d)) {
                const b = document.createElement('span');
                b.className = 'pe-domain-badge';
                b.textContent = badge.icon;
                b.style.cssText = `color:${badge.color};font-weight:bold;margin-left:6px;font-size:12px;`;
                b.title = domain;
                const te = p.querySelector('.title,[class*="title"]');
                if (te) te.appendChild(b);
                return;
            }
        }
    }
    function _decoratePost(p, uuid) {
        STATE.sessionProcessed++;
        const title = getPostTitle(p); const author = getPostAuthor(p); const domain = getPostDomain(p); const score = getPostScore(p);
        p.dataset.peTitle = title; p.dataset.peAuthor = author; p.dataset.peScore = String(score);
        peDB.set(uuid, { title, author, domain, score, age: getPostAge(p) });
        p.querySelectorAll('a,button,span').forEach(el => { const t = (el.textContent||'').trim().toLowerCase(); if (['award','share','crosspost','download'].includes(t)) el.style.display = 'none'; });
        if (CONFIG.showDomainBadges && domain && !p.querySelector('.pe-domain-badge')) { applyDomainBadge(p, domain); }
        // Domain badge from pre-populated cache (primeCachesFromFeedApi): the cache
        // may already hold the resolved domain, so apply it directly here instead
        // of only inside the fetchPostLinkInfo miss-callback below.
        if (CONFIG.showDomainBadges && !p.querySelector('.pe-domain-badge')) {
            const cached = STATE.postLinkCache.get(uuid);
            if (cached && cached.domain) applyDomainBadge(p, cached.domain);
        }
        // Resolve the real external link/domain via the site API (see fetchPostLinkInfo).
        // Feeds BOTH the domain badge (async, since the sync path above usually can't
        // resolve on the current skin) and HOVER.resolveTarget()'s link/tweet detection.
        if (!STATE.postLinkCache.has(uuid)) {
            fetchPostLinkInfo(uuid).then(info => {
                if (info && info.domain && CONFIG.showDomainBadges && document.body.contains(p) && !p.querySelector('.pe-domain-badge')) {
                    applyDomainBadge(p, info.domain);
                }
            });
        }
        if (!p.querySelector('.pe-age-badge')) { const age = getPostAge(p); const b = document.createElement('span'); b.className = 'pe-age-badge'; b.textContent = '●'; b.style.color = age < 1 ? C.GREEN : age < 4 ? C.ACCENT : age < 8 ? C.WARN : C.RED; b.title = age < 1 ? '<1h' : Math.round(age) + 'h'; const te = p.querySelector('.title,[class*="title"]'); if (te) te.prepend(b); }
        if (CONFIG.showVoteIndicators) { let ind = p.querySelector('.pe-vote-indicator'); if (!ind) { ind = document.createElement('span'); ind.className = 'pe-vote-indicator'; (p.querySelector('.vote,.voting') || p).appendChild(ind); } if (STATE.upvotedIDs.has(uuid)) { ind.textContent = '✓'; ind.style.color = C.GREEN; } else if (STATE.downvotedIDs.has(uuid)) { ind.textContent = '✗'; ind.style.color = C.RED; } else if (STATE.readIDs.has(uuid)) { ind.textContent = '•'; ind.style.color = C.TEXT3; } }
        observePostForSeen(p);
    }

    function _filterPost(p, uuid, now) {
        // v1.1.0 FIX: NEVER apply feed filters on user-profile pages (/u/<name>).
        // The age filter (default maxHours=8), hide-upvoted, hide-read, etc. are
        // feed conveniences that make sense on / where you want fresh content.
        // On a user's OWN history page they are catastrophic — every post older
        // than 8h gets .pe-hidden within seconds of load ("the page eats itself,"
        // a bug that survived 9 months across FOXY → Awesomizer because it looked
        // like a race/DOM-mutation bug, not a filter-context bug). Always show.
        // v1.1.0 FIX: NEVER apply feed filters on user-profile pages (/u/<name>) OR
        // single-post pages (/p/<uuid>). The age filter (default maxHours=8),
        // hideUpvoted, hideDownvoted, read-history, etc. are FEED conveniences —
        // they make sense on / where you want fresh content surfaced and stale
        // content hidden. On a profile page they hide every post >8h old; on a
        // single-post page they hide the ONE post you navigated there to read.
        // Both were manifestations of the same 9-month "page eats itself" bug:
        // feed filters applied to pages where filters are actively hostile.
        // Always show posts on these pages; only filter on listing/feed pages.
        if (STATE.isUserPage || STATE.isPostPage) { p.classList.remove('pe-hidden'); return false; }
        if (isSticky(p)) { p.classList.remove('pe-hidden'); return false; }
        const ub = findVoteButton(p, 'up'), db = findVoteButton(p, 'down');
        // When detecting upvotes from DOM on page load, set timestamp to 0 (epoch)
        // so the 60s grace period doesn't block auto-hide. The grace period only protects
        // votes cast THIS session (which go through handleVote and get Date.now() timestamps).
        if (ub?.classList.contains('active')) { if (!STATE.upvotedIDs.has(uuid)) { STATE.upvotedIDs.add(uuid); if (!STATE.upvoteTimestamps.has(uuid)) STATE.upvoteTimestamps.set(uuid, 0); } }
        const vc = p.querySelector('.vote[data-vote]');
        if (vc) { const dv = vc.getAttribute('data-vote'); if (dv === 'up' && !STATE.upvotedIDs.has(uuid)) { STATE.upvotedIDs.add(uuid); if (!STATE.upvoteTimestamps.has(uuid)) STATE.upvoteTimestamps.set(uuid, 0); } if (dv === 'down') STATE.downvotedIDs.add(uuid); }
        if (db?.classList.contains('active')) STATE.downvotedIDs.add(uuid);
        let hide = false; const age = getPostAge(p);
        if (CONFIG.maxHours > 0 && age > CONFIG.maxHours) hide = true;
        else if (CONFIG.hideUpvoted && STATE.upvotedIDs.has(uuid)) { const ts = STATE.upvoteTimestamps.get(uuid); if (!ts || now - ts >= 60000) hide = true; }
        else if (CONFIG.hideDownvoted && STATE.downvotedIDs.has(uuid)) hide = true;
        else if (STATE.readIDs.has(uuid)) { const rts = STATE.readTimestamps.get(uuid); if (rts && (now - rts) < READ_HIDE_TTL_MS) hide = true; else if (!rts) hide = true; }
        if (!hide && CONFIG.keywords.length > 0) { const ct = p.dataset.peTitle || getPostTitle(p); if (!CONFIG.keywords.some(kw => ct.includes(kw.toLowerCase()))) hide = true; }
        if (!hide && CONFIG.blocklist.length > 0) { const ca = p.dataset.peAuthor || getPostAuthor(p); if (ca && CONFIG.blocklist.some(u => u.toLowerCase() === ca)) hide = true; }
        if (!hide && CONFIG.minScore > 0) { const cs = p.dataset.peScore !== undefined ? Number(p.dataset.peScore) : getPostScore(p); if (cs < CONFIG.minScore) hide = true; }
        if (CONFIG.safeMode) hide = false;
        if (CONFIG.enabled && hide) { p.classList.add('pe-hidden'); return true; } else { p.classList.remove('pe-hidden'); return false; }
    }

    function _doScanFeed(full) { if (!STATE.isHydrated) return; const t0 = performance.now(); const posts = document.querySelectorAll('.post'); const now = Date.now(); let vis = 0, hid = 0, nc = 0; const doFull = full || STATE.filterDirty; STATE.filterDirty = false; posts.forEach(p => { const u = getPostUUID(p); if (!u) return; if (!p.dataset.peTweaked) { p.dataset.peTweaked = '1'; _decoratePost(p, u); nc++; if (_filterPost(p, u, now)) hid++; else vis++; } else if (doFull) { if (_filterPost(p, u, now)) hid++; else vis++; } else { if (p.classList.contains('pe-hidden')) hid++; else vis++; } });
        STATE.visibleCount = vis; STATE.hiddenCount = hid; STATE.visiblePosts = getVisiblePosts(); _lastScanMs = Math.round((performance.now()-t0)*100)/100; STATE.scanStats = { total: posts.length, newPosts: nc, filtered: doFull ? posts.length : nc, decorated: nc, lastMs: _lastScanMs }; updateStatusBar(); saveState(); }

    // =========================================================================
    // VOTING — clears opposite vote set when changing vote direction
    // =========================================================================
    function handleVote(direction) {
        const postEl = STATE.hoveredPostEl;
        if (!postEl) { showSnack('Hover over a post first', 'error'); return; }
        const btn = findVoteButton(postEl, direction);
        if (!btn) { showSnack('Vote button not found', 'error'); return; }
        const uuid = getPostUUID(postEl);
        const result = executeClick(btn);
        STATE.voteLog.push({ ts: Date.now(), dir: direction, uuid, success: result.success, method: result.method || result.reason });
        if (STATE.voteLog.length > 20) STATE.voteLog.shift();
        if (!result.success) { showSnack('Vote failed', 'error'); return; }

        const isUp = direction === 'up';
        postEl.classList.add(isUp ? 'pe-flash-up' : 'pe-flash-dn');
        postEl.addEventListener('animationend', () => postEl.classList.remove('pe-flash-up', 'pe-flash-dn'), { once: true });
        STATE.lastVote = { uuid, direction, postEl };

        if (uuid) {
            // CLEAR THE OPPOSITE VOTE SET — this fixes re-upvote after downvote
            if (isUp) {
                STATE.upvotedIDs.add(uuid);
                STATE.upvoteTimestamps.set(uuid, Date.now());
                STATE.downvotedIDs.delete(uuid);
            } else {
                STATE.downvotedIDs.add(uuid);
                STATE.upvotedIDs.delete(uuid);
                STATE.upvoteTimestamps.delete(uuid);
            }
        }

        if (!isUp) {
            showSnack(`✗ Downvoted <button class="pe-undo-btn" id="pe-undo-vote">UNDO (10s)</button>`, 'success', 10000);
            const undoBtn = document.getElementById('pe-undo-vote');
            if (undoBtn) undoBtn.onclick = ev => { ev.stopPropagation(); undoLastVote(); document.getElementById('pe-snack')?.remove(); };
        } else {
            showSnack('✓ Upvoted', 'success');
        }
        if (CONFIG.autoAdvance) setTimeout(() => { scheduleFullRescan(); navigatePost(1); }, 300);
        else scheduleFullRescan();
    }

    function undoLastVote() { if (!STATE.lastVote) { showSnack('Nothing to undo', 'info'); return; } const { uuid, direction, postEl } = STATE.lastVote; const btn = findVoteButton(postEl, direction); if (btn) { executeClick(btn); if (direction === 'up') { STATE.upvotedIDs.delete(uuid); STATE.upvoteTimestamps.delete(uuid); } else STATE.downvotedIDs.delete(uuid); STATE.lastVote = null; scheduleFullRescan(); showSnack('Vote undone', 'info'); } }
    function markAsRead() { const p = STATE.hoveredPostEl; if (!p) { showSnack('Hover over a post', 'error'); return; } const u = getPostUUID(p); if (u) { STATE.readIDs.add(u); STATE.readTimestamps.set(u, Date.now()); peDB.set(u, { read: true }); showSnack('Marked read', 'info'); scheduleFullRescan(); if (CONFIG.autoAdvance) setTimeout(() => navigatePost(1), 300); } }
    function bulkHideVisible() { if (STATE.undoTimer) { clearTimeout(STATE.undoTimer); STATE.undoTimer = null; } const posts = getVisiblePosts(); const nuked = []; posts.forEach(p => { if (isSticky(p)) return; const u = getPostUUID(p); if (u && !STATE.upvotedIDs.has(u) && !STATE.downvotedIDs.has(u)) { nuked.push(u); STATE.readIDs.add(u); STATE.readTimestamps.set(u, Date.now()); } }); scheduleFullRescan(); if (!nuked.length) { showSnack('Nothing to hide', 'info'); return; } STATE.undoPending = nuked; const sn = showSnack(`Nuked ${nuked.length} <button class="pe-undo-btn" id="pe-undo-bulk">UNDO</button>`, 'success', 5500); const ub = sn.querySelector('#pe-undo-bulk'); if (ub) ub.onclick = ev => { ev.stopPropagation(); if (STATE.undoPending) { STATE.undoPending.forEach(u => { STATE.readIDs.delete(u); STATE.readTimestamps.delete(u); }); const c = STATE.undoPending.length; STATE.undoPending = null; clearTimeout(STATE.undoTimer); STATE.undoTimer = null; scheduleFullRescan(); showSnack(`Restored ${c}`, 'info'); } }; STATE.undoTimer = setTimeout(() => { if (STATE.undoPending) { peDB.setMany(STATE.undoPending.map(u => ({ uuid: u, data: { read: true, bulkHidden: Date.now() } }))); STATE.undoPending = null; } STATE.undoTimer = null; }, 5000); }
    function navigatePost(delta) { STATE.visiblePosts = getVisiblePosts(); if (!STATE.visiblePosts.length) return; let ci = STATE.hoveredPostEl ? STATE.visiblePosts.indexOf(STATE.hoveredPostEl) : -1; let ni = Math.max(0, Math.min(ci + delta, STATE.visiblePosts.length - 1)); const tp = STATE.visiblePosts[ni]; if (tp) { STATE.hoveredPostEl = tp; STATE.currentPostIndex = ni; tp.scrollIntoView({ behavior: 'smooth', block: 'center' }); document.querySelectorAll('.pe-nav-highlight').forEach(e => e.classList.remove('pe-nav-highlight')); tp.classList.add('pe-nav-highlight'); showSnack(`${ni+1}/${STATE.visiblePosts.length}`, 'info'); } }

    // =========================================================================
    // EXPORT/IMPORT, HELP, DEBUG, KEYBOARD, STATUS BAR, SETTINGS
    // =========================================================================
    function exportConfig() { const d = { _pe_export: true, _version: VERSION, _site: SITE.siteKey, _timestamp: new Date().toISOString(), config: CONFIG, upvoted: [...STATE.upvotedIDs], downvoted: [...STATE.downvotedIDs], upvoteTimestamps: [...STATE.upvoteTimestamps], read: [...STATE.readIDs], readTimestamps: [...STATE.readTimestamps] }; const b = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `pe_${SITE.siteKey}_${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u); showSnack('Exported!', 'success'); }
    function importConfig() { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { try { const d = JSON.parse(ev.target.result); if (!d._pe_export) { showSnack('Not PE', 'error'); return; } if (d.config) CONFIG = { ...DEFAULT_CONFIG, ...d.config }; if (d.upvoted) d.upvoted.forEach(id => STATE.upvotedIDs.add(id)); if (d.downvoted) d.downvoted.forEach(id => STATE.downvotedIDs.add(id)); if (d.read) d.read.forEach(id => STATE.readIDs.add(id)); saveState(); document.querySelectorAll('.post[data-pe-tweaked]').forEach(p => delete p.dataset.peTweaked); scheduleFullRescan(); showSnack(`Imported ${d._version}`, 'success'); } catch { showSnack('Import failed', 'error'); } }; r.readAsText(f); }; i.click(); }

    function toggleHelpOverlay() { const ex = document.getElementById('pe-help-overlay'); if (ex) { ex.remove(); document.getElementById('pe-help-backdrop')?.remove(); STATE.helpOverlayOpen = false; return; } STATE.helpOverlayOpen = true; const bd = document.createElement('div'); bd.id = 'pe-help-backdrop'; bd.onclick = toggleHelpOverlay; document.body.appendChild(bd); const o = document.createElement('div'); o.id = 'pe-help-overlay'; const sn = SITE.isGAW ? 'GAW' : 'PDW'; o.innerHTML = `<div class="pe-help-header"><span>${SCRIPT_NAME} ${VERSION} [${sn}]</span><button class="pe-help-close-btn">&times;</button></div><div class="pe-help-body"><div class="pe-help-section"><h3>Navigation</h3><div class="pe-help-row"><kbd>J</kbd> Next</div><div class="pe-help-row"><kbd>K</kbd> Prev</div><div class="pe-help-row"><kbd>SPACE</kbd> Next/Play</div><div class="pe-help-row"><kbd>P</kbd> PgDn</div><div class="pe-help-row"><kbd>O</kbd> PgUp</div></div><div class="pe-help-section"><h3>Actions</h3><div class="pe-help-row"><kbd>A</kbd> Upvote</div><div class="pe-help-row"><kbd>D</kbd> Downvote (10s undo)</div><div class="pe-help-row"><kbd>R</kbd> Read</div><div class="pe-help-row"><kbd>H</kbd> Bulk hide</div><div class="pe-help-row"><kbd>Ctrl+Z</kbd> Undo vote</div></div><div class="pe-help-section"><h3>Filters</h3><div class="pe-help-row"><kbd>1248</kbd> Hour filter</div><div class="pe-help-row"><kbd>S</kbd> Safe mode</div></div><div class="pe-help-section"><h3>UI</h3><div class="pe-help-row"><kbd>M</kbd> Settings</div><div class="pe-help-row"><kbd>T</kbd> Debug</div><div class="pe-help-row"><kbd>?</kbd> Help</div></div><div class="pe-help-footer">${STATE.sessionProcessed} proc | ${STATE.seenIDs.size} seen | ${STATE.upvotedIDs.size} up | ${STATE.readIDs.size} read | ${sn} config | ${STATE.scanStats.lastMs}ms scan</div></div>`; document.body.appendChild(o); o.querySelector('.pe-help-close-btn').onclick = toggleHelpOverlay; requestAnimationFrame(() => { bd.style.opacity = '1'; o.style.opacity = '1'; o.style.transform = 'translate(-50%,-50%) scale(1)'; }); }

    function captureDebug() { const hb = document.getElementById('pe-hover-box'); const hr = hb?.getBoundingClientRect(); const d = { _V: VERSION, _T: new Date().toISOString(), _U: location.href, site: { host: SITE.host, key: SITE.siteKey, isGAW: SITE.isGAW }, config: CONFIG, stats: { vis: STATE.visibleCount, hid: STATE.hiddenCount, proc: STATE.sessionProcessed, up: STATE.upvotedIDs.size, dn: STATE.downvotedIDs.size, read: STATE.readIDs.size, readTs: STATE.readTimestamps.size, seen: STATE.seenIDs.size, scanMs: _lastScanMs, idbPre: STATE.idbHiddenCount }, hover: { vis: hb?.classList.contains('pe-visible'), pin: STATE.hoverPinned, key: HOVER.currentKey, pos: hr ? { l: Math.round(hr.left), t: Math.round(hr.top), w: Math.round(hr.width), h: Math.round(hr.height) } : null }, nav: { idx: STATE.currentPostIndex, total: STATE.visiblePosts.length }, lastHovered: STATE.lastHovered, voteLog: STATE.voteLog.slice(-10), errors: consoleErrors.slice(-10) }; GM_setClipboard(JSON.stringify(d, null, 2)); console.log('[PE] DEBUG:', d); showSnack('Debug copied!', 'success'); }

    // Keyboard
    // FIX (per Commander's request): posts no longer highlight on mouseover.
    // Only STATE.hoveredPostEl tracking remains (needed for hover-based vote/read
    // actions); the .pe-nav-highlight toggling that used to fire here is removed.
    // The keyboard-driven J/K navigation highlight in navigatePost() is untouched.
    document.addEventListener('mouseover', e => { const p = e.target.closest('.post'); if (p) { STATE.hoveredPostEl = p; } });
    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
        const k = e.key.toLowerCase();
        if (e.key === '?' || (e.shiftKey && k === '/')) { e.preventDefault(); toggleHelpOverlay(); return; }
        if (e.key === ' ') {
            // SPACEBAR video fix: a <video controls> element natively toggles on
            // SPACE, so if focus is on it our own toggle below would double-fire
            // and cancel out (net no-op — the "SPACE never works" bug). Blur the
            // video first so only our explicit toggle runs.
            const v = STATE.currentVideo || document.querySelector('#pe-hover-box video');
            if (v) {
                e.preventDefault();
                if (document.activeElement === v) v.blur();
                if (!STATE.hoverPinned && HOVER.box?.classList.contains('pe-visible')) { STATE.hoverPinned = true; HOVER.box.classList.add('pe-pinned'); }
                if (v.paused) v.play().catch(() => showSnack('Blocked', 'error')); else v.pause();
            } else { e.preventDefault(); navigatePost(1); }
            return;
        }
        if (k === 'j') { e.preventDefault(); navigatePost(1); return; }
        if (k === 'k') { e.preventDefault(); navigatePost(-1); return; }
        if (k === 'r' && !e.ctrlKey) { e.preventDefault(); markAsRead(); return; }
        if (k === 'h' && !e.ctrlKey && !STATE.settingsPanelOpen) { e.preventDefault(); bulkHideVisible(); return; }
        if (k === 't' && CONFIG.debugMode) { e.preventDefault(); captureDebug(); return; }
        if (k === 'z' && e.ctrlKey) { e.preventDefault(); undoLastVote(); return; }
        if (e.key === 'Escape') { if (STATE.helpOverlayOpen) toggleHelpOverlay(); else if (STATE.hoverPinned || HOVER.currentKey || HOVER._loadingKey) { STATE.hoverPinned = false; HOVER.hide(true); showSnack('Unpinned', 'info'); } else if (STATE.settingsPanelOpen) _saveAndClose(); return; }
        if (['1','2','4','8'].includes(k) && !e.ctrlKey) { e.preventDefault(); CONFIG.maxHours = parseInt(k); saveState(); scheduleFullRescan(); showSnack(k+'h', 'info'); return; }
        if (k === 'm' && !e.ctrlKey) { if (STATE.settingsPanelOpen) _saveAndClose(); else openSettingsPanel(); return; }
        if (k === 'a' && STATE.hoveredPostEl && !STATE.settingsPanelOpen) { e.preventDefault(); handleVote('up'); return; }
        if (k === 'd' && STATE.hoveredPostEl && !STATE.settingsPanelOpen) { e.preventDefault(); handleVote('down'); return; }
        if (k === 's' && !e.ctrlKey && !STATE.settingsPanelOpen) { CONFIG.safeMode = !CONFIG.safeMode; scheduleFullRescan(); showSnack(CONFIG.safeMode ? 'Safe ON' : 'Safe OFF', CONFIG.safeMode ? 'success' : 'info'); return; }
        if (k === 'p') window.scrollBy({ top: window.innerHeight * 0.85, behavior: 'smooth' });
        if (k === 'o') window.scrollBy({ top: -window.innerHeight * 0.85, behavior: 'smooth' });
    });

    // Status bar
    function createStatusBar() { if (STATE.isPostPage) return; const b = document.createElement('div'); b.id = 'pe-status-bar'; document.body.appendChild(b); updateStatusBar(); setTimeout(() => { if (document.getElementById('gam-status-bar')) b.style.bottom = '48px'; }, 2000); }
    function updateStatusBar() { const b = document.getElementById('pe-status-bar'); if (!b) return; const sn = SITE.isGAW ? 'GAW' : 'PDW'; b.innerHTML = `<span class="pe-pill-brand">${SCRIPT_NAME} ${VERSION} [${sn}]</span><span class="pe-pill-sep"></span><span class="pe-pill-stat"><b>${STATE.visibleCount}</b> vis</span><span class="pe-pill-stat"><b>${STATE.hiddenCount}</b> hid</span><span class="pe-pill-stat pe-session-stat">${STATE.sessionProcessed} proc</span>${CONFIG.safeMode?'<span class="pe-bar-badge">SAFE</span>':''}${CONFIG.keywords.length?'<span class="pe-bar-badge pe-bar-kw">KW:'+CONFIG.keywords.length+'</span>':''}${CONFIG.blocklist.length?'<span class="pe-bar-badge pe-bar-bl">BL:'+CONFIG.blocklist.length+'</span>':''}<span class="pe-pill-sep"></span><button id="pe-btn-post" class="pe-pill-btn pe-btn-post">POST</button><button id="pe-btn-hrs" class="pe-pill-btn">${CONFIG.maxHours}h</button><button id="pe-btn-safe" class="pe-pill-btn${CONFIG.safeMode?' pe-active':''}">S</button><button id="pe-btn-help" class="pe-pill-btn">?</button><button id="pe-btn-set" class="pe-pill-btn">M</button><button id="pe-btn-dbg" class="pe-pill-btn pe-btn-debug">DBG</button>`; document.getElementById('pe-btn-post').onclick = () => location.href = SITE.submitUrl(); document.getElementById('pe-btn-hrs').onclick = () => { const o = [1,2,4,8,12,24]; CONFIG.maxHours = o[(o.indexOf(CONFIG.maxHours)+1)%o.length]; saveState(); scheduleFullRescan(); showSnack(CONFIG.maxHours+'h', 'info'); }; document.getElementById('pe-btn-safe').onclick = () => { CONFIG.safeMode = !CONFIG.safeMode; scheduleFullRescan(); }; document.getElementById('pe-btn-help').onclick = toggleHelpOverlay; document.getElementById('pe-btn-set').onclick = () => { if (STATE.settingsPanelOpen) closeSettingsPanel(); else openSettingsPanel(); }; document.getElementById('pe-btn-dbg').onclick = captureDebug; }

    // Settings panel
    function _readAndApplySettings() {
        CONFIG.enabled = document.getElementById('pe-s-enabled').checked;
        CONFIG.hideUpvoted = document.getElementById('pe-s-hideUp').checked;
        CONFIG.hideDownvoted = document.getElementById('pe-s-hideDown').checked;
        CONFIG.hideSidebar = document.getElementById('pe-s-sidebar').checked;
        CONFIG.hoverZoom = document.getElementById('pe-s-hover').checked;
        CONFIG.autoAdvance = document.getElementById('pe-s-auto').checked;
        CONFIG.showDomainBadges = document.getElementById('pe-s-badges').checked;
        CONFIG.showVoteIndicators = document.getElementById('pe-s-votes').checked;
        CONFIG.debugMode = document.getElementById('pe-s-debug').checked;
        const ah = document.querySelector('#pe-settings-panel .pe-hr-btn.active');
        if (ah) CONFIG.maxHours = parseInt(ah.dataset.h);
        CONFIG.keywords = document.getElementById('pe-s-keywords').value.split(',').map(s=>s.trim()).filter(Boolean);
        CONFIG.blocklist = document.getElementById('pe-s-blocklist').value.split(',').map(s=>s.trim()).filter(Boolean);
        CONFIG.minScore = parseInt(document.getElementById('pe-s-minscore').value)||0;
        saveState();
        if (CONFIG.hideSidebar) document.body.classList.add('pe-no-side'); else document.body.classList.remove('pe-no-side');
        document.querySelectorAll('.post[data-pe-tweaked]').forEach(p => delete p.dataset.peTweaked);
        scheduleFullRescan();
    }
    function _saveAndClose() {
        if (document.getElementById('pe-settings-panel')) _readAndApplySettings();
        closeSettingsPanel();
        const sn = SITE.isGAW ? 'GAW' : 'PDW';
        showSnack(`Saved (${sn})`, 'success');
    }
    function openSettingsPanel() {
        if (document.getElementById('pe-settings-panel')) return;
        STATE.settingsPanelOpen = true;
        const bd = document.createElement('div');
        bd.id = 'pe-settings-backdrop';
        bd.onclick = _saveAndClose;
        document.body.appendChild(bd);
        const sn = SITE.isGAW ? 'GAW' : 'PDW';
        const p = document.createElement('div');
        p.id = 'pe-settings-panel';
        p.innerHTML = `
            <div class="pe-set-header">
                <div class="pe-set-title">${SCRIPT_NAME} ${VERSION}
                    <span style="color:${C.ACCENT};font-size:10px;margin-left:6px;background:rgba(74,158,255,.15);padding:2px 6px;border-radius:8px;">${sn}</span>
                </div>
                <button id="pe-set-close">&times;</button>
            </div>
            <div class="pe-set-body">
                <label class="pe-set-toggle"><input type="checkbox" id="pe-s-enabled" ${CONFIG.enabled?'checked':''}><span>Filtering</span></label>
                <label class="pe-set-toggle"><input type="checkbox" id="pe-s-hideUp" ${CONFIG.hideUpvoted?'checked':''}><span>Hide upvoted</span></label>
                <label class="pe-set-toggle"><input type="checkbox" id="pe-s-hideDown" ${CONFIG.hideDownvoted?'checked':''}><span>Hide downvoted</span></label>
                <label class="pe-set-toggle"><input type="checkbox" id="pe-s-sidebar" ${CONFIG.hideSidebar?'checked':''}><span>Hide sidebar</span></label>
                <label class="pe-set-toggle"><input type="checkbox" id="pe-s-hover" ${CONFIG.hoverZoom?'checked':''}><span>Hover zoom</span></label>
                <hr style="border:none;border-top:1px solid ${C.BORDER};margin:8px 0;">
                <label class="pe-set-toggle"><input type="checkbox" id="pe-s-auto" ${CONFIG.autoAdvance?'checked':''}><span>Auto-advance after vote</span></label>
                <label class="pe-set-toggle"><input type="checkbox" id="pe-s-badges" ${CONFIG.showDomainBadges?'checked':''}><span>Domain badges</span></label>
                <label class="pe-set-toggle"><input type="checkbox" id="pe-s-votes" ${CONFIG.showVoteIndicators?'checked':''}><span>Vote indicators</span></label>
                <label class="pe-set-toggle"><input type="checkbox" id="pe-s-debug" ${CONFIG.debugMode?'checked':''}><span>Debug mode (T key)</span></label>
                <hr style="border:none;border-top:1px solid ${C.BORDER};margin:8px 0;">
                <div class="pe-set-hours"><span>Age filter:</span>${[1,2,4,8,12,24].map(h=>`<button class="pe-hr-btn ${CONFIG.maxHours===h?'active':''}" data-h="${h}">${h}h</button>`).join('')}</div>
                <div class="pe-set-field" style="margin-top:6px;"><label>Min score:</label><input type="number" id="pe-s-minscore" value="${CONFIG.minScore}" min="0" style="width:60px;padding:4px 6px;background:${C.BG2};border:1px solid ${C.BORDER};color:${C.TEXT};border-radius:4px;font-size:11px;margin-top:2px;"></div>
                <hr style="border:none;border-top:1px solid ${C.BORDER};margin:8px 0;">
                <div class="pe-set-field"><label>Keywords (show only):</label><input type="text" id="pe-s-keywords" value="${esc(CONFIG.keywords.join(', '))}" placeholder="trump, maga" style="width:100%;padding:4px 6px;background:${C.BG2};border:1px solid ${C.BORDER};color:${C.TEXT};border-radius:4px;font-size:11px;margin-top:2px;box-sizing:border-box;"></div>
                <div class="pe-set-field" style="margin-top:6px;"><label>Blocklist (hide users):</label><input type="text" id="pe-s-blocklist" value="${esc(CONFIG.blocklist.join(', '))}" placeholder="username1, username2" style="width:100%;padding:4px 6px;background:${C.BG2};border:1px solid ${C.BORDER};color:${C.TEXT};border-radius:4px;font-size:11px;margin-top:2px;box-sizing:border-box;"></div>
                <hr style="border:none;border-top:1px solid ${C.BORDER};margin:8px 0;">
                <div class="pe-set-data-row"><button id="pe-s-export" class="pe-data-btn">Export</button><button id="pe-s-import" class="pe-data-btn">Import</button></div>
                <div style="font-size:9px;color:${C.TEXT3};text-align:center;margin-top:4px;">Settings auto-save when you close this panel.</div>
            </div>`;
        document.body.appendChild(p);
        requestAnimationFrame(() => {
            bd.style.opacity = '1';
            p.style.opacity = '1';
            p.style.transform = 'translate(-50%,-50%) scale(1)';
        });
        p.querySelectorAll('.pe-hr-btn').forEach(b => b.onclick = () => {
            p.querySelectorAll('.pe-hr-btn').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
        });
        document.getElementById('pe-set-close').onclick = _saveAndClose;
        document.getElementById('pe-s-export').onclick = exportConfig;
        document.getElementById('pe-s-import').onclick = importConfig;
    }
    function closeSettingsPanel() { document.getElementById('pe-settings-panel')?.remove(); document.getElementById('pe-settings-backdrop')?.remove(); STATE.settingsPanelOpen = false; }

    // =========================================================================
    // STYLES
    // =========================================================================
    function injectStyles() { const s = document.createElement('style'); s.id = 'pe-styles'; s.textContent = `.pe-hidden{display:none!important}
/* v1.1.0: hide Google/scored.co ads. ANTI-FRAGILE: targets stable semantic
   classes only (google-ad, googleAd, google-sponsored-links, sponsored,
   ad-unit, fullSizeAd) — NEVER the styled-components build hashes (sc-*)
   which change on every deploy and would break silently. */
.google-ad,.googleAd,.google-sponsored-links,.sponsored.ad,.ad-unit.google-ad,.fullSizeAd{display:none!important}
/* Also hide the ad-tracking pixel div (positioned offscreen, no content) */
div.sponsored.ad.ad-unit[style*="z-index: -9"]{display:none!important}body.pe-no-side .sidebar{display:none!important}body.pe-no-side .main,body.pe-no-side main{max-width:100%!important}.pe-nav-highlight{outline:2px solid ${C.ACCENT}!important;outline-offset:2px}.pe-flash-up{animation:pe-anim-up .4s ease-out}.pe-flash-dn{animation:pe-anim-dn .4s ease-out}@keyframes pe-anim-up{0%{box-shadow:inset 3px 0 0 ${C.GREEN}}to{box-shadow:none}}@keyframes pe-anim-dn{0%{box-shadow:inset 3px 0 0 ${C.RED}}to{box-shadow:none}}.pe-vote-indicator{font-size:14px;font-weight:700;margin-left:4px}.pe-spinner{width:16px;height:16px;border:2px solid ${C.BORDER};border-top-color:${C.ACCENT};border-radius:50%;animation:pe-spin .8s linear infinite;display:inline-block;margin-right:8px}@keyframes pe-spin{to{transform:rotate(360deg)}}#pe-status-bar{position:fixed;bottom:12px;right:16px;z-index:99999999;display:flex;align-items:center;gap:6px;background:${C.BG};border:1px solid ${C.BORDER};padding:4px 10px;border-radius:20px;font:11px -apple-system,system-ui,sans-serif;color:${C.TEXT2};box-shadow:0 4px 20px rgba(0,0,0,.5)}.pe-pill-brand{font-weight:700;color:${C.ACCENT};font-size:10px}.pe-pill-sep{width:1px;height:14px;background:${C.BORDER}}.pe-pill-stat b{color:${C.TEXT}}.pe-session-stat{color:${C.TEXT3};font-size:9px}.pe-pill-btn{background:0 0;border:none;color:${C.TEXT2};padding:4px 6px;border-radius:4px;cursor:pointer;font-size:11px}.pe-pill-btn:hover{background:${C.BG2};color:${C.TEXT}}.pe-btn-post{background:${C.GREEN}!important;color:#fff!important;font-weight:700}.pe-btn-debug{background:${C.WARN}!important;color:#000!important;font-weight:700}.pe-bar-badge{background:rgba(255,159,10,.15);color:${C.WARN};padding:1px 5px;border-radius:8px;font-size:8px;font-weight:700}.pe-bar-kw{background:rgba(74,158,255,.15);color:${C.ACCENT}}.pe-bar-bl{background:rgba(255,69,58,.15);color:${C.RED}}.pe-active{color:${C.WARN}!important}.pe-snack{position:fixed;bottom:52px;right:16px;z-index:99999999;padding:8px 16px;border-radius:8px;font:12px -apple-system,system-ui,sans-serif;color:#fff;opacity:0;transform:translateY(8px);transition:opacity .2s,transform .2s;pointer-events:auto;box-shadow:0 4px 12px rgba(0,0,0,.4)}.pe-snack-show{opacity:1;transform:translateY(0)}.pe-snack-success{background:${C.GREEN}}.pe-snack-error{background:${C.RED}}.pe-snack-info{background:${C.ACCENT}}.pe-undo-btn{background:rgba(255,255,255,.25);border:1px solid rgba(255,255,255,.4);color:#fff;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;margin-left:8px}.pe-undo-btn:hover{background:rgba(255,255,255,.4)}#pe-hover-box{position:fixed;z-index:999999;background:${C.BG};border:1px solid ${C.BORDER2};padding:10px;border-radius:10px;pointer-events:auto;color:${C.TEXT};box-shadow:0 8px 32px rgba(0,0,0,.5);font:15px -apple-system,system-ui,sans-serif;max-width:calc(100vw - ${HOVER_MARGIN*2}px);max-height:calc(100vh - ${HOVER_MARGIN*2}px);overflow:auto;opacity:0;transition:opacity .2s ease-in}#pe-hover-box.pe-visible{opacity:1}#pe-hover-box.pe-hiding{opacity:0;transition:opacity .4s ease-out}#pe-hover-box.pe-pinned{border-color:${C.ACCENT};box-shadow:0 0 0 2px ${C.ACCENT}}.pe-hz-error{color:${C.RED};font-size:14px}.pe-hz-warn{color:${C.WARN};font-size:14px}.pe-hz-loading{color:${C.TEXT2};font-size:14px}.pe-hover-actions{display:flex;gap:4px;margin-top:8px;padding-top:8px;border-top:1px solid ${C.BORDER};align-items:center}.pe-hover-action{background:${C.BG2};border:1px solid ${C.BORDER};color:${C.TEXT2};padding:4px 8px;border-radius:4px;cursor:pointer;font-size:12px}.pe-hover-action:hover{background:${C.BG3};color:${C.TEXT}}.pe-hvote-up{color:${C.GREEN}!important;font-weight:700}.pe-hvote-up:hover{background:rgba(52,199,89,.15)!important;border-color:${C.GREEN}}.pe-hvote-dn{color:${C.RED}!important;font-weight:700}.pe-hvote-dn:hover{background:rgba(255,69,58,.15)!important;border-color:${C.RED}}.pe-hover-sep{width:1px;height:16px;background:${C.BORDER};margin:0 2px}.pe-age-badge{font-size:8px;margin-right:6px;vertical-align:middle}.pe-hz-link-card{display:flex;gap:16px;max-width:1000px}.pe-hz-link-img-wrap{flex:0 0 320px}.pe-hz-link-img{width:320px;max-height:240px;object-fit:cover;border-radius:6px}.pe-hz-link-caption{font-size:11px;color:${C.TEXT3};margin-top:4px}.pe-hz-link-content{flex:1;min-width:0}.pe-hz-link-title{font-weight:700;font-size:17px;color:${C.ACCENT};margin-bottom:8px}.pe-hz-link-desc{font-size:14px;color:${C.TEXT2};margin-bottom:8px}.pe-hz-link-body{column-count:3;column-gap:16px;max-height:50vh;overflow-y:auto}.pe-hz-link-body p{font-size:14px;line-height:1.5;color:${C.TEXT};margin:0 0 10px;break-inside:avoid}.pe-hz-tweet{background:#15202b;padding:14px;border-radius:10px;min-width:340px;max-width:520px}.pe-hz-tweet-header{display:flex;align-items:center;gap:10px;margin-bottom:8px}.pe-hz-tweet-avatar{width:40px;height:40px;border-radius:50%}.pe-hz-tweet-name{font-weight:700;font-size:16px;color:#fff}.pe-hz-tweet-handle{font-size:13px;color:#8899a6}.pe-hz-tweet-body{font-size:15px;line-height:1.4;color:#e7e9ea;margin-bottom:6px}.pe-hz-tweet-media{max-width:100%;max-height:420px;border-radius:8px;margin-top:8px}.pe-hz-video-hint{font-size:10px;color:${C.TEXT3};text-align:center;margin-top:4px}.pe-hz-tweet-quote{background:${C.QUOTE_BG};border:1px solid ${C.BORDER2};border-radius:8px;padding:10px;margin-top:10px}.pe-hz-tq-head{display:flex;gap:8px;margin-bottom:4px}.pe-hz-tq-name{font-weight:600;font-size:12px;color:#ccc}.pe-hz-tq-handle{font-size:11px;color:#8899a6}.pe-hz-tq-body{font-size:12px;color:#aab8c2}.pe-hz-comments{min-width:460px;max-width:720px;background:${C.BG3};border-radius:8px;padding:10px;max-height:78vh;overflow-y:auto}.pe-hz-comments-header{display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:${C.ACCENT};margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid ${C.BORDER}}.pe-hz-comments-wc{font-weight:400;color:${C.TEXT3}}.pe-hz-comments-list{list-style:none;margin:0;padding:0}.pe-hz-comment{padding:6px 0;border-bottom:1px solid ${C.BORDER}}.pe-hz-comment:last-child{border-bottom:none}.pe-hz-comment.pe-top{background:rgba(74,158,255,.08);margin:0 -10px;padding:10px;border-radius:6px;border-left:3px solid ${C.ACCENT}}.pe-hz-comment.pe-nested{padding-left:14px;border-left:2px solid ${C.BORDER2};margin-left:10px;opacity:.85}.pe-hz-cmeta{display:flex;gap:8px;margin-bottom:4px;font-size:12px}.pe-hz-cauthor{font-weight:600;color:${C.ACCENT}}.pe-hz-cscore{color:${C.TEXT3}}.pe-hz-cbody{font-size:14px;line-height:1.4;color:${C.TEXT2}}.pe-top .pe-hz-cbody{color:${C.TEXT}}.pe-hz-user{min-width:280px;background:${C.BG3};border-radius:10px;overflow:hidden}.pe-hz-user-head{display:flex;align-items:center;gap:10px;padding:12px;background:linear-gradient(135deg,${C.BG2},${C.BG3})}.pe-hz-user-av{width:40px;height:40px;background:${C.BG};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px}.pe-hz-user-name{font-weight:700;font-size:15px;color:${C.TEXT}}.pe-hz-user-badges{display:flex;gap:3px;margin-top:2px}.pe-badge-admin,.pe-badge-mod,.pe-badge-susp{font-size:8px;font-weight:700;padding:2px 5px;border-radius:3px}.pe-badge-admin{background:${C.RED};color:#fff}.pe-badge-mod{background:${C.GREEN};color:#fff}.pe-badge-susp{background:${C.WARN};color:#000}.pe-hz-user-stats{display:flex;padding:10px;gap:6px}.pe-hz-ustat{flex:1;text-align:center;padding:8px;background:${C.BG};border-radius:6px}.pe-hz-ustat b{display:block;font-size:15px;color:${C.ACCENT}}.pe-hz-ustat span{font-size:9px;color:${C.TEXT3};text-transform:uppercase}.pe-hz-user-activity{padding:10px;border-top:1px solid ${C.BORDER}}.pe-hz-ua-title{font-size:10px;font-weight:700;color:${C.TEXT3};margin-bottom:6px}.pe-hz-ua-list{margin:0;padding:0;list-style:none;font-size:12px}.pe-hz-ua-list li{display:flex;justify-content:space-between;padding:2px 0}.pe-hz-ua-list span{color:${C.TEXT3}}.pe-hz-ua-list b{color:${C.ACCENT}}#pe-settings-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999998;opacity:0;transition:opacity .2s}#pe-settings-panel{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(.95);z-index:99999999;width:min(360px,90vw);background:${C.BG};border:1px solid ${C.BORDER2};border-radius:12px;font:13px -apple-system,system-ui,sans-serif;color:${C.TEXT};opacity:0;transition:all .2s;max-height:min(90vh,800px);overflow-y:auto;scrollbar-width:none;-ms-overflow-style:none}#pe-settings-panel::-webkit-scrollbar{display:none}.pe-set-header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid ${C.BORDER}}.pe-set-title{font-weight:700}.pe-set-header button{background:0 0;border:none;color:${C.TEXT3};font-size:18px;cursor:pointer}.pe-set-body{padding:12px 16px}.pe-set-toggle{display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;font-size:11px}.pe-set-toggle input{width:32px;height:16px;appearance:none;background:${C.BG2};border-radius:8px;position:relative;cursor:pointer}.pe-set-toggle input::after{content:'';position:absolute;top:2px;left:2px;width:12px;height:12px;background:${C.TEXT2};border-radius:50%;transition:all .15s}.pe-set-toggle input:checked{background:${C.ACCENT}}.pe-set-toggle input:checked::after{left:18px;background:#fff}.pe-set-hours{display:flex;align-items:center;gap:4px;padding:8px 0;font-size:11px;flex-wrap:wrap}.pe-hr-btn{background:${C.BG3};border:1px solid ${C.BORDER};color:${C.TEXT2};padding:2px 6px;border-radius:4px;cursor:pointer;font-size:9px}.pe-hr-btn.active{background:${C.ACCENT};border-color:${C.ACCENT};color:#fff}.pe-set-field label{font-size:10px;color:${C.TEXT2};font-weight:600}.pe-set-data-row{display:flex;gap:6px;margin-bottom:6px}.pe-data-btn{flex:1;background:${C.BG3};border:1px solid ${C.BORDER};color:${C.TEXT2};padding:6px;border-radius:4px;cursor:pointer;font-size:10px;font-weight:600;text-align:center}.pe-data-btn:hover{background:${C.BG2};color:${C.TEXT}}#pe-help-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999998;opacity:0;transition:opacity .2s}#pe-help-overlay{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(.95);z-index:99999999;width:480px;background:${C.BG};border:1px solid ${C.BORDER2};border-radius:12px;font:13px -apple-system,system-ui,sans-serif;color:${C.TEXT};opacity:0;transition:all .2s;max-height:85vh;overflow-y:auto}.pe-help-header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid ${C.BORDER};font-weight:700;color:${C.ACCENT}}.pe-help-header button{background:0 0;border:none;color:${C.TEXT3};font-size:18px;cursor:pointer}.pe-help-body{padding:12px 16px}.pe-help-section{margin-bottom:12px}.pe-help-section h3{font-size:11px;color:${C.ACCENT};text-transform:uppercase;margin:0 0 6px;letter-spacing:1px}.pe-help-row{display:flex;align-items:center;gap:10px;padding:3px 0;font-size:12px;color:${C.TEXT2}}.pe-help-row kbd{display:inline-block;background:${C.BG3};border:1px solid ${C.BORDER2};border-radius:3px;padding:1px 6px;font-family:monospace;font-size:11px;color:${C.TEXT};min-width:24px;text-align:center}.pe-help-footer{font-size:9px;color:${C.TEXT3};margin-top:10px;padding-top:8px;border-top:1px solid ${C.BORDER};line-height:1.5}`; document.head.appendChild(s); }

    // =========================================================================
    // INIT
    // =========================================================================
    async function initPostPageId() { if (!STATE.isPostPage) return; const pm = window.location.pathname.match(/\/p\/([a-zA-Z0-9]+)/); if (pm) { STATE.currentPostUuid = pm[1]; for (const el of document.querySelectorAll('[id]')) { if (RE.NUMERIC_ID_7.test(el.id)) { STATE.currentPostNumericId = el.id; setUuidId(STATE.currentPostUuid, el.id); return; } } const pd = document.querySelector('.post[data-id]'); if (pd) { const d = pd.getAttribute('data-id'); if (d && RE.NUMERIC_ID_7.test(d)) { STATE.currentPostNumericId = d; setUuidId(STATE.currentPostUuid, d); return; } } const n = await fetchNumericIdForUuid(STATE.currentPostUuid); if (n) STATE.currentPostNumericId = n; } }

    async function init() {
        console.log(`[PE] ${SCRIPT_NAME} ${VERSION} | ${SITE.host} [${SITE.siteKey}] | per-site config`);
        await peDB.init(); if (peDB.db) peDB.cleanup();
        if (peDB.db) { try { const h = await peDB.getAllReadUUIDs(); let n = 0; for (const u of h) { if (!STATE.readIDs.has(u)) { STATE.readIDs.add(u); STATE.readTimestamps.set(u, Date.now()); n++; } } STATE.idbHiddenCount = n; if (n) console.log(`[PE] IDB: ${n} pre-hidden (24h)`); } catch {} }
        REPUTATION.probe(); // V2-STUB: exercise identity extraction, no UI
        interceptNetworkForIds(); injectStyles(); createStatusBar(); initSeenObserver();
        // Prime the uuid->id and postLink caches from the feed API immediately —
        // this is what makes domain badges + tweet/link hoverzoom work under MV3
        // (the old XHR-intercept path is inert in the isolated world). Fire-and-
        // forget; the staggered rescans below will pick up the data when it lands.
        if (!STATE.isPostPage) primeCachesFromFeedApi();
        STATE.isHydrated = true; _doScanFeed(true);
        await new Promise(r => { let t = 0; const c = setInterval(() => { t++; _doScanFeed(false); if (document.querySelectorAll('.post').length >= 40 || t > 25) { clearInterval(c); r(); } }, 200); });
        await initPostPageId(); HOVER.init();
        // Delayed vote-state rescans — catches upvote .active classes that load late.
        // On scored.co sites, vote button states (.active class) often render AFTER the
        // initial HTML. These staggered rescans clear the processed flag and re-examine
        // every post's vote buttons, ensuring upvoted posts get hidden on page load.
        for (const delay of [1000, 2000, 4000]) {
            setTimeout(() => {
                document.querySelectorAll('.post[data-pe-tweaked]').forEach(p => delete p.dataset.peTweaked);
                _doScanFeed(true);
            }, delay);
        }
        // One-time diagnostic dump after all rescans complete
        setTimeout(() => {
            const posts = document.querySelectorAll('.post');
            const diag = [];
            posts.forEach((p, i) => {
                const uuid = getPostUUID(p);
                if (!uuid) return;
                const age = getPostAge(p);
                const sticky = isSticky(p);
                const ub = findVoteButton(p, 'up');
                const ubActive = ub?.classList.contains('active') || false;
                const inUpSet = STATE.upvotedIDs.has(uuid);
                const ts = STATE.upvoteTimestamps.get(uuid);
                const hidden = p.classList.contains('pe-hidden');
                const title = (p.dataset.peTitle || '').substring(0, 40);
                diag.push({ i, title, age: Math.round(age*10)/10, sticky, ubActive, inUpSet, ts, hidden, uuid: uuid.substring(0, 8) });
            });
            console.log(`[PE] DIAGNOSTIC | enabled:${CONFIG.enabled} hideUpvoted:${CONFIG.hideUpvoted} hideDown:${CONFIG.hideDownvoted} maxHours:${CONFIG.maxHours} safeMode:${CONFIG.safeMode} siteKey:${SITE.siteKey}`);
            console.table(diag);
        }, 5000);
        if (CONFIG.hideSidebar) document.body.classList.add('pe-no-side');
        const sk = 'pe_scroll_' + window.location.pathname.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
        window.addEventListener('beforeunload', () => GM_setValue(sk, window.scrollY));
        const ss = GM_getValue(sk, 0); if (ss > 0 && !STATE.isPostPage) setTimeout(() => window.scrollTo(0, ss), 300);
        new MutationObserver(() => scheduleScan()).observe(document.querySelector('main') || document.body, { childList: true, subtree: true });
        setInterval(() => _doScanFeed(true), 10000);
        // Re-prime caches every 2 min so newly-loaded feed posts (infinite scroll)
        // get their uuid->id + external link resolved. Throttled internally to 60s.
        if (!STATE.isPostPage) setInterval(() => primeCachesFromFeedApi(), 120000);
        // Soft integrity sweep: recreate orphaned overlays without stomping loads.
        setInterval(() => {
            try { HOVER.ensureBox(); } catch {}
            if (!document.getElementById('pe-status-bar') && !STATE.isPostPage) { try { createStatusBar(); } catch {} }
            if (!document.getElementById('pe-styles')) { try { injectStyles(); } catch {} }
        }, 30000);
        // Extension-reload guard: chrome.runtime dies after update while tab stays open.
        setInterval(() => {
            try { if (chrome.runtime && !chrome.runtime.id && !STATE._ctxLostShown) { STATE._ctxLostShown = true; showSnack('FOXY: reload page after extension update', 'warn', 8000); } } catch {}
        }, 15000);
        console.log(`[PE] Ready | ${STATE.visibleCount} vis ${STATE.hiddenCount} hid | IDB:${peDB.db?'yes':'no'} pre:${STATE.idbHiddenCount}`);
    }

    // Toolbar popup bridge — new in the extension port. Lets the popup show
    // live status and offer one-click settings/enable-toggle without requiring
    // the operator to know any keyboard shortcuts.
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (!msg) return false;
        if (msg.type === 'FOXY_GET_STATUS') {
            sendResponse({ enabled: CONFIG.enabled, visible: STATE.visibleCount, hidden: STATE.hiddenCount, maxHours: CONFIG.maxHours, safeMode: CONFIG.safeMode });
            return true;
        }
        if (msg.type === 'FOXY_TOGGLE_ENABLED') {
            CONFIG.enabled = !CONFIG.enabled;
            saveState();
            scheduleFullRescan();
            sendResponse({ enabled: CONFIG.enabled });
            return true;
        }
        if (msg.type === 'FOXY_OPEN_SETTINGS') {
            openSettingsPanel();
            sendResponse({ ok: true });
            return true;
        }
        if (msg.type === 'FOXY_OPEN_HELP') {
            toggleHelpOverlay();
            sendResponse({ ok: true });
            return true;
        }
        return false;
    });

    init();
})();
