# Character data sources

Retrieved 2026-08-28. Seed files contain factual character memberships and
dictionary fields only; no source prose or examples are copied.

## Korean: 한국어문회 8급, 7급II, 7급

- Level definitions and cumulative exam structure: [한국어문회](https://www.hanja.re.kr/).
- Machine-readable membership cross-check: [TypoStudio/matchit-packs](https://github.com/TypoStudio/matchit-packs/tree/acaafc3a08594d220f303f7d4bad94cd2d1e50c8/language/hanja-grade), checked against the association's 50-character 8급 and 50-character additions for 7급II and 7급.
- 훈음: [HanjaDict](https://github.com/seyoungsong/hanjadict/tree/39bbc7ba04514ec5d29eee79259823fa720b7065), MIT license.

`kr-7geup.json` contains the 100 characters added across 7급II and 7급. Each
track row retains its exact badge and ordinal (`7급II` = 2, `7급` = 3).

## Japanese: 漢検 10級, 9級

- Official membership: [日本漢字能力検定 級別漢字表](https://www.kanken.or.jp/kanken/outline/data/outline_degree_national_list20200217.pdf), published by 日本漢字能力検定協会. It identifies 10級 as the 80 小学校一年生 characters and 9級 as the 160 小学校二年生 characters.
- Readings, meanings, stroke counts, and community JLPT mapping: [davidluzgouveia/kanji-data](https://github.com/davidluzgouveia/kanji-data/tree/00fd7079c3890f430759536f91aa5e854ec0ca4f), MIT-licensed structured KANJIDIC2 derivative. KANJIDIC2 is maintained by the Electronic Dictionary Research and Development Group under its published dictionary license.
- Shinjitai to kyūjitai facts: [dahlia/shinjitai-table](https://github.com/dahlia/shinjitai-table/tree/65fc03d9ad556d748d370c64d04c36d712df1708), derived from the official Jōyō table. Unihan 17 does not yet expose the proposed Japanese old-variant property.

The post-2010 JLPT does not publish an official per-kanji list. `jlpt` therefore
uses the dataset's documented `jlpt_new` mapping, falling back to its historical
level-4 mapping as N5 for `分` and `里`. `なし` truthfully marks characters with
no kun'yomi.

## Chinese: HSK 3.0 2026 HSK1, HSK2

- Official syllabus origin: [Chinese Testing International](https://www.chinesetest.cn/).
- Machine-readable official syllabus extraction: [profesorm/hsk30](https://github.com/profesorm/hsk30/tree/f3163ca6edff5d6b1e81afb1cd716bb78f5a958a), CC BY 4.0. HSK1 has 246 unique characters. HSK2 has 220 unique characters after unioning recognition and handwriting rows; five characters occur in both source categories.
- Tone-marked Mandarin, English definitions, traditional/simplified mappings, and `通用规范汉字表` positions: [Unicode Unihan 17.0.0](https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip), under the [Unicode data license](https://www.unicode.org/license.txt). Positions 1–3500 map to `一级字`, 3501–6500 to `二级字`, and 6501–8105 to `三级字`.

The HSK2 handwriting/recognition union repeats 95 HSK1 recognition characters.
Because the frozen schema stores one band per `(character, track)`, repeated
characters retain their earliest recognition band (`HSK 1`) while remaining
members of the HSK2 curriculum units.

## Canonical glyph and variant policy

Canonical keys use the single traditional mapping published by Unihan. A glyph
with multiple traditional mappings remains its own key to avoid inventing a
semantic choice. Every duplicate entry carries the complete known variant map,
so seeding files in any order preserves cross-track links.

| Canonical | KR | JP | CN |
| --- | --- | --- | --- |
| 學 | 學 | 学 | 学 |
| 藥 | 藥 | 薬 | 药 |
| 時 | 時 | 時 | 时 |
| 憂 | 憂 | 憂 | 忧 |
| 國 | 國 | 国 | 国 |
| 讀 | 讀 | 読 | 读 |
| 醫 | 醫 | 医 | 医 |
| 廣 | 廣 | 広 | 广 |
| 體 | 體 | 体 | 体 |

The first six seed files include only their published levels. Higher-level
characters in the table document variant spot-checks; they are not injected
into an unrelated beginner level.

Curriculum units group 8–10 characters by dictionary meaning into localized
themes such as `수와 시간`, `自然`, and `学习与语言`; mixed boundary units name
both represented themes.

# Example sentence sources

All selections require an exact target-glyph match, at least one Hangul syllable
for Korean rows, and no more than 24 Unicode code points. No row is generated,
machine-translated, back-translated, or paraphrased. Korean source text is
retained byte-for-byte as `translation_ko`; the UI suppresses that duplicate
instead of presenting it as a translation.

## Tatoeba corpus

Retrieved 2026-08-28 through the public [Tatoeba sentence search API](https://api.tatoeba.org/).
Every `Tatoeba #{id}` row links to
`https://tatoeba.org/sentences/show/{id}`, which carries the sentence,
contributor, and license record. Tatoeba exports are released under
[CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/), with some
individual entries under CC0. These rows use `source_kind: corpus`.

The frozen Tatoeba selection remains unchanged for Japanese and Chinese: 232
Japanese and 363 Chinese `(character, track)` pairs. The original two Korean
rows were replaced because their parenthetical gloss format did not meet the
required mixed-script convention.

## Korean public-domain corpus and textbook lanes

Retrieved 2026-08-29 from Korean Wikisource. Each row records the immutable
Wikisource revision as `#{oldid}` and links to
`https://ko.wikisource.org/w/index.php?oldid={oldid}`. That revision page
provides contributor history; Wikisource contributions are published under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Ruby readings
are display annotations, so rows retain the published Hanja base text and
surrounding Hangul without copying the ruby annotation into the sentence.

- [개역간이국한문한글판](https://ko.wikisource.org/w/index.php?oldid=361959),
  published in 1964 and marked public domain after its copyright expired in
  2014. Exact verse text supplies 99 rows; `source_kind: corpus`.
- [대한민국헌법 (제1호) 국한문](https://ko.wikisource.org/w/index.php?oldid=418801).
  The official 1948 constitutional text supplies 16 rows. Constitution and law
  text is excluded from copyright protection by
  [Copyright Act Article 7](https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1029423769);
  `source_kind: corpus`.
- [노동야학독본](https://ko.wikisource.org/w/index.php?oldid=431030), a 1908
  textbook by 유길준, marked `PD-old-100`. Exact page revisions `#423248` and
  `#425566` supply two rows; `source_kind: textbook`.
- [국민 소학 독본](https://ko.wikisource.org/w/index.php?oldid=415110), the
  1895 학부 textbook. Exact page revision `#436021` supplies one row;
  `source_kind: textbook`. The publication is public domain by age.
- [산중신곡](https://ko.wikisource.org/w/index.php?oldid=430664), 윤선도's
  1642 work, marked `PD-old-100`, supplies one exact line; `source_kind: corpus`.
- [3·1독립선언서](https://ko.wikisource.org/w/index.php?oldid=430581), the
  1919 declaration, marked `PD-old-100`, supplies one exact clause;
  `source_kind: corpus`.
- Seven rows from six exact sentences in 1946 [USAMGIK ordinances](https://ko.wikisource.org/wiki/분류:군정법령)
  supply `學`, `校`, `市`, `文`, `有`, `住`, and `紙`. They link to the
  immutable revisions of ordinances 102, 106, 104, 110, 112, and 123. These
  official laws are excluded from copyright protection by Copyright Act
  Article 7; `source_kind: corpus`.

These lanes cover 127 of 150 Korean `(character, kr)` pairs: 48 of 50 in 8급
and 79 of 100 in 7급. Across all tracks, 722 of 761 pairs now have rank-0
sentences; one existing extra rank makes 723 unique seeded sentence identities.

### Remaining Korean gaps

Each character below lacked a complete, exact, mixed-script sentence of at
most 24 code points in the licensed lanes above. Longer text, isolated labels,
parenthetical Hanja glosses, and incomplete clauses were rejected.

| Character | Reason |
| --- | --- |
| 小 | No qualifying licensed sentence found. |
| 寸 | No qualifying licensed sentence found. |
| 車 | No qualifying licensed sentence found. |
| 氣 | No qualifying licensed sentence found. |
| 午 | No qualifying licensed sentence found. |
| 場 | No qualifying licensed sentence found. |
| 電 | No qualifying licensed sentence found. |
| 足 | No qualifying licensed sentence found. |
| 直 | No qualifying licensed sentence found. |
| 漢 | No qualifying licensed sentence found. |
| 話 | No qualifying licensed sentence found. |
| 活 | No qualifying licensed sentence found. |
| 孝 | No qualifying licensed sentence found. |
| 旗 | No qualifying licensed sentence found. |
| 冬 | No qualifying licensed sentence found. |
| 登 | No qualifying licensed sentence found. |
| 林 | No qualifying licensed sentence found. |
| 夕 | No qualifying licensed sentence found. |
| 植 | No qualifying licensed sentence found. |
| 然 | No qualifying licensed sentence found. |
| 川 | No qualifying licensed sentence found. |
| 秋 | No qualifying licensed sentence found. |
| 夏 | No qualifying licensed sentence found. |

## Past-paper sourcing position

Past-paper sentences from 한국어문회 기출 문제, 漢検 過去問, or another exam
body are not copied into redistributable seed data without an explicit compatible
license or written permission. Current hard cap: **zero sentence rows per past
paper**. Published 배정한자 and grade-membership lists may be used only for the
factual curriculum membership they state, with citation; they do not authorize
copying question prose. Any future permission or open-license lane must be
documented here before its first row is added. No current sentence is derived
from a past paper.
