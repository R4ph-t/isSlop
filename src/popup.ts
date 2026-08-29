function mustEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error('missing #' + id);
  return el as T;
}

const hideBtn = mustEl<HTMLButtonElement>('hide');
const rescanBtn = mustEl<HTMLButtonElement>('rescan');
const statusEl = mustEl<HTMLElement>('status');
const resultsEl = mustEl<HTMLElement>('results');

type ScanScope = 'article' | 'page';
type HiddenTiers = { 1: boolean; 2: boolean; 3: boolean };

let scanned = false;
let scanScope: ScanScope = 'article';
let lastSummary: import('./types').PageSummary | null = null;
const hiddenTiers: HiddenTiers = { 1: false, 2: false, 3: false };
const isPreview = new URLSearchParams(location.search).has('preview');

function requireTabId(tab: chrome.tabs.Tab): number {
  if (tab.id == null) throw new Error('No tab id');
  return tab.id;
}

function isTier(n: number): n is 1 | 2 | 3 {
  return n === 1 || n === 2 || n === 3;
}


if (!isPreview) {
  document.documentElement.dataset.theme =
    matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setStatus(text: string): void {
  if (!text) {
    statusEl.hidden = true;
    statusEl.textContent = '';
    return;
  }
  statusEl.hidden = false;
  statusEl.textContent = text;
}

function setBusy(busy: boolean): void {
  hideBtn.disabled = busy || !scanned;
  rescanBtn.disabled = busy;
}

function setScanned(on: boolean): void {
  scanned = on;
  document.body.classList.toggle('is-scanned', on);
  hideBtn.disabled = !on;
  if (!on) resultsEl.hidden = true;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) throw new Error('No active tab');
  return tab;
}

async function inject(tabId: number): Promise<void> {
  try {
    await chrome.scripting.removeCSS({ target: { tabId }, files: ['highlight.css'] });
  } catch (err) {
    /* nothing injected yet */
  }
  await chrome.scripting.insertCSS({ target: { tabId }, files: ['highlight.css'] });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
}

async function ensureInjected(tabId: number): Promise<void> {
  try {
    const pong = await chrome.tabs.sendMessage(tabId, { type: 'SLOP_PING' });
    if (pong && pong.ok) return;
  } catch (err) {
    /* not injected yet */
  }
  await inject(tabId);
}

function displayLabel(label: string): string {
  if (label === 'Heavy slop') return 'Heavily patterned';
  if (label === 'Some slop patterns') return 'Some patterning';
  return label;
}

function paintBar(score: number, tiers?: { 1?: number; 2?: number; 3?: number }): void {
  const bar = document.getElementById('bar');
  if (!bar) return;
  const t3 = (tiers && tiers[3]) || 0;
  const t2 = (tiers && tiers[2]) || 0;
  const t1 = (tiers && tiers[1]) || 0;
  const weighted = t3 * 3 + t2 * 2 + t1;
  const parts = weighted
    ? [(t3 * 3) / weighted, (t2 * 2) / weighted, t1 / weighted]
    : [0, 0, 0];
  ['b3', 'b2', 'b1'].forEach(function (cls, i) {
    const el = bar.querySelector('.' + cls);
    if (el instanceof HTMLElement) el.style.flex = '0 0 ' + ((parts[i] || 0) * score).toFixed(2) + '%';
  });
}

function blurb(n: number, score: number, where?: string): string {
  const place = where || 'the page';
  if (!n) return 'No flags. ' + place.charAt(0).toUpperCase() + place.slice(1) + ' didn’t trip a rule.';
  if (score < 15) {
    return n + (n === 1 ? ' flag. ' : ' flags. ') + 'Most of ' + place + ' reads as written by a person.';
  }
  const who = n === 1 ? 'One passage carries' : n + ' passages carry';
  return who + ' almost all of it. The rest of ' + place + ' reads as written by a person.';
}

function scopeWhere(summary?: import('./types').PageSummary | null): string {
  return summary && summary.scope === 'article' && summary.root !== 'body'
    ? 'the article'
    : 'the page';
}

function scopeNote(summary?: import('./types').PageSummary | null): string {
  if (!summary) return '';
  if (summary.scope === 'page') return '';
  if (summary.root === 'body') return 'No article block found. Skipped nav, footer, and asides.';
  return '';
}

