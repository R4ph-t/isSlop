import { JSDOM } from 'jsdom';
import * as scan from '../src/scan-dom';
import * as engine from '../src/engine';


let passed = 0;
let failed = 0;

function assert(cond: unknown, msg: string): void {
  if (cond) {
    passed += 1;
    console.log('  ok  ' + msg);
  } else {
    failed += 1;
    console.log('  FAIL  ' + msg);
  }
}

const COPY = "Let's delve into the tapestry of product writing.";

function withDom(html: string, fn: (doc: Document, win: Window & typeof globalThis) => void): void {
  const dom = new JSDOM('<!doctype html><html><body>' + html + '</body></html>', {
    pretendToBeVisual: true
  });
  const prev = {
    document: global.document,
    window: global.window,
    Node: global.Node,
    NodeFilter: global.NodeFilter,
    getComputedStyle: global.getComputedStyle,
    HTMLElement: global.HTMLElement,
    Element: global.Element,
    Text: global.Text
  };
  (globalThis as any).window = dom.window;
  (globalThis as any).document = dom.window.document;
  (globalThis as any).Node = dom.window.Node;
  (globalThis as any).NodeFilter = dom.window.NodeFilter;
  (globalThis as any).getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  (globalThis as any).HTMLElement = dom.window.HTMLElement;
  (globalThis as any).Element = dom.window.Element;
  (globalThis as any).Text = dom.window.Text;
  scan.reset();
  try {
    fn(dom.window.document, dom.window as unknown as Window & typeof globalThis);
  } finally {
    (globalThis as any).document = prev.document;
    (globalThis as any).window = prev.window;
    (globalThis as any).Node = prev.Node;
    (globalThis as any).NodeFilter = prev.NodeFilter;
    (globalThis as any).getComputedStyle = prev.getComputedStyle;
    (globalThis as any).HTMLElement = prev.HTMLElement;
    (globalThis as any).Element = prev.Element;
    (globalThis as any).Text = prev.Text;
    dom.window.close();
  }
}

function firstText(el: Element | null): Text {
  if (!el) throw new Error('missing element');
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const node = w.nextNode();
  if (!(node instanceof Text)) throw new Error('no text node');
  return node;
}

function mustId(doc: Document, id: string): HTMLElement {
  const el = doc.getElementById(id);
  if (!el) throw new Error('missing #' + id);
  return el;
}

console.log('isSlop DOM tests\n');

console.log('1. wrapRange skips contenteditable');
withDom(
  '<p id="copy">' + COPY + '</p>' +
  '<div id="editor" contenteditable="true">' + COPY + '</div>',
  function (doc) {
    const editor = mustId(doc, 'editor');
    const copy = mustId(doc, 'copy');
    const editorText = firstText(editor);
    const copyText = firstText(copy);
    const matches = engine.mergeOverlaps(engine.findMatches(COPY));
    assert(matches.length >= 1, 'fixture text hits a rule');
    assert(scan.inEditor(editorText), 'editor text reports inEditor');
    assert(!scan.inEditor(copyText), 'article text is not an editor');

    scan.applyMatches(editorText, matches);
    scan.applyMatches(copyText, matches);

    assert(editor.querySelectorAll('.' + scan.MARK_CLASS).length === 0,
      'wrapRange did not insert marks into contenteditable (got ' +
      editor.querySelectorAll('.' + scan.MARK_CLASS).length + ')');
    assert(copy.querySelectorAll('.' + scan.MARK_CLASS).length >= 1,
      'wrapRange still marks a normal paragraph');
  }
);

console.log('2. collectTextNodes skips editors');
withDom(
  '<p id="copy">' + COPY + '</p>' +
  '<div id="editor" contenteditable="true">' + COPY + '</div>' +
  '<div id="box" role="textbox">' + COPY + '</div>',
  function (doc) {
    const nodes = scan.collectTextNodes(doc.body, { stripChrome: false });
    const parents = nodes.map(function (n) {
      return n.parentElement && n.parentElement.id;
    });
    assert(parents.indexOf('editor') === -1, 'collectTextNodes skips contenteditable');
    assert(parents.indexOf('box') === -1, 'collectTextNodes skips role=textbox');
    assert(parents.indexOf('copy') !== -1, 'collectTextNodes keeps article text');

    nodes.forEach(function (node) {
      const hits = engine.mergeOverlaps(engine.findMatches(node.nodeValue || ''));
      scan.applyMatches(node, hits);
    });
    assert(mustId(doc, 'editor').querySelectorAll('.' + scan.MARK_CLASS).length === 0,
      'scan path never wraps the editor');
    assert(mustId(doc, 'box').querySelectorAll('.' + scan.MARK_CLASS).length === 0,
      'scan path never wraps role=textbox');
    assert(mustId(doc, 'copy').querySelectorAll('.' + scan.MARK_CLASS).length >= 1,
      'scan path wraps the article');
  }
);

console.log('3. designMode skips the whole document');
withDom('<p id="copy">' + COPY + '</p>', function (doc, win) {
  doc.designMode = 'on';
  const nodes = scan.collectTextNodes(doc.body, { stripChrome: false });
  assert(nodes.length === 0, 'designMode=on yields no text nodes (got ' + nodes.length + ')');
  const text = firstText(mustId(doc, 'copy'));
  const hits = engine.mergeOverlaps(engine.findMatches(COPY));
  scan.applyMatches(text, hits);
  assert(mustId(doc, 'copy').querySelectorAll('.' + scan.MARK_CLASS).length === 0,
    'wrapRange refuses designMode documents');
  void win;
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
