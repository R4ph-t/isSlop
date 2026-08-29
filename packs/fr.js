// French rule pack — native tells, not a translation of packs/en.js.
//
// Sources (patterns, not proof of origin):
// - Maria Mercanti-Guérin, The Conversation, « dé-IA-iser » nos écrits (2026)
//   https://theconversation.com/comment-de-ia-iser-nos-ecrits-pour-eviter-la-disparition-des-particularites-des-langues-281811
// - Shaku, iasignal, « Mots que ChatGPT utilise trop en français »
//   https://www.iasignal.com/blog/mots-chatgpt-trop-utilises
// - Daria Viktorova, « Les tics de langage de ChatGPT »
//   https://dariadecrypteia.substack.com/p/les-tics-de-langage-de-chatgpt
// - humaniseur-fr / humanizer-fr / Boileau — motif tables for French LLM prose
//   https://github.com/samber/cc-skills/blob/main/skills/humaniseur-fr/SKILL.md
//   https://github.com/ferr079/humanizer-fr
//   https://github.com/alxbd/boileau

(function (root) {
  const F = root.SlopFinders || require('../finders.js');
  const register = root.registerPack || require('./registry.js').registerPack;
  const makeChainFinder = F.makeChainFinder;
  const makeEchoFinder = F.makeEchoFinder;
  const makeAnaphoraFinder = F.makeAnaphoraFinder;

  const AP = String.raw`['\u2019]`;
  const FR_WORD = /[\p{L}\p{N}'’-]+/gu;
  const FR_HEAD = /[\p{L}'’-]+/u;
  const FR_CHAIN_SEP = String.raw`(?:\s*,\s*(?:et\s+|ou\s+)?|\s+(?:et|ou)\s+|\s*[;&\u2013\u2014]\s*(?:et\s+|ou\s+)?|\s+-{1,2}\s+)`;

  const ANAPHORA_SKIP = /^(?:le|la|les|un|une|des|je|tu|il|elle|on|nous|vous|ils|elles|ce|cet|cette|ces|et|ou|mais|donc|or|ni|car|de|du|à|au|aux|en|y|que|qui|si|ne|pas|dans|sur|pour|par|avec|sans|son|sa|ses|mon|ma|mes|c|d|l|n|s|qu)$/i;

  function frRe(inner, flags) {
    return new RegExp(String.raw`(?<![\p{L}\p{N}_])(?:${inner})(?![\p{L}\p{N}_])`, flags || 'giu');
  }

  const SLOP_RULES = [
    // ---------- HIGH CERTAINTY (tier 3) ----------
    {
      id: 'landscape-opener',
      name: 'Ouverture « dans un monde »',
      tier: 3,
      category: 'Throat-clearing',
      re: frRe(
        String.raw`dans un monde(?:\s+(?:où|en constante évolution|trépidant|tumultueux|en (?:pleine |constante )?mutation))?|à l${AP}ère(?:\s+(?:du numérique|digitale?|de(?:s)?\s+\w+))?|dans le paysage(?:\s+(?:actuel|numérique|contemporain|médiatique))?|dans le monde actuel|dans l${AP}univers de`
      ),
      why: '« Dans un monde en constante évolution », « à l’ère du numérique », « dans le paysage actuel » : amorce IA qui ne dit rien.'
    },
    {
      id: 'il-convient',
      name: '« Il est important de noter »',
      tier: 3,
      category: 'Throat-clearing',
      re: frRe(
        String.raw`il est (?:important|essentiel|crucial|intéressant) de (?:noter|souligner|rappeler|comprendre|préciser|retenir) que|il convient de (?:noter|souligner|rappeler|préciser|mentionner)|il est à noter que`
      ),
      why: 'Amorce solennelle : « il est important de noter que », « il convient de souligner que ». Couper et dire le fait.'
    },
    {
      id: 'ce-nest-pas',
      name: '« Ce n’est pas X, c’est Y »',
      tier: 3,
      category: 'Rhetorical setups',
      re: frRe(
        String.raw`ce n${AP}est pas (?:un simple |seulement |juste |uniquement )?[^.!?\n,]{2,50}[,;:—–-]\s*c${AP}est|il ne s${AP}agit pas (?:seulement |simplement |juste )?[^.!?\n,]{2,50}[,;:—–-]\s*il s${AP}agit|loin d${AP}être [^.!?\n,]{2,40},\s*c${AP}est`
      ),
      why: 'Parallélisme négatif : « ce n’est pas un simple outil, c’est un partenaire ». Dire Y directement.'
    },
    {
      id: 'summary-ending',
      name: 'Clôture « en conclusion »',
      tier: 3,
      category: 'Structure',
      re: frRe(String.raw`en conclusion|pour (?:résumer|conclure)|en résumé|en somme`),
      why: '« En conclusion », « en somme », « pour résumer » : recap de dissertation IA.'
    },
    {
      id: 'nhesitez-pas',
      name: '« N’hésitez pas »',
      tier: 3,
      category: 'Structure',
      re: frRe(String.raw`n${AP}hésitez pas(?:\s+à)?|j${AP}espère que (?:cet article|cela|ce (?:guide|texte)) (?:vous a|vous aura|vous)|en tant qu${AP}(?:intelligence artificielle|IA|assistant|modèle de langage)`),
      why: 'Clôture chatbot : « n’hésitez pas à… », « j’espère que cet article vous a plu », « en tant qu’IA ».'
    },
    {
      id: 'plongeons',
      name: '« Plongeons dans »',
      tier: 3,
      category: 'Throat-clearing',
      re: frRe(String.raw`plongeons dans|sans plus attendre|entrons dans le vif(?:\s+du sujet)?|explorons ensemble`),
      why: 'Échafaudage d’article : « plongeons dans », « sans plus attendre », « entrons dans le vif du sujet ».'
    },
    {
      id: 'weasel-attribution',
      name: 'Attribution floue',
      tier: 3,
      category: 'Attribution',
      re: frRe(
        String.raw`les experts (?:estiment|s${AP}accordent|soulignent|suggèrent)|il est (?:largement reconnu|communément admis|généralement admis) que|de nombreux observateurs|les analystes (?:estiment|suggèrent)`
      ),
      why: 'Autorité sans source : « les experts estiment », « il est largement reconnu que ».'
    },

    // ---------- MEDIUM CERTAINTY (tier 2) ----------
    {
      id: 'importance-puffery',
      name: 'Gonflage d’importance',
      tier: 2,
      category: 'Puffery',
      re: frRe(
        String.raw`joue un rôle (?:crucial|essentiel|clé|déterminant|central)|pierre angulaire|véritable (?:atout|défi|opportunité|révolution|rupture|bouleversement)|s${AP}inscrit dans une démarche|mettre en lumière|au c(?:œ|oe)ur de|levier (?:puissant|stratégique)|ne (?:peut|saurait) être (?:surestimé|sous-estimé)`
      ),
      why: 'Gonfle un fait : « joue un rôle crucial », « véritable atout », « s’inscrit dans une démarche ».'
    },
    {
      id: 'copula-avoid',
      name: 'Évitement d’« être »',
      tier: 2,
      category: 'Vocabulary',
      re: frRe(
        String.raw`s${AP}impose comme|se positionne comme|se révèle être|fait office de|constitue un(?:e)?|incarne l${AP}essence|fait figure de`
      ),
      why: 'Périphrase pour éviter « est » : « s’impose comme », « constitue une », « se révèle être ».'
    },
    {
      id: 'valise-verbs',
      name: 'Verbes valises',
      tier: 2,
      category: 'Vocabulary',
      re: frRe(
        String.raw`permettant ainsi|mettre en (?:œuvre|oeuvre)|répondre aux (?:besoins|enjeux)|tirer parti de|capitaliser sur`
      ),
      why: 'Verbes vides de rapport d’activité : « permettant ainsi », « mettre en œuvre », « répondre aux enjeux ».'
    },
    {
      id: 'ai-vocab',
      name: 'Vocabulaire IA français',
      tier: 2,
      category: 'Vocabulary',
      re: frRe(
        String.raw`crucial(?:e|es)?|incontournable|disruptif(?:ve|s|ves)?|holistique|transformateur(?:trice|s)?|fascinant(?:e|s|es)?|captivant(?:e|s|es)?`
      ),
      why: '« Crucial » est le tic lexical n°1 du français généré. Aussi : incontournable, disruptif, fascinant, holistique.'
    },
    {
      id: 'anglicisms',
      name: 'Calques de l’anglais',
      tier: 2,
      category: 'Vocabulary',
      re: frRe(
        String.raw`faire du sens|adresser (?:un |le |les |des |cette |ce )?problème|délivrer de la valeur|basiquement`
      ),
      why: 'Calques d’architecture anglaise : « faire du sens », « adresser un problème », « basiquement ».'
    },
    {
      id: 'participle-ant',
      name: 'Fausse analyse en -ant',
      tier: 2,
      category: 'Fake analysis',
      re: /,\s*(soulignant|mettant en lumière|illustrant|reflétant|témoignant|contribuant à|favorisant|symbolisant) (?:le|la|les|l['\u2019]|son|sa|ses|un|une|cette|ce|cet|leur)/giu,
      why: 'Participe présent collé en fin de phrase pour simuler de l’analyse : « , soulignant l’importance… ».'
    },
    {
      id: 'non-seulement',
      name: '« Non seulement… mais aussi »',
      tier: 2,
      category: 'Rhetorical setups',
      re: /(?<![\p{L}\p{N}_])non seulement[\s\S]{2,80}mais (?:aussi|également)(?![\p{L}\p{N}_])/giu,
      why: '« Non seulement X, mais aussi Y » : parallèle que les LLM francophones collent partout.'
    },
    {
      id: 'promo',
      name: 'Prose de brochure',
      tier: 2,
      category: 'Puffery',
      re: frRe(
        String.raw`nich[ée](?:e)? au c(?:œ|oe)ur de|à couper le souffle|joyau(?:x)? (?:caché|de|du)|incontournable|époustouflant(?:e)?|patrimoine (?:culturel )?riche`
      ),
      why: 'Brochure : « niché au cœur de », « à couper le souffle », « joyau caché ».'
    },
    {
      id: 'despite-challenges',
      name: 'Malgré les défis… avenir prometteur',
      tier: 2,
      category: 'Structure',
      re: frRe(
        String.raw`malgré (?:ces |ses |de tels )?défis|en dépit de ces défis|l${AP}avenir s${AP}annonce (?:prometteur|radieux|serein)|reste à voir|l${AP}avenir dira`
      ),
      why: 'Sandwich défis/optimisme : « malgré ces défis », « l’avenir s’annonce prometteur ».'
    },
    {
      id: 'connectors',
      name: 'Connecteurs en tête de phrase',
      tier: 2,
      category: 'Filler',
      re: /(^|[.!?]\s+)(En outre|Par ailleurs|De plus|Par conséquent|En effet|Ainsi|Qui plus est)\s*,/gu,
      why: 'Dissertation : chaque paragraphe ouvre par « En outre, », « Par ailleurs, », « De plus, ». Un connecteur isolé n’est pas un tic ; la pluie en tête de phrase l’est.'
    },
    {
      id: 'metadiscourse',
      name: 'Méta-commentaire',
      tier: 2,
      category: 'Filler',
      re: frRe(
        String.raw`en d${AP}autres termes|comme (?:mentionné|indiqué) (?:précédemment|plus haut|ci-dessus)|comme nous l${AP}avons vu|cela étant dit|dans ce cadre|dans ce contexte`
      ),
      why: 'Hors-sujet pédagogique : « en d’autres termes », « comme nous l’avons vu », « dans ce cadre ».'
    },
    {
      id: 'adj-doublet',
      name: 'Doublet d’adjectifs',
      tier: 2,
      category: 'Rhythm',
      re: frRe(
        String.raw`simple et intuitif(?:ve)?|robuste et fiable|innovant(?:e)? et (?:performant(?:e)?|avant-gardiste)|clair(?:e)? et (?:efficace|structuré(?:e)?)|dynamique et (?:robuste|en pleine expansion)|riche et varié(?:e)?`
      ),
      why: 'Deux adjectifs synonymes collés : « simple et intuitif », « robuste et fiable ». Tic statistique des LLM.'
    },
    {
      id: 'tout-dabord',
      name: 'Plan « tout d’abord / ensuite / enfin »',
      tier: 2,
      category: 'Structure',
      re: frRe(String.raw`tout d${AP}abord`),
      why: 'Balisage de dissertation : « tout d’abord ». Les humains varient ; l’IA numérote.'
    },
    {
      id: 'ni-chain',
      name: '« Ni X, ni Y, ni Z »',
      tier: 2,
      category: 'Rhetorical setups',
      find: makeChainFinder(String.raw`ni\s+`, /^ni\s+/i, 3, FR_CHAIN_SEP),
      why: 'Trois « ni … » d’affilée. Deux sont courants en français humain.'
    },
    {
      id: 'negative-listing',
      name: '« Pas X. Pas Y. Z. »',
      tier: 2,
      category: 'Rhetorical setups',
      re: /\bPas [^.!?\n]{2,35}\.\s*Pas [^.!?\n]{2,35}\.\s*(?:Juste|Seulement|Un|Une)\b/gu,
      why: '« Pas X. Pas Y. Juste Z. » : listing négatif de copie LinkedIn.'
    },
    {
      id: 'dramatic-fragment',
      name: 'Fragments « Et X. Et Y. »',
      tier: 2,
      category: 'Rhetorical setups',
      re: /(?:^|[.!?]\s+|\n)Et [^.!?\n]{1,48}\.\s*Et [^.!?\n]{1,48}\./g,
      why: '« X. Et Y. Et Z. » : fragmentation dramatique calquée sur l’anglais.'
    },
    {
      id: 'chatbot-residue',
      name: 'Résidu d’assistant',
      tier: 2,
      category: 'Structure',
      re: frRe(
        String.raw`excellente question\s*!|bien sûr\s*!\s*(?:voici|je)|je serais ravi de|à ma dernière (?:mise à jour|actualisation)|voici (?:une? )?(?:article|version|texte) (?:révisé|corrigé)`
      ),
      why: 'Voix d’assistant collée dans un texte publié : « Excellente question ! », « Bien sûr ! Voici ».'
    },
    {
      id: 'emoji-decoration',
      name: 'Emoji décoratif',
      tier: 2,
      category: 'Formatting',
      re: /(^|\n)\s*(?:🚀|✨|🔥|💡|🎯|⚡|🧵|👇|📈|🤯|🧠|✅|✔️|🌟|💪|🙌|🔑|📌|👉)\s*\S|(?:🚀|✨|🔥|💡|🎯|⚡|📈|🤯|🧠|✅|✔️|🌟)\s*$/gm,
      why: 'Emoji en tête ou en fin de ligne : formatting de post généré.'
    },
    {
      id: 'prompt-debris',
      name: 'Débris de prompt',
      tier: 3,
      category: 'Formatting',
      re: /\[(?:insérer|ajouter|votre|placeholder|statistique|date|nom|lien)[^\]]{0,50}\]/giu,
      why: 'Placeholder laissé tel quel : « [insérer statistique] ».'
    },
    {
      id: 'echo-triad',
      name: 'Phrases en écho',
      tier: 2,
      category: 'Rhythm',
      find: makeEchoFinder(FR_WORD),
      why: 'Phrases consécutives sur le même squelette.'
    },
    {
      id: 'sentence-anaphora',
      name: 'Même amorce répétée',
      tier: 2,
      category: 'Rhythm',
      find: makeAnaphoraFinder(ANAPHORA_SKIP, FR_HEAD),
      why: 'Trois phrases de suite qui commencent par le même mot (pronoms sautés).'
    },

    // ---------- WEAK SIGNALS (tier 1) ----------
    {
      id: 'dans-le-cadre',
      name: '« Dans le cadre de »',
      tier: 1,
      category: 'Filler',
      re: frRe(String.raw`dans le cadre de|à l${AP}aune de`),
      why: 'Périphrase administrative : « dans le cadre de », « à l’aune de » → souvent « pour » / « selon ».'
    },
    {
      id: 'sentence-adverb',
      name: 'Adverbe d’ouverture',
      tier: 1,
      category: 'Filler',
      re: /(^|[.!?]\s+)(Finalement|Globalement|Néanmoins|Toutefois|Cependant|Effectivement)\s*,/gu,
      why: 'Adverbe de liaison en tête de phrase, en série. Un « cependant » isolé est du français humain.'
    },
    {
      id: 'rule-of-three-adj',
      name: 'Triplet d’adjectifs',
      tier: 1,
      category: 'Rhythm',
      re: /\b[\p{L}'’-]+(?:if|ive|eux|euse|able|ible|ant|ent|é|ée),\s+[\p{L}'’-]+(?:if|ive|eux|euse|able|ible|ant|ent|é|ée),?\s+et\s+[\p{L}'’-]+(?:if|ive|eux|euse|able|ible|ant|ent|é|ée)\b/giu,
      why: 'Règle de trois : « rapide, fiable et élégant ». Les LLM defaultent au triplet.'
    }
  ];

  const pack = {
    id: 'fr',
    name: 'French',
    locales: ['fr', 'fr-FR', 'fr-CA', 'fr-BE', 'fr-CH', 'fr-LU'],
    stopwords: [
      'le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'à', 'a', 'est',
      'en', 'que', 'qui', 'dans', 'ce', 'il', 'elle', 'on', 'ne', 'se', 'pas',
      'pour', 'par', 'sur', 'plus', 'ou', 'mais', 'avec', 'tout', 'son', 'sa',
      'au', 'aux', 'nous', 'vous', 'je', 'tu', 'y', 'd', 'l', 'n', 's'
    ],
    rules: SLOP_RULES,
    emDash: {
      re: /—|\s--\s/g,
      minCount: 4,
      wordsPerDash: 150,
      rule: {
        id: 'em-dash',
        name: 'Abus de tiret cadratin',
        tier: 1,
        category: 'Rhythm',
        why: 'Le tiret cadratin à l’anglaise, en tas. En français on préfère la virgule ou la parenthèse.'
      }
    }
  };

  register(pack);
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
})(typeof globalThis !== 'undefined' ? globalThis : this);
