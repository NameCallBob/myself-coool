import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS,
  composeHalfwidthKana,
  convertDash,
  convertEllipsis,
  convertPunctuation,
  convertQuotes,
  convertWidth,
  spaceCjkLatin,
  tidy,
  totalChanges,
  trimAroundFullwidth,
  type Options,
} from './logic.ts';

const options = (patch: Partial<Options> = {}): Options => ({ ...DEFAULTS, ...patch });
const off = (patch: Partial<Options> = {}): Options =>
  options({
    spaceCjkLatin: false,
    width: 'keep',
    punctuation: 'keep',
    trimAroundFullwidth: false,
    ...patch,
  });

test('a space goes between CJK and Latin, both ways, and only once', () => {
  assert.equal(spaceCjkLatin('這個API回傳200')[0], '這個 API 回傳 200');
  assert.equal(spaceCjkLatin('中a中')[0], '中 a 中');
  assert.equal(spaceCjkLatin('這個 API')[0], '這個 API'); // already spaced
  assert.equal(spaceCjkLatin('全部都是中文')[0], '全部都是中文');
  assert.equal(spaceCjkLatin('all latin text')[0], 'all latin text');
  assert.equal(spaceCjkLatin('日本語とEnglish')[0], '日本語と English');
  assert.equal(spaceCjkLatin('한국어와English')[0], '한국어와 English');
  assert.equal(spaceCjkLatin('中文(abc)結尾')[0], '中文 (abc) 結尾');
  assert.equal(spaceCjkLatin('100%中文')[0], '100% 中文');
});

test('spacing counts what it inserted', () => {
  const [, n] = spaceCjkLatin('這個API回傳200');
  assert.equal(n, 3); // 個|A, I|回, 傳|2
  assert.equal(spaceCjkLatin('沒有拉丁字')[1], 0);
});

test('full-width letters and digits normalise to half-width, and back', () => {
  assert.equal(convertWidth('ＡＢＣ１２３', 'half')[0], 'ABC123');
  assert.equal(convertWidth('ＡＢＣ１２３', 'half')[1], 6);
  assert.equal(convertWidth('abc123', 'full')[0], 'ａｂｃ１２３');
  assert.equal(convertWidth('ABC', 'keep')[0], 'ABC');
  // Full-width punctuation is not a letter and is left to the punctuation rule.
  assert.equal(convertWidth('中文，。', 'half')[0], '中文，。');
  // Round trip.
  assert.equal(convertWidth(convertWidth('Hello 42', 'full')[0], 'half')[0], 'Hello 42');
});

test('contextual punctuation widens Chinese and narrows Latin', () => {
  assert.equal(convertPunctuation('你好,世界!', 'contextual')[0], '你好，世界！');
  assert.equal(convertPunctuation('他說:好', 'contextual')[0], '他說：好');
  assert.equal(convertPunctuation('中文(註)後', 'contextual')[0], '中文（註）後');
  assert.equal(convertPunctuation('結束。', 'contextual')[0], '結束。');
  // Latin text keeps its own punctuation.
  assert.equal(convertPunctuation('a,b. c!', 'contextual')[0], 'a,b. c!');
  assert.equal(convertPunctuation('Hello（world）', 'contextual')[0], 'Hello(world)');
  assert.equal(convertPunctuation('one，two', 'contextual')[0], 'one,two');
});

test('a dot or colon in front of Latin text is left alone — the case that matters', () => {
  // The whole reason for the guard: this must not become 檔案。txt.
  assert.equal(convertPunctuation('檔案.txt', 'contextual')[0], '檔案.txt');
  assert.equal(convertPunctuation('版本2.0中文', 'contextual')[0], '版本2.0中文');
  assert.equal(convertPunctuation('時間:12:30', 'contextual')[0], '時間:12:30');
  assert.equal(convertPunctuation('網址:http://a.b', 'contextual')[0], '網址:http://a.b');
  // With nothing Latin after it, the dot is a full stop.
  assert.equal(convertPunctuation('這是句子.', 'contextual')[0], '這是句子。');
  assert.equal(convertPunctuation('這是句子. 下一句', 'contextual')[0], '這是句子。 下一句');
});

test('forced punctuation modes ignore context entirely', () => {
  assert.equal(convertPunctuation('a,b.c', 'full')[0], 'a，b。c');
  assert.equal(convertPunctuation('中文，。、', 'half')[0], '中文,.,');
  assert.equal(convertPunctuation('anything', 'keep')[0], 'anything');
  assert.equal(convertPunctuation('a,b', 'keep')[1], 0);
});

test('ellipsis and dash runs collapse to the CJK forms', () => {
  assert.equal(convertEllipsis('等等...', 'cjk')[0], '等等……');
  assert.equal(convertEllipsis('等等....', 'cjk')[0], '等等……');
  assert.equal(convertEllipsis('等等…', 'cjk')[0], '等等……');
  assert.equal(convertEllipsis('等等...', 'single')[0], '等等…');
  assert.equal(convertEllipsis('a.b', 'cjk')[0], 'a.b'); // two dots or fewer: untouched
  assert.equal(convertEllipsis('等等...', 'keep')[0], '等等...');

  assert.equal(convertDash('中文--中文', 'cjk')[0], '中文——中文');
  assert.equal(convertDash('中文—中文', 'cjk')[0], '中文——中文');
  assert.equal(convertDash('中文--中文', 'single')[0], '中文—中文');
  // A command-line flag is not a dash.
  assert.equal(convertDash('npm run build --watch', 'cjk')[0], 'npm run build --watch');
  assert.equal(convertDash('中文——中文', 'cjk')[1], 0); // already right, no change reported
});

