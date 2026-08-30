# Character data sources

Retrieved 2026-08-30. Seed files contain factual character memberships and
dictionary fields only; no source prose or examples are copied.

## Korean: 한국어문회 8급 through 5급

- Level definitions and membership: [한국어문회 급수배정](https://www.hanja.re.kr/kccpt/exam/levelConfirm.do). Its published `전체배정한자` XLS (retrieved 2026-08-30, SHA-256 `97b8db715ebe1dd6e00e8e58d338a9ba70e7420bf5ec84da38f987d60eb64b17`) gives exact grade deltas of 50/50/50/75/75/100/100 and cumulative reading counts of 50, 100, 150, 225, 300, 400, and 500 from 8급 through 5급.
- Machine-readable factual membership cross-check: [TypoStudio/matchit-packs](https://github.com/TypoStudio/matchit-packs/tree/acaafc3a08594d220f303f7d4bad94cd2d1e50c8/language/hanja-grade). Every normalized glyph set through level 7 matches the association XLS exactly. The repository publishes no license, so only factual membership is used; none of its explanatory prose is copied.
- 훈음: [HanjaDict](https://github.com/seyoungsong/hanjadict/tree/39bbc7ba04514ec5d29eee79259823fa720b7065), MIT license.
- English dictionary definitions and total stroke counts: [Unicode Unihan 17.0.0](https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip) `kDefinition` and `kTotalStrokes`, under the [Unicode data license](https://www.unicode.org/license.txt).

`kr-7geup.json` contains the 100 characters added across 7급II and 7급. Each
track row retains its exact badge and ordinal (`7급II` = 2, `7급` = 3).
The four higher files contain the exact additions for `6급II` (75), `6급`
(75), `5급II` (100), and `5급` (100), with ordinals 4–7. Compatibility
forms `樂` and `宅` in the cross-check pack are normalized to their canonical
Unicode forms `樂` and `宅` before HanjaDict and Unihan lookup. Curriculum
units are deterministically grouped by sourced dictionary definitions into
8–10-character units; their title terms come directly from sourced 훈음.
`scripts/generate-kr-through-5geup.mjs` reproduces the four character and
sentence files from checkouts of the pinned grade pack and HanjaDict plus an
extracted Unihan directory; it performs no network lookup and emits no sentence
prose.

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

These lanes cover 218 of 500 Korean `(character, kr)` pairs: the existing 127
through 7급 plus 91 higher-grade characters already present in the same exact,
immutable licensed selections. No sentence text was generated or altered.
Across all tracks, 813 of 1,111 pairs now have rank-0 sentences; one existing
extra rank makes 814 unique seeded sentence identities.

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

## Past-paper sourcing position

Past-paper sentences from 한국어문회 기출 문제, 漢検 過去問, or another exam
body are not copied into redistributable seed data without an explicit compatible
license or written permission. Current hard cap: **zero sentence rows per past
paper**. Published 배정한자 and grade-membership lists may be used only for the
factual curriculum membership they state, with citation; they do not authorize
copying question prose. Any future permission or open-license lane must be
documented here before its first row is added. No current sentence is derived
from a past paper.
