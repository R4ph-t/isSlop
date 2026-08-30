import * as engine from '../src/engine';
import en from '../src/packs/en';
import fr from '../src/packs/fr';
import es from '../src/packs/es';
import { SLOP_PACK_IDS, detectPack } from '../src/packs/registry';


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

function padToWords(text: string, n: number): string {
  const have = engine.countWords(text);
  if (have >= n) return text;
  const extra = Array.from({ length: n - have }, (_, i) => 'padding' + i);
  return text + ' ' + extra.join(' ');
}

function insertDashes(wordCount: number, dashCount: number): string {
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

console.log('isSlop engine tests\n');

console.log('0. English pack');
{
  const pack = en;
  assert(pack.id === 'en', 'pack id is en');
  assert(Array.isArray(pack.rules) && pack.rules.length > 0, 'pack has rules (got ' + pack.rules.length + ')');
  assert(SLOP_PACK_IDS.indexOf('en') !== -1, 'registry lists en');
  assert(engine.currentPack().id === 'en', 'engine default pack is en');
}

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
  const raw = engine.findMatches(text, en.rules);
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
  function ids(text: string) {
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
  function ids(text: string) {
    return engine.scanText(text).matches.map((m) => m.rule.id);
  }
  assert(ids("Let's delve into the fascinating world of SEO.").some((id) => id === 'lets-dive' || id === 'landscape-opener'), 'fascinating world / let’s delve');
  assert(ids('While the technology offers benefits, it also presents challenges.').includes('synthetic-balance'), 'synthetic-balance');
  assert(ids('Despite these challenges, the future remains promising.').includes('despite-challenges'), 'sunny-fog future remains promising');
  assert(ids('\nEfficiency: faster deploys\nScalability: more users').includes('bold-label-list'), 'bold-label list');
  assert(ids('Revenue grew [Insert statistic] last year.').includes('prompt-debris'), 'prompt placeholder');
}

// 9. no-ai-slop skill phrase gaps
console.log('9. no-ai-slop skill phrases');
{
  function ids(text: string) {
    return engine.scanText(text).matches.map((m) => m.rule.id);
  }
  assert(ids("Here's what I mean: the lock is the bug.").includes('faux-insight'), "here's what I mean");
  assert(ids('Let me be clear: the queue was wedged.').includes('performative-honesty'), 'let me be clear');
  assert(!ids('To be clear, the lock is stale.').includes('performative-honesty'), 'bare to be clear is skipped');
  assert(ids('The uncomfortable truth is the lock expired.').includes('faux-insight'), 'the uncomfortable truth is');
  assert(ids('This is the part most people skip.').includes('faux-insight'), 'the part most people skip');
  assert(ids('The detail that makes it work: a separate agent grades it.').includes('colon-reveal'), 'noun-phrase colon reveal');
  assert(!ids('If you hit this: look at the TTL on the lock key.').includes('colon-reveal'), 'human this: look is not a colon reveal');
  assert(ids('The key point is the TTL. As you can see, this distinction matters. In other words, that last part matters more than it sounds.').includes('metadiscourse'), 'interpretive metadiscourse');
  assert(ids('Think about it: the lock expired. The result? Faster deploys.').includes('qa-setup'), 'think about it / The result?');
  assert(!ids('I need to think about it tomorrow.').includes('qa-setup'), 'think about it without colon is skipped');
  assert(ids('We shipped it. And the queue drained. And I went to bed.').includes('dramatic-fragment'), 'And X. And Y. fragments');
  assert(ids('The harbor is a beacon for shipping.').some((id) => id === 'banned-vocab-hard'), 'standalone beacon');
}

// 10. French pack
console.log('10. French pack');
{
  function ids(text: string) {
    return engine.scanText(text, fr).matches.map((m) => m.rule.id);
  }
  const FR_SLOP = padToWords(
    `Dans un monde en constante évolution, il est important de noter qu'il convient de souligner cette véritable opportunité. À l'ère du numérique, dans le paysage actuel, plongeons dans le sujet. Non seulement la solution permet d'optimiser les processus, mais elle s'inscrit aussi dans une démarche d'excellence, mettant en lumière notre savoir-faire. Les experts s'accordent à dire que c'est incontournable. Ce n'est pas un simple outil, c'est un partenaire stratégique. En outre, par ailleurs, cela constitue un levier crucial. En conclusion, n'hésitez pas à nous contacter. J'espère que cet article vous a plu.`,
    200
  );
  const FR_HUMAN = padToWords(
    `Hier j'ai passé 4 heures sur un race dans la file de jobs. On a 3 workers sur une machine et j'étais sûr que le lock était pris, mais les logs disaient le contraire. J'ai dumpé les clés redis, trouvé 12 entrées périmées de mardi, je les ai virées. Derrière, le backlog est passé de 840 à 11 en 90 secondes. Je m'en veux encore de pas avoir regardé redis en premier. Le « fix » dans la PR c'était un sleep(50), le genre de rustine qui explose dans un mois. Si tu tombes là-dessus : regarde le TTL de la clé, pas les logs du worker. J'ai écrit un script de 20 lignes qui affiche l'âge et le owner. Ça m'en a plus dit que le dashboard. On a shippé à 23h et je suis allé me coucher. Pas de manifeste, pas de leçon pour l'industrie, juste un bug bête avec un chiffre dessus.`,
    200
  );
  assert(fr.id === 'fr', 'pack id is fr');
  assert(SLOP_PACK_IDS.indexOf('fr') !== -1, 'registry lists fr');
  assert(engine.currentPack().id === 'en', 'default pack stays English');
  const slop = engine.scanText(FR_SLOP, fr);
  assert(slop.score >= 60, 'French slop score >= 60 (got ' + slop.score + ', label ' + slop.label + ')');
  assert((slop.tiers[3] || 0) >= 3, 'French slop has >= 3 tier-3 hits (got ' + slop.tiers[3] + ')');
  const human = engine.scanText(FR_HUMAN, fr);
  assert(human.score < 8, 'French human score < 8 (got ' + human.score + ')');
  if (human.matches.length) {
    console.log('     hits: ' + human.matches.map((m) => m.rule.id + '@' + JSON.stringify(FR_HUMAN.slice(m.start, m.end))).join(', '));
  }
  assert(ids("Il est important de noter que le lock a expiré.").includes('il-convient'), 'il est important de noter');
  assert(ids("Il convient de souligner que le TTL compte.").includes('il-convient'), 'il convient de souligner');
  assert(ids("Dans un monde en constante évolution, tout change.").includes('landscape-opener'), 'dans un monde');
  assert(ids("À l'ère du numérique, tout est connecté.").includes('landscape-opener'), "à l'ère du numérique");
  assert(ids("Ce n'est pas un simple outil, c'est un partenaire.").includes('ce-nest-pas'), "ce n'est pas X, c'est Y");
  assert(ids("Non seulement c'est rapide, mais aussi ça tient la charge.").includes('non-seulement'), 'non seulement… mais aussi');
  assert(ids("N'hésitez pas à ouvrir une issue.").includes('nhesitez-pas'), "n'hésitez pas");
  assert(ids('Les experts estiment que c’est incontournable.').includes('weasel-attribution'), 'les experts estiment');
  assert(ids('Faire du sens n’aide personne.').includes('anglicisms'), 'faire du sens');
  assert(!ids('Le lock était pris, mais les logs disaient le contraire.').includes('connectors'), 'mid-sentence mais is not a connector tell');
  assert(detectPack('fr', '').id === 'fr', 'html lang=fr → French pack');
  assert(detectPack('fr-CA', '').id === 'fr', 'html lang=fr-CA → French pack');
  assert(detectPack('en-US', '').id === 'en', 'html lang=en-US → English pack');
  assert(detectPack('', FR_HUMAN).id === 'fr', 'stopword vote on French prose → fr');
  assert(detectPack('', FR_HUMAN + ' constructor toString valueOf').id === 'fr', 'prototype tokens do not steal a French vote');
  assert(detectPack('', 'constructor toString valueOf __proto__ '.repeat(40)).id === 'en', 'prototype-only text falls back to English');
  assert(detectPack('fr', HUMAN).id === 'en', 'English body beats French UI lang');
  assert(detectPack('en', FR_HUMAN).id === 'fr', 'French body beats English UI lang');
}

// 11. Spanish pack (unverified)
console.log('11. Spanish pack (unverified)');
{
  function ids(text: string) {
    return engine.scanText(text, es).matches.map((m) => m.rule.id);
  }
  const ES_SLOP = padToWords(
    `En el mundo actual, cabe destacar que es importante señalar esta verdadera oportunidad. En la era digital, en el panorama actual, profundicemos en el tema. No solo la solución potencia los procesos, sino también se erige como un pilar fundamental, logrando así un antes y un después. Los expertos coinciden en que es crucial. No es un simple herramienta, es un aliado estratégico. Por otro lado, en este sentido, se puede observar que es innegable. En conclusión, no dudes en contactarnos. Espero que este artículo te haya servido.`,
    200
  );
  const ES_HUMAN = padToWords(
    `Ayer me pasé 4 horas detrás de un race en la cola de jobs. Tenemos 3 workers en una máquina y juraba que el lock estaba tomado, pero los logs decían otra cosa. Volqué las claves de redis, encontré 12 entradas viejas del martes y las borré. Después el backlog bajó de 840 a 11 en unos 90 segundos. Todavía me molesta no haber mirado redis primero. El «arreglo» del PR era un sleep(50), de esos parches que explotan al mes. Si te pasa: mira el TTL de la clave, no los logs del worker. Escribí un script de 20 líneas que imprime la edad y el owner. Me dijo más que el dashboard. Lo subimos a las 23h y me fui a dormir. Ni manifiesto ni lección para la industria, solo un bug tonto con un número.`,
    200
  );
  assert(es.id === 'es', 'pack id is es');
  assert(es.verified === false, 'Spanish pack is marked unverified');
  assert(SLOP_PACK_IDS.indexOf('es') !== -1, 'registry lists es');
  assert(engine.currentPack().id === 'en', 'default pack stays English');
  const slop = engine.scanText(ES_SLOP, es);
  assert(slop.score >= 60, 'Spanish slop score >= 60 (got ' + slop.score + ', label ' + slop.label + ')');
  assert((slop.tiers[3] || 0) >= 3, 'Spanish slop has >= 3 tier-3 hits (got ' + slop.tiers[3] + ')');
  const human = engine.scanText(ES_HUMAN, es);
  assert(human.score < 8, 'Spanish human score < 8 (got ' + human.score + ')');
  if (human.matches.length) {
    console.log('     hits: ' + human.matches.map((m) => m.rule.id + '@' + JSON.stringify(ES_HUMAN.slice(m.start, m.end))).join(', '));
  }
  assert(ids('Cabe destacar que el lock expiró.').includes('cabe-destacar'), 'cabe destacar que');
  assert(ids('En el mundo actual todo cambia.').includes('landscape-opener'), 'en el mundo actual');
  assert(ids('En la era digital todo está conectado.').includes('landscape-opener'), 'en la era digital');
  assert(ids('No es un simple herramienta, es un aliado.').includes('no-es-sino'), 'no es X, es Y');
  assert(ids('No solo es rápido, sino también aguanta carga.').includes('no-solo-sino'), 'no solo… sino también');
  assert(ids('No dudes en abrir una issue.').includes('no-dudes'), 'no dudes en');
  assert(ids('Los expertos coinciden en que es clave.').includes('weasel-attribution'), 'los expertos coinciden');
  assert(ids('Eso no llega a hacer sentido.').includes('anglicisms'), 'hacer sentido');
  assert(ids('Se puede observar que el TTL importa.').includes('pasiva-refleja'), 'se puede observar que');
  assert(ids('La herramienta se erige como un estándar.').includes('importance-puffery'), 'se erige como');
  assert(!ids('El lock estaba tomado, pero los logs decían otra cosa.').includes('connectors'), 'mid-sentence pero is not a connector tell');
  assert(detectPack('es', '').id === 'es', 'html lang=es → Spanish pack');
  assert(detectPack('es-MX', '').id === 'es', 'html lang=es-MX → Spanish pack');
  assert(detectPack('', ES_HUMAN).id === 'es', 'stopword vote on Spanish prose → es');
}

console.log('12. Engine guards');
{
  const t0 = Date.now();
  const hits = engine.findMatches('delve and delve again', [{
    id: 'nog',
    name: 'x',
    tier: 3,
    category: 'Vocabulary',
    re: /delve/,
    why: 'x'
  }]);
  assert(Date.now() - t0 < 200, 'non-global re does not hang');
  assert(hits.length === 2, 'non-global re is treated as global (got ' + hits.length + ')');
  const noise = 'constructor toString valueOf hasOwnProperty __proto__ ';
  assert(detectPack('', noise.repeat(50)).id === 'en', 'stopword map is not Object.prototype');
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
