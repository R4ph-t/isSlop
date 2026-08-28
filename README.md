# SlopSpotter

Chrome extension that highlights likely AI-generated "slop" **inline on the page**, with a tooltip naming the rule that fired. Detection is purely local and rule-based: no network, no ML, no API keys.

Toolbar and popup icons are from [Lucide](https://lucide.dev) (`scan-search`, `eraser`; ISC License).

## Load unpacked

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked** and select this folder
4. Open any http(s) page, click the toolbar icon, hit **Scan page**
5. Hover a highlight for the rule name and why it fired. **Clear** removes marks.

Chrome's own pages (`chrome://…`, the Web Store) cannot be scripted.

## How scoring works

Each hit has a tier weight: tier 3 = 4, tier 2 = 2, tier 1 = 1.

```
density = weightedHits / wordCount * 100
score   = clamp(round(density * 25), 0, 100)
```

Labels: &lt;15 Reads human · 15–39 Some slop patterns · 40–69 Heavy slop · 70+ Slop city.

Em dashes are only flagged in bulk: at least 4 on the page **and** more than 1 per 150 words.

## Sources

The original catalog was the build spec. Rules now also draw from:

- [Wikipedia: Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) (WikiProject AI Cleanup)
- Kobak et al., *Science Advances* (2025) — PubMed spike in *delves* / *underscores* / *showcasing*
- [Pangram, 9 Signs of AI Writing](https://www.pangram.com/signs-of-ai-writing) — contrast patterns ~3× human baseline
- [Simon Willison, LLM cliché highlighter](https://github.com/simonw/tools/blob/main/llm-cliche-highlighter.html) — structural chains (`no X, no Y`), “don’t VERB it”, echoing sentences, anaphora
- [slopdetector.org AI words list](https://slopdetector.org/blog/ai-words-list)
- [Search Engine Watch, 30 examples of AI slop](https://searchenginewatch.com/what-is-ai-slop/) — synthetic balance, placeholder debris, bold-label lists

These are **tells**, not proof of origin. Humans write some of them; density is the product.

## How to add a rule

Append an object to `SLOP_RULES` in `rules.js`:

```js
{
  id: 'my-rule',
  name: 'Short name',
  tier: 2,              // 3 high, 2 medium, 1 weak
  category: 'Vocabulary',
  re: /\bexample\b/gi,  // must be global; case-insensitive as needed
  why: 'One-line explanation shown in the tooltip.'
}
```

Then run:

```
node test.js
```

When in doubt, demote a rule one tier rather than deleting it. False positives are the product killer.

## Tests

```
node test.js
```

`rules.js` and `engine.js` are dual-environment (browser global + Node) so the same match/merge/score logic runs in tests and in the content script.
