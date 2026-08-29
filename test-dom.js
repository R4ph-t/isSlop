'use strict';

const { JSDOM } = require('jsdom');
const scan = require('./scan-dom.js');
const engine = require('./engine.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log('  ok  ' + msg);
  } else {
    failed += 1;
    console.log('  FAIL  ' + msg);
  }
}

const COPY = "Let's delve into the tapestry of product writing.";

function withDom(html, fn) {
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
  global.window = dom.window;
  global.document = dom.window.document;
  global.Node = dom.window.Node;
  global.NodeFilter = dom.window.NodeFilter;
  global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  global.HTMLElement = dom.window.HTMLElement;
  global.Element = dom.window.Element;
  global.Text = dom.window.Text;
  scan.reset();
  try {
    fn(dom.window.document, dom.window);
  } finally {
    global.document = prev.document;
    global.window = prev.window;
    global.Node = prev.Node;
    global.NodeFilter = prev.NodeFilter;
    global.getComputedStyle = prev.getComputedStyle;
    global.HTMLElement = prev.HTMLElement;
    global.Element = prev.Element;
    global.Text = prev.Text;
    dom.window.close();
  }
}

function firstText(el) {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  return w.nextNode();
}

console.log('isSlop DOM tests\n');

console.log('1. wrapRange skips contenteditable');
withDom(
  '<p id="copy">' + COPY + '</p>' +
  '<div id="editor" contenteditable="true">' + COPY + '</div>',
  function (doc) {
    const editor = doc.getElementById('editor');
    const copy = doc.getElementById('copy');
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
    assert(doc.getElementById('editor').querySelectorAll('.' + scan.MARK_CLASS).length === 0,
      'scan path never wraps the editor');
    assert(doc.getElementById('box').querySelectorAll('.' + scan.MARK_CLASS).length === 0,
      'scan path never wraps role=textbox');
    assert(doc.getElementById('copy').querySelectorAll('.' + scan.MARK_CLASS).length >= 1,
      'scan path wraps the article');
  }
);

console.log('3. designMode skips the whole document');
withDom('<p id="copy">' + COPY + '</p>', function (doc, win) {
  doc.designMode = 'on';
  const nodes = scan.collectTextNodes(doc.body, { stripChrome: false });
  assert(nodes.length === 0, 'designMode=on yields no text nodes (got ' + nodes.length + ')');
  const text = firstText(doc.getElementById('copy'));
  const hits = engine.mergeOverlaps(engine.findMatches(COPY));
  scan.applyMatches(text, hits);
  assert(doc.getElementById('copy').querySelectorAll('.' + scan.MARK_CLASS).length === 0,
    'wrapRange refuses designMode documents');
  void win;
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
