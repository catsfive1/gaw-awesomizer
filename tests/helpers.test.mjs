// tests/helpers.test.mjs
//
// Exercises the pure helpers in content.js by slicing their exact source
// (via _extract.mjs balanced-brace scanning) and compiling standalone.
// Same pattern as gaw-research-search/tests — we test the REAL source text,
// never a re-typed copy that could drift.
//
// Run:  node --test tests/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSource, loadFn } from './_extract.mjs';

const src = loadSource('../extension/content.js');

// ─── RE object: the content.js defines its regexes as a top-level RE = {...}
// Some helpers reference RE.USER_LINK, RE.AGE_TEXT, etc. We extract the RE
// object literal from content.js and inject it as a global so the sliced
// functions can see it.
function extractRE(src) {
  // Find `const RE = {` ... matching close brace
  const start = src.indexOf('const RE = {');
  if (start < 0) throw new Error('could not find RE object');
  let depth = 0, i = src.indexOf('{', start);
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  const body = src.slice(start + 'const RE = '.length, i + 1);
  // Use eval to materialize the object (it contains regex literals)
  return (0, eval)('(' + body + ')');
}
const RE = extractRE(src);

// ─── getPostAge ─────────────────────────────────────────────────────────────
// Reads time[datetime] attr OR parses age-text ("3 hours", "2 days").
// References RE.AGE_TEXT so we inject the extracted RE object.
const getPostAge = loadFn(src, 'getPostAge', { RE });

test('getPostAge: returns hours from time[datetime] element', () => {
  // Build a fake post element with a <time> child
  const fakeTime = {
    getAttribute: (attr) => attr === 'datetime'
      ? new Date(Date.now() - 5 * 3600000).toISOString() // 5h ago
      : null,
  };
  const fakePost = {
    querySelector: (sel) => sel === 'time' ? fakeTime : null,
    innerText: '',
  };
  const hours = getPostAge(fakePost);
  assert.ok(hours >= 4.9 && hours <= 5.1, `expected ~5h, got ${hours}`);
});

test('getPostAge: returns 0 when no time element and no age text', () => {
  const fakePost = {
    querySelector: () => null,
    innerText: 'no age info here',
  };
  assert.equal(getPostAge(fakePost), 0);
});

test('getPostAge: parses "3 hours" age text', () => {
  const fakePost = {
    querySelector: () => null,
    innerText: 'posted 3 hours ago by foo',
  };
  assert.equal(getPostAge(fakePost), 3);
});

test('getPostAge: parses "2 days" as 48 hours', () => {
  const fakePost = {
    querySelector: () => null,
    innerText: '2 days ago',
  };
  assert.equal(getPostAge(fakePost), 48);
});

test('getPostAge: parses "15 minutes" as 0.25 hours', () => {
  const fakePost = {
    querySelector: () => null,
    innerText: '15 minutes ago',
  };
  assert.equal(getPostAge(fakePost), 0.25);
});

// ─── isSticky ───────────────────────────────────────────────────────────────
const isSticky = loadFn(src, 'isSticky', {});

test('isSticky: true when data-stickied="true"', () => {
  const p = { getAttribute: (a) => a === 'data-stickied' ? 'true' : null,
              classList: { contains: () => false },
              querySelector: () => null };
  assert.equal(isSticky(p), true);
});

test('isSticky: true when .stickied class present', () => {
  const p = { getAttribute: () => null,
              classList: { contains: (c) => c === 'stickied' },
              querySelector: () => null };
  assert.equal(isSticky(p), true);
});

test('isSticky: false for normal post', () => {
  const p = { getAttribute: () => null,
              classList: { contains: () => false },
              querySelector: () => null };
  // The function does `m && (m.textContent || '').includes('Stickied')` —
  // for a normal post with no sticky indicators, returns the falsy result
  // of the last check (null from querySelector → false).
  assert.ok(!isSticky(p), 'expected falsy for normal post');
});

// ─── getPostScore ───────────────────────────────────────────────────────────
const getPostScore = loadFn(src, 'getPostScore', {});

test('getPostScore: parses plain integer', () => {
  const p = { querySelector: () => ({ textContent: '42' }) };
  assert.equal(getPostScore(p), 42);
});

test('getPostScore: parses "1.2k" as 1200', () => {
  const p = { querySelector: () => ({ textContent: '1.2k' }) };
  assert.equal(getPostScore(p), 1200);
});

test('getPostScore: parses "3.4m" as 3400000', () => {
  const p = { querySelector: () => ({ textContent: '3.4m' }) };
  assert.equal(getPostScore(p), 3400000);
});

test('getPostScore: strips commas', () => {
  const p = { querySelector: () => ({ textContent: '1,234' }) };
  assert.equal(getPostScore(p), 1234);
});

test('getPostScore: returns 0 when no score element', () => {
  const p = { querySelector: () => null };
  assert.equal(getPostScore(p), 0);
});

// ─── getPostAuthor ──────────────────────────────────────────────────────────
// References RE.USER_LINK — inject the RE object.
const getPostAuthor = loadFn(src, 'getPostAuthor', { RE });

test('getPostAuthor: prefers data-author attr (lowercased)', () => {
  const p = { getAttribute: (a) => a === 'data-author' ? 'MadMax2' : null,
              querySelector: () => null };
  assert.equal(getPostAuthor(p), 'madmax2');
});

test('getPostAuthor: falls back to /u/ link', () => {
  const fakeLink = { getAttribute: (a) => a === 'href' ? '/u/DCGRITS/' : null };
  const p = { getAttribute: () => null,
              querySelector: () => fakeLink };
  assert.equal(getPostAuthor(p), 'dcgrits');
});

test('getPostAuthor: empty string when no author found', () => {
  const p = { getAttribute: () => null, querySelector: () => null };
  assert.equal(getPostAuthor(p), '');
});

// ─── getPostTitle ───────────────────────────────────────────────────────────
const getPostTitle = loadFn(src, 'getPostTitle', {});

test('getPostTitle: returns lowercased title text', () => {
  const p = { querySelector: () => ({ textContent: '  Some Big News Story  ' }) };
  assert.equal(getPostTitle(p), 'some big news story');
});

test('getPostTitle: empty when no title element', () => {
  const p = { querySelector: () => null };
  assert.equal(getPostTitle(p), '');
});
