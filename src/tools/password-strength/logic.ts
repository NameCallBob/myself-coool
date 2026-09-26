/**
 * Password strength, estimated by finding the cheapest way to guess it.
 *
 * A character-class checkbox meter ("has an uppercase, a digit and a symbol —
 * strong!") rates `P@ssw0rd1` above `wintergreen bicycle`, which is backwards.
 * The approach here is the one zxcvbn established, reimplemented from scratch
 * for this page: look for the patterns a cracking rule set already knows —
 * dictionary words, the same word reversed, letter-to-digit substitutions,
 * keyboard runs, repeats, dates, sequences — then find the decomposition of
 * the password that a guesser would reach *soonest*, and report that. A
 * password is exactly as strong as its weakest complete explanation.
 *
 * How the arithmetic works, because the number is meaningless otherwise:
 *
 *  - Every match carries a guess count. A dictionary hit costs its rank in
 *    the list (so `password` is guess #1 or so, `wintergreen` much later),
 *    multiplied by how many capitalisation and substitution variants a
 *    guesser would have to try to reach that exact spelling.
 *  - Anything not covered by a match falls back to brute force over the
 *    character classes actually present.
 *  - Splitting a password into more pieces is itself information the attacker
 *    needs, so a k-piece decomposition pays a penalty of 10^4^(k-1) · k!.
 *    Without it, "abc"+"123" would look like two cheap guesses instead of one
 *    expensive composition.
 *  - The search runs entirely in log2 space. A 40-character random password
 *    is around 2^260 guesses, which is `Infinity` as a JavaScript number, and
 *    an estimator that silently saturates is worse than useless.
 *
 * Where this is deliberately different from zxcvbn: the brute-force fallback
 * uses the cardinality of the character classes present rather than a flat 10
 * per character. zxcvbn's choice is conservative on the assumption that few
 * passwords are actually random; it also means a genuinely random 20-character
 * password gets reported at 66 bits instead of 131. For a tool whose sibling
 * (E01) generates random passwords, understating them by a factor of 2^65
 * would be the bigger lie.
 *
 * What this cannot do: the lists here are a few hundred entries, not the
 * hundreds of millions in a real cracking dictionary. A password that is
 * common but not on this list will be over-rated. Treat a high score as
 * "no obvious pattern found", never as "safe".
 */

/* ── Lists ────────────────────────────────── */

/**
 * The most-guessed passwords, roughly in the order they appear in published
 * breach frequency lists, including the ones specific to Chinese-speaking
 * users (5201314, woaini, iloveyou variants) that English lists miss.
 * Position is the guess number, so order matters more than completeness.
 */
const TOP_PASSWORD_TEXT =
  '123456 password 123456789 12345678 12345 qwerty 1234567890 1234567 111111 1234 abc123 000000 iloveyou ' +
  '123123 dragon monkey letmein 1q2w3e4r 5201314 zaq12wsx password1 qwerty123 aa123456 654321 123321 666666 ' +
  '7777777 123qwe 1qaz2wsx 121212 qwertyuiop shadow master 112233 sunshine princess football baseball welcome ' +
  'admin login passw0rd starwars whatever hello freedom ninja azerty trustno1 batman superman michael jordan ' +
  'jennifer thomas hunter ranger buster soccer harley andrew charlie daniel ashley bailey summer george joshua ' +
  'matthew secret amanda cookie chicken maggie pokemon banana peanut purple orange yellow cheese silver samsung ' +
  'google taiwan nintendo ferrari porsche chelsea liverpool arsenal barcelona juventus asdfgh asdfasdf qazwsx ' +
  'zxcvbnm a123456 abcd1234 p@ssw0rd iloveyou1 123456a woaini woaini1314 taiwan123 asdf1234 1234qwer q1w2e3r4 ' +
  'abc12345 test123 test1234 root toor guest user oracle default changeme letmein1 access mustang shadow1 ' +
  'pepper jesus computer michelle tigger robert 696969 159753 147258369 987654321 88888888 11223344 love ' +
  'lovely sweety angel baby happy asdasd qweqwe zxczxc 1q2w3e 1234567891 987654 456789 abcdef abcdefg ' +
  'abcabc aaaaaa bbbbbb qwer1234 asd123 asdfghjkl poiuytrewq mnbvcxz apple android windows internet email ' +
  'server database mysql postgres redis docker jenkins gitlab github bitcoin blockchain crypto wallet ' +
  'family friend forever sweetheart darling honey kitten puppy flower sakura tokyo taipei kaohsiung taichung ' +
  'school student teacher office company manager boss salary money rich lucky dream future hope smile ' +
  'birthday newyear christmas halloween summer2024 summer2023 spring2024 winter2024 january february march ' +
  'april may june july august september november december monday friday sunday football1 soccer1 basketball ' +
  'volleyball badminton swimming running cycling gaming player gamer console keyboard mouse monitor laptop';

