/**
 * Passphrases, with an entropy figure that is the real one.
 *
 * A passphrase is stronger than a password of the same *length* and weaker
 * than a password of the same *entropy* — the whole point is that it is
 * easier to remember and to type, not that it is magically harder to guess.
 * Its strength is exactly `words × log2(listSize)`, and that only holds if
 * every word was chosen uniformly at random from a list whose size the
 * attacker is assumed to know. Which they do: the list is right here.
 *
 * Two habits inflate the claimed number everywhere else:
 *
 *  1. Counting characters. "correct-horse-battery-staple" is 28 characters,
 *     and a generator that reports 28 × log2(95) = 184 bits is off by a
 *     factor of 2^140. The words are the units, not the letters.
 *  2. Counting decoration. Capitalising the first letter of every word,
 *     putting "1!" on the end, or swapping the separator adds nothing an
 *     attacker does not already try — those are fixed patterns, and a fixed
 *     pattern is zero bits. Here, decoration only counts when its *choice*
 *     was random: which word gets capitalised, which digits, which symbol.
 *
 * The built-in list is 2048 words, which is exactly 11 bits each — the
 * arithmetic stays honest and checkable in your head. Words are 2 to 9 ASCII
 * letters, no proper nouns, no unpleasant vocabulary (a passphrase gets read
 * aloud and typed in front of people), and no two words in the list are the
 * same. You can also paste your own list — the EFF long list, a language
 * other than English — and the entropy is recomputed from what you paste,
 * after removing duplicates, because a list with the same word twice is
 * smaller than it looks.
 */

/**
 * The built-in wordlist, as one string so it is diffable and costs no
 * per-element syntax. Split at module load; `WORDS` is what everything uses.
 */
