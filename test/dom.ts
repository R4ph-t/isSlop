import { JSDOM } from 'jsdom';
import * as scan from '../src/scan-dom';
import * as engine from '../src/engine';
import { detectPack } from '../src/packs/registry';


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
const LONG_DOC = new Array(12).fill(COPY).join(' ');

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

console.log('4. Block page editor is scanned');
withDom(
  '<nav id="side">Sidebar nav text that is long enough</nav>' +
  '<div>' +
    '<div id="b1" contenteditable="true">' + COPY + '</div>' +
    '<div id="b2" contenteditable="true">' + COPY + '</div>' +
    '<div id="b3" contenteditable="true">' + COPY + '</div>' +
  '</div>' +
  '<div id="comment" contenteditable="true">Short isolated comment box text.</div>',
  function (doc) {
    const nodes = scan.collectTextNodes(doc.body, { stripChrome: false });
    const ids = nodes.map(function (n) {
      return n.parentElement && n.parentElement.id;
    });
    assert(ids.indexOf('b1') !== -1, 'collects page-editor block b1');
    assert(ids.indexOf('b2') !== -1, 'collects page-editor block b2');
    assert(ids.indexOf('b3') !== -1, 'collects page-editor block b3');
    assert(ids.indexOf('comment') === -1, 'still skips an isolated comment box');
    assert(!scan.inEditor(firstText(mustId(doc, 'b1'))), 'page-editor block is not a compose field');
    assert(scan.inEditor(firstText(mustId(doc, 'comment'))), 'isolated comment is a compose field');

    nodes.forEach(function (node) {
      const hits = engine.mergeOverlaps(engine.findMatches(node.nodeValue || ''));
      scan.applyMatches(node, hits);
    });
    assert(mustId(doc, 'b1').querySelectorAll('.' + scan.MARK_CLASS).length >= 1,
      'wraps a page-editor block');
    assert(mustId(doc, 'comment').querySelectorAll('.' + scan.MARK_CLASS).length === 0,
      'does not wrap the isolated comment');
  }
);

console.log('5. Multiline document leaf (short tokens, Article chrome)');
withDom(
  '<main id="main">' +
    '<header>Share Search New page chrome chrome chrome chrome</header>' +
    '<div id="leaf" contenteditable="true" role="textbox" aria-multiline="true">' +
      'The <span id="tok">adversative</span> ' + LONG_DOC +
    '</div>' +
  '</main>' +
  '<div id="comment" contenteditable="true" role="textbox">Short isolated comment box text here.</div>' +
  '<div role="dialog"><div id="modal" contenteditable="true" role="textbox" aria-multiline="true">' +
    LONG_DOC +
  '</div></div>',
  function (doc) {
    const main = mustId(doc, 'main');
    const nodes = scan.collectTextNodes(main, { stripChrome: true });
    const ids = nodes.map(function (n) {
      return n.parentElement && n.parentElement.id;
    });
    const bodyIds = scan.collectTextNodes(doc.body, { stripChrome: false }).map(function (n) {
      return n.parentElement && n.parentElement.id;
    });
    assert(ids.indexOf('leaf') !== -1, 'Article scan collects the multiline document leaf');
    assert(ids.indexOf('tok') !== -1, 'collects short token spans inside the document leaf');
    assert(bodyIds.indexOf('comment') === -1, 'does not collect a textbox outside the document');
    assert(bodyIds.indexOf('modal') === -1, 'does not collect a multiline editor inside a dialog');
    assert(!scan.inEditor(firstText(mustId(doc, 'tok'))), 'document leaf is not a compose field');
    assert(scan.inEditor(firstText(mustId(doc, 'comment'))), 'textbox outside the document stays compose');
    assert(scan.inEditor(firstText(mustId(doc, 'modal'))), 'dialog editor stays compose');

    nodes.forEach(function (node) {
      const hits = engine.mergeOverlaps(engine.findMatches(node.nodeValue || ''));
      scan.applyMatches(node, hits);
    });
    assert(mustId(doc, 'leaf').querySelectorAll('.' + scan.MARK_CLASS).length >= 1,
      'wraps the document leaf');
  }
);

console.log('6. Tokenized article text is collected');
withDom(
  '<main id="main">' +
    '<p id="post"><span>Let</span>\'s <span>delve</span> <span>into</span> the tapestry of product writing.</p>' +
  '</main>',
  function (doc) {
    const nodes = scan.collectTextNodes(mustId(doc, 'main'), { stripChrome: true });
    const joined = nodes.map(function (n) { return n.nodeValue || ''; }).join('');
    assert(joined.indexOf('delve') !== -1, 'collects short token spans in a static article');
    nodes.forEach(function (node) {
      const hits = engine.mergeOverlaps(engine.findMatches(node.nodeValue || ''));
      scan.applyMatches(node, hits);
    });
    assert(mustId(doc, 'post').querySelectorAll('.' + scan.MARK_CLASS).length >= 1,
      'wraps tokenized article text');
  }
);

console.log('7. Canvas/SVG aria-labels are scanned');
withDom(
  '<main id="main">' +
    '<svg><g id="line" aria-label="' + COPY + '"></g></svg>' +
    '<button aria-label="Close dialog window now">x</button>' +
  '</main>',
  function (doc) {
    const labels = scan.collectAriaText(mustId(doc, 'main'), { stripChrome: true });
    assert(labels.some(function (t) { return t.text.indexOf('delve') !== -1; }),
      'collects document text from svg aria-label');
    assert(!labels.some(function (t) { return t.text.indexOf('Close') !== -1; }),
      'skips button aria-labels');
  }
);

