'use strict';

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

function padToWords(text, n) {
  const have = engine.countWords(text);
  if (have >= n) return text;
  const extra = Array.from({ length: n - have }, (_, i) => 'padding' + i);
  return text + ' ' + extra.join(' ');
}

function insertDashes(wordCount, dashCount) {
  const words = Array.from({ length: wordCount }, (_, i) => 'token' + i);
  const step = Math.max(1, Math.floor(wordCount / (dashCount + 1)));
  let inserted = 0;
  for (let i = step; i < words.length && inserted < dashCount; i += step) {
    words[i] = words[i] + ' —';
    inserted += 1;
  }
  while (inserted < dashCount) {
    words.push('extra —');
    inserted += 1;
  }
  return words.join(' ');
}

// ---------------------------------------------------------------------------
const SLOP = padToWords(
  `In today's fast-paced digital landscape, organizations must delve into every tapestry of opportunity. This is a paradigm shift. Let's dive in. Here's the thing: experts agree this changes everything. It isn't just a tool. It's a paradigm shift that stands as a testament to progress and plays a vital role. Studies show research suggests many believe it cannot be overstated. Without further ado, in this article, we'll explore a game-changer. What most people don't realize is that it's worth noting, when it comes to leverage, we must utilize a seamless, robust, and cutting-edge approach, highlighting the transformative realm. First and foremost, at the end of the day, at its core, the reality is needless to say. The takeaway: not only does it empower teams but also streamlines workflows. That's it. That's the tweet. In conclusion, to summarize, buckle up. Importantly, this marks a pivotal moment. Supercharge your process. Let that sink in.`,
  200
);

const HUMAN = padToWords(
  `I spent 4 hours yesterday chasing a race in our job queue. We run 3 workers on one box and I swore the lock was held, but the logs said otherwise. I dumped the redis keys, found 12 stale entries from Tuesday, and deleted them. After that the backlog dropped from 840 to 11 in about 90 seconds. I'm still pissed I didn't check redis first. The "fix" in the PR was a sleep(50) which is the kind of crap that comes back in a month. If you hit this: look at the TTL on the lock key, not the worker logs. I wrote a 20-line script that prints key age and owner. That told me more than the dashboard ever did. We shipped it at 11pm and I went to bed. No manifesto, no lesson for the industry, just a dumb bug with a number on it.`,
  200
);

console.log('SlopSpotter engine tests\n');

// 1. Synthetic slop
console.log('1. Synthetic slop paragraph');
{
  const wc = engine.countWords(SLOP);
  const result = engine.scanText(SLOP);
  const t3 = result.tiers[3] || 0;
  assert(wc >= 200, 'slop is at least 200 words (got ' + wc + ')');
  assert(result.score >= 60, 'score >= 60 (got ' + result.score + ', label ' + result.label + ')');
  assert(t3 >= 3, 'at least 3 tier-3 hits (got ' + t3 + ')');
  console.log('     score=' + result.score + ' t3=' + t3 + ' t2=' + result.tiers[2] + ' t1=' + result.tiers[1] + ' words=' + result.wordCount);
}

// 2. Human writing
console.log('2. Human paragraph');
{
  const wc = engine.countWords(HUMAN);
  const result = engine.scanText(HUMAN);
  assert(wc >= 200, 'human is at least 200 words (got ' + wc + ')');
  assert(result.score < 15, 'score < 15 (got ' + result.score + ')');
  if (result.score >= 8) {
    console.log('     note: score is ' + result.score + ' (under 15, but not under 8)');
  }
  assert(result.score < 8, 'score < 8 ideally (got ' + result.score + ')');
  if (result.matches.length) {
    console.log('     hits: ' + result.matches.map((m) => m.rule.id + '@' + JSON.stringify(HUMAN.slice(m.start, m.end))).join(', '));
  }
  console.log('     score=' + result.score + ' hits=' + result.matches.length + ' words=' + result.wordCount);
}

// 3. Delve vs dove
console.log('3. Delve vs dove');
{
  const delved = engine.scanText('The team delved into the codebase');
  const dove = engine.scanText('We dove into the logs');
  const t3 = delved.matches.filter((m) => m.rule.tier === 3);
  assert(t3.length >= 1 && t3.some((m) => m.rule.id === 'banned-vocab-hard'), 'delved hits tier 3 Classic AI vocabulary');
  assert(dove.matches.length === 0, 'dove hits nothing (got ' + dove.matches.map((m) => m.rule.id).join(', ') + ')');
}