/**
 * Common English words, roughly frequency-ordered, plus the given names and
 * nouns that show up in passwords. A hit here is cheap but not as cheap as a
 * top-password hit, which is what the ordering encodes.
 */
const COMMON_WORD_TEXT =
  'the be to of and in that have it for not on with he as you do at this but his by from they we say her she ' +
  'or an will my one all would there their what so up out if about who get which go me when make can like ' +
  'time no just him know take people into year your good some could them see other than then now look only ' +
  'come its over think also back after use two how our work first well way even new want because any these ' +
  'give day most us love life world home house water fire earth wind light dark night day moon star sun sky ' +
  'cloud rain snow storm river ocean mountain forest tree flower grass stone sand metal gold silver iron ' +
  'copper steel glass paper wood cotton leather plastic money bank card cash price cost pay buy sell shop ' +
  'store market office company business team group friend family father mother brother sister child baby boy ' +
  'girl man woman person people student teacher doctor nurse driver farmer worker player master king queen ' +
  'prince princess hero angel devil dragon tiger lion bear wolf eagle shark snake horse dog cat bird fish ' +
  'mouse rabbit monkey panda elephant dolphin butterfly spider bee ant apple orange banana grape lemon peach ' +
  'cherry melon mango berry bread rice noodle pizza burger coffee tea milk juice water beer wine cake candy ' +
  'sugar salt pepper garlic onion tomato potato carrot corn bean egg meat chicken beef pork fish soup salad ' +
  'red blue green yellow purple orange pink brown black white gray silver golden bright shiny soft hard warm ' +
  'cold hot cool fresh clean dirty new old young fast slow big small tall short long wide thin thick heavy ' +
  'light strong weak happy sad angry calm quiet loud funny serious smart clever brave shy kind mean nice ' +
  'good bad best worst first last next final start begin end stop pause play run walk jump climb swim fly ' +
  'drive ride sleep wake eat drink read write speak listen watch look see hear touch feel think know learn ' +
  'teach help work rest game sport music song dance movie film book story poem art paint draw photo picture ' +
  'phone computer laptop tablet screen keyboard mouse camera radio clock watch door window wall floor roof ' +
  'room kitchen garden park street road city town village country island beach desert jungle space planet ' +
  'rocket robot machine engine wheel train plane ship boat car bike bus taxi truck michael john david james ' +
  'robert william richard joseph thomas charles daniel matthew anthony mark steven andrew kevin brian george ' +
  'edward ronald timothy jason jeffrey ryan jacob gary nicholas eric jonathan stephen larry justin scott ' +
  'brandon frank benjamin gregory samuel raymond patrick alexander jack dennis jerry mary patricia jennifer ' +
  'linda elizabeth barbara susan jessica sarah karen nancy lisa betty helen sandra donna carol ruth sharon ' +
  'michelle laura sarah kimberly deborah dorothy amy angela ashley brenda emma olivia cynthia marie janet ' +
  'catherine frances christine samantha debra rachel carolyn janet virginia maria heather diane julie joyce ' +
  'victoria kelly christina joan evelyn lauren judith megan cheryl andrea hannah martha jacqueline'

;

/**
 * A second tier: 2048 ordinary English words, alphabetically. Alphabetical
 * order means a rank here is not a frequency, so every word in this tier
 * costs roughly the same — about 11 bits once the tier offset is counted,
 * which is the right order of magnitude for "a word someone might pick" and
 * is stated on the page rather than implied.
 */
const BULK_WORD_TEXT =
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

