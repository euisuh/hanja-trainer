# Character data sources

Retrieved 2026-08-30. Seed files contain factual character memberships and
dictionary fields only; no source prose or examples are copied.

## Korean: 한국어문회 8급 through 4급

- Level definitions and membership: [한국어문회 급수배정](https://www.hanja.re.kr/kccpt/exam/levelConfirm.do). Its published `전체배정한자` XLS (retrieved 2026-08-30, SHA-256 `97b8db715ebe1dd6e00e8e58d338a9ba70e7420bf5ec84da38f987d60eb64b17`) gives exact grade deltas of 50/50/50/75/75/100/100/250/250 and cumulative reading counts of 50, 100, 150, 225, 300, 400, 500, 750, and 1,000 from 8급 through 4급.
- Machine-readable factual membership cross-check: [TypoStudio/matchit-packs](https://github.com/TypoStudio/matchit-packs/tree/acaafc3a08594d220f303f7d4bad94cd2d1e50c8/language/hanja-grade). Every normalized glyph set through level 9 matches the association XLS exactly. The repository publishes no license, so only factual membership is used; none of its explanatory prose is copied.
- 훈음: [HanjaDict](https://github.com/seyoungsong/hanjadict/tree/39bbc7ba04514ec5d29eee79259823fa720b7065), MIT license. The pinned `src/hanjadict/table.json` has SHA-256 `d36ceb0d37ed53b9af78a88517ebc1499502cdef0367c396ff723460af52e471`.
- English dictionary definitions and total stroke counts: [Unicode Unihan 17.0.0](https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip) `kDefinition` and `kTotalStrokes`, under the [Unicode data license](https://www.unicode.org/license.txt). Pinned inputs are SHA-256 `575e69c9ad85a4737a889a4f94cbd987042a90a1a6cc16dd3f4ed995c715b17c` (`Unihan_Readings.txt`) and `d1c817dd7db84295dab0643c277d97c2fa742c245f8824e6736c2a0935095325` (`Unihan_IRGSources.txt`).

`kr-7geup.json` contains the 100 characters added across 7급II and 7급. Each
track row retains its exact badge and ordinal (`7급II` = 2, `7급` = 3).
The six higher files contain the exact additions for `6급II` (75), `6급`
(75), `5급II` (100), `5급` (100), `4급II` (250), and `4급` (250), with
ordinals 4–9. Compatibility
forms `樂` and `宅` in the cross-check pack are normalized to their canonical
Unicode forms `樂` and `宅` before HanjaDict and Unihan lookup. Curriculum
units are deterministically grouped by sourced dictionary definitions into
8–10-character units; their title terms come directly from sourced 훈음.
`scripts/generate-kr-through-4geup.mjs` reproduces the six character and
sentence files from checkouts of the pinned grade pack and HanjaDict plus an
extracted Unihan directory; it performs no network lookup and emits no sentence
prose.

Coverage stops at 4급 in this pass. Extending through 3급II, 3급, 2급, or 1급
remains a follow-up because those tiers add at least 500 more characters and
require a separate content and QA pass.

## Japanese: 漢検 10級 through 8級

- Official membership: [日本漢字能力検定 級別漢字表](https://www.kanken.or.jp/kanken/outline/data/outline_degree_national_list20200217.pdf), published by 日本漢字能力検定協会 (retrieved 2026-08-31, SHA-256 `8c7513a4ecfc7d6ca2b8f8aa71313b9097e972bac7a43f8a568fe99a9a1d7285`). It identifies 10級, 9級, and 8級 as the 80 小学校一年生, 160 小学校二年生, and 200 小学校三年生 characters respectively, for exact cumulative counts of 80, 240, and 440. Only factual membership is retained.
- Readings, meanings, stroke counts, and community JLPT mapping: [davidluzgouveia/kanji-data](https://github.com/davidluzgouveia/kanji-data/tree/00fd7079c3890f430759536f91aa5e854ec0ca4f), retrieved 2026-08-31 at commit `00fd7079c3890f430759536f91aa5e854ec0ca4f`. It is an MIT-licensed structured KANJIDIC2 derivative; KANJIDIC2 is maintained by the Electronic Dictionary Research and Development Group under its published dictionary license.
- Shinjitai to kyūjitai facts: [dahlia/shinjitai-table](https://github.com/dahlia/shinjitai-table/tree/65fc03d9ad556d748d370c64d04c36d712df1708), retrieved 2026-08-31 at commit `65fc03d9ad556d748d370c64d04c36d712df1708` and derived from the official Jōyō table. The repository publishes no license, so only factual mappings are used. Unihan 17 does not yet expose the proposed Japanese old-variant property.
- Korean dictionary glosses: [HanjaDict](https://github.com/seyoungsong/hanjadict/tree/39bbc7ba04514ec5d29eee79259823fa720b7065), retrieved 2026-08-31 at commit `39bbc7ba04514ec5d29eee79259823fa720b7065`, MIT license. The first sourced 훈음 supplies `meaningKo`; its reading syllable is removed without translating or paraphrasing the gloss.

The post-2010 JLPT does not publish an official per-kanji list. `jlpt` therefore
uses the dataset's documented `jlpt_new` mapping, falling back to its historical
mapping when `jlpt_new` is absent (`分` and `里` at historical N5; `身` and
`畑` at historical N2). `なし` truthfully marks a missing on'yomi or kun'yomi.
For linked shinjitai/kyūjitai rows, `strokeCount` comes from the canonical
key's pinned `kanji-data` entry while the Japanese readings use the JP glyph.

`scripts/generate-jp-through-8kyu.mjs` reproduces the 200-character 8級 file
from the exact `kanji-data`, `shinjitai-table`, and HanjaDict pins above. It
contains the official PDF's row-order membership as an independent exact-set
check and performs no network lookup. The 51 sentence rows are exact reusable
matches from the already-frozen Tatoeba selection; the remaining 149
characters ship without a sentence rather than introducing new prose.

```sh
node scripts/generate-jp-through-8kyu.mjs /path/to/kanji-data /path/to/shinjitai-table /path/to/hanjadict/src/hanjadict/table.json
```

## Chinese: HSK 3.0 2026 HSK1 through HSK3

- Official syllabus origin: [Chinese Testing International](https://www.chinesetest.cn/).
- Machine-readable official syllabus extraction: [profesorm/hsk30](https://github.com/profesorm/hsk30/tree/f3163ca6edff5d6b1e81afb1cd716bb78f5a958a), retrieved 2026-08-31 at commit `f3163ca6edff5d6b1e81afb1cd716bb78f5a958a`, CC BY 4.0. The pinned `data/hsk_hanzi_compact.json` has SHA-256 `6f48d2e8bf9e61857246a9f84c2d6ca3d3168df554be1f51fd746c30ca85ede2`.
- Tone-marked Mandarin, English definitions, traditional/simplified mappings, total strokes, and `通用规范汉字表` positions: [Unicode Unihan 17.0.0](https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip), retrieved 2026-08-31 under the [Unicode data license](https://www.unicode.org/license.txt). The exact input SHA-256 values are `575e69c9ad85a4737a889a4f94cbd987042a90a1a6cc16dd3f4ed995c715b17c` (`Unihan_Readings.txt`), `3f23cd71872633f3350875d25bd388e83b60fa71807634c9a600ec26f38a68ab` (`Unihan_Variants.txt`), `d1c817dd7db84295dab0643c277d97c2fa742c245f8824e6736c2a0935095325` (`Unihan_IRGSources.txt`), and `4fabda168d04a5ac360809a8bfa377fe54e04fbc069ba67cacad4df03d691fa0` (`Unihan_OtherMappings.txt`). The `kTGH` value supplies the actual table position: 1–3500 map to `一级字`, 3501–6500 to `二级字`, and 6501–8105 to `三级字`; `kTGHZ2013` is a dictionary locator and is not used as a tier index.
- Korean dictionary glosses: [HanjaDict](https://github.com/seyoungsong/hanjadict/tree/39bbc7ba04514ec5d29eee79259823fa720b7065), retrieved 2026-08-31 at commit `39bbc7ba04514ec5d29eee79259823fa720b7065`, MIT license. `src/hanjadict/table.json` has SHA-256 `d36ceb0d37ed53b9af78a88517ebc1499502cdef0367c396ff723460af52e471`. The first sourced 훈음 supplies `meaningKo`; its reading syllable is removed without translation or paraphrase.

The compact source has 246 membership rows (246 unique glyphs) at HSK1,
225 membership rows (220 unique glyphs) at HSK2, and 434 membership rows
(284 unique glyphs) at HSK3. Five HSK2 glyphs and 150 HSK3 glyphs occur in
both recognition and handwriting categories inside their level. After that
within-level union, HSK2 repeats 95 HSK1 glyphs while HSK3 repeats none from
HSK1 or HSK2. The true cumulative simplified-glyph union is therefore 246 at
HSK1, 371 through HSK2, and 655 through HSK3; the prior 466 figure was the
sum of file rows, not the cross-level union.

The frozen schema stores one band per `(character, track)`. A repeated glyph
retains its earliest band while remaining a member of each later curriculum
unit. `cn-hsk3.json` therefore contains the exact 284-glyph HSK3 union with
badge `HSK 3` and ordinal 3. `scripts/generate-cn-through-hsk3.mjs` reproduces
the character file and its 29 units from the pinned HSK, Unihan, and HanjaDict
inputs without network access. It also reuses 67 exact rows from the existing
frozen Tatoeba selection where those sentences already contain an HSK3 glyph;
no new sentence prose is generated or translated.

```sh
npx tsx scripts/generate-cn-through-hsk3.mjs /path/to/hsk30 /path/to/unihan /path/to/hanjadict/src/hanjadict/table.json
```

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

# Korean compound source

Retrieved 2026-08-30 from [Korean Wiktionary](https://ko.wiktionary.org/),
whose text is reusable under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The
`data/words/kr-wiktionary.json` selection is separately offered under that
license. Each row links to an immutable revision so its contributors and the
published Korean entry remain auditable.

Selection is deliberately mechanical: retain a two-character Hanja spelling
only when the corresponding Hangul-titled Korean Wiktionary entry explicitly
identifies that exact spelling as its Hanja origin, and both characters already
exist in the Korean seed. The page title is retained byte-for-byte as the
reading. Four entries are selected at each highest-constituent grade from 8급
through 5급, for 28 compounds total. No spelling, reading, meaning, or distractor
is AI-generated, machine-translated, or paraphrased. JP 熟語 and CN 词语 remain
separate sourcing and implementation work.

| Highest grade | Immutable Korean Wiktionary revisions |
| --- | --- |
| 8급 | [學校/학교 #4219407](https://ko.wiktionary.org/w/index.php?title=%ED%95%99%EA%B5%90&oldid=4219407), [學生/학생 #4151217](https://ko.wiktionary.org/w/index.php?title=%ED%95%99%EC%83%9D&oldid=4151217), [父母/부모 #4132586](https://ko.wiktionary.org/w/index.php?title=%EB%B6%80%EB%AA%A8&oldid=4132586), [國民/국민 #4263456](https://ko.wiktionary.org/w/index.php?title=%EA%B5%AD%EB%AF%BC&oldid=4263456) |
| 7급II | [時間/시간 #4286332](https://ko.wiktionary.org/w/index.php?title=%EC%8B%9C%EA%B0%84&oldid=4286332), [人間/인간 #4251411](https://ko.wiktionary.org/w/index.php?title=%EC%9D%B8%EA%B0%84&oldid=4251411), [生活/생활 #4180172](https://ko.wiktionary.org/w/index.php?title=%EC%83%9D%ED%99%9C&oldid=4180172), [正答/정답 #4121610](https://ko.wiktionary.org/w/index.php?title=%EC%A0%95%EB%8B%B5&oldid=4121610) |
| 7급 | [國語/국어 #4242586](https://ko.wiktionary.org/w/index.php?title=%EA%B5%AD%EC%96%B4&oldid=4242586), [自然/자연 #4216064](https://ko.wiktionary.org/w/index.php?title=%EC%9E%90%EC%97%B0&oldid=4216064), [工夫/공부 #4269981](https://ko.wiktionary.org/w/index.php?title=%EA%B3%B5%EB%B6%80&oldid=4269981), [主人/주인 #4385478](https://ko.wiktionary.org/w/index.php?title=%EC%A3%BC%EC%9D%B8&oldid=4385478) |
| 6급II | [問題/문제 #4382612](https://ko.wiktionary.org/w/index.php?title=%EB%AC%B8%EC%A0%9C&oldid=4382612), [運動/운동 #4188874](https://ko.wiktionary.org/w/index.php?title=%EC%9A%B4%EB%8F%99&oldid=4188874), [平和/평화 #4257721](https://ko.wiktionary.org/w/index.php?title=%ED%8F%89%ED%99%94&oldid=4257721), [科學/과학 #4180431](https://ko.wiktionary.org/w/index.php?title=%EA%B3%BC%ED%95%99&oldid=4180431) |
| 6급 | [英語/영어 #4395517](https://ko.wiktionary.org/w/index.php?title=%EC%98%81%EC%96%B4&oldid=4395517), [衣服/의복 #4186752](https://ko.wiktionary.org/w/index.php?title=%EC%9D%98%EB%B3%B5&oldid=4186752), [道路/도로 #4483939](https://ko.wiktionary.org/w/index.php?title=%EB%8F%84%EB%A1%9C&oldid=4483939), [溫度/온도 #4137778](https://ko.wiktionary.org/w/index.php?title=%EC%98%A8%EB%8F%84&oldid=4137778) |
| 5급II | [幸福/행복 #4192892](https://ko.wiktionary.org/w/index.php?title=%ED%96%89%EB%B3%B5&oldid=4192892), [責任/책임 #4241290](https://ko.wiktionary.org/w/index.php?title=%EC%B1%85%EC%9E%84&oldid=4241290), [品質/품질 #4235882](https://ko.wiktionary.org/w/index.php?title=%ED%92%88%EC%A7%88&oldid=4235882), [商店/상점 #4382869](https://ko.wiktionary.org/w/index.php?title=%EC%83%81%EC%A0%90&oldid=4382869) |
| 5급 | [原因/원인 #4267550](https://ko.wiktionary.org/w/index.php?title=%EC%9B%90%EC%9D%B8&oldid=4267550), [汽車/기차 #4162821](https://ko.wiktionary.org/w/index.php?title=%EA%B8%B0%EC%B0%A8&oldid=4162821), [許可/허가 #4219754](https://ko.wiktionary.org/w/index.php?title=%ED%97%88%EA%B0%80&oldid=4219754), [停止/정지 #4142204](https://ko.wiktionary.org/w/index.php?title=%EC%A0%95%EC%A7%80&oldid=4142204) |

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

The frozen Tatoeba sentence selection remains unchanged for Japanese and
Chinese. Exact reuse for new 8級 target glyphs raises the mappings to 283
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

These lanes cover 289 of 1,000 Korean `(character, kr)` pairs: the existing 127
through 7급 plus 162 higher-grade characters already present in the same exact,
immutable licensed selections. No sentence text was generated or altered.
Across all tracks, 1,002 of 2,095 pairs now have rank-0 sentences; one existing
extra rank makes 1,003 unique seeded sentence identities.

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
| 讀 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 書 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 線 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 題 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 角 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 短 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 代 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 童 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 理 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 表 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 堂 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 班 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 省 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 庭 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 體 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 雪 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 窓 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 術 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 身 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 藥 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 淸 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 形 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 社 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 運 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 今 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 昨 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 科 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 球 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 功 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 信 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 弱 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 飮 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 共 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 果 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 急 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 圖 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 樂 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 反 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 放 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 消 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 新 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 業 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 勇 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 用 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 才 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 戰 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 幸 | 6급II: No qualifying sentence occurs in the retained licensed selections. |
| 章 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 訓 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 多 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 度 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 禮 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 孫 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 由 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 京 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 古 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 路 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 米 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 朴 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 病 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 席 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 樹 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 習 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 洋 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 英 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 近 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 頭 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 服 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 醫 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 苦 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 油 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 衣 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 番 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 使 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 夜 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 晝 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 向 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 野 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 號 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 強 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 美 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 愛 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 交 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 待 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 失 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 感 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 郡 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 根 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 例 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 綠 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 李 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 死 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 速 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 勝 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 永 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 溫 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 園 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 遠 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 親 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 通 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 畫 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 黃 | 6급: No qualifying sentence occurs in the retained licensed selections. |
| 具 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 念 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 典 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 筆 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 客 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 課 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 兵 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 仕 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 臣 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 兒 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 友 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 卒 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 流 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 類 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 雲 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 州 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 價 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 局 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 練 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 束 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 雨 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 任 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 切 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 觀 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 朗 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 洗 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 首 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 養 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 充 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 害 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 廣 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 歷 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 宿 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 展 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 情 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 格 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 舊 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 變 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 實 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 參 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 責 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 化 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 良 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 福 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 奉 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 見 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 關 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 到 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 産 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 順 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 着 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 基 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 團 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 德 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 旅 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 陸 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 史 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 商 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 相 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 說 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 性 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 識 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 約 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 偉 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 財 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 材 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 店 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 種 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 週 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 質 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 品 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 必 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 凶 | 5급II: No qualifying sentence occurs in the retained licensed selections. |
| 寫 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 葉 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 比 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 億 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 牛 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 雄 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 因 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 操 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 唱 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 規 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 壇 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 都 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 量 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 位 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 則 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 島 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 氷 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 漁 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 魚 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 曜 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 再 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 寒 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 健 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 技 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 鼻 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 浴 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 耳 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 卓 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 考 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 橋 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 船 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 屋 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 板 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 擧 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 競 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 末 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 倍 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 原 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 爭 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 停 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 致 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 去 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 冷 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 思 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 曲 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 吉 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 善 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 黑 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 改 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 建 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 固 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 給 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 落 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 領 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 加 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 可 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 輕 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 景 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 救 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 貴 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 汽 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 談 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 料 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 馬 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 亡 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 買 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 賣 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 賞 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 序 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 選 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 案 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 熱 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 願 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 災 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 貯 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 赤 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 止 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 祝 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 打 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 炭 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 敗 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 許 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 湖 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 患 | 5급: No qualifying sentence occurs in the retained licensed selections. |
| 講 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 師 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 修 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 解 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 故 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 求 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 毒 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 斗 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 房 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 壁 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 婦 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 佛 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 星 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 謠 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 員 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 製 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 統 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 虛 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 戶 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 列 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 武 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 府 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 寺 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 申 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 政 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 準 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 志 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 街 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 檀 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 羅 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 麗 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 液 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 祭 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 鳥 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 職 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 察 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 康 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 端 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 擔 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 脈 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 未 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 殺 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 盛 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 掃 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 受 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 眼 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 將 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 早 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 走 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 齒 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 鄕 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 血 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 博 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 伐 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 舍 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 玉 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 票 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 航 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 貨 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 起 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 牧 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 防 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 配 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 勢 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 細 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 送 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 守 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 息 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 衛 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 移 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 低 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 程 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 回 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 單 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 黨 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 帶 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 豆 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 兩 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 連 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 誠 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 素 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 演 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 圓 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 測 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 假 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 想 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 是 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 恩 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 尊 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 眞 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 賢 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 惠 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 好 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 確 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 宮 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 努 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 導 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 密 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 步 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 飛 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 床 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 續 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 授 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 施 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 誤 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 接 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 除 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 進 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 築 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 蓄 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 取 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 治 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 減 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 監 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 個 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 潔 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 缺 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 境 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 警 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 慶 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 係 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 句 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 極 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 器 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 暖 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 難 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 怒 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 斷 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 達 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 隊 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 督 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 銅 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 得 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 燈 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 論 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 毛 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 味 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 訪 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 拜 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 背 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 邊 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 報 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 復 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 富 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 副 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 非 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 悲 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 貧 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 謝 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 常 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 聖 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 笑 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 俗 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 純 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 詩 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 試 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 視 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 深 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 暗 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 壓 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 餘 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 逆 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 煙 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 藝 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 肉 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 陰 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 應 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 益 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 引 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 障 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 敵 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 田 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 絶 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 濟 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 制 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 際 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 助 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 竹 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 衆 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 增 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 指 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 至 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 請 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 總 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 銃 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 忠 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 蟲 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 侵 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 快 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 退 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 波 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 砲 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 包 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 港 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 驗 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 協 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 呼 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 吸 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 興 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 希 | 4급II: No qualifying sentence occurs in the retained licensed selections. |
| 券 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 紀 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 普 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 辭 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 絲 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 籍 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 智 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 誌 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 冊 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 派 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 篇 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 季 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 孤 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 柳 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 私 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 叔 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 氏 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 緣 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 營 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 危 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 儒 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 仁 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 姿 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 張 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 差 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 討 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 顯 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 階 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 君 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 亂 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 犯 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 範 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 屬 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 域 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 資 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 帝 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 刑 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 驚 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 孔 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 管 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 糧 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 鳴 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 松 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 秀 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 燃 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 郵 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 座 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 探 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 革 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 拒 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 更 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 骨 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 徒 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 負 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 傷 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 源 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 裝 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 靜 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 聽 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 就 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 紅 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 庫 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 碑 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 殘 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 廳 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 暇 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 干 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 降 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 屈 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 勸 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 筋 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 寄 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 粉 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 委 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 乳 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 雜 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 折 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 讚 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 鬪 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 胞 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 閑 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 混 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 犬 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 困 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 離 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 否 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 批 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 延 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 遇 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 圍 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 錢 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 整 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 泉 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 趣 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 堅 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 肅 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 疲 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 喜 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 繼 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 卷 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 龍 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 嚴 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 與 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 易 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 鉛 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 迎 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 援 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 獎 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 轉 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 丁 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 鍾 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 持 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 採 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 閉 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 候 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 刻 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 覺 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 簡 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 看 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 甘 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 敢 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 甲 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 據 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 巨 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 傑 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 儉 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 擊 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 激 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 傾 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 鏡 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 鷄 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 系 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 戒 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 攻 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 鑛 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 群 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 歸 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 劇 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 機 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 奇 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 段 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 盜 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 逃 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 卵 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 覽 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 慮 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 烈 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 輪 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 妹 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 模 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 墓 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 妙 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 舞 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 拍 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 髮 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 妨 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 辯 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 伏 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 複 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 憤 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 祕 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 射 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 散 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 象 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 宣 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 舌 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 損 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 頌 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 崇 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 映 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 優 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 怨 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 威 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 慰 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 遊 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 遺 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 隱 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 儀 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 疑 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 異 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 姉 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 腸 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 壯 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 帳 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 底 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 積 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 適 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 績 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 賊 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 專 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 點 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 占 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 條 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 潮 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 存 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 酒 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 朱 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 周 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 證 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 珍 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 盡 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 招 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 推 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 縮 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 層 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 寢 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 針 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 歎 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 彈 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 脫 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 擇 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 痛 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 投 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 評 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 爆 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 標 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 避 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 恨 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 抗 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 核 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 險 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 或 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 婚 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 歡 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 環 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 況 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 灰 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 厚 | 4급: No qualifying sentence occurs in the retained licensed selections. |
| 揮 | 4급: No qualifying sentence occurs in the retained licensed selections. |

## Past-paper sourcing position

Past-paper sentences from 한국어문회 기출 문제, 漢検 過去問, or another exam
body are not copied into redistributable seed data without an explicit compatible
license or written permission. Current hard cap: **zero sentence rows per past
paper**. Published 배정한자 and grade-membership lists may be used only for the
factual curriculum membership they state, with citation; they do not authorize
copying question prose. Any future permission or open-license lane must be
documented here before its first row is added. No current sentence is derived
from a past paper.