function paintScope() {
  document.querySelectorAll<HTMLButtonElement>('[data-scope]').forEach(function (btn) {
    const on = btn.dataset.scope === scanScope;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function paintLevels() {
  document.querySelectorAll<HTMLButtonElement>('.level-toggle').forEach(function (btn) {
    const tier = Number(btn.dataset.tier);
    if (!isTier(tier)) return;
    const on = !hiddenTiers[tier];
    btn.classList.toggle('is-off', !on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    const label = tier === 3 ? 'heavy' : tier === 2 ? 'medium' : 'light';
    btn.title = on ? 'Hide ' + label + ' marks' : 'Show ' + label + ' marks';
  });
}

function visibleFindings(list?: import('./types').Finding[] | null): import('./types').Finding[] {
  const allOff = hiddenTiers[1] && hiddenTiers[2] && hiddenTiers[3];
  if (allOff) return [];
  return (list || []).filter(function (hit) {
    return !isTier(hit.tier) || !hiddenTiers[hit.tier];
  });
}

function tierName(tier: number): string {
  if (tier === 3) return 'HEAVY';
  if (tier === 2) return 'MEDIUM';
  return 'LIGHT';
}

function renderFindings(list?: import('./types').Finding[] | null): void {
  const root = mustEl('findings');
  root.replaceChildren();
  if (!list || !list.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    const allOff = hiddenTiers[1] && hiddenTiers[2] && hiddenTiers[3];
    li.textContent = allOff
      ? 'All levels hidden. Tap a level to show marks.'
      : 'No patterns hit';
    root.appendChild(li);
    return;
  }
  for (const hit of list) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'finding';
    btn.dataset.id = hit.id;

    const copy = document.createElement('span');
    copy.className = 'finding-copy';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = hit.name;
    const snippet = document.createElement('span');
    snippet.className = 'snippet';
    snippet.textContent = hit.snippet;
    copy.append(name, snippet);

    const meta = document.createElement('span');
    meta.className = 'finding-meta';
    const tag = document.createElement('span');
    tag.className = 'tier-tag t' + hit.tier;
    tag.textContent = tierName(hit.tier);
    meta.appendChild(tag);
    meta.insertAdjacentHTML('beforeend',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>');

    btn.append(copy, meta);
    li.appendChild(btn);
    root.appendChild(li);
  }
}

function render(summary: import('./types').PageSummary, elapsedMs?: number): void {
  resultsEl.hidden = false;
  setScanned(true);
  lastSummary = summary || lastSummary;

  const tiers = summary.tiers || {};
  const t3 = tiers[3] || 0;
  const t2 = tiers[2] || 0;
  const t1 = tiers[1] || 0;
  const total = t3 + t2 + t1;

  mustEl('score').textContent = String(summary.score);
  mustEl('label').textContent = displayLabel(summary.label);
  mustEl('words').textContent = Number(summary.wordCount || 0).toLocaleString('en-US');
  const elapsed = mustEl('elapsed');
  elapsed.textContent = elapsedMs != null ? ' • ' + (elapsedMs / 1000).toFixed(1) + 's' : '';

  ([['t3', t3], ['t2', t2], ['t1', t1], ['t3b', t3], ['t2b', t2], ['t1b', t1],
   ['total', total]] as Array<[string, number]>).forEach(function (pair) {
    const el = document.getElementById(pair[0]);
    if (el) el.textContent = String(pair[1]);
  });
  paintBar(summary.score, tiers);
  mustEl('blurb').textContent = blurb(total, summary.score, scopeWhere(summary));
  const noteEl = document.getElementById('scope-note');
  if (noteEl) noteEl.textContent = scopeNote(summary);
  paintScope();
  paintLevels();
  if (summary.scheme === 'dark' || summary.scheme === 'light') {
    applyScheme(summary.scheme, false);
  }

  const note = document.getElementById('pack-note');
  if (note) {
    if (summary.pack && summary.pack.verified === false) {
      note.hidden = false;
      note.textContent = (summary.pack.name || summary.pack.id) + ' pack is unverified. Treat hits as drafts until a native speaker reviews them.';
    } else {
      note.hidden = true;
      note.textContent = '';
    }
  }

  const findings = summary.findings && summary.findings.length ? summary.findings : [];
  renderFindings(visibleFindings(findings));
}

async function runScan() {
  setBusy(true);
  setStatus('Scanning…');
  const t0 = performance.now();
  try {
    const tab = await activeTab();
    const tabId = requireTabId(tab);
    await ensureInjected(tabId);
    const summary = await chrome.tabs.sendMessage(tabId, {
      type: 'SLOP_SCAN',
      scope: scanScope
    });
    await chrome.tabs.sendMessage(tabId, { type: 'SLOP_FILTER', hidden: hiddenTiers });
    statusEl.classList.remove('is-error');
    render(summary, performance.now() - t0);
    setStatus('');
  } catch (err) {
    setScanned(false);
    statusEl.classList.add('is-error');
    setStatus('Can’t scan this page. Open a normal http(s) tab.');
  } finally {
    setBusy(false);
  }
}

async function hideHighlights() {
  setBusy(true);
  try {
    const tab = await activeTab();
    const tabId = requireTabId(tab);
    await ensureInjected(tabId);
    await chrome.tabs.sendMessage(tabId, { type: 'SLOP_CLEAR' });
    statusEl.classList.remove('is-error');
    setScanned(false);
    mustEl('words').textContent = '0';
    mustEl('elapsed').textContent = '';
    setStatus('');
  } catch (err) {
    statusEl.classList.add('is-error');
    setStatus('Nothing to clear on this page.');
  } finally {
    setBusy(false);
  }
}

async function sendScheme(scheme?: string): Promise<void> {
  if (isPreview) return;
  try {
    const tab = await activeTab();
    await chrome.tabs.sendMessage(requireTabId(tab), {
      type: 'SLOP_SCHEME',
      scheme: scheme || currentScheme()
    });
  } catch (err) {
    /* page gone or not injected yet */
  }
}

async function sendFilter() {
  if (isPreview) return;
  try {
    const tab = await activeTab();
    await chrome.tabs.sendMessage(requireTabId(tab), { type: 'SLOP_FILTER', hidden: hiddenTiers });
  } catch (err) {
    /* page gone */
  }
}

function applyFindingsFilter() {
  if (!lastSummary) return;
  const findings = lastSummary.findings && lastSummary.findings.length ? lastSummary.findings : [];
  renderFindings(visibleFindings(findings));
  paintLevels();
}

hideBtn.addEventListener('click', function () {
  hideHighlights();
});
rescanBtn.addEventListener('click', function () {
  runScan();
});

mustEl('close').addEventListener('click', async function () {
  try {
    const tab = await activeTab();
    chrome.tabs.sendMessage(requireTabId(tab), { type: 'ISSLOP_PANEL_CLOSE' }, function () {
      void chrome.runtime.lastError;
    });
  } catch (err) {
    /* not on a page */
  }
});

mustEl('findings').addEventListener('click', async function (e) {
  const target = e.target;
  if (!(target instanceof Element)) return;
  const btn = target.closest('.finding');
  if (!(btn instanceof HTMLElement) || !btn.dataset.id) return;
  try {
    const tab = await activeTab();
    const tabId = requireTabId(tab);
    await ensureInjected(tabId);
    await chrome.tabs.sendMessage(tabId, { type: 'SLOP_JUMP', id: btn.dataset.id });
  } catch (err) {
    /* page gone */
  }
});

function currentScheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function applyScheme(scheme: string, syncPage?: boolean): void {
  const next = scheme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  const shell = document.querySelector('.shell');
  if (shell instanceof HTMLElement) shell.style.colorScheme = next;
  document.querySelectorAll<HTMLButtonElement>('[data-scheme]').forEach(function (btn) {
    btn.classList.toggle('is-on', btn.dataset.scheme === next);
  });
  const levels = document.getElementById('levels');
  if (levels) levels.classList.toggle('slopspotter-on-dark', next === 'dark');
  if (syncPage !== false) sendScheme(next);
}

applyScheme(currentScheme(), false);

document.querySelectorAll<HTMLButtonElement>('[data-scheme]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    applyScheme(btn.dataset.scheme || 'light');
  });
});

document.querySelectorAll<HTMLButtonElement>('[data-scope]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    const next = btn.dataset.scope === 'page' ? 'page' : 'article';
    if (next === scanScope) return;
    scanScope = next;
    paintScope();
    if (!isPreview) {
      runScan();
      return;
    }
    if (lastSummary) {
      lastSummary = Object.assign({}, lastSummary, { scope: scanScope, root: scanScope === 'article' ? 'article' : 'body' });
      render(lastSummary, 4100);
    }
  });
});

