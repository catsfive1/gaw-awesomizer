// FOXY background service worker — cross-origin fetch relay.
// Replaces Tampermonkey's GM_xmlhttpRequest: MV3 content scripts are still
// subject to page CORS, but a background service worker with host_permissions
// declared in manifest.json is not, so every cross-origin request the content
// script needs (site API calls, fxtwitter, arbitrary linked-article OG scrape,
// media CDN hi-res lookups) is relayed through here instead.

// decodeBody — charset-aware text decoding.
// Response.text() ALWAYS decodes as UTF-8 per the Fetch/Encoding spec, no matter
// what charset the page actually declares. GM_xmlhttpRequest's responseText (what
// this relay replaces) auto-detects charset from the Content-Type header the same
// way a real browser tab renders a page. Any external site using a legacy encoding
// (windows-1252, iso-8859-1, gbk, shift_jis, euc-kr, ...) rendered as mojibake in
// HOVERZOOM link previews until this was fixed - res.text() was silently mojibaking
// every non-UTF-8 page.
function decodeBody(buffer, contentTypeHeader) {
  const declared = (contentTypeHeader || '').match(/charset=([^;]+)/i);
  let charset = declared ? declared[1].trim().toLowerCase() : null;

  if (!charset) {
    // Sniff a <meta charset> / <meta http-equiv="Content-Type" content="...charset=...">
    // from the first chunk of bytes, same as a browser would before it has the real charset.
    const sniff = new TextDecoder('windows-1252').decode(buffer.slice(0, 2048));
    const metaMatch = sniff.match(/<meta[^>]+charset=["']?\s*([\w-]+)/i);
    if (metaMatch) charset = metaMatch[1].trim().toLowerCase();
  }

  if (!charset || charset === 'utf-8' || charset === 'utf8') {
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  }
  try {
    return new TextDecoder(charset, { fatal: false }).decode(buffer);
  } catch {
    // Unknown/unsupported label - fall back to UTF-8 rather than throwing.
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'FOXY_FETCH') return false;

  const { url, method, headers, timeout } = msg;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout || 12000);

  fetch(url, { method: method || 'GET', headers: headers || undefined, signal: controller.signal })
    .then(async (res) => {
      clearTimeout(timer);
      const buffer = await res.arrayBuffer();
      const text = decodeBody(buffer, res.headers.get('content-type'));
      sendResponse({ ok: res.status >= 200 && res.status < 400, status: res.status, text });
    })
    .catch((err) => {
      clearTimeout(timer);
      const isAbort = err && err.name === 'AbortError';
      sendResponse({ ok: false, error: isAbort ? 'timeout' : 'network' });
    });

  return true; // keep the message channel open for the async sendResponse
});