const splitList = (text: string): string[] => {
  const seen = new Set<string>();
  for (const word of text.trim().split(/\s+/)) {
    if (word.length >= 3) seen.add(word.toLowerCase());
  }
  return [...seen];
};

export const TOP_PASSWORDS: string[] = splitList(TOP_PASSWORD_TEXT);
export const COMMON_WORDS: string[] = splitList(`${COMMON_WORD_TEXT} ${BULK_WORD_TEXT}`);

/** rank = guess number. Both lists are searched; the cheaper hit wins. */
type Ranked = { rank: number; source: 'passwords' | 'words' };

function buildIndex(): Map<string, Ranked> {
  const index = new Map<string, Ranked>();
  TOP_PASSWORDS.forEach((word, i) => index.set(word, { rank: i + 1, source: 'passwords' }));
  COMMON_WORDS.forEach((word, i) => {
    const existing = index.get(word);
    // A word in both lists keeps the cheaper (earlier) rank.
    const rank = i + 1;
    if (!existing || rank < existing.rank) index.set(word, { rank, source: 'words' });
  });
  return index;
}

const INDEX = buildIndex();

/** Longest entry in either list — the window the dictionary scan needs. */
const LONGEST = [...INDEX.keys()].reduce((max, word) => Math.max(max, word.length), 0);

/* ── Matches ──────────────────────────────── */

export type MatchKind =
  | 'dictionary'
  | 'reversed'
  | 'leet'
  | 'sequence'
  | 'repeat'
  | 'keyboard'
  | 'date'
  | 'bruteforce';

export type Match = {
  kind: MatchKind;
  /** Inclusive start and end offsets in the password. */
  i: number;
  j: number;
  token: string;
  /** log2 of the guesses this match costs. Log space: 2^260 is not a number. */
  log2Guesses: number;
  /** Machine-readable specifics, for the UI to explain the finding. */
  detail: { word?: string; rank?: number; source?: string; turns?: number; year?: number; base?: string; repeats?: number };
};

/** Above this length the O(n²) scans are pointless — the password has won. */
export const MAX_LENGTH = 128;

const log2 = (value: number) => Math.log2(value);

/* Capitalisation and substitution variants ── */

/**
 * How many capitalisations a guesser must try to reach this exact spelling.
 *
 * All lower case is free. The three habits — Capitalised, ALL CAPS, last
 * letter capitalised — cost a factor of 2 between them. Anything else costs
 * the number of ways to choose which letters are upper case.
 */
export function capitalizationVariants(token: string): number {
  if (token === token.toLowerCase()) return 1;
  if (/^[^a-z]*[A-Z][^A-Z]*$/.test(token) && token.slice(1) === token.slice(1).toLowerCase()) return 2;
  if (token === token.toUpperCase()) return 2;
  if (/^[^A-Z]*[A-Z]$/.test(token)) return 2;

  const upper = [...token].filter((character) => /[A-Z]/.test(character)).length;
  const lower = [...token].filter((character) => /[a-z]/.test(character)).length;
  let total = 0;
  for (let i = 1; i <= Math.min(upper, lower); i += 1) total += choose(upper + lower, i);
  return Math.max(1, total);
}

export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i += 1) result = (result * (n - i)) / (i + 1);
  return Math.round(result);
}

/** The substitutions every cracking rule set applies. */
export const LEET: Record<string, string> = {
  '4': 'a',
  '@': 'a',
  '8': 'b',
  '(': 'c',
  '3': 'e',
  '6': 'g',
  '1': 'l',
  '!': 'i',
  '0': 'o',
  '$': 's',
  '5': 's',
  '7': 't',
  '+': 't',
  '2': 'z',
};

/** `p@ssw0rd` → `password`. One pass, the substitutions applied greedily. */
export function unleet(token: string): { plain: string; substitutions: number } {
  let plain = '';
  let substitutions = 0;
  for (const character of token) {
    const replacement = LEET[character];
    if (replacement) {
      plain += replacement;
      substitutions += 1;
    } else {
      plain += character;
    }
  }
  return { plain, substitutions };
}

/**
 * Cost of the substitution pattern: the ways of choosing which of the
 * eligible letters were substituted. `p@ssword` (one of two a-positions) is
 * cheaper to reach than a password with every vowel swapped.
 */