// 4. Overlap merge
console.log('4. Overlap merge');
{
  const text = "It isn't just robust. It's transformative.";
  const raw = engine.findMatches(text, require('./rules.js').SLOP_RULES);
  const merged = engine.mergeOverlaps(raw);
  const spans = merged.map((m) => [m.start, m.end]);
  let overlap = false;
  for (let i = 1; i < spans.length; i++) {
    if (spans[i][0] < spans[i - 1][1]) overlap = true;
  }
  assert(raw.length >= 2, 'raw matches overlap candidates (got ' + raw.length + ')');
  assert(!overlap, 'merged highlights do not overlap');
  const covered = merged.map((m) => text.slice(m.start, m.end));
  const hasBinary = merged.some((m) => m.rule.id === 'binary-contrast');
  assert(hasBinary, 'keeps binary-contrast (higher tier) over robust');
  console.log('     raw=' + raw.length + ' merged=' + merged.length + ' spans=' + JSON.stringify(covered));
}

// 5. Em dash gating
console.log('5. Em dash gating');
{
  const few = insertDashes(1000, 3);
  const many = insertDashes(400, 8);
  const fewResult = engine.scanText(few);
  const manyResult = engine.scanText(many);
  const fewDash = fewResult.matches.filter((m) => m.rule.id === 'em-dash');
  const manyDash = manyResult.matches.filter((m) => m.rule.id === 'em-dash');
  assert(engine.countEmDashes(few) === 3, 'few-dash fixture has 3 dashes (got ' + engine.countEmDashes(few) + ')');
  assert(engine.countWords(few) >= 1000, 'few-dash fixture ~1000 words (got ' + engine.countWords(few) + ')');
  assert(fewDash.length === 0, '3 dashes / 1000 words → no em-dash hits');
  assert(engine.countEmDashes(many) === 8, 'many-dash fixture has 8 dashes (got ' + engine.countEmDashes(many) + ')');
  assert(manyDash.length > 0, '8 dashes / 400 words → em-dash hits present (got ' + manyDash.length + ')');
}

// 6. Structural antithesis (Simon / Wikipedia)
console.log('6. Structural antithesis');
{
  const a = engine.scanText("It's not about speed. It's about taste.");
  const b = engine.scanText("It's a process, not a product.");
  const c = engine.scanText("It's not a bug — it's a feature.");
  const d = engine.scanText('look at the TTL on the lock key, not the worker logs');
  assert(a.matches.some((m) => m.rule.id === 'its-not-its'), 'It\'s not X. It\'s Y. hits its-not-its');
  assert(b.matches.some((m) => m.rule.id === 'its-x-not-y'), 'It\'s X, not Y hits its-x-not-y');
  assert(c.matches.some((m) => m.rule.id === 'its-not-its'), 'em-dash It\'s not X — it\'s Y hits');
  assert(!d.matches.some((m) => m.rule.id === 'its-x-not-y'), 'bare "X, not Y" without it\'s does not hit');
}

// 7. Simon Willison catalog samples
console.log('7. Simon Willison cliché samples');
{
  function ids(text) {
    return engine.scanText(text).matches.map((m) => m.rule.id);
  }
  assert(ids("Don't call it a comeback. Call it a return.").includes('dont-verb-it'), 'dont-verb-it');
  assert(ids('Sit with that for a moment.').includes('sit-with'), 'sit-with');
  assert(ids("That's not nothing.").includes('not-nothing'), 'not-nothing');
  assert(ids('No fluff, no filler, no jargon.').includes('no-chain'), 'no-chain 3-item');
  assert(!ids('No manifesto, no lesson for the industry, just a dumb bug.').includes('no-chain'), 'no-chain ignores 2-item human lists');
  assert(ids('A shopping cart is an object in the system. A chat room is an object in the system.').includes('echo-triad'), 'echo-triad');
  assert(ids('Maybe nobody needed it. Maybe the timing was off. Maybe both.').includes('sentence-anaphora'), 'sentence-anaphora');
  assert(ids('Come sit with us at lunch.').length === 0, 'sit with us is not sit-with');
}

// 8. Search Engine Watch examples
console.log('8. Search Engine Watch examples');
{
  function ids(text) {
    return engine.scanText(text).matches.map((m) => m.rule.id);
  }
  assert(ids("Let's delve into the fascinating world of SEO.").some((id) => id === 'lets-dive' || id === 'landscape-opener'), 'fascinating world / let’s delve');
  assert(ids('While the technology offers benefits, it also presents challenges.').includes('synthetic-balance'), 'synthetic-balance');
  assert(ids('Despite these challenges, the future remains promising.').includes('despite-challenges'), 'sunny-fog future remains promising');
  assert(ids('\nEfficiency: faster deploys\nScalability: more users').includes('bold-label-list'), 'bold-label list');
  assert(ids('Revenue grew [Insert statistic] last year.').includes('prompt-debris'), 'prompt placeholder');
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
