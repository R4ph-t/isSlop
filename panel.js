(function () {
  const HOST_ID = 'isslop-panel';
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    existing.remove();
    return;
  }

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('data-isslop', 'panel');
  host.style.cssText = [
    'display: block',
    'position: fixed',
    'top: 28px',
    'right: 56px',
    'z-index: 2147483647',
    'width: 400px',
    'height: 120px',
    'margin: 0',
    'padding: 0',
    'border: 0',
    'background: transparent',
    'filter: drop-shadow(0 3px 8px rgba(0,0,0,0.14))',
    'pointer-events: auto',
    'box-sizing: border-box'
  ].join(';');

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
  frame.id = 'isslop-frame';
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
  host.appendChild(clip);
  document.documentElement.appendChild(host);

  function onMessage(msg) {
    if (!msg) return;
    if (msg.type === 'ISSLOP_PANEL_CLOSE') {
      teardown();
      return;
    }
    if (msg.type !== 'ISSLOP_PANEL_SIZE') return;
    const h = Math.max(120, Math.min(720, window.innerHeight - 44, Math.ceil(Number(msg.height) || 0)));
    host.style.height = h + 'px';
    frame.style.height = h + 'px';
  }

  function onPointerDown(e) {
    if (host.contains(e.target)) return;
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
  }

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKey, true);
  chrome.runtime.onMessage.addListener(onMessage);
})();