export function leetVariants(token: string, plain: string): number {
  let total = 1;
  const substituted = new Map<string, number>();
  const unsubstituted = new Map<string, number>();
  for (let i = 0; i < token.length && i < plain.length; i += 1) {
    const replacement = LEET[token[i]];
    if (replacement) substituted.set(replacement, (substituted.get(replacement) ?? 0) + 1);
    else if (/[a-z]/i.test(token[i])) {
      const lower = token[i].toLowerCase();
      unsubstituted.set(lower, (unsubstituted.get(lower) ?? 0) + 1);
    }
  }
  for (const [letter, count] of substituted) {
    const clean = unsubstituted.get(letter) ?? 0;
    if (clean === 0) {
      total *= 2;
      continue;
    }
    let ways = 0;
    for (let i = 1; i <= Math.min(count, count + clean); i += 1) ways += choose(count + clean, i);
    total *= Math.max(2, ways);
  }
  return total;
}

/* Dictionary, reversed, and l33t ──────────── */

export function dictionaryMatches(password: string): Match[] {
  const found: Match[] = [];
  const lower = password.toLowerCase();
  const reversedLower = [...lower].reverse().join('');

  for (let i = 0; i < password.length; i += 1) {
    // j is inclusive, and the window is the longest entry in either list.
    for (let j = i + 2; j < password.length && j - i + 1 <= LONGEST; j += 1) {
      const token = password.slice(i, j + 1);
      const plainLower = lower.slice(i, j + 1);

      const direct = INDEX.get(plainLower);
      if (direct) {
        found.push({
          kind: 'dictionary',
          i,
          j,
          token,
          log2Guesses: log2(direct.rank * capitalizationVariants(token)),
          detail: { word: plainLower, rank: direct.rank, source: direct.source },
        });
      }

      // Reversed: the same list, read backwards. A guesser tries both, which
      // is one extra bit, not a new keyspace.
      const backwards = reversedLower.slice(password.length - 1 - j, password.length - i);
      const reverseHit = INDEX.get(backwards);
      if (reverseHit && backwards !== plainLower) {
        found.push({
          kind: 'reversed',
          i,
          j,
          token,
          log2Guesses: log2(reverseHit.rank * capitalizationVariants(token) * 2),
          detail: { word: backwards, rank: reverseHit.rank, source: reverseHit.source },
        });
      }

      // Substituted: only worth checking when something was substituted.
      const { plain, substitutions } = unleet(plainLower);
      if (substitutions > 0 && plain !== plainLower) {
        const leetHit = INDEX.get(plain);
        if (leetHit) {
          found.push({
            kind: 'leet',
            i,
            j,
            token,
            log2Guesses: log2(
              leetHit.rank * capitalizationVariants(token) * leetVariants(plainLower, plain)
            ),
            detail: { word: plain, rank: leetHit.rank, source: leetHit.source },
          });
        }
      }
    }
  }
  return found;
}

/* Sequences ────────────────────────────────── */

