const hideBtn = document.getElementById('hide');
const rescanBtn = document.getElementById('rescan');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');

let scanned = false;

function setStatus(text) {
  if (!text) {
    statusEl.hidden = true;
    statusEl.textContent = '';
    return;
  }
  statusEl.hidden = false;
  statusEl.textContent = text;
}

function setBusy(busy) {
  hideBtn.disabled = busy || !scanned;
  rescanBtn.disabled = busy;
}

function setScanned(on) {
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

async function inject(tabId) {
  try {
    await chrome.scripting.removeCSS({ target: { tabId }, files: ['highlight.css'] });
  } catch (err) {
    /* nothing injected yet */
  }
  await chrome.scripting.insertCSS({ target: { tabId }, files: ['highlight.css'] });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['finders.js', 'packs/registry.js']
      .concat((typeof SLOP_PACK_IDS !== 'undefined' ? SLOP_PACK_IDS : ['en']).map(function (id) {
        return 'packs/' + id + '.js';
      }))
      .concat(['engine.js', 'content.js'])
  });
}

function displayLabel(label) {
  if (label === 'Heavy slop') return 'Heavily patterned';
  if (label === 'Some slop patterns') return 'Some patterning';
  return label;
}

function paintBar(score, tiers) {
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
    if (el) el.style.flex = '0 0 ' + (parts[i] * score).toFixed(2) + '%';
  });
}

function blurb(n, score) {
  if (!n) return 'No flags. The page didn’t trip a rule.';
  if (score < 15) {
    return n + (n === 1 ? ' flag. ' : ' flags. ') + 'Most of the page reads as written by a person.';
  }
  const who = n === 1 ? 'One passage carries' : n + ' passages carry';
  return who + ' almost all of it. The rest reads as written by a person.';
}

function tierName(tier) {
  if (tier === 3) return 'HEAVY';
  if (tier === 2) return 'MEDIUM';
  return 'LIGHT';
}

function renderFindings(list) {
  const root = document.getElementById('findings');
  root.replaceChildren();
  if (!list || !list.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No patterns hit';
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

function render(summary, elapsedMs) {
  resultsEl.hidden = false;
  setScanned(true);

  const tiers = summary.tiers || {};
  const t3 = tiers[3] || 0;
  const t2 = tiers[2] || 0;
  const t1 = tiers[1] || 0;
  const total = t3 + t2 + t1;

  document.getElementById('score').textContent = String(summary.score);
  document.getElementById('label').textContent = displayLabel(summary.label);
  document.getElementById('words').textContent = Number(summary.wordCount || 0).toLocaleString('en-US');
  const elapsed = document.getElementById('elapsed');
  elapsed.textContent = elapsedMs != null ? ' • ' + (elapsedMs / 1000).toFixed(1) + 's' : '';

  [['t3', t3], ['t2', t2], ['t1', t1], ['t3b', t3], ['t2b', t2], ['t1b', t1],
   ['total', total]].forEach(function (pair) {
    const el = document.getElementById(pair[0]);
    if (el) el.textContent = String(pair[1]);
  });
  paintBar(summary.score, tiers);
  document.getElementById('blurb').textContent = blurb(total, summary.score);

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

  renderFindings(summary.findings && summary.findings.length
    ? summary.findings
    : []);
}

async function runScan() {
  setBusy(true);
  setStatus('Scanning…');
  const t0 = performance.now();
  try {
    const tab = await activeTab();
    await inject(tab.id);
    const summary = await chrome.tabs.sendMessage(tab.id, { type: 'SLOP_SCAN' });
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
    await inject(tab.id);
    await chrome.tabs.sendMessage(tab.id, { type: 'SLOP_CLEAR' });
    statusEl.classList.remove('is-error');
    setScanned(false);
    document.getElementById('words').textContent = '0';
    document.getElementById('elapsed').textContent = '';
    setStatus('');
  } catch (err) {
    statusEl.classList.add('is-error');
    setStatus('Nothing to clear on this page.');
  } finally {
    setBusy(false);
  }
}

hideBtn.addEventListener('click', hideHighlights);
rescanBtn.addEventListener('click', runScan);

document.getElementById('findings').addEventListener('click', async function (e) {
  const btn = e.target.closest('.finding');
  if (!btn || !btn.dataset.id) return;
  try {
    const tab = await activeTab();
    await inject(tab.id);
    await chrome.tabs.sendMessage(tab.id, { type: 'SLOP_JUMP', id: btn.dataset.id });
  } catch (err) {
    /* page gone */
  }
});

function currentScheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function applyScheme(scheme) {
  const next = scheme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
  document.querySelectorAll('.scheme-opt').forEach(function (btn) {
    btn.classList.toggle('is-on', btn.dataset.scheme === next);
  });
  const blend = document.getElementById('blend-text');
  if (blend) {
    blend.textContent = next === 'dark'
      ? 'Dark page: ink screens, so the mark lightens instead of punching a hole.'
      : 'Light page: ink multiplies, so the text underneath stays fully legible.';
  }
}

applyScheme(currentScheme());

document.querySelector('.scheme-toggle').addEventListener('click', function (e) {
  const btn = e.target.closest('.scheme-opt');
  if (!btn) return;
  applyScheme(btn.dataset.scheme);
});

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
  const ver = chrome.runtime.getManifest().version;
  const el = document.getElementById('ext-version');
  if (el && ver) el.textContent = ver;
}

if (new URLSearchParams(location.search).has('preview')) {
  applyScheme('light');
  render({
    score: 68,
    label: 'Heavy slop',
    wordCount: 1942,
    tiers: { 1: 3, 2: 3, 3: 4 },
    findings: [
      { id: 'p1', name: 'Closing platitude', snippet: 'At the end of the day, the possibilities are truly endless.', tier: 3 },
      { id: 'p2', name: 'Template opener', snippet: "In today's rapidly evolving digital landscape", tier: 3 },
      { id: 'p3', name: 'Signature vocabulary', snippet: "Let's delve into the rich tapestry of…", tier: 3 },
      { id: 'p4', name: 'Hollow tribute', snippet: 'a testament to the power of…', tier: 3 }
    ]
  }, 4100);
} else {
  runScan();
}
