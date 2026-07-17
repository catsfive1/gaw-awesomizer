(async function() {
  const manifest = chrome.runtime.getManifest();
  document.getElementById('version').textContent = 'v' + manifest.version;

  const body = document.getElementById('body');
  const SITE_RE = /^https?:\/\/(greatawakening\.win|patriots\.win)\//i;

  function renderNotOnSite() {
    body.innerHTML = `
      <div class="empty">GAW Awesomizer runs on greatawakening.win and patriots.win.<br>Open either site to see live status here.</div>
      <button class="btn primary" id="goGaw">Go to greatawakening.win</button>
      <button class="btn" id="goPdw">Go to patriots.win</button>
    `;
    document.getElementById('goGaw').onclick = () => {
      chrome.tabs.create({ url: 'https://greatawakening.win/' });
      window.close();
    };
    document.getElementById('goPdw').onclick = () => {
      chrome.tabs.create({ url: 'https://patriots.win/' });
      window.close();
    };
  }

  function renderStatus(status, tabId) {
    body.innerHTML = `
      <div class="stats-row">
        <div class="stat"><b id="visCount">${status.visible}</b><span>Visible</span></div>
        <div class="stat"><b id="hidCount">${status.hidden}</b><span>Hidden</span></div>
        <div class="stat"><b>${status.maxHours}h</b><span>Age filter</span></div>
      </div>
      <div class="row">
        <span>Enabled</span>
        <input type="checkbox" class="toggle" id="enabledToggle" ${status.enabled ? 'checked' : ''}>
      </div>
      <button class="btn primary" id="openSettings">Open Settings Panel</button>
      <button class="btn" id="openHelp">Show Keyboard Shortcuts</button>
    `;
    document.getElementById('enabledToggle').onchange = async (e) => {
      try {
        const resp = await chrome.tabs.sendMessage(tabId, { type: 'FOXY_TOGGLE_ENABLED' });
        e.target.checked = resp.enabled;
      } catch { e.target.checked = !e.target.checked; }
    };
    document.getElementById('openSettings').onclick = async () => {
      try { await chrome.tabs.sendMessage(tabId, { type: 'FOXY_OPEN_SETTINGS' }); } catch {}
      window.close();
    };
    document.getElementById('openHelp').onclick = async () => {
      try { await chrome.tabs.sendMessage(tabId, { type: 'FOXY_OPEN_HELP' }); } catch {}
      window.close();
    };
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !SITE_RE.test(tab.url) || tab.url.includes('/u/')) {
    renderNotOnSite();
    return;
  }

  try {
    const status = await chrome.tabs.sendMessage(tab.id, { type: 'FOXY_GET_STATUS' });
    if (!status) throw new Error('no response');
    renderStatus(status, tab.id);
  } catch {
    body.innerHTML = `<div class="empty">GAW Awesomizer is loading on this tab — reload the page and reopen this popup if this persists.</div>`;
  }
})();