const BUILT_IN =
  'able about above absent absorb abstract acid across action actor actual adapt adjust admit adopt ' +
  'adult advance advice aerial afford afraid after again against agency agent agree ahead aim air ' +
  'aisle alarm album alert alien align alive alley allow almond almost alone along aloud alpha ' +
  'already also alter always amber amend among amount ample amuse anchor ancient anger angle animal ' +
  'ankle annual answer antenna anthem anxiety any apart apple apply apron arcade arch arctic arena ' +
  'argue arise armor army around arrange arrest arrive arrow art artist ash aside ask aspect asphalt ' +
  'assist assume asthma athlete atom attach attack attend attic auction audio audit august aunt ' +
  'author auto autumn avenue average avocado avoid awake award aware away awesome awful awkward axis ' +
  'babble baby back bacon badge badly bag bake balance balcony ball bamboo banana band bandage bang ' +
  'bank banner barely bargain barn barrel base basic basil basket batch bath battery battle bay beach ' +
  'beam bean bear beauty become bedroom bee beef before begin behave behind being belief bell belong ' +
  'below belt bench bend benefit berry beside best betray better between beyond bicycle bid big bike ' +
  'bill binary bind biology bird birth biscuit bitter black blade blame blank blanket blast bleak ' +
  'blend bless blind blink block blond blood bloom blouse blue blur blush board boast boat body boil ' +
  'bold bolt bone bonus book boost boot border boring borrow bosom boss both bottle bottom bounce ' +
  'bound bow bowl box boy brace brain brake branch brand brass brave bread break breeze brick bridge ' +
  'brief bright bring brisk broad broken bronze broom brother brown brush bubble bucket budget ' +
  'buffalo build bulb bulk bundle bunker burden burger burn burst bus bush business busy butter ' +
  'button buyer buzz cabin cable cactus cage cake calm camera camp canal cancel candle canoe canvas ' +
  'canyon capable capital captain car carbon card career cargo carpet carry cart carve case cash ' +
  'castle casual cat catalog catch cattle caught cause caution cave ceiling celery cement census ' +
  'cereal certain chain chair chalk champion change channel chaos chapter charge charity charm chart ' +
  'chase cheap check cheese chef cherry chest chicken chief child chill chimney choice choose chorus ' +
  'chosen chrome chunk cinema circle citizen city civil claim clamp clarify clash class clay clean ' +
  'clear clerk clever click client cliff climate climb clinic clip clock clog close cloth cloud clown ' +
  'club clump cluster clutch coach coal coast coat code coffee coil coin cold collect college color ' +
  'column comb combine come comfort comic comma common compass concert concrete confirm connect ' +
  'consider control convince cook cool copper copy coral cord core cork corn corner correct cost ' +
  'cotton couch cough could council count couple courage course cousin cover cow coyote cozy crack ' +
  'cradle craft crane crash crater crawl crazy cream create credit creek crew cricket crime crisp ' +
  'critic crop cross crowd cruise crumble crunch crush crystal cube cuisine culture cup curious curl ' +
  'current curtain curve cushion custom cute cycle dad daily dairy damage damp dance danger daring ' +
  'dash data date daughter dawn day deal dear debate debris decade decent decide declare decline ' +
  'decorate decrease deer defense define defy degree delay deliver demand demise denial dentist deny ' +
  'depart depend deposit depth deputy derive describe desert design desk detail detect develop device ' +
  'devote diagram dial diamond diary dice diesel diet differ digital dignity dilemma dinner dinosaur ' +
  'direct dirt disagree discover dish display distance divert divide doctor document dog doll dolphin ' +
  'domain donate donkey donor door dose double dove draft dragon drama drastic draw dream dress drift ' +
  'drill drink drip drive drop drum dry duck dumb dune during dust duty dwarf dwell dynamic eager ' +
  'eagle early earn earth easily east easy echo ecology economy edge edit educate effort egg eight ' +
  'either elbow elder electric elegant element elephant elevator elite else embark embody embrace ' +
  'emerge emotion employ empower empty enable enact end endless endorse enemy energy enforce engage ' +
  'engine enhance enjoy enlist enough enrich enroll ensure enter entire entry envelope episode equal ' +
  'equip era erase erode erosion error erupt escape essay essence estate eternal ethics evidence ' +
  'evoke evolve exact example excess exchange excite exclude excuse execute exercise exhaust exhibit ' +
  'exile exist exit exotic expand expect expire explain expose express extend extra eye fabric face ' +
  'faculty fade faint faith fall false fame family famous fan fancy fantasy farm fashion fast fat ' +
  'fatal father fatigue fault favorite feature federal fee feed feel female fence festival fetch ' +
  'fever few fiber fiction field figure file film filter final find fine finger finish fire firm ' +
  'first fiscal fish fit fitness fix flag flame flash flat flavor flee flesh flight flip float flock ' +
  'floor flour flower fluid flush fly foam focus fog foil fold follow food foot force forest forget ' +
  'fork form fortune forum forward fossil foster found fox fragile frame frequent fresh friend fringe ' +
  'frog front frost frown frozen fruit fuel fun funny furnace fury future gadget gain galaxy gallery ' +
  'game gap garage garbage garden garlic garment gas gasp gate gather gauge gaze general genius genre ' +
  'gentle genuine gesture ghost giant gift giggle ginger giraffe girl give glad glance glare glass ' +
  'glide glimpse globe gloom glory glove glow glue goat goddess gold good goose gorilla gospel gossip ' +
  'govern gown grab grace grain grant grape grass gravity great green grid grief grit grocery group ' +
  'grow grunt guard guess guide guilt guitar gym habit hair half hammer hamster hand happy harbor ' +
  'hard harsh harvest hat have hawk head health heart heavy hedge height hello helmet help hen hero ' +
  'hidden high hill hint hip hire history hobby hockey hold hole holiday hollow home honey hood hope ' +
  'horn horse hospital host hotel hour hover hub huge human humble humor hundred hungry hunt hurdle ' +
  'hurry husband hybrid ice icon idea identify idle ignore ill image imitate immense immune impact ' +
  'impose improve impulse inch include income increase index indicate indoor industry infant inflict ' +
  'inform inhale inherit initial inject injury inmate inner innocent input inquiry insane insect ' +
  'inside inspire install intact interest into invest invite involve iron island isolate issue item ' +
  'ivory jacket jaguar jar jazz jealous jeans jelly jewel job join joke journey joy judge juice jump ' +
  'jungle junior junk just kangaroo keen keep key kick kid kidney kind kingdom kiss kit kitchen kite ' +
  'kitten kiwi knee knife knock know lab label labor ladder lady lake lamp language laptop large ' +
  'later laugh laundry lava law lawn layer lazy leader leaf learn leave lecture left leg legal legend ' +
  'leisure lemon lend length lens leopard lesson letter level liar liberty library license life lift ' +
  'light like limb limit link lion liquid list little live lizard load loan lobster local lock logic ' +
  'lonely long loop lottery loud lounge love loyal lucky luggage lumber lunar lunch luxury lyrics ' +
  'machine mad magic magnet maid mail main major make mammal man manage mandate mango mansion manual ' +
  'maple marble march margin marine market marriage mask mass master match material math matrix ' +
  'matter maximum maze meadow mean measure meat mechanic medal media melody melt member memory ' +
  'mention menu mercy merge merit merry mesh message metal method middle midnight milk million mimic ' +
  'mind minimum minor minute miracle mirror miss mistake mix mobile model modify mom moment monitor ' +
  'monkey monster month moon moral more morning mosquito mother motion motor mountain mouse move ' +
  'movie much muffin mule multiply muscle museum mushroom music must mutual myself mystery myth naive ' +
  'name napkin narrow nation nature near neck need negative neglect neither nephew nerve nest net ' +
  'network neutral never news next nice night noble noise nominee noodle normal north nose notable ' +
  'note nothing notice novel now nuclear number nurse nut oak obey object oblige obscure observe ' +
  'obtain obvious occur ocean odor off offer office often oil okay old olive omit once one onion ' +
  'online only open opera opinion oppose option orange orbit orchard order ordinary organ orient ' +
  'original orphan ostrich other outdoor outer output outside oval oven over own owner oxygen oyster ' +
  'ozone pact paddle page pair palace palm panda panel panic panther paper parade parent park parrot ' +
  'party pass patch path patient patrol pattern pause pave payment peace peanut pear peasant pelican ' +
  'pen pencil people pepper perfect permit person pet phone photo phrase physical piano picnic ' +
  'picture piece pig pigeon pill pilot pink pioneer pipe pitch pizza place planet plastic plate play ' +
  'please pledge pluck plug plunge poem poet point polar pole police pond pony pool popular portion ' +
  'position possible post potato pottery poverty powder power practice praise predict prefer prepare ' +
  'present pretty prevent price pride primary print priority private prize problem process produce ' +
  'profit program project promote proof property prosper protect proud provide public pudding pull ' +
  'pulp pulse pumpkin punch pupil puppy purchase purity purpose purse push put puzzle pyramid quality ' +
  'quantum quarter question quick quit quiz quote rabbit raccoon race rack radar radio rail rain ' +
  'raise rally ramp ranch random range rapid rare rate rather raven raw razor ready real reason rebel ' +
  'rebuild recall receive recipe record recycle reduce reflect reform refuse region regret regular ' +
  'reject relax release relief rely remain remember remind remove render renew rent reopen repair ' +
  'repeat replace report require rescue resemble resist resource response result retire retreat ' +
  'return reunion reveal review reward rhythm rib ribbon rice rich ride ridge right rigid ring ripple ' +
  'risk ritual rival river road roast robot robust rocket romance roof rookie room rose rotate rough ' +
  'round route royal rubber rude rug rule run runway rural sad saddle safe sail salad salmon salon ' +
  'salt salute same sample sand satisfy sauce sausage save say scale scan scare scatter scene scheme ' +
  'school science scissors scorpion scout scrap screen script scrub sea search season seat second ' +
  'secret section security seed seek segment select sell seminar senior sense sentence series service ' +
  'session settle setup seven shadow shaft shallow share shed shell sheriff shield shift shine ship ' +
  'shiver shock shoe shoot shop short shoulder shove shrimp shrug shuffle shy sibling side siege ' +
  'sight sign silent silk silly silver similar simple since sing siren sister situate six size skate ' +
  'sketch ski skill skin skirt skull slab slam sleep slender slice slide slight slim slogan slot slow ' +
  'slush small smart smile smoke smooth snack snake snap sniff snow soap soccer social sock soda soft ' +
  'solar soldier solid solution solve someone song soon sorry sort soul sound soup source south space ' +
  'spare spatial spawn speak special speed spell spend sphere spice spider spike spin spirit split ' +
  'spoil sponsor spoon sport spot spray spread spring spy square squeeze squirrel stable stadium ' +
  'staff stage stairs stamp stand start state stay steak steel stem step stereo stick still stock ' +
  'stomach stone stool story stove strategy street strike strong struggle student stuff style subject ' +
  'submit subway success such sudden sugar suggest suit summer sun sunny sunset super supply supreme ' +
  'sure surface surge surprise surround survey suspect sustain swallow swamp swap swarm swear sweet ' +
  'swift swim swing switch sword symbol symptom syrup system table tackle tag tail talent talk tank ' +
  'tape target task taste tattoo teach team tell ten tenant tennis tent term test text thank that ' +
  'theme then theory there they thing this thought three thrive throw thumb thunder ticket tide tiger ' +
  'tilt timber time tiny tip tired tissue title toast today toddler toe together toilet token tomato ' +
  'tomorrow tone tongue tonight tool tooth top topic topple torch tornado tortoise toss total tourist ' +
  'toward tower town toy track trade traffic tragic train transfer trap trash travel tray treat tree ' +
  'trend trial tribe trick trigger trim trip trophy trouble truck true truly trumpet trust truth try ' +
  'tube tuition tumble tuna tunnel turkey turn turtle twelve twenty twice twin twist two type typical ' +
  'umbrella unable unaware uncle uncover under undo unfold uniform unique unit universe unknown ' +
  'unlock until unusual unveil update upgrade uphold upon upper upset urban urge usage use used ' +
  'useful usual utility vacant vacuum vague valid valley valve van vanish vapor various vast vault ' +
  'vehicle velvet vendor venture venue verb verify version very vessel veteran viable vibrant victory ' +
  'video view village vintage violin virtual virus visa visit visual vital vivid vocal voice volcano ' +
  'volume vote voyage wage wagon wait walk wall walnut want warm wash waste water wave way wealth ' +
  'weapon wear weather web wedding weekend weird welcome west wet whale what wheat wheel when where ' +
  'whip whisper wide width wife wild will win window wine wing wink winner winter wire wisdom wise ' +
  'wish witness wolf woman wonder wood wool word work world worry worth wrap wrestle wrist write yard ' +
  'year yellow you young youth zebra zero zone zoo';


