(function () {
  if (typeof window.__isslopPanelTeardown === 'function') {
    window.__isslopPanelTeardown();
    return;
  }

  document.querySelectorAll('[data-isslop="panel"]').forEach(function (n) {
    n.parentNode.removeChild(n);
  });

  const host = document.createElement('div');
  host.setAttribute('data-isslop', 'panel');
  const hostStyle = {
    display: 'block',
    position: 'fixed',
    top: '28px',
    right: '56px',
    zIndex: '2147483647',
    width: '400px',
    height: '120px',
    margin: '0',
    padding: '0',
    border: '0',
    background: 'transparent',
    filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.14))',
    pointerEvents: 'auto',
    boxSizing: 'border-box'
  };
  Object.keys(hostStyle).forEach(function (k) {
    host.style.setProperty(k.replace(/[A-Z]/g, function (c) {
      return '-' + c.toLowerCase();
    }), hostStyle[k], 'important');
  });

  const shadow = host.attachShadow({ mode: 'closed' });

  const clip = document.createElement('div');
  clip.style.cssText = [
    'display: block',
    'width: 400px',
    'height: 100%',
    'margin: 0',
    'padding: 0',
    'border: 0',
    'border-radius: 8px',
    'overflow: hidden',
    'background: transparent',
    'box-sizing: border-box'
  ].join(';');

  const frame = document.createElement('iframe');
  frame.src = chrome.runtime.getURL('popup.html');
  frame.setAttribute('title', 'isSlop');
  frame.setAttribute('allowtransparency', 'true');
  frame.style.cssText = [
    'display: block',
    'width: 400px',
    'height: 100%',
    'margin: 0',
    'padding: 0',
    'border: 0',
    'border-radius: 8px',
    'background: transparent',
    'color-scheme: none',
    'box-sizing: border-box'
  ].join(';');

  clip.appendChild(frame);
  shadow.appendChild(clip);
  document.documentElement.appendChild(host);

  function onMessage(msg, sender) {
    if (!msg || typeof msg !== 'object') return;
    if (sender && sender.id && sender.id !== chrome.runtime.id) return;
    if (msg.type === 'ISSLOP_PANEL_CLOSE') {
      teardown();
      return;
    }
    if (msg.type !== 'ISSLOP_PANEL_SIZE') return;
    const h = Math.max(120, Math.min(720, window.innerHeight - 44, Math.ceil(Number(msg.height) || 0)));
    host.style.setProperty('height', h + 'px', 'important');
    frame.style.height = h + 'px';
  }

  function onPointerDown(e) {
    const path = e.composedPath ? e.composedPath() : [];
    if (path.indexOf(host) !== -1) return;
    teardown();
  }

  function onKey(e) {
    if (e.key === 'Escape') teardown();
  }

  function teardown() {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKey, true);
    chrome.runtime.onMessage.removeListener(onMessage);
    if (host.parentNode) host.parentNode.removeChild(host);
    window.__isslopPanelTeardown = null;
  }

  window.__isslopPanelTeardown = teardown;
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKey, true);
  chrome.runtime.onMessage.addListener(onMessage);
})();
