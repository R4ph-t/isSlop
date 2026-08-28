const scanBtn = document.getElementById('scan');
const clearBtn = document.getElementById('clear');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');

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
  scanBtn.disabled = busy;
  clearBtn.disabled = busy;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) throw new Error('No active tab');
  return tab;
}

async function inject(tabId) {
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['highlight.css'] });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (!/duplicate/i.test(msg)) throw err;
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['rules.js', 'engine.js', 'content.js']
  });
}

function bandClass(label) {
  if (label === 'Reads human') return 'is-human';
  if (label === 'Some slop patterns') return 'is-some';
  if (label === 'Heavy slop') return 'is-heavy';
  return 'is-city';
}

function render(summary) {
  resultsEl.hidden = false;
  const block = document.getElementById('score-block');
  block.className = 'score-block ' + bandClass(summary.label);
  document.getElementById('score').textContent = String(summary.score);
  document.getElementById('label').textContent = summary.label;
  document.getElementById('t3').textContent = String((summary.tiers && summary.tiers[3]) || 0);
  document.getElementById('t2').textContent = String((summary.tiers && summary.tiers[2]) || 0);
  document.getElementById('t1').textContent = String((summary.tiers && summary.tiers[1]) || 0);
  document.getElementById('words').textContent = String(summary.wordCount || 0);

  const cats = document.getElementById('cats');
  cats.replaceChildren();
  const list = summary.categories || [];
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No patterns hit';
    cats.appendChild(li);
    return;
  }
  for (const cat of list) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = cat.name;
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = String(cat.count);
    li.append(name, n);
    cats.appendChild(li);
  }
}

scanBtn.addEventListener('click', async () => {
  setBusy(true);
  setStatus('Scanning…');
  try {
    const tab = await activeTab();
    await inject(tab.id);
    const summary = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN' });
    statusEl.classList.remove('is-error');
    render(summary);
    setStatus('');
  } catch (err) {
    resultsEl.hidden = true;
    statusEl.classList.add('is-error');
    setStatus('Can’t scan this page. Open a normal http(s) tab.');
  } finally {
    setBusy(false);
  }
});

clearBtn.addEventListener('click', async () => {
  setBusy(true);
  try {
    const tab = await activeTab();
    await inject(tab.id);
    await chrome.tabs.sendMessage(tab.id, { type: 'CLEAR' });
    resultsEl.hidden = true;
    statusEl.classList.remove('is-error');
    setStatus('Highlights cleared');
  } catch (err) {
    statusEl.classList.add('is-error');
    setStatus('Nothing to clear on this page.');
  } finally {
    setBusy(false);
  }
});

if (new URLSearchParams(location.search).has('preview')) {
  render({
    score: 72,
    label: 'Slop city',
    wordCount: 412,
    tiers: { 1: 3, 2: 8, 3: 12 },
    categories: [
      { name: 'Rhetorical setups', count: 9 },
      { name: 'Vocabulary', count: 7 },
      { name: 'Puffery', count: 4 }
    ]
  });
}