export const WORDS: string[] = normalizeWordlist(BUILT_IN);

/** Exactly 2^11 words, so each one is exactly 11 bits. */
export const BUILT_IN_SIZE = 2048;

export const SEPARATORS: Record<string, string> = {
  hyphen: '-',
  dot: '.',
  space: ' ',
  underscore: '_',
  none: '',
};

export type SeparatorId = keyof typeof SEPARATORS;

/**
 * Symbols that survive a trip through a shell, a CSV and a login form. Quotes,
 * backslash and backtick are left out for the same reason as in E01: a
 * passphrase you cannot paste gets replaced by a weaker one you can.
 */
export const SYMBOLS = '!#$%&*+,-./:;=?@^_~';

export type Capitalize =
  /** Leave the words as they are in the list. */
  | 'none'
  /** Capitalise every word's first letter — a fixed pattern, so zero bits. */
  | 'each'
  /** Capitalise one randomly chosen word — log2(words) bits. */
  | 'one-random';

export type Options = {
  words: number;
  separator: SeparatorId;
  capitalize: Capitalize;
  /** Random decimal digits appended at the end. 0 for none. */
  digits: number;
  /** Append one randomly chosen symbol from SYMBOLS. */
  symbol: boolean;
  /** The list to draw from. Defaults to the built-in one. */
  list?: string[];
};