test('straight quotes pair by what precedes them, not by parity', () => {
  assert.equal(convertQuotes('他說 "好" 就走了', 'curly')[0], '他說 “好” 就走了');
  assert.equal(convertQuotes('"start" and "end"', 'curly')[0], '“start” and “end”');
  assert.equal(convertQuotes('他說 "好"', 'corner')[0], '他說 「好」');
  assert.equal(convertQuotes("he said 'yes'", 'curly')[0], 'he said ‘yes’');
  // An apostrophe is not a quote, in either style.
  assert.equal(convertQuotes("don't", 'curly')[0], 'don’t');
  assert.equal(convertQuotes("don't", 'corner')[0], 'don’t');
  assert.equal(convertQuotes('("quoted")', 'curly')[0], '(“quoted”)');
  assert.equal(convertQuotes('no quotes here', 'curly')[1], 0);
});

test('spaces against full-width punctuation come off, newlines do not', () => {
  assert.equal(trimAroundFullwidth('你好 ，世界')[0], '你好，世界');
  assert.equal(trimAroundFullwidth('你好，  世界')[0], '你好，世界');
  assert.equal(trimAroundFullwidth('第一句。\n第二句')[0], '第一句。\n第二句');
  assert.equal(trimAroundFullwidth('a, b')[0], 'a, b'); // half-width comma untouched
});

test('half-width katakana composes, and nothing else is normalised', () => {
  assert.equal(composeHalfwidthKana('ｶﾞｷﾞ')[0], 'ガギ');
  assert.equal(composeHalfwidthKana('ｱｲｳ')[0], 'アイウ');
  // Full-width Latin is left alone, unlike a whole-string NFKC.
  assert.equal(composeHalfwidthKana('ＡＢＣ')[0], 'ＡＢＣ');
  assert.equal(composeHalfwidthKana('no kana')[1], 0);
});

test('the pipeline order is what makes the result right', () => {
  // Ellipsis before punctuation: otherwise the first dot becomes 。
  const result = tidy('等等...然後呢', options({ ellipsis: 'cjk' }));
  assert.equal(result.text, '等等……然後呢');

  // Punctuation before spacing: a widened comma must not then be spaced.
  const spaced = tidy('你好,world', options());
  assert.equal(spaced.text, '你好，world');
});

test('a realistic paragraph, end to end', () => {
  const input = '\u9019\u500bAPI\u57282024\u5e74\u91cb\u51fa,\u652f\u63f4JSON\u8207CSV\u3002\u6a94\u6848.txt\u4e0d\u8981\u52d5,\uff29\uff24\u662fA1.';
  const result = tidy(input, options());
  // Spacing added around API / 2024 / JSON / CSV / ID / A1, the two commas
  // widened because a Chinese line owns them, ＩＤ narrowed to ID, and the two
  // things that must not move: 檔案.txt keeps its dot, the final dot becomes 。
  assert.equal(
    result.text,
    '\u9019\u500b API \u5728 2024 \u5e74\u91cb\u51fa\uff0c\u652f\u63f4 JSON \u8207 CSV\u3002\u6a94\u6848.txt \u4e0d\u8981\u52d5\uff0cID \u662f A1\u3002'
  );
  assert.ok(totalChanges(result.changes) > 0);
  assert.equal(result.changes.width, 2);
  assert.equal(result.changes.punctuation, 3);
});

test('every option off is the identity function', () => {
  const input = '這個API,檔案.txt "好" ...--ＡＢ';
  const result = tidy(
    input,
    off({ quotes: false, ellipsis: 'keep', dash: 'keep', composeKana: false, fullwidthSpace: false, dropSpaceBetweenCjk: false, collapseSpaces: false })
  );
  assert.equal(result.text, input);
  assert.equal(totalChanges(result.changes), 0);
});

test('empty and whitespace-only input is returned unchanged', () => {
  assert.equal(tidy('', options()).text, '');
  assert.equal(tidy('\n\n', options()).text, '\n\n');
  assert.equal(totalChanges(tidy('', options()).changes), 0);
});

test('line structure survives: CRLF, blank lines and indentation', () => {
  const input = '第一行API\r\n\r\n  第二行API';
  const result = tidy(input, options());
  assert.equal(result.text, '第一行 API\r\n\r\n  第二行 API');
});

test('emoji and astral characters are not treated as CJK', () => {
  assert.equal(tidy('中文\u{1F600}API', options()).text, '中文\u{1F600}API');
  assert.equal(tidy('\u{20BB7}API', options()).text, '\u{20BB7} API'); // Han Extension B is CJK
});

test('optional space squeezing only fires when asked', () => {
  assert.equal(tidy('中文 中文', options({ dropSpaceBetweenCjk: true })).text, '中文中文');
  assert.equal(tidy('中文 中文', options()).text, '中文 中文');
  assert.equal(tidy('a   b', options({ collapseSpaces: true })).text, 'a b');
  assert.equal(tidy('中文　中文', options({ fullwidthSpace: true, dropSpaceBetweenCjk: true })).text, '中文中文');
});

test('changes are counted per category', () => {
  const result = tidy('\u9019\u500b\uff21\uff30\uff29,\u652f\u63f4', options());
  assert.equal(result.text, '\u9019\u500b API\uff0c\u652f\u63f4');
  assert.equal(result.changes.width, 3); // ＡＰＩ
  assert.equal(result.changes.punctuation, 1); // the comma, Latin on the left, CJK on the right
  assert.equal(result.changes.spacesAdded, 1); // 個|A
  assert.equal(totalChanges(result.changes), 5);

  // A comma between two Latin tokens stays half-width even inside a Chinese line.
  const latinList = tidy('\u9019\u500bAPI,\uff21\uff22', options());
  assert.equal(latinList.text, '\u9019\u500b API,AB');
  assert.equal(latinList.changes.punctuation, 0);
});