const SEQUENCES: { name: string; characters: string }[] = [
  { name: 'digits', characters: '0123456789' },
  { name: 'lower', characters: 'abcdefghijklmnopqrstuvwxyz' },
  { name: 'upper', characters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
];

/**
 * Runs like `abcdef`, `4567`, `zyxw`.
 *
 * Cost follows zxcvbn: a run starting at an obvious place (a, A, z, 0, 1, 9)
 * costs 4 before length is taken into account, anything else 10, doubled when
 * the run descends — because a guesser tries ascending first.
 */
export function sequenceMatches(password: string): Match[] {
  const found: Match[] = [];
  for (const { name, characters } of SEQUENCES) {
    for (let i = 0; i < password.length; i += 1) {
      const start = characters.indexOf(password[i]);
      if (start < 0) continue;
      for (const step of [1, -1]) {
        let length = 1;
        while (
          i + length < password.length &&
          characters[start + step * length] === password[i + length]
        ) {
          length += 1;
        }
        if (length < 3) continue;
        const token = password.slice(i, i + length);
        const obvious = 'aAzZ019'.includes(token[0]);
        const base = obvious ? 4 : 10;
        found.push({
          kind: 'sequence',
          i,
          j: i + length - 1,
          token,
          log2Guesses: log2(base * length * (step === -1 ? 2 : 1)),
          detail: { base: name },
        });
      }
    }
  }
  return found;
}

/* Repeats ─────────────────────────────────── */

/**
 * `aaaa`, `abcabcabc`, `!@#!@#`.
 *
 * The cost is the cost of guessing the repeated unit, times the number of
 * repeats — repeating something adds almost nothing, which is the point.
 */
export function repeatMatches(password: string): Match[] {
  const found: Match[] = [];
  for (let i = 0; i < password.length; i += 1) {
    for (let unit = 1; unit <= Math.floor((password.length - i) / 2); unit += 1) {
      const base = password.slice(i, i + unit);
      let repeats = 1;
      while (password.slice(i + repeats * unit, i + (repeats + 1) * unit) === base) repeats += 1;
      if (repeats < 2) continue;
      const token = password.slice(i, i + repeats * unit);
      // The unit's own cost: a single character is cheap, a longer unit gets
      // priced by brute force over the classes it uses.
      const unitLog2 = log2(bruteforceCardinality(base)) * unit;
      found.push({
        kind: 'repeat',
        i,
        j: i + repeats * unit - 1,
        token,
        log2Guesses: unitLog2 + log2(repeats),
        detail: { base, repeats },
      });
      // Only the longest repeat starting here is interesting.
      break;
    }
  }
  return found;
}

/* Keyboard runs ───────────────────────────── */

/**
 * US QWERTY and the number pad, as staggered rows. The adjacency graph is
 * derived from the geometry rather than written out: a key is adjacent to its
 * left and right neighbours and to the two keys nearest above and below.
 */
const QWERTY_ROWS = ['`1234567890-=', 'qwertyuiop[]\\', "asdfghjkl;'", 'zxcvbnm,./'];
const QWERTY_SHIFTED = ['~!@#$%^&*()_+', 'QWERTYUIOP{}|', 'ASDFGHJKL:"', 'ZXCVBNM<>?'];
const PAD_ROWS = ['789', '456', '123', ' 0'];

function buildGraph(rows: string[], shifted?: string[]): { graph: Map<string, Set<string>>; keys: Set<string> } {
  const graph = new Map<string, Set<string>>();
  const keys = new Set<string>();
  const at = (row: number, column: number): string[] => {
    const out: string[] = [];
    const line = rows[row];
    if (!line || column < 0 || column >= line.length) return out;
    if (line[column] !== ' ') out.push(line[column]);
    const shift = shifted?.[row];
    if (shift && column < shift.length && shift[column] !== ' ') out.push(shift[column]);
    return out;
  };
  for (let row = 0; row < rows.length; row += 1) {
    for (let column = 0; column < rows[row].length; column += 1) {
      for (const key of at(row, column)) {
        keys.add(key);
        const neighbours = graph.get(key) ?? new Set<string>();
        for (const offset of [-1, 1]) for (const near of at(row, column + offset)) neighbours.add(near);
        for (const rowOffset of [-1, 1]) {
          for (const columnOffset of [0, -1, 1]) {
            for (const near of at(row + rowOffset, column + columnOffset)) neighbours.add(near);
          }
        }
        graph.set(key, neighbours);
      }
    }
  }
  return { graph, keys };
}

const QWERTY = buildGraph(QWERTY_ROWS, QWERTY_SHIFTED);
const PAD = buildGraph(PAD_ROWS);

/** Average number of neighbours — the branching factor a guesser faces. */
function averageDegree(graph: Map<string, Set<string>>): number {
  let total = 0;
  for (const neighbours of graph.values()) total += neighbours.size;
  return graph.size > 0 ? total / graph.size : 0;
}

const QWERTY_DEGREE = averageDegree(QWERTY.graph);
const PAD_DEGREE = averageDegree(PAD.graph);

/**
 * `qwerty`, `1qaz2wsx`, `789456`.
 *
 * Cost is zxcvbn's spatial estimate: for a run of length L with T direction
 * changes, sum over lengths and turn counts of (ways to place the turns) ×
 * (starting positions) × (degree ^ turns).
 */
export function keyboardMatches(password: string): Match[] {
  const found: Match[] = [];
  for (const { graph, keys, degree, name } of [
    { ...QWERTY, degree: QWERTY_DEGREE, name: 'qwerty' },
    { ...PAD, degree: PAD_DEGREE, name: 'keypad' },
  ]) {
    let i = 0;
    while (i < password.length - 2) {
      if (!keys.has(password[i])) {
        i += 1;
        continue;
      }
      let j = i;
      let turns = 0;
      let lastDirection: string | null = null;
      while (j + 1 < password.length && (graph.get(password[j])?.has(password[j + 1]) ?? false)) {
        const direction = `${password[j]}>${password[j + 1]}`;
        if (lastDirection !== null && direction !== lastDirection) turns += 1;
        lastDirection = direction;
        j += 1;
      }
      const length = j - i + 1;
      if (length >= 3) {
        found.push({
          kind: 'keyboard',
          i,
          j,
          token: password.slice(i, j + 1),
          log2Guesses: log2(spatialGuesses(length, turns, keys.size, degree)),
          detail: { base: name, turns },
        });
        i = j;
      } else {
        i += 1;
      }
    }
  }
  return found;
}

export function spatialGuesses(length: number, turns: number, starts: number, degree: number): number {
  let guesses = 0;
  for (let i = 2; i <= length; i += 1) {
    for (let j = 1; j <= Math.min(turns + 1, i - 1); j += 1) {
      guesses += choose(i - 1, j - 1) * starts * degree ** j;
    }
  }
  return Math.max(guesses, starts);
}

/* Dates ───────────────────────────────────── */

/** The year a guesser centres on. Dates near it are cheaper. */
export const REFERENCE_YEAR = 2025;

/**
 * Four- to eight-digit runs that read as dates, and separated forms like
 * `1990-01-01` or `3/14/79`.
 *
 * Cost is 365 days × the distance from the reference year, doubled when a
 * separator is present (the guesser has to try each separator).
 */
export function dateMatches(password: string): Match[] {
  const found: Match[] = [];

  const push = (i: number, j: number, year: number, separated: boolean) => {
    const distance = Math.max(Math.abs(year - REFERENCE_YEAR), 20);
    found.push({
      kind: 'date',
      i,
      j,
      token: password.slice(i, j + 1),
      log2Guesses: log2(365 * distance * (separated ? 4 : 1)),
      detail: { year },
    });
  };

  // A bare year on its own is a date too, and a very common one.
  for (const match of password.matchAll(/(19[0-9]{2}|20[0-2][0-9])/g)) {
    const i = match.index ?? 0;
    push(i, i + 3, Number(match[1]), false);
  }

  // yyyymmdd / ddmmyyyy / yymmdd, taken as whole digit runs.
  for (const match of password.matchAll(/[0-9]{6,8}/g)) {
    const i = match.index ?? 0;
    const digits = match[0];
    const year = plausibleYear(digits);
    if (year !== null) push(i, i + digits.length - 1, year, false);
  }

  // Separated forms.
  for (const match of password.matchAll(/([0-9]{1,4})[-./]([0-9]{1,2})[-./]([0-9]{1,4})/g)) {
    const i = match.index ?? 0;
    const first = Number(match[1]);
    const last = Number(match[3]);
    const year = first > 31 ? first : last > 31 ? last : last + (last < 30 ? 2000 : 1900);
    push(i, i + match[0].length - 1, year, true);
  }

  return found;
}

function plausibleYear(digits: string): number | null {
  const candidates =
    digits.length === 8
      ? [digits.slice(0, 4), digits.slice(4)]
      : digits.length === 6
        ? [`19${digits.slice(0, 2)}`, `20${digits.slice(0, 2)}`, `19${digits.slice(4)}`, `20${digits.slice(4)}`]
        : [digits.slice(0, 4), digits.slice(digits.length - 4)];
  for (const candidate of candidates) {
    const year = Number(candidate);
    if (year >= 1900 && year <= REFERENCE_YEAR + 5) return year;
  }
  return null;
}

/* ── Brute force fallback ─────────────────── */

/**
 * The alphabet a guesser would have to sweep for an unrecognised run: the
 * classes actually present, not the union of every class on the keyboard.
 */
export function bruteforceCardinality(token: string): number {
  let cardinality = 0;
  if (/[a-z]/.test(token)) cardinality += 26;
  if (/[A-Z]/.test(token)) cardinality += 26;
  if (/[0-9]/.test(token)) cardinality += 10;
  if (/[ !"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(token)) cardinality += 33;
  // Anything outside ASCII: counted conservatively, because an attacker who
  // knows a CJK character is in there has a far smaller space than Unicode.
  if (/[^\x20-\x7e]/.test(token)) cardinality += 1000;
  return Math.max(cardinality, 1);
}

/* ── The search ───────────────────────────── */

export function allMatches(password: string): Match[] {
  const text = password.slice(0, MAX_LENGTH);
  return [
    ...dictionaryMatches(text),
    ...sequenceMatches(text),
    ...repeatMatches(text),
    ...keyboardMatches(text),
    ...dateMatches(text),
  ];
}

export type Estimate = {
  /** log2 of the estimated guesses — the entropy, in bits. */
  bits: number;
  /** The cheapest complete explanation of the password. */
  sequence: Match[];
  /** 0–4, the familiar five-band score. */
  score: number;
  /** Fraction of the password explained by a known pattern. */
  coverage: number;
  truncated: boolean;
};

/** 10^4 per extra piece, the penalty for a longer decomposition. */
const PIECE_PENALTY = log2(10_000);

/**
 * Cheapest decomposition, by dynamic programming in log2 space.
 *
 * `best[j][k]` is the smallest total log2-guesses for covering the first j+1
 * characters with exactly k pieces. The piece-count penalty is applied once at
 * the end rather than inside the recurrence, which is what makes the search
 * exact instead of greedy: a two-piece explanation can beat a one-piece one
 * only after the penalty is counted, and that depends on k.
 */
export function estimate(password: string): Estimate {
  const text = password.slice(0, MAX_LENGTH);
  const truncated = password.length > MAX_LENGTH;
  if (text === '') return { bits: 0, sequence: [], score: 0, coverage: 0, truncated };

  const n = text.length;
  const byEnd: Match[][] = Array.from({ length: n }, () => []);
  for (const match of allMatches(text)) byEnd[match.j].push(match);
  // Brute-force pieces, one per (start, end) run, so every span is coverable.
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i <= j; i += 1) {
      const token = text.slice(i, j + 1);
      byEnd[j].push({
        kind: 'bruteforce',
        i,
        j,
        token,
        log2Guesses: log2(bruteforceCardinality(token)) * token.length,
        detail: {},
      });
    }
  }

  const INF = Number.POSITIVE_INFINITY;
  const best: number[][] = Array.from({ length: n }, () => new Array<number>(n + 1).fill(INF));
  const from: (Match | null)[][] = Array.from({ length: n }, () => new Array<Match | null>(n + 1).fill(null));

  for (let j = 0; j < n; j += 1) {
    for (const match of byEnd[j]) {
      if (match.i === 0) {
        if (match.log2Guesses < best[j][1]) {
          best[j][1] = match.log2Guesses;
          from[j][1] = match;
        }
        continue;
      }
      const previous = match.i - 1;
      for (let k = 1; k < n; k += 1) {
        if (best[previous][k] === INF) continue;
        const total = best[previous][k] + match.log2Guesses;
        if (total < best[j][k + 1]) {
          best[j][k + 1] = total;
          from[j][k + 1] = match;
        }
      }
    }
  }

  let bits = INF;
  let pieces = 1;
  for (let k = 1; k <= n; k += 1) {
    if (best[n - 1][k] === INF) continue;
    const total = best[n - 1][k] + (k - 1) * PIECE_PENALTY + log2Factorial(k);
    if (total < bits) {
      bits = total;
      pieces = k;
    }
  }
  if (bits === INF) bits = log2(bruteforceCardinality(text)) * n;

  // Walk the chosen decomposition back out.
  const sequence: Match[] = [];
  let end = n - 1;
  let k = pieces;
  while (end >= 0 && k > 0) {
    const match = from[end][k];
    if (!match) break;
    sequence.unshift(match);
    end = match.i - 1;
    k -= 1;
  }

  const covered = coverage(sequence, n);
  return { bits, sequence, score: scoreOf(bits, covered), truncated, coverage: covered };
}

/** Fraction of characters explained by a known pattern rather than brute force. */
export function coverage(sequence: readonly Match[], length: number): number {
  if (length === 0) return 0;
  let covered = 0;
  for (const match of sequence) {
    if (match.kind !== 'bruteforce') covered += match.j - match.i + 1;
  }
  return covered / length;
}

function log2Factorial(k: number): number {
  let total = 0;
  for (let i = 2; i <= k; i += 1) total += log2(i);
  return total;
}

/**
 * Five bands. The thresholds are guess counts, not character counts:
 * 10^3 is what an unthrottled login form absorbs in a minute; 10^6 falls to a
 * laptop; 10^8 to a GPU-hour; 10^10 is where an offline attack on a fast hash
 * starts costing real money.
 */
export function scoreOf(bits: number, patternCoverage = 0): number {
  const band = bits < log2(1e3) ? 0 : bits < log2(1e6) ? 1 : bits < log2(1e8) ? 2 : bits < log2(1e10) ? 3 : 4;
  // Deliberate deviation from the pure guess-count band: when most of the
  // password is made of patterns a rule set already knows, the 10^4-per-piece
  // penalty is doing the flattering. It is an average over real passwords —
  // fair for a mixed password, far too generous for `michael1990`, which is
  // two known pieces and nothing else. Below 50 bits, a mostly-explained
  // password is capped at "okay".
  if (patternCoverage >= 0.6 && bits < 50) return Math.min(band, 2);
  return band;
}

/* ── Time to guess ────────────────────────── */

/**
 * Seconds to exhaust half the space, formatted. Works in log space
 * throughout, so 2^300 guesses prints a number instead of `Infinity`.
 */
export function guessTime(bits: number, guessesPerSecond: number): string {
  const log2Seconds = bits - 1 - log2(guessesPerSecond);
  if (log2Seconds < 0) return 'instantly';
  const units: [number, string][] = [
    [1, 'second'],
    [60, 'minute'],
    [3600, 'hour'],
    [86_400, 'day'],
    [31_557_600, 'year'],
  ];
  let chosen = units[0];
  for (const unit of units) if (log2Seconds >= log2(unit[0])) chosen = unit;
  const log2Value = log2Seconds - log2(chosen[0]);
  if (chosen[1] === 'year' && log2Value > 20) {
    return `1e${Math.floor((log2Value * Math.LN2) / Math.LN10)} years`;
  }
  const value = 2 ** log2Value;
  const rounded = value < 10 ? value.toFixed(1) : Math.round(value).toLocaleString('en-US');
  return `${rounded} ${chosen[1]}${Math.abs(value - 1) < 1e-9 ? '' : 's'}`;
}

/* ── Advice ───────────────────────────────── */

export type AdviceCode =
  | 'empty'
  | 'too-short'
  | 'top-password'
  | 'dictionary-word'
  | 'reversed-word'
  | 'leet-substitution'
  | 'keyboard-run'
  | 'sequence'
  | 'repeat'
  | 'date'
  | 'single-piece'
  | 'add-length'
  | 'looks-random'
  | 'list-is-small';

/**
 * What to say, as codes the UI turns into sentences. Ordered by how much
 * difference acting on it would make.
 */
export function adviceFor(password: string, result: Estimate): AdviceCode[] {
  if (password === '') return ['empty'];
  const codes: AdviceCode[] = [];
  const kinds = new Set(result.sequence.map((match) => match.kind));

  if (password.length < 12) codes.push('too-short');
  const top = result.sequence.find(
    (match) => match.detail.source === 'passwords' && (match.detail.rank ?? Infinity) <= 200
  );
  if (top) codes.push('top-password');
  if (kinds.has('dictionary') && !top) codes.push('dictionary-word');
  if (kinds.has('reversed')) codes.push('reversed-word');
  if (kinds.has('leet')) codes.push('leet-substitution');
  if (kinds.has('keyboard')) codes.push('keyboard-run');
  if (kinds.has('sequence')) codes.push('sequence');
  if (kinds.has('repeat')) codes.push('repeat');
  if (kinds.has('date')) codes.push('date');

  if (result.sequence.length === 1 && kinds.has('bruteforce') && result.score >= 3) {
    codes.push('looks-random');
  }
  if (result.score < 3 && codes.length === 0) codes.push('add-length');
  codes.push('list-is-small');
  return codes;
}