mustEl('levels').addEventListener('click', function (e) {
  const target = e.target;
  if (!(target instanceof Element)) return;
  const btn = target.closest('.level-toggle');
  if (!(btn instanceof HTMLElement)) return;
  const tier = Number(btn.dataset.tier);
  if (!isTier(tier)) return;
  hiddenTiers[tier] = !hiddenTiers[tier];
  applyFindingsFilter();
  sendFilter();
});

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
  const ver = chrome.runtime.getManifest().version;
  const el = document.getElementById('ext-version');
  if (el && ver) el.textContent = ver;
}

if (isPreview) {
  applyScheme('light', false);
  render({
    score: 68,
    label: 'Heavy slop',
    wordCount: 1942,
    scope: 'article',
    root: 'article',
    tiers: { 1: 3, 2: 3, 3: 4 },
    categories: [],
    findings: [
      { id: 'p1', name: 'Closing platitude', snippet: 'At the end of the day, the possibilities are truly endless.', tier: 3 },
      { id: 'p2', name: 'Template opener', snippet: "In today's rapidly evolving digital landscape", tier: 2 },
      { id: 'p3', name: 'Signature vocabulary', snippet: "Let's delve into the rich tapestry of…", tier: 2 },
      { id: 'p4', name: 'Hollow tribute', snippet: 'a testament to the power of…', tier: 1 }
    ]
  }, 4100);
} else {
  runScan();
}

function reportPanelSize() {
  if (window.parent === window) return;
  const shell = document.querySelector('.shell');
  if (!shell || typeof chrome === 'undefined' || !chrome.tabs) return;
  const h = Math.ceil(shell.getBoundingClientRect().height);
  if (!h) return;
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const tab = tabs && tabs[0];
    if (!tab || tab.id == null) return;
    chrome.tabs.sendMessage(tab.id, { type: 'ISSLOP_PANEL_SIZE', height: h }, function () {
      void chrome.runtime.lastError;
    });
  });
}

if (window.parent !== window) {
  const shell = document.querySelector('.shell');
  if (shell && typeof ResizeObserver === 'function') {
    new ResizeObserver(reportPanelSize).observe(shell);
  }
  window.addEventListener('load', reportPanelSize);
}