export const MIN_WORDS = 3;
export const MAX_WORDS = 12;
export const MAX_DIGITS = 6;

export class ImpossibleOptions extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImpossibleOptions';
  }
}

/**
 * Cleans a pasted wordlist: one word per line or per space, lower-cased,
 * de-duplicated, sorted. Numbered lists are accepted because the EFF files
 * are dice rolls followed by a tab and the word.
 */
export function normalizeWordlist(text: string): string[] {
  const seen = new Set<string>();
  for (const token of text.split(/[\s,;]+/)) {
    // `11116\tacid` — drop a leading dice-roll or index column.
    const word = token.replace(/^[0-9]+[-.\t]?/, '').trim().toLowerCase();
    if (word === '') continue;
    seen.add(word);
  }
  return [...seen].sort();
}

export function listFor(options: Options): string[] {
  const list = options.list && options.list.length > 0 ? options.list : WORDS;
  return list;
}

/** Bits per word: log2 of the list size, and nothing else. */
export function bitsPerWord(list: readonly string[]): number {
  return list.length > 1 ? Math.log2(list.length) : 0;
}

export type Breakdown = {
  /** Bits from the word draws. */
  words: number;
  /** Bits from *which* word is capitalised, when that is random. */
  capitalization: number;
  /** Bits from the appended digits. */
  digits: number;
  /** Bits from the appended symbol. */
  symbol: number;
  total: number;
};

