# isSlop

Chrome extension that highlights likely AI-generated "slop" on the current page. A tooltip names the rule that fired. Nothing leaves the browser. No network, accounts, tracking, or ML APIs. MIT licensed.

Toolbar and panel icons are from [Lucide](https://lucide.dev) (`highlighter`, `eraser`; ISC License).

## Load unpacked

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked** and select this folder
4. Open any http(s) page and click the toolbar icon. A panel opens on the page and the tab is scanned. Compose boxes and other `contenteditable` fields are left alone.
5. Hover a highlight for the rule name and why it fired. **Hide highlights** removes marks. **Rescan** if the page changed.

Chrome's own pages (`chrome://…`, the Web Store) cannot be scripted.

## How scoring works

Each hit has a tier weight: tier 3 = 4, tier 2 = 2, tier 1 = 1.

```
density = weightedHits / wordCount * 100
score   = clamp(round(density * 25), 0, 100)
```

Labels: below 15 Reads human · 15–39 Some slop patterns · 40–69 Heavy slop · 70+ Slop city.

Em dashes are only flagged in bulk: at least 4 on the page and more than 1 per 150 words.

## Sources

Rules draw from:

- [Wikipedia: Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) (WikiProject AI Cleanup)
- Kobak et al., *Science Advances* (2025) — PubMed spike in *delves* / *underscores* / *showcasing*
- [Pangram, 9 Signs of AI Writing](https://www.pangram.com/signs-of-ai-writing) — contrast patterns ~3× human baseline
- [Simon Willison, LLM cliché highlighter](https://github.com/simonw/tools/blob/main/llm-cliche-highlighter.html) — structural chains (`no X, no Y`), “don’t VERB it”, echoing sentences, anaphora
- [slopdetector.org AI words list](https://slopdetector.org/blog/ai-words-list)
- [Search Engine Watch, 30 examples of AI slop](https://searchenginewatch.com/what-is-ai-slop/) — synthetic balance, placeholder debris, bold-label lists
- Spanish pack (unverified): [stop-slop-spanish](https://github.com/sohantanna/stop-slop-spanish), [humanizar-texto-es](https://github.com/fernandotellado/ai-skills/blob/main/humanizar-texto-es/SKILL.md), [ActivaDocente](https://activadocente.com/frases-y-estilos-reconocibles-en-los-textos-escritos-con-chatgpt-e-ia/), [Diario Vida](https://diariovida.com/tics-texto-escrito-con-ia-espanol/)

A hit is a tell. Humans write some of them; density is the product. The Spanish catalog is compiled from those lists and needs a native-speaker review before `verified: true`.

## How to add a pack

A pack is one language. English is not special. It is `packs/en.js`. French is `packs/fr.js`. Spanish is `packs/es.js` (**unverified**). The engine never names a language; scan picks a pack from `document.documentElement.lang`, then a stopword vote on the page text if `lang` is missing.

The only list a contributor edits besides the new file is `SLOP_PACK_IDS` in `packs/registry.js`. Popup inject and tests load from that array. Do not edit `popup.js` or `engine.js` to add a language.

### Steps

1. Copy `packs/fr.js` (better starting point than English if the language has accents) to `packs/<id>.js`. `<id>` is the ISO 639-1 code: `es`, `de`, `pt`.
2. Keep the IIFE wrapper (`SlopFinders` / `registerPack` / `module.exports`). Change `id`, `name`, `locales`, and `stopwords`.
3. Write **native** `rules`. Do not translate the English catalog. LLM tells are language-specific (`delve` ≠ `plonger`; Spanish uses *cabe destacar*, not *it's worth noting*).
4. Add `'<id>'` to `SLOP_PACK_IDS` in `packs/registry.js`.
5. Add fixtures in `test.js`: a slop paragraph that scores high, a human paragraph that stays **under 8**, plus `detectPack('<id>', '')` and a stopword-vote case.
6. Run `npm test`. Existing English, French, and DOM editor-skip tests must still pass.

Set `verified: true` only when a native speaker has scanned real pages in that language and the human fixture still scores under 8. Leave `verified: false` (and say so in the file header) if the catalog is compiled from published lists but not attested yet. Unverified packs still run on matching `lang`; the popup labels them so hits are treated as drafts.

### Pack shape

```js
{
  id: 'es',
  name: 'Spanish',
  verified: false,            // true only after a native speaker attests the pack
  locales: ['es', 'es-ES', 'es-MX', 'es-AR'],  // html lang values that select this pack
  stopwords: ['el', 'la', 'de', 'que', 'y', 'en', /* … */],
  rules: [ /* see below */ ],
  emDash: {                   // or null if this tell does not apply
    re: /—|\s--\s/g,
    minCount: 4,
    wordsPerDash: 150,
    rule: { id: 'em-dash', name: '…', tier: 1, category: 'Rhythm', why: '…' }
  }
}
```

`locales` is how `lang="es-MX"` finds the pack. `stopwords` is the fallback vote when the page has no `lang`. Use common function words, not slop vocabulary.

Cite real sources in a comment at the top of the file (how models actually write in that language, not a translated English list).

### Rules

Each rule is `{ id, name, tier, category, re|find, why }`. `why` is the tooltip. `re` must be global (`g`). `name` can be in the pack’s language.

```js
{
  id: 'landscape-opener',
  name: 'En el mundo actual',
  tier: 2,              // 3 high, 2 medium, 1 weak
  category: 'Throat-clearing',
  re: /\ben el mundo actual\b/gi,
  why: 'Empty opener. State the fact instead.'
}
```

`\b` is ASCII-only in JavaScript. For accents, elisions, or non-Latin letters, use unicode boundaries (`u` flag) as in `packs/fr.js` (`(?<![\p{L}\p{N}_])…(?![\p{L}\p{N}_])`), not `\b`.

Structural helpers live in `finders.js`. Pass language-specific separators and skip lists; do not copy the finder guts into the pack:

- `makeChainFinder(head, headTest, minItems, chainSep)` — `et`/`ou`, `y`/`o`, `ni`/`ningún`
- `makeEchoFinder(wordRe)` — pass `/[\p{L}\p{N}'’-]+/gu` when words are not ASCII
- `makeAnaphoraFinder(skipRe, wordRe)` — skip articles and pronouns in that language

When in doubt, demote a rule one tier. False positives are the product killer. A connector that humans use in the middle of a sentence should not fire just because it appears once.

To add a rule to an existing pack, append an object to `rules` in that pack file and extend `test.js`. Same `node test.js` bar.

## Tests

```
npm test          # engine catalogs + jsdom wrapRange / editor skips
npm run lint
npm run typecheck
npm run check     # all three
```

`node test.js` is the zero-dependency catalog suite. `test-dom.js` needs `npm install` (jsdom).

Packs, `finders.js`, `engine.js`, and `scan-dom.js` are dual-environment (browser global + Node) so match/merge/score and wrapRange run in tests and in the content script.

## Release (Chrome Web Store)

Version lives in one place: `manifest.json` `"version"`. Chrome only accepts `x.y.z` integers (no `-beta`). The panel reads it via `chrome.runtime.getManifest()`.

```
node scripts/release.js pack              # zip current version → dist/islop-x.y.z.zip
node scripts/release.js patch|minor|major # bump, retest, zip
```

That zip has `manifest.json` at the archive root (required). It excludes `.git`, tests, SVGs, and this README.

Then:

1. One-time: [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole) ($5).
2. **New item** (or **Package → Upload new package** for an update). Upload `dist/islop-x.y.z.zip`. Each upload must be a higher version than the last.
3. Store listing: name, short + detailed description, then the images in `store/`:
   - Screenshots (1280×800 JPEG): `screenshot-1-popup.jpg`, `screenshot-2-tooltip.jpg`, `screenshot-3-dark.jpg`
   - Small promo tile (440×280): `promo-small.jpg`
   - 128px icon: `icons/icon128.png` (already in the zip)
4. Privacy tab: single purpose, data use (nothing leaves the browser), justify `activeTab` and `scripting`, remote code = No. Host [`PRIVACY.md`](PRIVACY.md) at a public URL.
5. Submit for review.

After a bump, commit `manifest.json`, then tag so git matches the store:

```
git tag v1.0.1
git push && git push --tags
```
