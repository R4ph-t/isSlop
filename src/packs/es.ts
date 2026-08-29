// Spanish rule pack — UNVERIFIED.
// Compiled from published Spanish LLM-tell lists. Not attested by a
// native-speaking maintainer. Contributors: scan real pages, watch false
// positives (especially regional Spanish), then set verified: true.
//
// Sources (patterns, not proof of origin):
// - stop-slop-spanish — frases.md / estructuras.md (native Spanish tells)
//   https://github.com/sohantanna/stop-slop-spanish
// - humanizar-texto-es (español peninsular skill)
//   https://github.com/fernandotellado/ai-skills/blob/main/humanizar-texto-es/SKILL.md
// - ActivaDocente, «Frases y estilos reconocibles en textos ChatGPT»
//   https://activadocente.com/frases-y-estilos-reconocibles-en-los-textos-escritos-con-chatgpt-e-ia/
// - Diario Vida, «Cómo huele un texto escrito por una IA» (castellano)
//   https://diariovida.com/tics-texto-escrito-con-ia-espanol/
// - Walter, «Humanizar textos de ChatGPT»
//   https://walterwrites.ai/es/humanizar-texto-de-chatgpt/

import { makeChainFinder, makeEchoFinder, makeAnaphoraFinder } from '../finders';
import { registerPack } from './registry';
import type { Pack } from '../types';

  const ES_WORD = /[\p{L}\p{N}'’-]+/gu;
  const ES_HEAD = /[\p{L}'’-]+/u;
  const ES_CHAIN_SEP = String.raw`(?:\s*,\s*(?:y\s+|o\s+)?|\s+(?:y|o)\s+|\s*[;&\u2013\u2014]\s*(?:y\s+|o\s+)?|\s+-{1,2}\s+)`;

  const ANAPHORA_SKIP = /^(?:el|la|los|las|un|una|unos|unas|yo|tú|tu|vos|usted|él|ella|nosotros|nosotras|vosotros|vosotras|ustedes|ellos|ellas|me|te|se|le|les|lo|nos|os|de|del|al|a|en|y|o|que|quien|quién|si|sí|no|por|para|con|sin|su|sus|mi|mis|este|esta|estos|estas|eso|esa)$/i;

  function esRe(inner: string, flags?: string) {
    return new RegExp(String.raw`(?<![\p{L}\p{N}_])(?:${inner})(?![\p{L}\p{N}_])`, flags || 'giu');
  }

  const SLOP_RULES = [
    // ---------- HIGH CERTAINTY (tier 3) ----------
    {
      id: 'landscape-opener',
      name: 'Apertura «en el mundo actual»',
      tier: 3,
      category: 'Throat-clearing',
      re: esRe(
        String.raw`en el mundo actual|en la era (?:digital|de la información|de la IA|de la inteligencia artificial)|en un mundo cada vez más|en el panorama (?:actual|digital|tecnológico)|en un panorama en constante evolución|a d[ií]a de hoy`
      ),
      why: '«En el mundo actual», «en la era digital», «en el panorama actual»: arranque vacío de LLM. (Pack no verificado.)'
    },
    {
      id: 'cabe-destacar',
      name: '«Cabe destacar que»',
      tier: 3,
      category: 'Throat-clearing',
      re: esRe(
        String.raw`cabe (?:destacar|mencionar|señalar|resaltar|recordar) que|es importante (?:destacar|mencionar|señalar|recordar|entender) que|vale la pena (?:mencionar|destacar|señalar) que|es preciso señalar que|conviene recordar que`
      ),
      why: 'Carraspeo: «cabe destacar que», «es importante señalar que». Corta y afirma. (Pack no verificado.)'
    },
    {
      id: 'no-es-sino',
      name: '«No es X, es Y»',
      tier: 3,
      category: 'Rhetorical setups',
      re: esRe(
        String.raw`no es(?:tá)? (?:solo |solamente |simplemente |un simple )?[^.!?\n¿¡,]{2,50}[,;:—–-]\s*(?:es|sino(?: que)?|se trata de)|no se trata (?:solo |solamente )?de [^.!?\n¿¡,]{2,50}[,;:—–-]\s*sino(?: que)?|no es una herramienta[^.!?\n¿¡,]{0,40},\s*es un`
      ),
      why: 'Contraste negativo: «no es un simple X, es un Y» / «no se trata de X, sino de Y». (Pack no verificado.)'
    },
    {
      id: 'summary-ending',
      name: 'Cierre «en conclusión»',
      tier: 3,
      category: 'Structure',
      re: esRe(String.raw`en conclusi[oó]n|en resumen|en s[ií]ntesis|en definitiva|para (?:concluir|resumir)`),
      why: '«En conclusión», «en resumen», «en definitiva»: recap de cierre IA. (Pack no verificado.)'
    },
    {
      id: 'no-dudes',
      name: '«No dudes en»',
      tier: 3,
      category: 'Structure',
      re: esRe(
        String.raw`no dud(?:es|e|éis) en|espero que (?:este (?:art[ií]culo|texto|gu[ií]a)|esto) te (?:haya|sirva)|como (?:IA|inteligencia artificial|modelo de lenguaje)|excelente pregunta`
      ),
      why: 'Cierre de chatbot: «no dudes en…», «espero que este artículo te haya…», «como IA». (Pack no verificado.)'
    },
    {
      id: 'sumergente',
      name: '«Sumérgete en»',
      tier: 3,
      category: 'Throat-clearing',
      re: esRe(String.raw`sum[eé]rgete en|emb[aá]rcate en|profundicemos en|sin m[aá]s pre[aá]mbulos|entremos en materia`),
      why: 'Andamiaje de artículo: «sumérgete en», «profundicemos en», «sin más preámbulos». (Pack no verificado.)'
    },
    {
      id: 'weasel-attribution',
      name: 'Atribución vaga',
      tier: 3,
      category: 'Attribution',
      re: esRe(
        String.raw`los expertos (?:coinciden|afirman|señalan|estiman|sugieren)|est[aá] ampliamente reconocido que|es innegable que|no cabe duda de que|como todos sabemos|todos sabemos que`
      ),
      why: 'Autoridad sin fuente: «los expertos coinciden», «está ampliamente reconocido que». (Pack no verificado.)'
    },

    // ---------- MEDIUM CERTAINTY (tier 2) ----------
    {
      id: 'importance-puffery',
      name: 'Inflación de importancia',
      tier: 2,
      category: 'Puffery',
      re: esRe(
        String.raw`juega un papel (?:clave|fundamental|esencial|crucial)|se erige como|pilar fundamental|piedra angular|un antes y un despu[eé]s|de (?:vital|suma|gran) importancia|marca un hito`
      ),
      why: 'Infla el hecho: «se erige como», «juega un papel fundamental», «un antes y un después». (Pack no verificado.)'
    },
    {
      id: 'copula-avoid',
      name: 'Evitar «ser»/«estar»',
      tier: 2,
      category: 'Vocabulary',
      re: esRe(
        String.raw`se posiciona como|se constituye como|se revela como|hace las veces de|representa una (?:soluci[oó]n|herramienta|oportunidad)`
      ),
      why: 'Perífrasis para no decir «es»: «se posiciona como», «se constituye como». (Pack no verificado.)'
    },
    {
      id: 'ai-vocab',
      name: 'Adjetivos-comodín',
      tier: 2,
      category: 'Vocabulary',
      re: esRe(
        String.raw`crucial(?:es)?|fundamental(?:es)?|imprescindible(?:s)?|hol[ií]stic[oa]s?|disruptiv[oa]s?|sinf[ií]n de`
      ),
      why: '«Crucial», «fundamental», «disruptivo», «un sinfín de»: folleto LLM. (Pack no verificado.)'
    },
    {
      id: 'anglicisms',
      name: 'Calcos del inglés',
      tier: 2,
      category: 'Vocabulary',
      re: esRe(
        String.raw`hacer sentido|en base a|aplicar para (?:un |el |una )?(?:puesto|trabajo|beca)|pensar fuera de la caja`
      ),
      why: 'Calcos: «hacer sentido», «en base a», «pensar fuera de la caja». Puede picar español humano regional. Pack no verificado.'
    },
    {
      id: 'gerundio',
      name: 'Gerundio colgante',
      tier: 2,
      category: 'Fake analysis',
      re: /,\s*(logrando as[ií]|garantizando|permitiendo|destacando|subrayando|fomentando|impulsando) (?:el|la|los|las|un|una|su|sus|este|esta|que)/giu,
      why: 'Gerundio de consecuencia pegado al final: «, logrando así…», «, permitiendo…». (Pack no verificado.)'
    },
    {
      id: 'no-solo-sino',
      name: '«No solo… sino también»',
      tier: 2,
      category: 'Rhetorical setups',
      re: /(?<![\p{L}\p{N}_])no solo[\s\S]{2,80}sino (?:tambi[eé]n|que)(?![\p{L}\p{N}_])/giu,
      why: '«No solo X, sino también Y»: paralelo estrella del español-IA. (Pack no verificado.)'
    },
    {
      id: 'pasiva-refleja',
      name: 'Pasiva refleja de relleno',
      tier: 2,
      category: 'Fake analysis',
      re: esRe(String.raw`se puede (?:observar|apreciar|constatar|afirmar) que|puede observarse que`),
      why: '«Se puede observar que»: esconde al responsable y no dice nada. (Pack no verificado.)'
    },
    {
      id: 'promo',
      name: 'Prosa de folleto',
      tier: 2,
      category: 'Puffery',
      re: esRe(
        String.raw`enclavado en el coraz[oó]n de|joya (?:escondida|oculta)|imprescindible de visitar|corta el aliento|rico patrimonio(?: cultural)?`
      ),
      why: 'Folleto: «enclavado en el corazón de», «joya escondida». (Pack no verificado.)'
    },
    {
      id: 'despite-challenges',
      name: 'A pesar de los desafíos…',
      tier: 2,
      category: 'Structure',
      re: esRe(
        String.raw`a pesar de (?:estos |dichos |tales )?desaf[ií]os|pese a estos desaf[ií]os|el futuro se presenta (?:prometedor|halag[uü]eño)|el tiempo dir[aá]`
      ),
      why: 'Sándwich desafíos/optimismo. (Pack no verificado.)'
    },
    {
      id: 'connectors',
      name: 'Conectores a inicio de frase',
      tier: 2,
      category: 'Filler',
      re: /(^|[.!?¿¡]\s+)(Por otro lado|Asimismo|Además|En este sentido|Por consiguiente|Dicho esto)\s*,/gu,
      why: 'Cada párrafo abre con «Por otro lado,», «En este sentido,». Un «además» a mitad de frase no es el tic. (Pack no verificado.)'
    },
    {
      id: 'metadiscourse',
      name: 'Metacomentario',
      tier: 2,
      category: 'Filler',
      re: esRe(
        String.raw`en (?:otras|distintas) palabras|como (?:veremos|mencionamos|se mencion[oó]) (?:a continuaci[oó]n|anteriormente|m[aá]s arriba)|en este art[ií]culo (?:veremos|exploraremos|analizaremos)|antes de continuar`
      ),
      why: 'El texto se explica a sí mismo: «como veremos a continuación», «en este artículo exploraremos». (Pack no verificado.)'
    },
    {
      id: 'en-primer-lugar',
      name: '«En primer lugar…»',
      tier: 2,
      category: 'Structure',
      re: esRe(String.raw`en primer lugar`),
      why: 'Plan de disertación: «en primer lugar». (Pack no verificado.)'
    },
    {
      id: 'ni-chain',
      name: '«Ni X, ni Y, ni Z»',
      tier: 2,
      category: 'Rhetorical setups',
      find: makeChainFinder(String.raw`ni\s+`, /^ni\s+/i, 3, ES_CHAIN_SEP),
      why: 'Tres «ni …» seguidos. Dos son normales en español. (Pack no verificado.)'
    },
    {
      id: 'negative-listing',
      name: '«No X. No Y. Z.»',
      tier: 2,
      category: 'Rhetorical setups',
      re: /\bNo [^.!?\n¿¡]{2,35}\.\s*No [^.!?\n¿¡]{2,35}\.\s*(?:Solo|Solamente|Un|Una|Tan solo)\b/gu,
      why: '«No X. No Y. Solo Z.» (Pack no verificado.)'
    },
    {
      id: 'dramatic-fragment',
      name: 'Fragmentos «Y X. Y Y.»',
      tier: 2,
      category: 'Rhetorical setups',
      re: /(?:^|[.!?]\s+|\n)Y [^.!?\n¿¡]{1,48}\.\s*Y [^.!?\n¿¡]{1,48}\./g,
      why: '«X. Y Y. Y Z.»: fragmentación dramática. (Pack no verificado.)'
    },
    {
      id: 'chatbot-residue',
      name: 'Residuo de asistente',
      tier: 2,
      category: 'Structure',
      re: esRe(
        String.raw`claro que s[ií]\s*!|por supuesto\s*!\s*(?:aqu[ií]|te)|estar[ií]a encantado de|seg[uú]n mi [uú]ltima (?:actualizaci[oó]n|fecha de (?:corte|entrenamiento))`
      ),
      why: 'Voz de asistente en texto publicado. (Pack no verificado.)'
    },
    {
      id: 'emoji-decoration',
      name: 'Emoji decorativo',
      tier: 2,
      category: 'Formatting',
      re: /(^|\n)\s*(?:🚀|✨|🔥|💡|🎯|⚡|🧵|👇|📈|🤯|🧠|✅|✔️|🌟|💪|🙌|🔑|📌|👉)\s*\S|(?:🚀|✨|🔥|💡|🎯|⚡|📈|🤯|🧠|✅|✔️|🌟)\s*$/gm,
      why: 'Emoji al inicio o al final de línea. (Pack no verificado.)'
    },
    {
      id: 'prompt-debris',
      name: 'Restos de prompt',
      tier: 3,
      category: 'Formatting',
      re: /\[(?:inserta|insertar|a[nñ]ade|tu|placeholder|estad[ií]stica|fecha|nombre|enlace)[^\]]{0,50}\]/giu,
      why: 'Placeholder sin rellenar: «[insertar estadística]». (Pack no verificado.)'
    },
    {
      id: 'echo-triad',
      name: 'Frases en eco',
      tier: 2,
      category: 'Rhythm',
      find: makeEchoFinder(ES_WORD),
      why: 'Frases seguidas sobre el mismo esqueleto. (Pack no verificado.)'
    },
    {
      id: 'sentence-anaphora',
      name: 'Misma apertura repetida',
      tier: 2,
      category: 'Rhythm',
      find: makeAnaphoraFinder(ANAPHORA_SKIP, ES_HEAD),
      why: 'Tres frases seguidas que empiezan por la misma palabra. (Pack no verificado.)'
    },

    // ---------- WEAK SIGNALS (tier 1) ----------
    {
      id: 'a-nivel-de',
      name: '«A nivel de»',
      tier: 1,
      category: 'Filler',
      re: esRe(String.raw`a nivel de|en aras de`),
      why: 'Muletilla: «a nivel de», «en aras de» → suele bastar «en» / «para». (Pack no verificado.)'
    },
    {
      id: 'sentence-adverb',
      name: 'Conector de apertura débil',
      tier: 1,
      category: 'Filler',
      re: /(^|[.!?¿¡]\s+)(Sin embargo|No obstante|Efectivamente|Finalmente|En esencia|En [uú]ltima instancia)\s*,/gu,
      why: 'Conector de tesis al inicio. Uno suelto es español humano. (Pack no verificado.)'
    },
    {
      id: 'rule-of-three-adj',
      name: 'Trío de adjetivos',
      tier: 1,
      category: 'Rhythm',
      re: /\b[\p{L}'’-]+(?:ivo|iva|oso|osa|able|ible|ante|ente|ico|ica),\s+[\p{L}'’-]+(?:ivo|iva|oso|osa|able|ible|ante|ente|ico|ica),?\s+y\s+[\p{L}'’-]+(?:ivo|iva|oso|osa|able|ible|ante|ente|ico|ica)\b/giu,
      why: 'Regla de tres: «rápido, fácil y eficaz». (Pack no verificado.)'
    }
  ];

const pack: Pack = {
    id: 'es',
    name: 'Spanish',
    verified: false,
    locales: ['es', 'es-ES', 'es-MX', 'es-AR', 'es-CO', 'es-CL', 'es-PE', 'es-VE', 'es-US', 'es-419'],
    stopwords: [
      'el', 'la', 'los', 'las', 'de', 'del', 'que', 'y', 'en', 'un', 'una', 'es',
      'se', 'no', 'por', 'con', 'para', 'como', 'su', 'al', 'lo', 'le', 'a',
      'o', 'pero', 'más', 'este', 'esta', 'si', 'ya', 'todo', 'me', 'te'
    ],
    rules: SLOP_RULES,
    emDash: {
      re: /—|\s--\s/g,
      minCount: 4,
      wordsPerDash: 150,
      rule: {
        id: 'em-dash',
        name: 'Abuso de raya',
        tier: 1,
        category: 'Rhythm',
        why: 'Raya al estilo inglés, a montones. En español suele ir coma o paréntesis. (Pack no verificado.)'
      }
    }
  };

registerPack(pack);
export default pack;