/**
 * Where every bit comes from.
 *
 * Shown as a table in the UI rather than a single number, because the useful
 * lesson is visible in the breakdown: one more word is worth more than every
 * decoration put together.
 */
export function entropyBreakdown(options: Options): Breakdown {
  const list = listFor(options);
  const words = Math.max(0, options.words) * bitsPerWord(list);
  const capitalization =
    options.capitalize === 'one-random' && options.words > 1 ? Math.log2(options.words) : 0;
  const digits = options.digits > 0 ? options.digits * Math.log2(10) : 0;
  const symbol = options.symbol ? Math.log2(SYMBOLS.length) : 0;
  return {
    words,
    capitalization,
    digits,
    symbol,
    total: words + capitalization + digits + symbol,
  };
}

/**
 * One passphrase.
 *
 * `randomIndex` is injected so the tests can drive a deterministic sequence;
 * the tool always passes the CSPRNG-backed sampler from lib/tools/random.
 * Words are drawn *with* replacement: sampling without it would change the
 * entropy (and lower it), and the difference is not worth an inaccurate
 * number on the screen.
 */
export function generatePassphrase(options: Options, randomIndex: (max: number) => number): string {
  const list = listFor(options);
  if (list.length < 2) throw new ImpossibleOptions('the wordlist needs at least two words');
  if (!Number.isInteger(options.words) || options.words < MIN_WORDS || options.words > MAX_WORDS) {
    throw new ImpossibleOptions(`the word count must be between ${MIN_WORDS} and ${MAX_WORDS}`);
  }
  if (!Number.isInteger(options.digits) || options.digits < 0 || options.digits > MAX_DIGITS) {
    throw new ImpossibleOptions(`the digit count must be between 0 and ${MAX_DIGITS}`);
  }

  const chosen: string[] = [];
  for (let i = 0; i < options.words; i += 1) chosen.push(list[randomIndex(list.length)]);

  if (options.capitalize === 'each') {
    for (let i = 0; i < chosen.length; i += 1) chosen[i] = capitalizeWord(chosen[i]);
  } else if (options.capitalize === 'one-random') {
    const which = randomIndex(chosen.length);
    chosen[which] = capitalizeWord(chosen[which]);
  }

  const separator = SEPARATORS[options.separator] ?? '-';
  let out = chosen.join(separator);

  if (options.digits > 0) {
    let digits = '';
    for (let i = 0; i < options.digits; i += 1) digits += String(randomIndex(10));
    out += separator + digits;
  }
  if (options.symbol) out += SYMBOLS[randomIndex(SYMBOLS.length)];

  return out;
}

function capitalizeWord(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Characters someone has to type, which is the cost side of the trade. */
export function typedLength(passphrase: string): number {
  return passphrase.length;
}

/**
 * Time to search half the keyspace at a given guess rate.
 *
 * The default is an offline attack on a fast hash with commodity GPUs — the
 * assumption worth designing against. A passphrase protecting something
 * behind a login faces a rate millions of times lower.
 */
export function guessTime(bits: number, guessesPerSecond = 1e11): string {
  if (bits <= 0) return 'instantly';
  const seconds = 2 ** (bits - 1) / guessesPerSecond;
  if (seconds < 1) return 'instantly';
  const units: [number, string][] = [
    [1, 'second'],
    [60, 'minute'],
    [3600, 'hour'],
    [86_400, 'day'],
    [31_557_600, 'year'],
  ];
  let chosen = units[0];
  for (const unit of units) if (seconds >= unit[0]) chosen = unit;
  const value = seconds / chosen[0];
  if (chosen[1] === 'year' && value >= 1e6) {
    return `1e${Math.floor(Math.log10(value))} years`;
  }
  const rounded = value < 10 ? value.toFixed(1) : Math.round(value).toLocaleString('en-US');
  return `${rounded} ${chosen[1]}${Math.abs(value - 1) < 1e-9 ? '' : 's'}`;
}

/** Bands, matching E01 so the two tools do not disagree about "strong". */
export type Strength = 'weak' | 'fair' | 'strong' | 'excessive';

export function strengthOf(bits: number): Strength {
  if (bits < 60) return 'weak';
  if (bits < 80) return 'fair';
  if (bits < 120) return 'strong';
  return 'excessive';
}
