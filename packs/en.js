// English rule pack
// Tiers: 3 = high certainty (strong slop tell), 2 = medium, 1 = weak signal.
//
// Sources (patterns, not proof of origin):
// - Wikipedia:Signs of AI writing — WikiProject AI Cleanup
//   https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing
// - Kobak et al., Science Advances (2025): PubMed spike in "delves",
//   "underscores", "showcasing" after ChatGPT
// - Pangram Labs, "9 Signs of AI Writing" — contrast pattern ~3× human
//   https://www.pangram.com/signs-of-ai-writing
// - slopdetector.org AI words list / slop taxonomy (phrase-level tells)
// - Simon Willison, LLM cliché highlighter (structural chains, echoes, tics)
//   https://github.com/simonw/tools/blob/main/llm-cliche-highlighter.html
// - Radu Tyrsina, Search Engine Watch, “What is AI slop? 30 examples”
//   https://searchenginewatch.com/what-is-ai-slop/
// - no-ai-slop editor skill — throat-clearing, metadiscourse, colon reveals, Q&A setups

(function (root) {
  const F = root.SlopFinders || require('../finders.js');
  const register = root.registerPack || require('./registry.js').registerPack;
  const makeChainFinder = F.makeChainFinder;
  const makeEchoFinder = F.makeEchoFinder;
  const makeAnaphoraFinder = F.makeAnaphoraFinder;

  const ANAPHORA_SKIP = /^(?:i|it|the|a|an|this|that|we|you|they|he|she|there|but|and|so|in|as|if|my|his|her|their|its|these|those|for|at|on|of|to|is|was)$/i;

  const SLOP_RULES = [
  // ---------- HIGH CERTAINTY (tier 3) ----------
  {
    id: 'banned-vocab-hard',
    name: 'Classic AI vocabulary',
    tier: 3,
    category: 'Vocabulary',
    re: /\b(delve[sd]?|delving|tapestr(?:y|ies)|paradigm shift|game.?changer|ever-evolving|supercharge[sd]?|supercharging|beacons?|bustling|commendable|interplay|intricacies)\b/gi,
    why: 'Words LLMs love and humans rarely type: delve, tapestry, paradigm shift, game changer, ever-evolving, supercharge.'
  },
  {
    id: 'landscape-opener',
    name: 'Landscape/world-of opener',
    tier: 3,
    category: 'Throat-clearing',
    re: /\bin (today'?s|the) (fast-paced|ever-changing|ever-evolving|rapidly (changing|evolving)|digital|modern) (world|age|landscape|era|environment)\b|\bin the (world|age|realm|era) of\b|\bin a world where\b|\bthe (fascinating )?world of\b|\bevolving landscape\b|\bthe realm of\b/gi,
    why: '"In today\'s fast-paced world..." / "in a world where..." is the canonical AI intro. Says nothing.'
  },
  {
    id: 'importance-puffery',
    name: 'Importance puffery',
    tier: 3,
    category: 'Puffery',
    re: /\b(stands?|serves?|standing|serving) as a testament\b|\ba testament to\b|\bmarks? a pivotal (moment|shift)\b|\bplays? a (vital|crucial|pivotal|key) role\b|\bsolidif(?:y|ies|ied|ying) (its|their|his|her) (position|place|status)\b|\bunderscores? (its|their|the) (significance|importance|commitment)\b|\bcannot be overstated\b|\bmore important than ever\b/gi,
    why: 'Asserts importance instead of showing it: "stands as a testament", "plays a vital role", "cannot be overstated".'
  },
  {
    id: 'faux-insight',
    name: 'Faux-insight setup',
    tier: 3,
    category: 'Rhetorical setups',
    re: /\bhere['\u2019]?s (the thing|what i mean|what nobody tells you|what no one tells you|what most people (miss|get wrong))\b|\bhere(?:['\u2019]s|\s+is)\s+(?:the|a)\s+(?:twist|thing|catch|kicker|rub)\b|\bwhat most people (get wrong|miss|don['\u2019]?t (know|realize|understand))\b|\b(?:this is )?the part (?:that )?(?:everyone|most people) (?:miss(?:es)?|skip|get wrong)\b|\bthe uncomfortable truth is\b|\bwhat if i told you\b|\bplot twist\s*[:,]|\blet that sink in\b|\bread that again\b/gi,
    why: 'Flatters the writer as the lone expert: "here\'s what I mean", "the part most people skip", "let that sink in".'
  },
  {
    id: 'binary-contrast',
    name: 'Binary contrast ("isn\'t X. It\'s Y.")',
    tier: 3,
    category: 'Rhetorical setups',
    re: /\b(?:this |it |that |[a-z]+ )?(?:is|was|are)n'?t (?:just |merely |only |about )?[^.!?\n]{2,60}[.;]\s*It'?s\b|\bnot just [^.!?\n]{2,50}[,;:]?\s*(?:it'?s|but a whole|but an?)\b/gi,
    why: 'The "This isn\'t X. It\'s Y." / "not just X, it\'s Y" construction. A top LLM tell.'
  },
  {
    id: 'its-not-its',
    name: 'Antithesis ("It\'s not X. It\'s Y.")',
    tier: 3,
    category: 'Rhetorical setups',
    re: /\b(?:it|this|that)(?:['\u2019]s|\s+(?:is|was))\s+not\s+(?:just |merely |only |simply |about )?[^.!?\n,;\u2014\u2013]{1,60}[,.;\u2014\u2013]\s*(?:it|this|that)(?:['\u2019]s|\s+(?:is|was))\b/gi,
    why: 'Negative parallelism: "It\'s not about X. It\'s about Y" / "It\'s not a bug — it\'s a feature."'
  },
  {
    id: 'its-x-not-y',
    name: 'Antithesis ("It\'s X, not Y")',
    tier: 3,
    category: 'Rhetorical setups',
    re: /\bit['\u2019]?s (?:about |just |really |simply )?[^.!?\n,]{3,40},\s*not (?:about |just |merely |only |simply |a |an |the )?/gi,
    why: 'Inverted contrast: "It\'s a process, not a product" / "It\'s about people, not technology." Same antithesis tic, flipped.'
  },
  {
    id: 'summary-ending',
    name: 'Summary-recap ending',
    tier: 3,
    category: 'Structure',
    re: /\bin (conclusion|summary)\b|\bto (summarize|sum up|wrap up)\b/gi,
    why: '"In conclusion..." recap endings are a strong AI tell.'
  },
  {
    id: 'weasel-attribution',
    name: 'Weasel attribution',
    tier: 3,
    category: 'Attribution',
    re: /\b(?:many|some|several)?\s*(?:experts|critics|observers|analysts)\s+(?:have\s+)?(?:agree|say|believe|warn|argue|note|suggest|claim)\w*\b|\bstudies (show|suggest|have shown)\b|\bresearch (shows|suggests)\b|\bindustry reports? (suggest|indicate|show)\w*\b|\bwidely regarded as\b|\bmany (argue|believe|would say)\b/gi,
    why: 'Vague authority with no source: "experts agree", "studies show", "widely regarded as".'
  },
  {
    id: 'lets-dive',
    name: 'Dive-in framing',
    tier: 3,
    category: 'Throat-clearing',
    re: /\blet'?s (dive (in|into)|unpack|explore|delve (in|into))\b|\bthe fascinating world of\b|\bpicture this\b|\bever wonder(?:ed)?\b|\bbuckle up\b|\bwithout further ado\b|\bin this (article|post|guide),? (we'?ll|we will|i'?ll|i will)\b/gi,
    why: '"Let\'s dive in", "let\'s unpack", "picture this": LLM article scaffolding.'
  },
  {
    id: 'this-is-huge',
    name: 'Hype declarations',
    tier: 3,
    category: 'Puffery',
    re: /\bthis (is huge|changes everything)\b|\ba game.?changer\b|\bmind.?blowing\b|\bjaw.?dropping\b/gi,
    why: 'Manufactured hype: "this changes everything", "this is huge".'
  },

  // ---------- MEDIUM CERTAINTY (tier 2) ----------
  {
    id: 'corporate-vocab',
    name: 'Corporate/AI-favored vocabulary',
    tier: 2,
    category: 'Vocabulary',
    re: /\b(leverag(?:e[sd]?|ing)|utiliz(?:e[sd]?|ing)|facilitat(?:e[sd]?|ing)|foster(?:s|ed|ing)?|empower(?:s|ed|ing|ment)?|streamlin(?:e[sd]?|ing)|robust|seamless(?:ly)?|cutting.?edge|harness(?:es|ed|ing)?|elevat(?:e[sd]?|ing)|embark(?:s|ed|ing)?|transformative|meticulous(?:ly)?|intricate|paramount|multifaceted|holistic|realm|showcase[sd]?|showcasing|underscore[sd]?|garner(?:s|ed|ing)?)\b/gi,
    why: 'Corporate filler LLMs overuse: leverage, seamless, robust, showcase, underscore, garner...'
  },
  {
    id: 'empty-phrases',
    name: 'Filler phrases',
    tier: 2,
    category: 'Filler',
    re: /\bit['\u2019]?s (worth noting|important to (note|remember|understand|pause|consider|ask))\b|\bit is (?:also\s+)?(?:important|worth|crucial) to (?:note|remember|understand|pause|consider|ask)\b|\bit should be noted\b|\bat the end of the day\b|\bwhen it comes to\b|\bat its core\b|\bthe (reality|truth) is\b|\bneedless to say\b|\bthat being said\b|\bfirst and foremost\b|\bgoing forward\b|\bit goes without saying\b/gi,
    why: 'Phrases that delay the point: "it\'s worth noting", "when it comes to", "at the end of the day".'
  },
  {
    id: 'metadiscourse',
    name: 'Interpretive metadiscourse',
    tier: 2,
    category: 'Filler',
    re: /\bthe key point is\b|\bas you can (?:see|tell)\b|\bthis (?:distinction|difference) matters\b|\bin other words\b|\bthat last part matters\b|\bmatters more than it (?:sounds|seems|looks)\b/gi,
    why: 'Steps outside the subject to tell the reader what to notice: "the key point is", "as you can see", "in other words".'
  },
  {
    id: 'superficial-ing',
    name: 'Superficial -ing analysis',
    tier: 2,
    category: 'Fake analysis',
    re: /,\s*(highlighting|underscoring|reflecting|showcasing|demonstrating|signaling|emphasizing|reinforcing|cementing|illustrating|solidifying|underlining) (the|its|their|a|an|how|that|what)\b/gi,
    why: 'Trailing "-ing" clause pretending to explain significance: ", highlighting the...", ", underscoring its..."'
  },
  {
    id: 'colon-reveal',
    name: 'Colon reveal',
    tier: 2,
    category: 'Rhetorical setups',
    re: /\b(?:The (?:best|worst) part|The kicker|The catch|The bottom line|The takeaway|The result|The problem|The twist|The secret|The trick|The irony|The paradox|The real (?:reason|story|issue)|The (?:detail|thing|part|lesson|insight) that [^.!?\n:]{2,40})\s*\??:/gi,
    why: 'Dramatic colon reveal: "The best part: …" / "The detail that makes it work: …" Fake drama, LLM rhythm.'
  },
  {
    id: 'negative-listing',
    name: 'Negative listing',
    tier: 2,
    category: 'Rhetorical setups',
    re: /\bNo(?:t| more)? [^.!?\n]{2,35}\.\s*No(?:t| more)? [^.!?\n]{2,35}\.\s*(?:Just|Only|A|An)\b/g,
    why: '"Not X. Not Y. Just Z." Negative listing, a stock LLM shape.'
  },
  {
    id: 'not-only-but-also',
    name: 'Not only... but also',
    tier: 2,
    category: 'Rhetorical setups',
    re: /\bnot only\b[^.!?\n]{2,80}\bbut (also|even)\b/gi,
    why: '"Not only X but also Y": negative parallelism LLMs lean on.'
  },
  {
    id: 'dramatic-fragment',
    name: 'Dramatic fragmentation',
    tier: 2,
    category: 'Rhetorical setups',
    re: /\bThat'?s it\.\s*That'?s the\b|\bFull stop\.|(?:^|[.!?]\s+|\n)And [^.!?\n]{1,48}\.\s*And [^.!?\n]{1,48}\./g,
    why: '"That\'s it. That\'s the tweet." / "Full stop." / "X. And Y. And Z." Mic-drop fragments.'
  },
  {
    id: 'fake-strong-verbs',
    name: 'Fake-strong verbs',
    tier: 2,
    category: 'Vocabulary',
    re: /\bserves? as an? (centralized |comprehensive |powerful )?(hub|platform|solution|gateway|foundation|cornerstone)\b|\bacts? as an? (bridge|catalyst)\b|\bserves? as a hub\b/gi,
    why: '"Serves as a centralized hub": say what it actually does instead.'
  },
  {
    id: 'emoji-decoration',
    name: 'Emoji decoration',
    tier: 2,
    category: 'Formatting',
    re: /(^|\n)\s*(?:🚀|✨|🔥|💡|🎯|⚡|🧵|👇|📈|🤯|🧠|✅|✔️|🌟|💪|🙌|🔑|📌|👉)\s*\S|(?:🚀|✨|🔥|💡|🎯|⚡|📈|🤯|🧠|✅|✔️|🌟)\s*$/gm,
    why: 'Emoji as line decoration (🚀 opening or closing a line): LLM social-post formatting.'
  },
  {
    id: 'navigating-complexities',
    name: 'Navigating-the-X abstraction',
    tier: 2,
    category: 'Throat-clearing',
    re: /\bnavigat(?:e[sd]?|ing) the (complexities|nuances|challenges|landscape|intricacies)\b/gi,
    why: '"Navigating the complexities": signals depth without naming a specific problem.'
  },
  {
    id: 'chatbot-residue',
    name: 'Chatbot leftover phrasing',
    tier: 2,
    category: 'Structure',
    re: /\b(certainly!?|of course! let me|great question!|i hope this helps!?|let me know if you (need|have|want)|as an ai(?: language)? (?:model|assistant)|as of my last (?:update|training)|knowledge cutoff|here is the revised (?:article|draft|version|text))\b|contentReference|oaicite|turn0(?:search|news)|utm_source=/gi,
    why: 'Unedited chatbot voice or paste debris: "I hope this helps!", "as of my last update", oaicite.'
  },
  {
    id: 'qa-setup',
    name: 'Rhetorical Q&A setup',
    tier: 2,
    category: 'Rhetorical setups',
    re: /\bthink about it\s*:|\bthe (?:result|reason|answer|secret|catch|problem|difference|upshot|truth)\?\s+\S|\bsound familiar\s*\?|\bsee the (?:problem|pattern|issue)\s*\?/gi,
    why: '"Think about it:", "The result? Faster deploys.", "Sound familiar?" Self-answered setups. Drop them and make the point.'
  },
  {
    id: 'stop-start-imperative',
    name: 'Stop X. Start Y.',
    tier: 2,
    category: 'Rhetorical setups',
    re: /\bStop [^.!?\n]{4,40}\.\s*Start /g,
    why: 'Paired imperatives: "Stop doing X. Start doing Y." Engagement-copy cadence LLMs copy from LinkedIn.'
  },
  {
    id: 'no-chain',
    name: '“No X, no Y, no Z” chain',
    tier: 2,
    category: 'Rhetorical setups',
    find: makeChainFinder(String.raw`no[-\s]`, /^no[-\s]/i, 3),
    why: 'Three or more “no …” items in a row: “No fluff, no filler, no jargon.” From Simon Willison’s cliché highlighter. Pairs of two are too common in human prose.'
  },
  {
    id: 'did-not-chain',
    name: '“Did not X, did not Y” chain',
    tier: 2,
    category: 'Rhetorical setups',
    find: makeChainFinder(String.raw`(?:did\s+not|didn['\u2019]t)\s`, /^(?:did\s+not|didn['\u2019]t)\s/i, 2),
    why: 'Stacked “did not …” items: “Did not flinch, did not blink.” LLM list rhythm.'
  },
  {
    id: 'dont-verb-it',
    name: '“Don’t VERB it. VERB it.”',
    tier: 3,
    category: 'Rhetorical setups',
    re: /\b(?:do\s+not|don['\u2019]t)\s+(?:just\s+|simply\s+|merely\s+)?(\w+)(?:\s+(?:of|about|at|on|for|with|to))?\s+it\b[^.!?\n]*?[.!?;,\u2013\u2014]['"\u201d\u2019]*\s*(?:just\s+|simply\s+|merely\s+)?\1(?:\s+(?:of|about|at|on|for|with|to))?\s+it\b/gi,
    why: '“Don’t call it X. Call it Y.” Negated verb + it, then the same verb + it again.'
  },
  {
    id: 'sit-with',
    name: '“Sit with that”',
    tier: 3,
    category: 'Rhetorical setups',
    re: /\bsit(?:s|ting)?\s+with\s+(?:that|this|it|(?:the|your)\s+(?:discomfort|feelings?|tension|weight|uncertainty|ambiguity|grief|silence|unease))\b(?:\s+for\s+a\s+\w+)?/gi,
    why: 'Therapist-voiced “sit with that for a moment.” Rare in unforced prose.'
  },
  {
    id: 'already-know',
    name: '“You already know”',
    tier: 2,
    category: 'Rhetorical setups',
    re: /\byou\s+already\s+knows?\s+(?:the\s+answer|what|how|why|this|that|it|who|where)\b|\byou\s+already\s+knows?\b(?![ \t]+\w)/gi,
    why: 'False intimacy: “you already know the answer.” Skips “if you already know Python”.'
  },
  {
    id: 'whole-entire',
    name: '“The whole/entire point”',
    tier: 2,
    category: 'Puffery',
    re: /\b(?:that|this)(?:['\u2019]s|\s+(?:is|was))\s+the\s+whole\b(?:\s+\w+)?|(?:\b(?:is|was|are|were)|['\u2019]s)\s+the\s+(?:whole|entire)\s+(?:point|game|pitch|idea|trick|thing|secret|business)\b|\bhere(?:['\u2019]s|\s+is)\s+the\s+whole\b(?:\s+\w+)?/gi,
    why: '“That’s the whole point” / “consistency is the entire game.” Inflates a claim into the only claim.'
  },
  {
    id: 'punchline',
    name: '“The punchline is”',
    tier: 2,
    category: 'Rhetorical setups',
    re: /\bthe\s+punchline(?:\s+(?:is|was|being)\b|\s*[:?])/gi,
    why: 'Stage-managed reveal: “the punchline is …” / “the punchline?”'
  },
  {
    id: 'worth-naming',
    name: '“Worth naming”',
    tier: 2,
    category: 'Filler',
    re: /(?:\b(?:is|are|was|were|feels?|felt|seems?|seemed)|['\u2019]s)\s+(?:\w+\s+){0,2}?worth\s+naming\b(?!\s+names\b)|\bworth\s+naming\s*:/gi,
    why: 'Therapist cadence: “it’s worth naming that …” Skips “naming names”.'
  },
  {
    id: 'not-nothing',
    name: '“That’s not nothing”',
    tier: 2,
    category: 'Rhetorical setups',
    re: /\b(?:that|this|it|which)(?:['\u2019]s|\s+(?:is|was))\s+not\s+nothing\b/gi,
    why: 'Understated-profundity tic: “that’s not nothing.”'
  },
  {
    id: 'performative-honesty',
    name: 'Performative honesty',
    tier: 2,
    category: 'Rhetorical setups',
    re: /\bI\s+(?:will\s+not|won['\u2019]t)\s+pretend\b|\b(?:I['\u2019]ll|let['\u2019]s)\s+be\s+(?:honest|blunt|real)\b|\blet me be (?:clear|blunt|honest|real|frank)\b|(?:^|[.!?]\s+|\n)(?:Honestly|Truthfully|Frankly)\s*,/gi,
    why: 'Sincerity announced: “I won’t pretend”, “let me be clear”, “let’s be honest”. Skips bare “to be clear” / “Look,” as too common in humans.'
  },
  {
    id: 'thats-the-part',
    name: '“That’s the part …”',
    tier: 2,
    category: 'Rhetorical setups',
    re: /\b(?:that|this|it)(?:['\u2019]s|\s+(?:is|was))\s+the\s+part\b|\bthe\s+part\s+that\s+(?:makes|made|gets|got|keeps|kept)\s+(?:me|you|us|it)\b|\bmy\s+favou?rite\s+part\s+of\b/gi,
    why: 'Gestures at a favoured detail instead of stating it: “that’s the part a counter can’t reach.”'
  },
  {
    id: 'the-only-i-trust',
    name: '“The only X I trust”',
    tier: 2,
    category: 'Rhetorical setups',
    re: /\bthe\s+only\s+[\w'\u2019-]+(?:\s+[\w'\u2019-]+){0,2}?\s+(?:I|you|we|it|he|she|they)\s+(?:trust|need|needs|care|want|wants|use|uses|believe)\b|\bthe\s+only\s+[\w'\u2019-]+\s+that\s+(?:matters|counts|works|survives)\b/gi,
    why: 'Narrowing superlative reveal: “the only marketing I trust”, “the only thing that matters”.'
  },
  {
    id: 'take-my-word',
    name: '“Don’t take my word for it”',
    tier: 2,
    category: 'Rhetorical setups',
    re: /\b(?:you\s+)?(?:do\s+not|don['\u2019]t)\s+(?:have\s+to\s+)?take\s+my\s+word\s+for\s+(?:it|any\s+of\s+(?:it|this|that))\b/gi,
    why: 'Stock invitation to verify: “you don’t have to take my word for it.”'
  },
  {
    id: 'despite-challenges',
    name: 'Challenges-and-outlook formula',
    tier: 2,
    category: 'Structure',
    re: /\bdespite\s+(?:these|those|such|its|their|the|numerous|significant|ongoing)\s+(?:\w+\s+)?challenges\b|\bfac(?:e|es|ed|ing)\s+(?:several|numerous|many|significant|various|a\s+number\s+of)\s+challenges\b|\bchallenges\s+remain\b|\bremains\s+to\s+be\s+seen\b|\b(?:only\s+)?time\s+will\s+tell\b|\bthe future remains promising\b|\ba promising future (?:ahead|awaits)\b/gi,
    why: 'Wikipedia canned closer: “despite these challenges”, “remains to be seen”, “time will tell”.'
  },
  {
    id: 'promo',
    name: 'Promotional boilerplate',
    tier: 2,
    category: 'Puffery',
    re: /\bnestled\s+(?:in|on|among|between|along|at)\b|\bin\s+the\s+heart\s+of\b|\brich\s+(?:cultural\s+|historical\s+)?(?:heritage|history|tapestry)\b|\bhidden\s+gem\b|\bmust-(?:visit|see|try)\b|\bbreathtaking\b|\bboasts?\s+(?:a|an|the)\b|\bstunning\s+(?:views?|scenery|architecture|backdrop)\b/gi,
    why: 'Travel-brochure LLM tone: “nestled in”, “hidden gem”, “boasts a”, “in the heart of”.'
  },
  {
    id: 'stacked-questions',
    name: 'Stacked rhetorical questions',
    tier: 1,
    category: 'Rhythm',
    re: /[^.!?\n]+\?(?:\s+[^.!?\n]+\?){2,}/g,
    why: 'Three or more questions in a row. Two is common in FAQs, so this stays a weak signal.'
  },
  {
    id: 'echo-triad',
    name: 'Echoing sentence runs',
    tier: 2,
    category: 'Rhythm',
    find: makeEchoFinder(),
    why: 'Consecutive sentences on the same skeleton: “A cart is an object in the system. A room is an object in the system.”'
  },
  {
    id: 'sentence-anaphora',
    name: 'Repeated sentence openers',
    tier: 2,
    category: 'Rhythm',
    find: makeAnaphoraFinder(ANAPHORA_SKIP),
    why: 'Three or more consecutive sentences starting on the same word: “Maybe X. Maybe Y. Maybe Z.” Pronouns skipped.'
  },
  {
    id: 'synthetic-balance',
    name: 'Synthetic benefits/challenges balance',
    tier: 2,
    category: 'Structure',
    re: /\bwhile\b[^.!?\n]{5,80}\b(?:benefits?|advantages?)\b[^.!?\n]{0,50}\b(?:challenges?|drawbacks?|risks?)\b|\boffers?\s+(?:many\s+|several\s+)?benefits?,?\s+(?:it\s+|they\s+)?(?:also\s+)?(?:presents?|poses?|brings?)\s+(?:several\s+|many\s+|some\s+)?(?:challenges?|drawbacks?)\b/gi,
    why: '"While it offers benefits, it also presents challenges." True of everything, specific about nothing.'
  },
  {
    id: 'bold-label-list',
    name: 'Bold-label list shape',
    tier: 2,
    category: 'Formatting',
    re: /(?:^|\n)\s*(?:[-*•]\s*)?(?:Efficiency|Scalability|Innovation|Flexibility|Reliability|Productivity|Performance|Security|Transparency|Sustainability|Empowerment|Collaboration)\s*:/gim,
    why: 'Every bullet as "Efficiency: …" / "Scalability: …": mechanical list shape from LLM how-tos.'
  },
  {
    id: 'prompt-debris',
    name: 'Prompt/placeholder debris',
    tier: 3,
    category: 'Formatting',
    re: /\[(?:insert|add|your|placeholder|statistic|date|name|link)[^\]]{0,50}\]|\[cite:\s*\d+\]/gi,
    why: 'Unfinished prompt left in published copy: "[Insert statistic]", "[cite: 3]".'
  },

  // ---------- WEAK SIGNALS (tier 1) ----------
  {
    id: 'in-order-to',
    name: 'Wordy constructions',
    tier: 1,
    category: 'Filler',
    re: /\bin order to\b|\bhas the ability to\b|\bmade? (a|the) decision to\b|\bin terms of\b|\bwith regard to\b/gi,
    why: 'Wordy where a plain verb works: "in order to" → "to", "has the ability to" → "can".'
  },
  {
    id: 'sentence-adverb',
    name: 'Sentence-opening adverb',
    tier: 1,
    category: 'Filler',
    re: /(^|[.!?]\s+)(Importantly|Crucially|Fundamentally|Ultimately|Overall|Moreover|Furthermore|Additionally|Notably),/g,
    why: 'Stacked sentence-opening adverbs (Moreover, Furthermore, Importantly...): LLM connective tissue.'
  },
  {
    id: 'deep-adjectives',
    name: 'Overwrought adjectives',
    tier: 1,
    category: 'Vocabulary',
    re: /\b(profound(?:ly)?|remarkable|invaluable|unparalleled|unprecedented|pivotal|crucial|vibrant|dynamic|innovative|comprehensive)\b/gi,
    why: 'Inflated adjectives humans use sparingly and LLMs sprinkle everywhere.'
  },
  {
    id: 'whether-list',
    name: '"Whether you\'re..." audience list',
    tier: 1,
    category: 'Filler',
    re: /\bwhether you'?re an? [^.!?\n]{2,60}\bor an?\b/gi,
    why: '"Whether you\'re a beginner or a seasoned pro...": stock audience-flattering list.'
  },
  {
    id: 'rule-of-three-adj',
    name: 'Adjective triplet',
    tier: 1,
    category: 'Rhythm',
    re: /\b\w+(?:ive|ous|ble|ful|ant|ent|ing|ed|al|ic),\s+\w+(?:ive|ous|ble|ful|ant|ent|ing|ed|al|ic),?\s+and\s+\w+(?:ive|ous|ble|ful|ant|ent|ing|ed|al|ic)\b/gi,
    why: 'Rule of three: "fast, reliable, and scalable". LLMs default to triplets.'
  }
];

  const pack = {
    id: 'en',
    name: 'English',
    locales: ['en', 'en-US', 'en-GB', 'en-AU', 'en-CA', 'en-IN', 'en-NZ', 'en-IE', 'en-ZA'],
    stopwords: [
      'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for',
      'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by',
      'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one',
      'all', 'would', 'there', 'their', 'what', 'so', 'if', 'about'
    ],
    rules: SLOP_RULES,
    emDash: {
      re: /—|\s--\s/g,
      minCount: 4,
      wordsPerDash: 150,
      rule: {
        id: 'em-dash',
        name: 'Em dash overuse',
        tier: 1,
        category: 'Rhythm',
        why: 'Heavy em dash use on this page. A known LLM rhythm crutch, only flagged in bulk.'
      }
    }
  };

  register(pack);
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
})(typeof globalThis !== 'undefined' ? globalThis : this);