console.log('8. Hidden canvas labels inside a page editor are scanned');
withDom(
  '<main id="main">' +
    '<div id="ed" role="textbox" contenteditable="true" aria-multiline="true">' +
      '<svg style="display:none" aria-hidden="true">' +
        '<rect aria-label="Hello"></rect>' +
        '<rect aria-label="' + COPY + '"></rect>' +
      '</svg>' +
    '</div>' +
  '</main>',
  function (doc) {
    const labels = scan.collectAriaText(mustId(doc, 'main'), { stripChrome: true });
    assert(labels.some(function (t) { return t.text === 'Hello'; }), 'keeps short svg labels');
    assert(labels.some(function (t) { return t.text.indexOf('delve') !== -1; }),
      'reads hidden svg labels inside a textbox');
  }
);

console.log('9. Patterns match across token spans');
withDom(
  '<p id="post"><span>Let</span>\'s <span>delve</span> into the tapestry of product writing.</p>',
  function (doc) {
    const nodes = scan.collectTextNodes(doc.body, { stripChrome: false });
    const runs = scan.groupTextRuns(nodes).map(function (group) {
      return scan.joinTextRun(group);
    });
    assert(runs.length >= 1, 'groups token spans into a run');
    const joined = runs[0] && runs[0].text || '';
    assert(joined.indexOf("Let's delve") !== -1, 'joined text restores the phrase');
    const hits = engine.mergeOverlaps(engine.findMatches(joined));
    assert(hits.length >= 1, 'joined run hits a rule (got ' + hits.length + ')');
    const run = runs[0];
    if (!run) return;
    const byNode = new Map();
    hits.forEach(function (hit) {
      scan.projectSpan(run.parts, hit.start, hit.end).forEach(function (bit) {
        const list = byNode.get(bit.node) || [];
        list.push({ start: bit.start, end: bit.end, rule: hit.rule });
        byNode.set(bit.node, list);
      });
    });
    byNode.forEach(function (list, node) {
      scan.applyMatches(node, list);
    });
    assert(mustId(doc, 'post').querySelectorAll('.' + scan.MARK_CLASS).length >= 1,
      'wraps the phrase across token spans');
  }
);

console.log('10. Nested page editor (Notion-style) is scanned as English despite UI lang');
withDom(
  '<main id="main">' +
    '<div contenteditable="true" data-content-editable-root="true">' +
      '<div id="leaf1" class="content-editable-leaf-rtl" contenteditable="true" data-content-editable-leaf="true" role="textbox" aria-multiline="true">' +
        'It\u2019s also a testament to the symbiosis of Render products: a workflow behind a web service is becoming an increasingly common pattern across our internal tools.' +
      '</div>' +
      '<div id="leaf2" class="content-editable-leaf-rtl" contenteditable="true" data-content-editable-leaf="true" role="textbox" aria-multiline="true">' +
        'The conventional wisdom says: always use a Facade. Hot take: Sometimes it\u2019s overkill.' +
      '</div>' +
      '<div id="leaf3" class="content-editable-leaf-rtl" contenteditable="true" data-content-editable-leaf="true" role="textbox" aria-multiline="true">' +
        'In today\u2019s world, the Facade pattern can be supercharged with AI. Imagine an AI-powered Facade that dynamically adapts.' +
      '</div>' +
    '</div>' +
  '</main>',
  function (doc) {
    doc.documentElement.lang = 'fr';
    const nodes = scan.collectTextNodes(mustId(doc, 'main'), { stripChrome: true });
    const ids = nodes.map(function (n) {
      return n.parentElement && n.parentElement.id;
    });
    assert(ids.indexOf('leaf1') !== -1, 'collects nested document leaf 1');
    assert(ids.indexOf('leaf3') !== -1, 'collects nested document leaf 3');
    const runs = scan.groupTextRuns(nodes).map(function (group) {
      return scan.joinTextRun(group);
    });
    const scanned = runs.map(function (r) { return r.text; }).join('\n');
    assert(detectPack('fr', scanned).id === 'en', 'English Notion body beats html lang=fr');
    let hits = 0;
    runs.forEach(function (run) {
      hits += engine.mergeOverlaps(engine.findMatches(run.text)).length;
    });
    assert(hits >= 2, 'English slop in nested leaves hits rules (got ' + hits + ')');
    assert(scanned.indexOf('supercharged') !== -1, 'joined leaf keeps supercharged');
    assert(!scan.inEditor(firstText(mustId(doc, 'leaf1'))), 'nested document leaf is not compose');
  }
);

console.log('11. Line overlay is sliced to the match, not the whole glyph');
{
  const box = { left: 100, top: 40, width: 600, height: 20 };
  const line = 'Consider defining facades within each assembly to facilitate easy access from other application parts.';
  const start = line.indexOf('facilitate');
  const end = start + 'facilitate'.length;
  const sliced = scan.sliceLineRect(box, line, start, end);
  assert(sliced.width < box.width * 0.25, 'sliced width is much smaller than the line (got ' + sliced.width + ')');
  assert(sliced.left > box.left + box.width * 0.4, 'sliced left sits in the later part of the line');
  assert(sliced.left + sliced.width < box.left + box.width, 'sliced box stays inside the line');
  const measured = scan.sliceLineRect(box, line, start, end, function (s) { return s.length * 10; });
  const scale = box.width / (line.length * 10);
  assert(Math.abs(measured.left - (box.left + start * 10 * scale)) < 1, 'measured slice uses prefix width');
  assert(Math.abs(measured.width - ('facilitate'.length * 10 * scale)) < 2, 'measured slice uses match width');
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
