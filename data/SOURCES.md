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

## Japanese: JLPT N5 through N1

- Official scope statement: the [JLPT official guidebook, Q7–Q8](https://www.jlpt.jp/e/reference/pdf/guidebook_s_e.pdf) says the post-2010 test does not publish vocabulary, kanji, or grammar item lists. There is therefore no official per-kanji N5–N1 membership to import.
- Curriculum membership, readings, meanings, stroke counts, and frequency: [davidluzgouveia/kanji-data](https://github.com/davidluzgouveia/kanji-data/tree/00fd7079c3890f430759536f91aa5e854ec0ca4f), retrieved 2026-08-31 at commit `00fd7079c3890f430759536f91aa5e854ec0ca4f`. The pinned [`kanji.json`](https://github.com/davidluzgouveia/kanji-data/blob/00fd7079c3890f430759536f91aa5e854ec0ca4f/kanji.json) has SHA-256 `561b72ea9df703c58fae0c68585812e172aaa7611d2fcee6719d55fd2dfd4fa4`. Its `jlpt_new` values are an unofficial community mapping: the pinned [`tools/jlpt.py`](https://github.com/davidluzgouveia/kanji-data/blob/00fd7079c3890f430759536f91aa5e854ec0ca4f/tools/jlpt.py) says it scraped Jonathan Waller's Tanos lists at `http://www.tanos.co.uk/jlpt/jlpt{1..5}/kanji/`, and the pinned [`tools/combine.py`](https://github.com/davidluzgouveia/kanji-data/blob/00fd7079c3890f430759536f91aa5e854ec0ca4f/tools/combine.py) copies that scraped mapping into `jlpt_new`. The commit and file hash freeze the imported membership, but the pinned provenance records neither an immutable Tanos revision nor a separate upstream data license; this is a provenance and licensing limitation. The source repository is [MIT-licensed](https://github.com/davidluzgouveia/kanji-data/blob/00fd7079c3890f430759536f91aa5e854ec0ca4f/LICENSE), and this project copies only the bare character-to-level assignments. KANJIDIC2 supplies the dictionary fields under its published license; it is not the authority for `jlpt_new`.
- Secondary Kanken metadata: [日本漢字能力検定 級別漢字表](https://www.kanken.or.jp/kanken/outline/data/outline_degree_national_list20200217.pdf), published by 日本漢字能力検定協会 (retrieved 2026-08-31, SHA-256 `8c7513a4ecfc7d6ca2b8f8aa71313b9097e972bac7a43f8a568fe99a9a1d7285`). Source school grades 1–6 map to 10級 through 5級. Later source bands cannot identify an exact Kanken level, so they store `未指定` and the UI omits that badge.
- Shinjitai to kyūjitai facts: [dahlia/shinjitai-table](https://github.com/dahlia/shinjitai-table/tree/65fc03d9ad556d748d370c64d04c36d712df1708), retrieved 2026-08-31 at commit `65fc03d9ad556d748d370c64d04c36d712df1708`; `shinjitai.json` has SHA-256 `e0d59f319748555eff8d6bb0db9c5938974a7b184094e4bebfb1ef02de8582be`. The mapping is derived from the official Jōyō table. The repository publishes no license, so only factual mappings are used. Unihan 17 does not yet expose the proposed Japanese old-variant property.
- Korean dictionary glosses: [HanjaDict](https://github.com/seyoungsong/hanjadict/tree/39bbc7ba04514ec5d29eee79259823fa720b7065), retrieved 2026-08-31 at commit `39bbc7ba04514ec5d29eee79259823fa720b7065`, MIT license. `src/hanjadict/table.json` has SHA-256 `d36ceb0d37ed53b9af78a88517ebc1499502cdef0367c396ff723460af52e471`. The first sourced 훈음 supplies `meaningKo`; its reading syllable is removed without translating or paraphrasing the gloss.

The five files contain every pinned `jlpt_new` row: 79 at N5, 166 at N4, 367
at N3, 367 at N2, and 1,232 at N1 (2,211 unique characters). Within a level,
characters are ordered by the source frequency field and split into 8–10
character units. Historical `jlpt_old` fallbacks are not mixed into the new
scale. `なし` truthfully marks a missing on'yomi or kun'yomi.
For linked shinjitai/kyūjitai rows, `strokeCount` comes from the canonical
key's pinned `kanji-data` entry while the Japanese readings use the JP glyph.

`scripts/generate-jp-jlpt.mjs` reproduces the five JLPT files from the exact
`kanji-data`, `shinjitai-table`, and HanjaDict pins above. It performs no
network lookup and emits no sentence prose.

```sh
node scripts/generate-jp-jlpt.mjs /path/to/kanji-data /path/to/shinjitai-table /path/to/hanjadict/src/hanjadict/table.json
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

# Compound sources

Korean rows were retrieved 2026-08-30 and 2026-09-02 from [Korean
Wiktionary](https://ko.wiktionary.org/); Japanese and Chinese rows were
retrieved 2026-09-02 from [Japanese Wiktionary](https://ja.wiktionary.org/) and
[Chinese Wiktionary](https://zh.wiktionary.org/). Each edition's primary
MediaWiki `rightsinfo` endpoint reports Creative Commons Attribution-Share
Alike 4.0: [ko](https://ko.wiktionary.org/w/api.php?action=query&meta=siteinfo&siprop=rightsinfo&format=json),
[ja](https://ja.wiktionary.org/w/api.php?action=query&meta=siteinfo&siprop=rightsinfo&format=json),
and [zh](https://zh.wiktionary.org/w/api.php?action=query&meta=siteinfo&siprop=rightsinfo&format=json).
The three `data/words/*-wiktionary.json` selections are separately offered
under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Every
row links to an immutable revision so its contributors and published entry
remain auditable.

Selection is deliberately mechanical: retain the published two-character
spelling and reading only when both characters already exist in that track.
Korean rows use the Hangul page title; Japanese and Chinese rows use the
revision's published kana or tone-marked Mandarin reading. `levelOrd` is the
higher of the two member ordinals. No spelling, reading, meaning, or distractor
is AI-generated, machine-translated, or paraphrased.

Compounds remain exactly two characters. This keeps the product aligned with
the existing two-glyph card and with one answer scheduling exactly two member
FSRS states; the arbitrary `word_members.position` schema remains available if
a later product change adds three- or four-character compounds.

The Korean pool now contains 72 compounds: at least eight at every
highest-constituent grade through 4급. The original 28 revisions follow; the 44
additions and all JP/CN revisions are recorded below.

| Highest grade | Immutable Korean Wiktionary revisions |
| --- | --- |
| 8급 | [學校/학교 #4219407](https://ko.wiktionary.org/w/index.php?title=%ED%95%99%EA%B5%90&oldid=4219407), [學生/학생 #4151217](https://ko.wiktionary.org/w/index.php?title=%ED%95%99%EC%83%9D&oldid=4151217), [父母/부모 #4132586](https://ko.wiktionary.org/w/index.php?title=%EB%B6%80%EB%AA%A8&oldid=4132586), [國民/국민 #4263456](https://ko.wiktionary.org/w/index.php?title=%EA%B5%AD%EB%AF%BC&oldid=4263456) |
| 7급II | [時間/시간 #4286332](https://ko.wiktionary.org/w/index.php?title=%EC%8B%9C%EA%B0%84&oldid=4286332), [人間/인간 #4251411](https://ko.wiktionary.org/w/index.php?title=%EC%9D%B8%EA%B0%84&oldid=4251411), [生活/생활 #4180172](https://ko.wiktionary.org/w/index.php?title=%EC%83%9D%ED%99%9C&oldid=4180172), [正答/정답 #4121610](https://ko.wiktionary.org/w/index.php?title=%EC%A0%95%EB%8B%B5&oldid=4121610) |
| 7급 | [國語/국어 #4242586](https://ko.wiktionary.org/w/index.php?title=%EA%B5%AD%EC%96%B4&oldid=4242586), [自然/자연 #4216064](https://ko.wiktionary.org/w/index.php?title=%EC%9E%90%EC%97%B0&oldid=4216064), [工夫/공부 #4269981](https://ko.wiktionary.org/w/index.php?title=%EA%B3%B5%EB%B6%80&oldid=4269981), [主人/주인 #4385478](https://ko.wiktionary.org/w/index.php?title=%EC%A3%BC%EC%9D%B8&oldid=4385478) |
| 6급II | [問題/문제 #4382612](https://ko.wiktionary.org/w/index.php?title=%EB%AC%B8%EC%A0%9C&oldid=4382612), [運動/운동 #4188874](https://ko.wiktionary.org/w/index.php?title=%EC%9A%B4%EB%8F%99&oldid=4188874), [平和/평화 #4257721](https://ko.wiktionary.org/w/index.php?title=%ED%8F%89%ED%99%94&oldid=4257721), [科學/과학 #4180431](https://ko.wiktionary.org/w/index.php?title=%EA%B3%BC%ED%95%99&oldid=4180431) |
| 6급 | [英語/영어 #4395517](https://ko.wiktionary.org/w/index.php?title=%EC%98%81%EC%96%B4&oldid=4395517), [衣服/의복 #4186752](https://ko.wiktionary.org/w/index.php?title=%EC%9D%98%EB%B3%B5&oldid=4186752), [道路/도로 #4483939](https://ko.wiktionary.org/w/index.php?title=%EB%8F%84%EB%A1%9C&oldid=4483939), [溫度/온도 #4137778](https://ko.wiktionary.org/w/index.php?title=%EC%98%A8%EB%8F%84&oldid=4137778) |
| 5급II | [幸福/행복 #4192892](https://ko.wiktionary.org/w/index.php?title=%ED%96%89%EB%B3%B5&oldid=4192892), [責任/책임 #4241290](https://ko.wiktionary.org/w/index.php?title=%EC%B1%85%EC%9E%84&oldid=4241290), [品質/품질 #4235882](https://ko.wiktionary.org/w/index.php?title=%ED%92%88%EC%A7%88&oldid=4235882), [商店/상점 #4382869](https://ko.wiktionary.org/w/index.php?title=%EC%83%81%EC%A0%90&oldid=4382869) |
| 5급 | [原因/원인 #4267550](https://ko.wiktionary.org/w/index.php?title=%EC%9B%90%EC%9D%B8&oldid=4267550), [汽車/기차 #4162821](https://ko.wiktionary.org/w/index.php?title=%EA%B8%B0%EC%B0%A8&oldid=4162821), [許可/허가 #4219754](https://ko.wiktionary.org/w/index.php?title=%ED%97%88%EA%B0%80&oldid=4219754), [停止/정지 #4142204](https://ko.wiktionary.org/w/index.php?title=%EC%A0%95%EC%A7%80&oldid=4142204) |

## Expanded Korean compounds

| Highest grade | Immutable Korean Wiktionary revisions |
| --- | --- |
| 8급 | [韓國/한국 #4123623](https://ko.wiktionary.org/w/index.php?title=%ED%95%9C%EA%B5%AD&oldid=4123623), [軍人/군인 #4211800](https://ko.wiktionary.org/w/index.php?title=%EA%B5%B0%EC%9D%B8&oldid=4211800), [國王/국왕 #4172587](https://ko.wiktionary.org/w/index.php?title=%EA%B5%AD%EC%99%95&oldid=4172587), [東西/동서 #4118580](https://ko.wiktionary.org/w/index.php?title=%EB%8F%99%EC%84%9C&oldid=4118580) |
| 7급II | [男子/남자 #4154605](https://ko.wiktionary.org/w/index.php?title=%EB%82%A8%EC%9E%90&oldid=4154605), [女子/여자 #4386009](https://ko.wiktionary.org/w/index.php?title=%EC%97%AC%EC%9E%90&oldid=4386009), [電氣/전기 #4483903](https://ko.wiktionary.org/w/index.php?title=%EC%A0%84%EA%B8%B0&oldid=4483903), [動物/동물 #4483095](https://ko.wiktionary.org/w/index.php?title=%EB%8F%99%EB%AC%BC&oldid=4483095) |
| 7급 | [歌手/가수 #4384038](https://ko.wiktionary.org/w/index.php?title=%EA%B0%80%EC%88%98&oldid=4384038), [老人/노인 #4214154](https://ko.wiktionary.org/w/index.php?title=%EB%85%B8%EC%9D%B8&oldid=4214154), [人口/인구 #4135974](https://ko.wiktionary.org/w/index.php?title=%EC%9D%B8%EA%B5%AC&oldid=4135974), [文字/문자 #4481388](https://ko.wiktionary.org/w/index.php?title=%EB%AC%B8%EC%9E%90&oldid=4481388) |
| 6급II | [讀書/독서 #4392052](https://ko.wiktionary.org/w/index.php?title=%EB%8F%85%EC%84%9C&oldid=4392052), [作家/작가 #4213314](https://ko.wiktionary.org/w/index.php?title=%EC%9E%91%EA%B0%80&oldid=4213314), [世界/세계 #4210393](https://ko.wiktionary.org/w/index.php?title=%EC%84%B8%EA%B3%84&oldid=4210393), [社會/사회 #4161856](https://ko.wiktionary.org/w/index.php?title=%EC%82%AC%ED%9A%8C&oldid=4161856) |
| 6급 | [銀行/은행 #4480706](https://ko.wiktionary.org/w/index.php?title=%EC%9D%80%ED%96%89&oldid=4480706), [夜間/야간 #4147930](https://ko.wiktionary.org/w/index.php?title=%EC%95%BC%EA%B0%84&oldid=4147930), [石油/석유 #4198573](https://ko.wiktionary.org/w/index.php?title=%EC%84%9D%EC%9C%A0&oldid=4198573), [愛人/애인 #4234288](https://ko.wiktionary.org/w/index.php?title=%EC%95%A0%EC%9D%B8&oldid=4234288) |
| 5급II | [課題/과제 #4245710](https://ko.wiktionary.org/w/index.php?title=%EA%B3%BC%EC%A0%9C&oldid=4245710), [流行/유행 #4172092](https://ko.wiktionary.org/w/index.php?title=%EC%9C%A0%ED%96%89&oldid=4172092), [獨立/독립 #4481901](https://ko.wiktionary.org/w/index.php?title=%EB%8F%85%EB%A6%BD&oldid=4481901), [記念/기념 #4280986](https://ko.wiktionary.org/w/index.php?title=%EA%B8%B0%EB%85%90&oldid=4280986) |
| 5급 | [病院/병원 #4137242](https://ko.wiktionary.org/w/index.php?title=%EB%B3%91%EC%9B%90&oldid=4137242), [都市/도시 #4176630](https://ko.wiktionary.org/w/index.php?title=%EB%8F%84%EC%8B%9C&oldid=4176630), [競爭/경쟁 #4290020](https://ko.wiktionary.org/w/index.php?title=%EA%B2%BD%EC%9F%81&oldid=4290020), [期間/기간 #4270340](https://ko.wiktionary.org/w/index.php?title=%EA%B8%B0%EA%B0%84&oldid=4270340) |
| 4급II | [講師/강사 #4289089](https://ko.wiktionary.org/w/index.php?title=%EA%B0%95%EC%82%AC&oldid=4289089), [記錄/기록 #4267189](https://ko.wiktionary.org/w/index.php?title=%EA%B8%B0%EB%A1%9D&oldid=4267189), [準備/준비 #4123452](https://ko.wiktionary.org/w/index.php?title=%EC%A4%80%EB%B9%84&oldid=4123452), [政府/정부 #4235860](https://ko.wiktionary.org/w/index.php?title=%EC%A0%95%EB%B6%80&oldid=4235860), [敎師/교사 #4141982](https://ko.wiktionary.org/w/index.php?title=%EA%B5%90%EC%82%AC&oldid=4141982), [態度/태도 #4143997](https://ko.wiktionary.org/w/index.php?title=%ED%83%9C%EB%8F%84&oldid=4143997), [統計/통계 #4252448](https://ko.wiktionary.org/w/index.php?title=%ED%86%B5%EA%B3%84&oldid=4252448), [觀察/관찰 #4277337](https://ko.wiktionary.org/w/index.php?title=%EA%B4%80%EC%B0%B0&oldid=4277337) |
| 4급 | [辭典/사전 #4479687](https://ko.wiktionary.org/w/index.php?title=%EC%82%AC%EC%A0%84&oldid=4479687), [組織/조직 #4182439](https://ko.wiktionary.org/w/index.php?title=%EC%A1%B0%EC%A7%81&oldid=4182439), [犯罪/범죄 #4185878](https://ko.wiktionary.org/w/index.php?title=%EB%B2%94%EC%A3%84&oldid=4185878), [資料/자료 #4240514](https://ko.wiktionary.org/w/index.php?title=%EC%9E%90%EB%A3%8C&oldid=4240514), [帝國/제국 #4174310](https://ko.wiktionary.org/w/index.php?title=%EC%A0%9C%EA%B5%AD&oldid=4174310), [刑事/형사 #4201851](https://ko.wiktionary.org/w/index.php?title=%ED%98%95%EC%82%AC&oldid=4201851), [拒否/거부 #4241544](https://ko.wiktionary.org/w/index.php?title=%EA%B1%B0%EB%B6%80&oldid=4241544), [改革/개혁 #4195752](https://ko.wiktionary.org/w/index.php?title=%EA%B0%9C%ED%98%81&oldid=4195752) |

## Japanese compounds

| JLPT | Immutable Japanese Wiktionary revisions |
| --- | --- |
| N5 | [学校/がっこう #2215211](https://ja.wiktionary.org/w/index.php?title=%E5%AD%A6%E6%A0%A1&oldid=2215211), [学生/がくせい #2151335](https://ja.wiktionary.org/w/index.php?title=%E5%AD%A6%E7%94%9F&oldid=2151335), [日本/にほん #2301892](https://ja.wiktionary.org/w/index.php?title=%E6%97%A5%E6%9C%AC&oldid=2301892), [時間/じかん #2328451](https://ja.wiktionary.org/w/index.php?title=%E6%99%82%E9%96%93&oldid=2328451), [電話/でんわ #2321518](https://ja.wiktionary.org/w/index.php?title=%E9%9B%BB%E8%A9%B1&oldid=2321518), [電車/でんしゃ #2181516](https://ja.wiktionary.org/w/index.php?title=%E9%9B%BB%E8%BB%8A&oldid=2181516), [先生/せんせい #2335168](https://ja.wiktionary.org/w/index.php?title=%E5%85%88%E7%94%9F&oldid=2335168), [大学/だいがく #2152029](https://ja.wiktionary.org/w/index.php?title=%E5%A4%A7%E5%AD%A6&oldid=2152029), [人間/にんげん #2292707](https://ja.wiktionary.org/w/index.php?title=%E4%BA%BA%E9%96%93&oldid=2292707) |
| N4 | [会社/かいしゃ #2025753](https://ja.wiktionary.org/w/index.php?title=%E4%BC%9A%E7%A4%BE&oldid=2025753), [社会/しゃかい #2291904](https://ja.wiktionary.org/w/index.php?title=%E7%A4%BE%E4%BC%9A&oldid=2291904), [問題/もんだい #2239245](https://ja.wiktionary.org/w/index.php?title=%E5%95%8F%E9%A1%8C&oldid=2239245), [運動/うんどう #2279417](https://ja.wiktionary.org/w/index.php?title=%E9%81%8B%E5%8B%95&oldid=2279417), [英語/えいご #2338620](https://ja.wiktionary.org/w/index.php?title=%E8%8B%B1%E8%AA%9E&oldid=2338620) |
| N3 | [生活/せいかつ #2152448](https://ja.wiktionary.org/w/index.php?title=%E7%94%9F%E6%B4%BB&oldid=2152448), [文化/ぶんか #2273462](https://ja.wiktionary.org/w/index.php?title=%E6%96%87%E5%8C%96&oldid=2273462), [自然/しぜん #2212300](https://ja.wiktionary.org/w/index.php?title=%E8%87%AA%E7%84%B6&oldid=2212300), [科学/かがく #2239459](https://ja.wiktionary.org/w/index.php?title=%E7%A7%91%E5%AD%A6&oldid=2239459), [道路/どうろ #2182564](https://ja.wiktionary.org/w/index.php?title=%E9%81%93%E8%B7%AF&oldid=2182564), [原因/げんいん #2296882](https://ja.wiktionary.org/w/index.php?title=%E5%8E%9F%E5%9B%A0&oldid=2296882) |

## Chinese compounds

| HSK | Immutable Chinese Wiktionary revisions |
| --- | --- |
| HSK 1 | [学校/xué xiào #9870347](https://zh.wiktionary.org/w/index.php?title=%E5%AD%B8%E6%A0%A1&oldid=9870347), [学生/xué shēng #8544897](https://zh.wiktionary.org/w/index.php?title=%E5%AD%B8%E7%94%9F&oldid=8544897), [中国/zhōng guó #9178809](https://zh.wiktionary.org/w/index.php?title=%E4%B8%AD%E5%9C%8B&oldid=9178809), [时间/shí jiān #9689495](https://zh.wiktionary.org/w/index.php?title=%E6%99%82%E9%96%93&oldid=9689495), [工作/gōng zuò #9032678](https://zh.wiktionary.org/w/index.php?title=%E5%B7%A5%E4%BD%9C&oldid=9032678), [问题/wèn tí #9019980](https://zh.wiktionary.org/w/index.php?title=%E5%95%8F%E9%A1%8C&oldid=9019980), [学习/xué xí #9130387](https://zh.wiktionary.org/w/index.php?title=%E5%AD%B8%E7%BF%92&oldid=9130387), [老师/lǎo shī #8545956](https://zh.wiktionary.org/w/index.php?title=%E8%80%81%E5%B8%AB&oldid=8545956), [电脑/diàn nǎo #9612530](https://zh.wiktionary.org/w/index.php?title=%E9%9B%BB%E8%85%A6&oldid=9612530), [电话/diàn huà #9475885](https://zh.wiktionary.org/w/index.php?title=%E9%9B%BB%E8%A9%B1&oldid=9475885), [医生/yī shēng #8417997](https://zh.wiktionary.org/w/index.php?title=%E9%86%AB%E7%94%9F&oldid=8417997), [医院/yī yuàn #8827505](https://zh.wiktionary.org/w/index.php?title=%E9%86%AB%E9%99%A2&oldid=8827505), [电影/diàn yǐng #9880969](https://zh.wiktionary.org/w/index.php?title=%E9%9B%BB%E5%BD%B1&oldid=9880969), [飞机/fēi jī #9612514](https://zh.wiktionary.org/w/index.php?title=%E9%A3%9B%E6%A9%9F&oldid=9612514), [火车/huǒ chē #9786992](https://zh.wiktionary.org/w/index.php?title=%E7%81%AB%E8%BB%8A&oldid=9786992), [国语/guó yǔ #9488282](https://zh.wiktionary.org/w/index.php?title=%E5%9C%8B%E8%AA%9E&oldid=9488282), [天气/tiān qì #8544150](https://zh.wiktionary.org/w/index.php?title=%E5%A4%A9%E6%B0%A3&oldid=8544150), [明年/míng nián #9731419](https://zh.wiktionary.org/w/index.php?title=%E6%98%8E%E5%B9%B4&oldid=9731419), [上午/shàng wǔ #9327633](https://zh.wiktionary.org/w/index.php?title=%E4%B8%8A%E5%8D%88&oldid=9327633), [下午/xià wǔ #9855018](https://zh.wiktionary.org/w/index.php?title=%E4%B8%8B%E5%8D%88&oldid=9855018) |
| HSK 2 | [商店/shāng diàn #9728360](https://zh.wiktionary.org/w/index.php?title=%E5%95%86%E5%BA%97&oldid=9728360), [运动/yùn dòng #9375210](https://zh.wiktionary.org/w/index.php?title=%E9%81%8B%E5%8B%95&oldid=9375210), [自然/zì rán #8546463](https://zh.wiktionary.org/w/index.php?title=%E8%87%AA%E7%84%B6&oldid=8546463), [每天/měi tiān #8543754](https://zh.wiktionary.org/w/index.php?title=%E6%AF%8F%E5%A4%A9&oldid=8543754) |
| HSK 3 | [生活/shēng huó #8911823](https://zh.wiktionary.org/w/index.php?title=%E7%94%9F%E6%B4%BB&oldid=8911823), [汽车/qì chē #8544785](https://zh.wiktionary.org/w/index.php?title=%E6%B1%BD%E8%BB%8A&oldid=8544785), [文化/wén huà #9775436](https://zh.wiktionary.org/w/index.php?title=%E6%96%87%E5%8C%96&oldid=9775436), [银行/yín háng #9728757](https://zh.wiktionary.org/w/index.php?title=%E9%8A%80%E8%A1%8C&oldid=9728757), [空气/kōng qì #9728695](https://zh.wiktionary.org/w/index.php?title=%E7%A9%BA%E6%B0%A3&oldid=9728695), [南北/nán běi #9424757](https://zh.wiktionary.org/w/index.php?title=%E5%8D%97%E5%8C%97&oldid=9424757) |

# Example sentence sources

All selections require an exact target-glyph match, at least one Hangul syllable
for Korean rows, and no more than 24 Unicode code points. No source sentence is
generated, machine-translated, back-translated, or paraphrased. Korean `text` is
retained byte-for-byte. Its `translation_ko` is an all-Hangul reading gloss, not
a modernization or translation; the existing study and quiz views show that
distinct value below the mixed-script sentence.

## Tatoeba corpus

Retrieved 2026-08-28 through the public [Tatoeba sentence search API](https://api.tatoeba.org/).
Every `Tatoeba #{id}` row links to
`https://tatoeba.org/sentences/show/{id}`, which carries the sentence,
contributor, and license record. Tatoeba exports are released under
[CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/), with some
individual entries under CC0. These rows use `source_kind: corpus`.

The frozen Tatoeba sentence selection remains unchanged for Japanese and
Chinese: 281 Japanese rank-0 mappings and 431 Chinese identities (430 rank-0
and one rank-1). The original two Korean rows were replaced because their
parenthetical gloss format did not meet the required mixed-script convention.

## Korean verified public-domain and official-text lanes

Retrieved 2026-08-29 from Korean Wikisource. Each row records the immutable
Wikisource revision as `#{oldid}` and links to
`https://ko.wikisource.org/w/index.php?oldid={oldid}`. That revision page
provides contributor history; Wikisource contributions are published under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Ruby readings
are display annotations, so rows retain the published Hanja base text and
surrounding Hangul without copying the ruby annotation into the sentence.

- [대한민국헌법 (제1호) 국한문](https://ko.wikisource.org/w/index.php?oldid=418801).
  The official 1948 constitutional text supplies 19 active rows. Constitution
  and law text is excluded from copyright protection by
  [Copyright Act Article 7](https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1029423769);
  `source_kind: corpus`.
- [노동야학독본](https://ko.wikisource.org/w/index.php?oldid=431030), a 1908
  textbook by 유길준, marked `PD-old-100`. Exact page revisions `#423248` and
  `#425566` supply 10 active rows; `source_kind: textbook`.
- [국민 소학 독본](https://ko.wikisource.org/w/index.php?oldid=415110), the
  1895 학부 textbook. Exact page revision `#436021` supplies four active rows;
  `source_kind: textbook`. The publication is public domain by age.
- [산중신곡](https://ko.wikisource.org/w/index.php?oldid=430664), 윤선도's
  1642 work, marked `PD-old-100`, supplies two active rows from one exact line;
  `source_kind: corpus`.
- [3·1독립선언서](https://ko.wikisource.org/w/index.php?oldid=430581), the
  1919 declaration, marked `PD-old-100`, supplies 10 active rows from one exact
  clause; `source_kind: corpus`.
- Nineteen rows from six exact sentences in 1946
  [USAMGIK ordinances](https://ko.wikisource.org/wiki/분류:군정법령) link to the
  immutable revisions of ordinances 102, 106, 104, 110, 112, and 123. These
  official laws are excluded from copyright protection by Copyright Act
  Article 7; `source_kind: corpus`.

### Active Korean lane counts

Counts are character-to-sentence mappings, not distinct source sentences. The
19-row build-time ceiling balances candidates by current lane count before
sentence length. It keeps every lane below 30% while preferring existing exact
licensed text and is reproduced for higher grades by
`scripts/generate-kr-through-4geup.mjs`.

| Lane | Rows |
| --- | ---: |
| 대한민국헌법 | 19 |
| 군정법령 | 19 |
| 3·1독립선언서 | 10 |
| 노동야학독본 | 10 |
| 국민 소학 독본 | 4 |
| 산중신곡 | 2 |
| Total | 64 |

These lanes cover 64 of 1,000 Korean `(character, kr)` pairs. Rebalancing
deliberately reduces the previous 289-row coverage rather than retaining a
source-dominant curriculum. No source sentence was generated or altered.
Across all tracks, 775 of 3,866 pairs now have rank-0 sentences; one existing
extra rank makes 776 unique seeded sentence identities.

### Hangul gloss policy

Glosses use source-provided readings wherever the frozen source has them.
노동야학독본 publishes ruby, including its historical spellings, and
산중신곡 prints Hangul readings beside the Hanja. The 1948 constitution's
immutable parallel Hangul revision
[`#418800`](https://ko.wikisource.org/w/index.php?oldid=418800) checks
the readings and spacing used for mixed-script revision `#418801`. Five of the
six ordinance revisions contain their own parallel Hangul section. For the
remaining ordinance, 3·1독립선언서, and 국민 소학 독본 rows, the gloss only
replaces Hanja with its documented Korean reading and preserves the surrounding
source spelling. It does not modernize or paraphrase the sentence.

### Modern-register source decision

No modern lane was added because the two evaluated primary sources cannot
responsibly satisfy the existing literal-glyph rule. The official Tatoeba
Korean sentence export (retrieved 2026-09-02, SHA-256
`6ddb636c5e598ca65c29e27c0a57e547d4854264fc594aaa1adc6af527eee095`)
contains 15,897 rows but only three with both Hangul and Hanja. One is 87 code
points; of the two within 24 code points, `Tatoeba #907715` uses a parenthetical
Hanja annotation and `Tatoeba #3447235` is not suitable modern standard learner
text. Tatoeba's [official download page](https://tatoeba.org/en/downloads)
licenses the export under CC BY 2.0 FR, so licensing was not the blocker.

The National Institute of Korean Language was also evaluated, but its official
[2021 corpus project report](https://www.korean.go.kr/common/download.do?c_file_name=7456053f-8fd8-47d2-b317-f18498cf769e.pdf&file_path=reportData&o_file_name=2021%EB%85%84+%ED%95%9C%EA%B5%AD%EC%96%B4-%EC%99%B8%EA%B5%AD%EC%96%B4+%EB%B3%91%EB%A0%AC+%EB%A7%90%EB%AD%89%EC%B9%98+%EA%B5%AC%EC%B6%95+%EC%82%AC%EC%97%85_%EC%B5%9C%EC%A2%85+%EA%B2%B0%EA%B3%BC+%EB%B3%B4%EA%B3%A0%EC%84%9C.pdf)
records that secondary copyright prevented reuse of 모두의 말뭉치 for that
project. Without an explicit redistribution grant for candidate sentence text,
this repository does not import it. Modern all-Hangul sentences plus separately
added Hanja would change the exact-source and `target_index` contract; that
product/schema change remains outside this data correction.

The previous Bible lane was also removed after primary-source verification.
The Korean Bible Society's [copyright FAQ](https://www.bskorea.or.kr/bbs/board.php?bo_table=copyright_faq&wr_id=3)
identifies the 1964 관주성경전서 간이국한문 as a work whose copyright it owns.
The 2011 [Copyright Act amendment](https://www.law.go.kr/LSW/nwRvsLsInfoR.do?lsiSeq=114443)
extended the publication term for corporate works from 50 to 70 years in 2013
and excludes only rights that had already expired before the extension. The
1964 edition had not expired then, so the Wikisource `PD-old-50` tag is not a
sufficient redistribution grant. The active archaic lanes are therefore
limited to official legal text excluded by Copyright Act Article 7 and old
works with independently expired terms.

### Remaining Korean gaps

Each character below lacked a complete, exact, mixed-script sentence of at
most 24 code points in the retained licensed lanes after applying the source
balance policy. Longer text, isolated labels, parenthetical Hanja glosses, and
incomplete clauses were rejected.

| Character | Reason |
| --- | --- |
| 丁 | No qualifying licensed sentence retained. |
| 七 | No qualifying licensed sentence retained. |
| 不 | No qualifying licensed sentence retained. |
| 世 | No qualifying licensed sentence retained. |
| 中 | No qualifying licensed sentence retained. |
| 主 | No qualifying licensed sentence retained. |
| 九 | No qualifying licensed sentence retained. |
| 乳 | No qualifying licensed sentence retained. |
| 亂 | No qualifying licensed sentence retained. |
| 五 | No qualifying licensed sentence retained. |
| 亡 | No qualifying licensed sentence retained. |
| 交 | No qualifying licensed sentence retained. |
| 京 | No qualifying licensed sentence retained. |
| 人 | No qualifying licensed sentence retained. |
| 仁 | No qualifying licensed sentence retained. |
| 今 | No qualifying licensed sentence retained. |
| 仕 | No qualifying licensed sentence retained. |
| 他 | No qualifying licensed sentence retained. |
| 仙 | No qualifying licensed sentence retained. |
| 代 | No qualifying licensed sentence retained. |
| 令 | No qualifying licensed sentence retained. |
| 以 | No qualifying licensed sentence retained. |
| 件 | No qualifying licensed sentence retained. |
| 任 | No qualifying licensed sentence retained. |
| 伏 | No qualifying licensed sentence retained. |
| 伐 | No qualifying licensed sentence retained. |
| 休 | No qualifying licensed sentence retained. |
| 位 | No qualifying licensed sentence retained. |
| 低 | No qualifying licensed sentence retained. |
| 佛 | No qualifying licensed sentence retained. |
| 作 | No qualifying licensed sentence retained. |
| 使 | No qualifying licensed sentence retained. |
| 來 | No qualifying licensed sentence retained. |
| 例 | No qualifying licensed sentence retained. |
| 依 | No qualifying licensed sentence retained. |
| 侵 | No qualifying licensed sentence retained. |
| 便 | No qualifying licensed sentence retained. |
| 係 | No qualifying licensed sentence retained. |
| 俗 | No qualifying licensed sentence retained. |
| 保 | No qualifying licensed sentence retained. |
| 信 | No qualifying licensed sentence retained. |
| 修 | No qualifying licensed sentence retained. |
| 個 | No qualifying licensed sentence retained. |
| 倍 | No qualifying licensed sentence retained. |
| 候 | No qualifying licensed sentence retained. |
| 假 | No qualifying licensed sentence retained. |
| 偉 | No qualifying licensed sentence retained. |
| 停 | No qualifying licensed sentence retained. |
| 健 | No qualifying licensed sentence retained. |
| 傑 | No qualifying licensed sentence retained. |
| 備 | No qualifying licensed sentence retained. |
| 傳 | No qualifying licensed sentence retained. |
| 傷 | No qualifying licensed sentence retained. |
| 傾 | No qualifying licensed sentence retained. |
| 價 | No qualifying licensed sentence retained. |
| 儀 | No qualifying licensed sentence retained. |
| 億 | No qualifying licensed sentence retained. |
| 儉 | No qualifying licensed sentence retained. |
| 儒 | No qualifying licensed sentence retained. |
| 優 | No qualifying licensed sentence retained. |
| 元 | No qualifying licensed sentence retained. |
| 充 | No qualifying licensed sentence retained. |
| 先 | No qualifying licensed sentence retained. |
| 光 | No qualifying licensed sentence retained. |
| 兒 | No qualifying licensed sentence retained. |
| 全 | No qualifying licensed sentence retained. |
| 兩 | No qualifying licensed sentence retained. |
| 公 | No qualifying licensed sentence retained. |
| 六 | No qualifying licensed sentence retained. |
| 共 | No qualifying licensed sentence retained. |
| 兵 | No qualifying licensed sentence retained. |
| 具 | No qualifying licensed sentence retained. |
| 典 | No qualifying licensed sentence retained. |
| 冊 | No qualifying licensed sentence retained. |
| 再 | No qualifying licensed sentence retained. |
| 冬 | No qualifying licensed sentence retained. |
| 冷 | No qualifying licensed sentence retained. |
| 凶 | No qualifying licensed sentence retained. |
| 出 | No qualifying licensed sentence retained. |
| 分 | No qualifying licensed sentence retained. |
| 切 | No qualifying licensed sentence retained. |
| 刑 | No qualifying licensed sentence retained. |
| 列 | No qualifying licensed sentence retained. |
| 初 | No qualifying licensed sentence retained. |
| 判 | No qualifying licensed sentence retained. |
| 別 | No qualifying licensed sentence retained. |
| 利 | No qualifying licensed sentence retained. |
| 到 | No qualifying licensed sentence retained. |
| 制 | No qualifying licensed sentence retained. |
| 券 | No qualifying licensed sentence retained. |
| 刻 | No qualifying licensed sentence retained. |
| 則 | No qualifying licensed sentence retained. |
| 副 | No qualifying licensed sentence retained. |
| 創 | No qualifying licensed sentence retained. |
| 劇 | No qualifying licensed sentence retained. |
| 力 | No qualifying licensed sentence retained. |
| 功 | No qualifying licensed sentence retained. |
| 加 | No qualifying licensed sentence retained. |
| 助 | No qualifying licensed sentence retained. |
| 努 | No qualifying licensed sentence retained. |
| 勇 | No qualifying licensed sentence retained. |
| 動 | No qualifying licensed sentence retained. |
| 務 | No qualifying licensed sentence retained. |
| 勝 | No qualifying licensed sentence retained. |
| 勞 | No qualifying licensed sentence retained. |
| 勢 | No qualifying licensed sentence retained. |
| 勤 | No qualifying licensed sentence retained. |
| 勸 | No qualifying licensed sentence retained. |
| 包 | No qualifying licensed sentence retained. |
| 化 | No qualifying licensed sentence retained. |
| 北 | No qualifying licensed sentence retained. |
| 區 | No qualifying licensed sentence retained. |
| 午 | No qualifying licensed sentence retained. |
| 半 | No qualifying licensed sentence retained. |
| 卒 | No qualifying licensed sentence retained. |
| 卓 | No qualifying licensed sentence retained. |
| 協 | No qualifying licensed sentence retained. |
| 南 | No qualifying licensed sentence retained. |
| 博 | No qualifying licensed sentence retained. |
| 占 | No qualifying licensed sentence retained. |
| 印 | No qualifying licensed sentence retained. |
| 危 | No qualifying licensed sentence retained. |
| 卵 | No qualifying licensed sentence retained. |
| 卷 | No qualifying licensed sentence retained. |
| 厚 | No qualifying licensed sentence retained. |
| 原 | No qualifying licensed sentence retained. |
| 去 | No qualifying licensed sentence retained. |
| 參 | No qualifying licensed sentence retained. |
| 友 | No qualifying licensed sentence retained. |
| 反 | No qualifying licensed sentence retained. |
| 叔 | No qualifying licensed sentence retained. |
| 取 | No qualifying licensed sentence retained. |
| 受 | No qualifying licensed sentence retained. |
| 口 | No qualifying licensed sentence retained. |
| 古 | No qualifying licensed sentence retained. |
| 句 | No qualifying licensed sentence retained. |
| 可 | No qualifying licensed sentence retained. |
| 史 | No qualifying licensed sentence retained. |
| 右 | No qualifying licensed sentence retained. |
| 各 | No qualifying licensed sentence retained. |
| 合 | No qualifying licensed sentence retained. |
| 吉 | No qualifying licensed sentence retained. |
| 名 | No qualifying licensed sentence retained. |
| 向 | No qualifying licensed sentence retained. |
| 君 | No qualifying licensed sentence retained. |
| 否 | No qualifying licensed sentence retained. |
| 吸 | No qualifying licensed sentence retained. |
| 告 | No qualifying licensed sentence retained. |
| 周 | No qualifying licensed sentence retained. |
| 味 | No qualifying licensed sentence retained. |
| 呼 | No qualifying licensed sentence retained. |
| 和 | No qualifying licensed sentence retained. |
| 品 | No qualifying licensed sentence retained. |
| 員 | No qualifying licensed sentence retained. |
| 唱 | No qualifying licensed sentence retained. |
| 商 | No qualifying licensed sentence retained. |
| 問 | No qualifying licensed sentence retained. |
| 善 | No qualifying licensed sentence retained. |
| 喜 | No qualifying licensed sentence retained. |
| 單 | No qualifying licensed sentence retained. |
| 器 | No qualifying licensed sentence retained. |
| 嚴 | No qualifying licensed sentence retained. |
| 四 | No qualifying licensed sentence retained. |
| 回 | No qualifying licensed sentence retained. |
| 因 | No qualifying licensed sentence retained. |
| 困 | No qualifying licensed sentence retained. |
| 固 | No qualifying licensed sentence retained. |
| 圍 | No qualifying licensed sentence retained. |
| 園 | No qualifying licensed sentence retained. |
| 圓 | No qualifying licensed sentence retained. |
| 圖 | No qualifying licensed sentence retained. |
| 團 | No qualifying licensed sentence retained. |
| 土 | No qualifying licensed sentence retained. |
| 在 | No qualifying licensed sentence retained. |
| 地 | No qualifying licensed sentence retained. |
| 均 | No qualifying licensed sentence retained. |
| 城 | No qualifying licensed sentence retained. |
| 域 | No qualifying licensed sentence retained. |
| 基 | No qualifying licensed sentence retained. |
| 堂 | No qualifying licensed sentence retained. |
| 堅 | No qualifying licensed sentence retained. |
| 報 | No qualifying licensed sentence retained. |
| 場 | No qualifying licensed sentence retained. |
| 境 | No qualifying licensed sentence retained. |
| 墓 | No qualifying licensed sentence retained. |
| 增 | No qualifying licensed sentence retained. |
| 壁 | No qualifying licensed sentence retained. |
| 壇 | No qualifying licensed sentence retained. |
| 壓 | No qualifying licensed sentence retained. |
| 士 | No qualifying licensed sentence retained. |
| 壯 | No qualifying licensed sentence retained. |
| 夏 | No qualifying licensed sentence retained. |
| 夕 | No qualifying licensed sentence retained. |
| 外 | No qualifying licensed sentence retained. |
| 多 | No qualifying licensed sentence retained. |
| 夜 | No qualifying licensed sentence retained. |
| 天 | No qualifying licensed sentence retained. |
| 太 | No qualifying licensed sentence retained. |
| 夫 | No qualifying licensed sentence retained. |
| 失 | No qualifying licensed sentence retained. |
| 奇 | No qualifying licensed sentence retained. |
| 奉 | No qualifying licensed sentence retained. |
| 好 | No qualifying licensed sentence retained. |
| 如 | No qualifying licensed sentence retained. |
| 妙 | No qualifying licensed sentence retained. |
| 妨 | No qualifying licensed sentence retained. |
| 妹 | No qualifying licensed sentence retained. |
| 姉 | No qualifying licensed sentence retained. |
| 始 | No qualifying licensed sentence retained. |
| 姓 | No qualifying licensed sentence retained. |
| 委 | No qualifying licensed sentence retained. |
| 姿 | No qualifying licensed sentence retained. |
| 威 | No qualifying licensed sentence retained. |
| 婚 | No qualifying licensed sentence retained. |
| 婦 | No qualifying licensed sentence retained. |
| 孔 | No qualifying licensed sentence retained. |
| 字 | No qualifying licensed sentence retained. |
| 存 | No qualifying licensed sentence retained. |
| 孝 | No qualifying licensed sentence retained. |
| 季 | No qualifying licensed sentence retained. |
| 孤 | No qualifying licensed sentence retained. |
| 孫 | No qualifying licensed sentence retained. |
| 宅 | No qualifying licensed sentence retained. |
| 守 | No qualifying licensed sentence retained. |
| 安 | No qualifying licensed sentence retained. |
| 完 | No qualifying licensed sentence retained. |
| 官 | No qualifying licensed sentence retained. |
| 定 | No qualifying licensed sentence retained. |
| 客 | No qualifying licensed sentence retained. |
| 宣 | No qualifying licensed sentence retained. |
| 宮 | No qualifying licensed sentence retained. |
| 害 | No qualifying licensed sentence retained. |
| 容 | No qualifying licensed sentence retained. |
| 宿 | No qualifying licensed sentence retained. |
| 寄 | No qualifying licensed sentence retained. |
| 密 | No qualifying licensed sentence retained. |
| 富 | No qualifying licensed sentence retained. |
| 寒 | No qualifying licensed sentence retained. |
| 察 | No qualifying licensed sentence retained. |
| 寢 | No qualifying licensed sentence retained. |
| 實 | No qualifying licensed sentence retained. |
| 寫 | No qualifying licensed sentence retained. |
| 寶 | No qualifying licensed sentence retained. |
| 寸 | No qualifying licensed sentence retained. |
| 寺 | No qualifying licensed sentence retained. |
| 射 | No qualifying licensed sentence retained. |
| 將 | No qualifying licensed sentence retained. |
| 專 | No qualifying licensed sentence retained. |
| 尊 | No qualifying licensed sentence retained. |
| 對 | No qualifying licensed sentence retained. |
| 導 | No qualifying licensed sentence retained. |
| 小 | No qualifying licensed sentence retained. |
| 就 | No qualifying licensed sentence retained. |
| 局 | No qualifying licensed sentence retained. |
| 居 | No qualifying licensed sentence retained. |
| 屈 | No qualifying licensed sentence retained. |
| 屋 | No qualifying licensed sentence retained. |
| 展 | No qualifying licensed sentence retained. |
| 層 | No qualifying licensed sentence retained. |
| 屬 | No qualifying licensed sentence retained. |
| 島 | No qualifying licensed sentence retained. |
| 崇 | No qualifying licensed sentence retained. |
| 川 | No qualifying licensed sentence retained. |
| 州 | No qualifying licensed sentence retained. |
| 工 | No qualifying licensed sentence retained. |
| 巨 | No qualifying licensed sentence retained. |
| 差 | No qualifying licensed sentence retained. |
| 己 | No qualifying licensed sentence retained. |
| 布 | No qualifying licensed sentence retained. |
| 希 | No qualifying licensed sentence retained. |
| 帝 | No qualifying licensed sentence retained. |
| 師 | No qualifying licensed sentence retained. |
| 席 | No qualifying licensed sentence retained. |
| 帳 | No qualifying licensed sentence retained. |
| 帶 | No qualifying licensed sentence retained. |
| 常 | No qualifying licensed sentence retained. |
| 干 | No qualifying licensed sentence retained. |
| 平 | No qualifying licensed sentence retained. |
| 幸 | No qualifying licensed sentence retained. |
| 床 | No qualifying licensed sentence retained. |
| 序 | No qualifying licensed sentence retained. |
| 底 | No qualifying licensed sentence retained. |
| 店 | No qualifying licensed sentence retained. |
| 府 | No qualifying licensed sentence retained. |
| 度 | No qualifying licensed sentence retained. |
| 座 | No qualifying licensed sentence retained. |
| 庫 | No qualifying licensed sentence retained. |
| 庭 | No qualifying licensed sentence retained. |
| 康 | No qualifying licensed sentence retained. |
| 廣 | No qualifying licensed sentence retained. |
| 廳 | No qualifying licensed sentence retained. |
| 延 | No qualifying licensed sentence retained. |
| 建 | No qualifying licensed sentence retained. |
| 式 | No qualifying licensed sentence retained. |
| 引 | No qualifying licensed sentence retained. |
| 弱 | No qualifying licensed sentence retained. |
| 張 | No qualifying licensed sentence retained. |
| 強 | No qualifying licensed sentence retained. |
| 彈 | No qualifying licensed sentence retained. |
| 形 | No qualifying licensed sentence retained. |
| 往 | No qualifying licensed sentence retained. |
| 待 | No qualifying licensed sentence retained. |
| 律 | No qualifying licensed sentence retained. |
| 後 | No qualifying licensed sentence retained. |
| 徒 | No qualifying licensed sentence retained. |
| 得 | No qualifying licensed sentence retained. |
| 復 | No qualifying licensed sentence retained. |
| 德 | No qualifying licensed sentence retained. |
| 心 | No qualifying licensed sentence retained. |
| 必 | No qualifying licensed sentence retained. |
| 志 | No qualifying licensed sentence retained. |
| 忠 | No qualifying licensed sentence retained. |
| 快 | No qualifying licensed sentence retained. |
| 念 | No qualifying licensed sentence retained. |
| 怒 | No qualifying licensed sentence retained. |
| 思 | No qualifying licensed sentence retained. |
| 急 | No qualifying licensed sentence retained. |
| 性 | No qualifying licensed sentence retained. |
| 怨 | No qualifying licensed sentence retained. |
| 恨 | No qualifying licensed sentence retained. |
| 恩 | No qualifying licensed sentence retained. |
| 息 | No qualifying licensed sentence retained. |
| 患 | No qualifying licensed sentence retained. |
| 悲 | No qualifying licensed sentence retained. |
| 情 | No qualifying licensed sentence retained. |
| 惠 | No qualifying licensed sentence retained. |
| 惡 | No qualifying licensed sentence retained. |
| 想 | No qualifying licensed sentence retained. |
| 意 | No qualifying licensed sentence retained. |
| 愛 | No qualifying licensed sentence retained. |
| 感 | No qualifying licensed sentence retained. |
| 態 | No qualifying licensed sentence retained. |
| 慮 | No qualifying licensed sentence retained. |
| 慰 | No qualifying licensed sentence retained. |
| 慶 | No qualifying licensed sentence retained. |
| 憤 | No qualifying licensed sentence retained. |
| 憲 | No qualifying licensed sentence retained. |
| 應 | No qualifying licensed sentence retained. |
| 成 | No qualifying licensed sentence retained. |
| 戒 | No qualifying licensed sentence retained. |
| 或 | No qualifying licensed sentence retained. |
| 戰 | No qualifying licensed sentence retained. |
| 戶 | No qualifying licensed sentence retained. |
| 房 | No qualifying licensed sentence retained. |
| 所 | No qualifying licensed sentence retained. |
| 手 | No qualifying licensed sentence retained. |
| 才 | No qualifying licensed sentence retained. |
| 打 | No qualifying licensed sentence retained. |
| 批 | No qualifying licensed sentence retained. |
| 承 | No qualifying licensed sentence retained. |
| 技 | No qualifying licensed sentence retained. |
| 投 | No qualifying licensed sentence retained. |
| 抗 | No qualifying licensed sentence retained. |
| 折 | No qualifying licensed sentence retained. |
| 拍 | No qualifying licensed sentence retained. |
| 拒 | No qualifying licensed sentence retained. |
| 招 | No qualifying licensed sentence retained. |
| 拜 | No qualifying licensed sentence retained. |
| 持 | No qualifying licensed sentence retained. |
| 指 | No qualifying licensed sentence retained. |
| 掃 | No qualifying licensed sentence retained. |
| 授 | No qualifying licensed sentence retained. |
| 採 | No qualifying licensed sentence retained. |
| 探 | No qualifying licensed sentence retained. |
| 接 | No qualifying licensed sentence retained. |
| 推 | No qualifying licensed sentence retained. |
| 提 | No qualifying licensed sentence retained. |
| 揮 | No qualifying licensed sentence retained. |
| 援 | No qualifying licensed sentence retained. |
| 損 | No qualifying licensed sentence retained. |
| 擇 | No qualifying licensed sentence retained. |
| 擊 | No qualifying licensed sentence retained. |
| 操 | No qualifying licensed sentence retained. |
| 擔 | No qualifying licensed sentence retained. |
| 據 | No qualifying licensed sentence retained. |
| 擧 | No qualifying licensed sentence retained. |
| 支 | No qualifying licensed sentence retained. |
| 收 | No qualifying licensed sentence retained. |
| 改 | No qualifying licensed sentence retained. |
| 攻 | No qualifying licensed sentence retained. |
| 放 | No qualifying licensed sentence retained. |
| 政 | No qualifying licensed sentence retained. |
| 故 | No qualifying licensed sentence retained. |
| 效 | No qualifying licensed sentence retained. |
| 救 | No qualifying licensed sentence retained. |
| 敗 | No qualifying licensed sentence retained. |
| 敢 | No qualifying licensed sentence retained. |
| 散 | No qualifying licensed sentence retained. |
| 敬 | No qualifying licensed sentence retained. |
| 整 | No qualifying licensed sentence retained. |
| 敵 | No qualifying licensed sentence retained. |
| 斗 | No qualifying licensed sentence retained. |
| 料 | No qualifying licensed sentence retained. |
| 新 | No qualifying licensed sentence retained. |
| 斷 | No qualifying licensed sentence retained. |
| 方 | No qualifying licensed sentence retained. |
| 施 | No qualifying licensed sentence retained. |
| 旅 | No qualifying licensed sentence retained. |
| 旗 | No qualifying licensed sentence retained. |
| 早 | No qualifying licensed sentence retained. |
| 明 | No qualifying licensed sentence retained. |
| 易 | No qualifying licensed sentence retained. |
| 星 | No qualifying licensed sentence retained. |
| 映 | No qualifying licensed sentence retained. |
| 昨 | No qualifying licensed sentence retained. |
| 是 | No qualifying licensed sentence retained. |
| 晝 | No qualifying licensed sentence retained. |
| 普 | No qualifying licensed sentence retained. |
| 景 | No qualifying licensed sentence retained. |
| 智 | No qualifying licensed sentence retained. |
| 暇 | No qualifying licensed sentence retained. |
| 暖 | No qualifying licensed sentence retained. |
| 暗 | No qualifying licensed sentence retained. |
| 暴 | No qualifying licensed sentence retained. |
| 曜 | No qualifying licensed sentence retained. |
| 曲 | No qualifying licensed sentence retained. |
| 更 | No qualifying licensed sentence retained. |
| 書 | No qualifying licensed sentence retained. |
| 最 | No qualifying licensed sentence retained. |
| 會 | No qualifying licensed sentence retained. |
| 月 | No qualifying licensed sentence retained. |
| 服 | No qualifying licensed sentence retained. |
| 朗 | No qualifying licensed sentence retained. |
| 望 | No qualifying licensed sentence retained. |
| 朝 | No qualifying licensed sentence retained. |
| 期 | No qualifying licensed sentence retained. |
| 木 | No qualifying licensed sentence retained. |
| 未 | No qualifying licensed sentence retained. |
| 末 | No qualifying licensed sentence retained. |
| 朱 | No qualifying licensed sentence retained. |
| 朴 | No qualifying licensed sentence retained. |
| 李 | No qualifying licensed sentence retained. |
| 材 | No qualifying licensed sentence retained. |
| 村 | No qualifying licensed sentence retained. |
| 束 | No qualifying licensed sentence retained. |
| 東 | No qualifying licensed sentence retained. |
| 松 | No qualifying licensed sentence retained. |
| 板 | No qualifying licensed sentence retained. |
| 林 | No qualifying licensed sentence retained. |
| 果 | No qualifying licensed sentence retained. |
| 柳 | No qualifying licensed sentence retained. |
| 査 | No qualifying licensed sentence retained. |
| 核 | No qualifying licensed sentence retained. |
| 根 | No qualifying licensed sentence retained. |
| 格 | No qualifying licensed sentence retained. |
| 案 | No qualifying licensed sentence retained. |
| 條 | No qualifying licensed sentence retained. |
| 植 | No qualifying licensed sentence retained. |
| 業 | No qualifying licensed sentence retained. |
| 極 | No qualifying licensed sentence retained. |
| 榮 | No qualifying licensed sentence retained. |
| 構 | No qualifying licensed sentence retained. |
| 樂 | No qualifying licensed sentence retained. |
| 標 | No qualifying licensed sentence retained. |
| 模 | No qualifying licensed sentence retained. |
| 樣 | No qualifying licensed sentence retained. |
| 樹 | No qualifying licensed sentence retained. |
| 橋 | No qualifying licensed sentence retained. |
| 機 | No qualifying licensed sentence retained. |
| 檀 | No qualifying licensed sentence retained. |
| 檢 | No qualifying licensed sentence retained. |
| 權 | No qualifying licensed sentence retained. |
| 次 | No qualifying licensed sentence retained. |
| 歌 | No qualifying licensed sentence retained. |
| 歎 | No qualifying licensed sentence retained. |
| 歡 | No qualifying licensed sentence retained. |
| 止 | No qualifying licensed sentence retained. |
| 正 | No qualifying licensed sentence retained. |
| 步 | No qualifying licensed sentence retained. |
| 武 | No qualifying licensed sentence retained. |
| 歲 | No qualifying licensed sentence retained. |
| 歷 | No qualifying licensed sentence retained. |
| 歸 | No qualifying licensed sentence retained. |
| 死 | No qualifying licensed sentence retained. |
| 殘 | No qualifying licensed sentence retained. |
| 段 | No qualifying licensed sentence retained. |
| 殺 | No qualifying licensed sentence retained. |
| 母 | No qualifying licensed sentence retained. |
| 毒 | No qualifying licensed sentence retained. |
| 比 | No qualifying licensed sentence retained. |
| 毛 | No qualifying licensed sentence retained. |
| 氏 | No qualifying licensed sentence retained. |
| 氣 | No qualifying licensed sentence retained. |
| 水 | No qualifying licensed sentence retained. |
| 氷 | No qualifying licensed sentence retained. |
| 永 | No qualifying licensed sentence retained. |
| 求 | No qualifying licensed sentence retained. |
| 決 | No qualifying licensed sentence retained. |
| 汽 | No qualifying licensed sentence retained. |
| 河 | No qualifying licensed sentence retained. |
| 油 | No qualifying licensed sentence retained. |
| 治 | No qualifying licensed sentence retained. |
| 況 | No qualifying licensed sentence retained. |
| 泉 | No qualifying licensed sentence retained. |
| 法 | No qualifying licensed sentence retained. |
| 波 | No qualifying licensed sentence retained. |
| 注 | No qualifying licensed sentence retained. |
| 洋 | No qualifying licensed sentence retained. |
| 洗 | No qualifying licensed sentence retained. |
| 洞 | No qualifying licensed sentence retained. |
| 活 | No qualifying licensed sentence retained. |
| 派 | No qualifying licensed sentence retained. |
| 流 | No qualifying licensed sentence retained. |
| 浴 | No qualifying licensed sentence retained. |
| 海 | No qualifying licensed sentence retained. |
| 消 | No qualifying licensed sentence retained. |
| 液 | No qualifying licensed sentence retained. |
| 深 | No qualifying licensed sentence retained. |
| 混 | No qualifying licensed sentence retained. |
| 淸 | No qualifying licensed sentence retained. |
| 減 | No qualifying licensed sentence retained. |
| 測 | No qualifying licensed sentence retained. |
| 港 | No qualifying licensed sentence retained. |
| 湖 | No qualifying licensed sentence retained. |
| 源 | No qualifying licensed sentence retained. |
| 準 | No qualifying licensed sentence retained. |
| 溫 | No qualifying licensed sentence retained. |
| 漁 | No qualifying licensed sentence retained. |
| 演 | No qualifying licensed sentence retained. |
| 漢 | No qualifying licensed sentence retained. |
| 潔 | No qualifying licensed sentence retained. |
| 潮 | No qualifying licensed sentence retained. |
| 激 | No qualifying licensed sentence retained. |
| 濟 | No qualifying licensed sentence retained. |
| 火 | No qualifying licensed sentence retained. |
| 灰 | No qualifying licensed sentence retained. |
| 災 | No qualifying licensed sentence retained. |
| 炭 | No qualifying licensed sentence retained. |
| 烈 | No qualifying licensed sentence retained. |
| 無 | No qualifying licensed sentence retained. |
| 然 | No qualifying licensed sentence retained. |
| 煙 | No qualifying licensed sentence retained. |
| 熱 | No qualifying licensed sentence retained. |
| 燃 | No qualifying licensed sentence retained. |
| 燈 | No qualifying licensed sentence retained. |
| 營 | No qualifying licensed sentence retained. |
| 爆 | No qualifying licensed sentence retained. |
| 爭 | No qualifying licensed sentence retained. |
| 爲 | No qualifying licensed sentence retained. |
| 父 | No qualifying licensed sentence retained. |
| 牛 | No qualifying licensed sentence retained. |
| 牧 | No qualifying licensed sentence retained. |
| 物 | No qualifying licensed sentence retained. |
| 特 | No qualifying licensed sentence retained. |
| 犬 | No qualifying licensed sentence retained. |
| 犯 | No qualifying licensed sentence retained. |
| 狀 | No qualifying licensed sentence retained. |
| 獎 | No qualifying licensed sentence retained. |
| 獨 | No qualifying licensed sentence retained. |
| 玉 | No qualifying licensed sentence retained. |
| 王 | No qualifying licensed sentence retained. |
| 珍 | No qualifying licensed sentence retained. |
| 班 | No qualifying licensed sentence retained. |
| 球 | No qualifying licensed sentence retained. |
| 理 | No qualifying licensed sentence retained. |
| 環 | No qualifying licensed sentence retained. |
| 甘 | No qualifying licensed sentence retained. |
| 生 | No qualifying licensed sentence retained. |
| 産 | No qualifying licensed sentence retained. |
| 用 | No qualifying licensed sentence retained. |
| 田 | No qualifying licensed sentence retained. |
| 由 | No qualifying licensed sentence retained. |
| 甲 | No qualifying licensed sentence retained. |
| 申 | No qualifying licensed sentence retained. |
| 男 | No qualifying licensed sentence retained. |
| 留 | No qualifying licensed sentence retained. |
| 略 | No qualifying licensed sentence retained. |
| 番 | No qualifying licensed sentence retained. |
| 畫 | No qualifying licensed sentence retained. |
| 異 | No qualifying licensed sentence retained. |
| 當 | No qualifying licensed sentence retained. |
| 疑 | No qualifying licensed sentence retained. |
| 疲 | No qualifying licensed sentence retained. |
| 病 | No qualifying licensed sentence retained. |
| 痛 | No qualifying licensed sentence retained. |
| 登 | No qualifying licensed sentence retained. |
| 發 | No qualifying licensed sentence retained. |
| 白 | No qualifying licensed sentence retained. |
| 百 | No qualifying licensed sentence retained. |
| 益 | No qualifying licensed sentence retained. |
| 盛 | No qualifying licensed sentence retained. |
| 盜 | No qualifying licensed sentence retained. |
| 盡 | No qualifying licensed sentence retained. |
| 監 | No qualifying licensed sentence retained. |
| 目 | No qualifying licensed sentence retained. |
| 直 | No qualifying licensed sentence retained. |
| 相 | No qualifying licensed sentence retained. |
| 省 | No qualifying licensed sentence retained. |
| 看 | No qualifying licensed sentence retained. |
| 眞 | No qualifying licensed sentence retained. |
| 眼 | No qualifying licensed sentence retained. |
| 着 | No qualifying licensed sentence retained. |
| 督 | No qualifying licensed sentence retained. |
| 知 | No qualifying licensed sentence retained. |
| 短 | No qualifying licensed sentence retained. |
| 石 | No qualifying licensed sentence retained. |
| 砲 | No qualifying licensed sentence retained. |
| 破 | No qualifying licensed sentence retained. |
| 硏 | No qualifying licensed sentence retained. |
| 碑 | No qualifying licensed sentence retained. |
| 確 | No qualifying licensed sentence retained. |
| 示 | No qualifying licensed sentence retained. |
| 社 | No qualifying licensed sentence retained. |
| 祕 | No qualifying licensed sentence retained. |
| 祖 | No qualifying licensed sentence retained. |
| 祝 | No qualifying licensed sentence retained. |
| 神 | No qualifying licensed sentence retained. |
| 票 | No qualifying licensed sentence retained. |
| 祭 | No qualifying licensed sentence retained. |
| 禁 | No qualifying licensed sentence retained. |
| 福 | No qualifying licensed sentence retained. |
| 禮 | No qualifying licensed sentence retained. |
| 秀 | No qualifying licensed sentence retained. |
| 私 | No qualifying licensed sentence retained. |
| 秋 | No qualifying licensed sentence retained. |
| 科 | No qualifying licensed sentence retained. |
| 移 | No qualifying licensed sentence retained. |
| 稅 | No qualifying licensed sentence retained. |
| 程 | No qualifying licensed sentence retained. |
| 種 | No qualifying licensed sentence retained. |
| 穀 | No qualifying licensed sentence retained. |
| 積 | No qualifying licensed sentence retained. |
| 究 | No qualifying licensed sentence retained. |
| 空 | No qualifying licensed sentence retained. |
| 窓 | No qualifying licensed sentence retained. |
| 窮 | No qualifying licensed sentence retained. |
| 章 | No qualifying licensed sentence retained. |
| 童 | No qualifying licensed sentence retained. |
| 端 | No qualifying licensed sentence retained. |
| 競 | No qualifying licensed sentence retained. |
| 竹 | No qualifying licensed sentence retained. |
| 笑 | No qualifying licensed sentence retained. |
| 第 | No qualifying licensed sentence retained. |
| 筆 | No qualifying licensed sentence retained. |
| 等 | No qualifying licensed sentence retained. |
| 筋 | No qualifying licensed sentence retained. |
| 答 | No qualifying licensed sentence retained. |
| 管 | No qualifying licensed sentence retained. |
| 節 | No qualifying licensed sentence retained. |
| 範 | No qualifying licensed sentence retained. |
| 篇 | No qualifying licensed sentence retained. |
| 築 | No qualifying licensed sentence retained. |
| 簡 | No qualifying licensed sentence retained. |
| 籍 | No qualifying licensed sentence retained. |
| 米 | No qualifying licensed sentence retained. |
| 粉 | No qualifying licensed sentence retained. |
| 糧 | No qualifying licensed sentence retained. |
| 系 | No qualifying licensed sentence retained. |
| 紀 | No qualifying licensed sentence retained. |
| 約 | No qualifying licensed sentence retained. |
| 紅 | No qualifying licensed sentence retained. |
| 納 | No qualifying licensed sentence retained. |
| 純 | No qualifying licensed sentence retained. |
| 級 | No qualifying licensed sentence retained. |
| 素 | No qualifying licensed sentence retained. |
| 細 | No qualifying licensed sentence retained. |
| 終 | No qualifying licensed sentence retained. |
| 組 | No qualifying licensed sentence retained. |
| 給 | No qualifying licensed sentence retained. |
| 統 | No qualifying licensed sentence retained. |
| 絲 | No qualifying licensed sentence retained. |
| 絶 | No qualifying licensed sentence retained. |
| 經 | No qualifying licensed sentence retained. |
| 綠 | No qualifying licensed sentence retained. |
| 線 | No qualifying licensed sentence retained. |
| 緣 | No qualifying licensed sentence retained. |
| 練 | No qualifying licensed sentence retained. |
| 縮 | No qualifying licensed sentence retained. |
| 總 | No qualifying licensed sentence retained. |
| 績 | No qualifying licensed sentence retained. |
| 織 | No qualifying licensed sentence retained. |
| 繼 | No qualifying licensed sentence retained. |
| 續 | No qualifying licensed sentence retained. |
| 缺 | No qualifying licensed sentence retained. |
| 罪 | No qualifying licensed sentence retained. |
| 置 | No qualifying licensed sentence retained. |
| 罰 | No qualifying licensed sentence retained. |
| 羅 | No qualifying licensed sentence retained. |
| 羊 | No qualifying licensed sentence retained. |
| 美 | No qualifying licensed sentence retained. |
| 群 | No qualifying licensed sentence retained. |
| 義 | No qualifying licensed sentence retained. |
| 習 | No qualifying licensed sentence retained. |
| 老 | No qualifying licensed sentence retained. |
| 考 | No qualifying licensed sentence retained. |
| 者 | No qualifying licensed sentence retained. |
| 耳 | No qualifying licensed sentence retained. |
| 聖 | No qualifying licensed sentence retained. |
| 聞 | No qualifying licensed sentence retained. |
| 聲 | No qualifying licensed sentence retained. |
| 職 | No qualifying licensed sentence retained. |
| 聽 | No qualifying licensed sentence retained. |
| 肅 | No qualifying licensed sentence retained. |
| 肉 | No qualifying licensed sentence retained. |
| 育 | No qualifying licensed sentence retained. |
| 背 | No qualifying licensed sentence retained. |
| 胞 | No qualifying licensed sentence retained. |
| 能 | No qualifying licensed sentence retained. |
| 脈 | No qualifying licensed sentence retained. |
| 脫 | No qualifying licensed sentence retained. |
| 腸 | No qualifying licensed sentence retained. |
| 臣 | No qualifying licensed sentence retained. |
| 自 | No qualifying licensed sentence retained. |
| 至 | No qualifying licensed sentence retained. |
| 致 | No qualifying licensed sentence retained. |
| 與 | No qualifying licensed sentence retained. |
| 興 | No qualifying licensed sentence retained. |
| 舊 | No qualifying licensed sentence retained. |
| 舌 | No qualifying licensed sentence retained. |
| 舍 | No qualifying licensed sentence retained. |
| 舞 | No qualifying licensed sentence retained. |
| 航 | No qualifying licensed sentence retained. |
| 船 | No qualifying licensed sentence retained. |
| 良 | No qualifying licensed sentence retained. |
| 花 | No qualifying licensed sentence retained. |
| 苦 | No qualifying licensed sentence retained. |
| 英 | No qualifying licensed sentence retained. |
| 草 | No qualifying licensed sentence retained. |
| 落 | No qualifying licensed sentence retained. |
| 葉 | No qualifying licensed sentence retained. |
| 蓄 | No qualifying licensed sentence retained. |
| 藝 | No qualifying licensed sentence retained. |
| 藥 | No qualifying licensed sentence retained. |
| 處 | No qualifying licensed sentence retained. |
| 虛 | No qualifying licensed sentence retained. |
| 號 | No qualifying licensed sentence retained. |
| 蟲 | No qualifying licensed sentence retained. |
| 血 | No qualifying licensed sentence retained. |
| 衆 | No qualifying licensed sentence retained. |
| 行 | No qualifying licensed sentence retained. |
| 術 | No qualifying licensed sentence retained. |
| 街 | No qualifying licensed sentence retained. |
| 衛 | No qualifying licensed sentence retained. |
| 衣 | No qualifying licensed sentence retained. |
| 表 | No qualifying licensed sentence retained. |
| 裝 | No qualifying licensed sentence retained. |
| 製 | No qualifying licensed sentence retained. |
| 複 | No qualifying licensed sentence retained. |
| 西 | No qualifying licensed sentence retained. |
| 要 | No qualifying licensed sentence retained. |
| 見 | No qualifying licensed sentence retained. |
| 規 | No qualifying licensed sentence retained. |
| 視 | No qualifying licensed sentence retained. |
| 親 | No qualifying licensed sentence retained. |
| 覺 | No qualifying licensed sentence retained. |
| 覽 | No qualifying licensed sentence retained. |
| 觀 | No qualifying licensed sentence retained. |
| 角 | No qualifying licensed sentence retained. |
| 解 | No qualifying licensed sentence retained. |
| 言 | No qualifying licensed sentence retained. |
| 計 | No qualifying licensed sentence retained. |
| 討 | No qualifying licensed sentence retained. |
| 訓 | No qualifying licensed sentence retained. |
| 訪 | No qualifying licensed sentence retained. |
| 設 | No qualifying licensed sentence retained. |
| 許 | No qualifying licensed sentence retained. |
| 評 | No qualifying licensed sentence retained. |
| 試 | No qualifying licensed sentence retained. |
| 詩 | No qualifying licensed sentence retained. |
| 話 | No qualifying licensed sentence retained. |
| 誌 | No qualifying licensed sentence retained. |
| 認 | No qualifying licensed sentence retained. |
| 語 | No qualifying licensed sentence retained. |
| 誠 | No qualifying licensed sentence retained. |
| 誤 | No qualifying licensed sentence retained. |
| 說 | No qualifying licensed sentence retained. |
| 課 | No qualifying licensed sentence retained. |
| 調 | No qualifying licensed sentence retained. |
| 談 | No qualifying licensed sentence retained. |
| 請 | No qualifying licensed sentence retained. |
| 論 | No qualifying licensed sentence retained. |
| 講 | No qualifying licensed sentence retained. |
| 謝 | No qualifying licensed sentence retained. |
| 謠 | No qualifying licensed sentence retained. |
| 證 | No qualifying licensed sentence retained. |
| 識 | No qualifying licensed sentence retained. |
| 警 | No qualifying licensed sentence retained. |
| 議 | No qualifying licensed sentence retained. |
| 護 | No qualifying licensed sentence retained. |
| 讀 | No qualifying licensed sentence retained. |
| 變 | No qualifying licensed sentence retained. |
| 讚 | No qualifying licensed sentence retained. |
| 豆 | No qualifying licensed sentence retained. |
| 豊 | No qualifying licensed sentence retained. |
| 象 | No qualifying licensed sentence retained. |
| 豫 | No qualifying licensed sentence retained. |
| 負 | No qualifying licensed sentence retained. |
| 財 | No qualifying licensed sentence retained. |
| 貧 | No qualifying licensed sentence retained. |
| 貨 | No qualifying licensed sentence retained. |
| 責 | No qualifying licensed sentence retained. |
| 貯 | No qualifying licensed sentence retained. |
| 貴 | No qualifying licensed sentence retained. |
| 買 | No qualifying licensed sentence retained. |
| 費 | No qualifying licensed sentence retained. |
| 資 | No qualifying licensed sentence retained. |
| 賊 | No qualifying licensed sentence retained. |
| 賞 | No qualifying licensed sentence retained. |
| 賢 | No qualifying licensed sentence retained. |
| 賣 | No qualifying licensed sentence retained. |
| 質 | No qualifying licensed sentence retained. |
| 赤 | No qualifying licensed sentence retained. |
| 走 | No qualifying licensed sentence retained. |
| 起 | No qualifying licensed sentence retained. |
| 趣 | No qualifying licensed sentence retained. |
| 足 | No qualifying licensed sentence retained. |
| 路 | No qualifying licensed sentence retained. |
| 身 | No qualifying licensed sentence retained. |
| 車 | No qualifying licensed sentence retained. |
| 軍 | No qualifying licensed sentence retained. |
| 輕 | No qualifying licensed sentence retained. |
| 輪 | No qualifying licensed sentence retained. |
| 轉 | No qualifying licensed sentence retained. |
| 辭 | No qualifying licensed sentence retained. |
| 辯 | No qualifying licensed sentence retained. |
| 農 | No qualifying licensed sentence retained. |
| 迎 | No qualifying licensed sentence retained. |
| 近 | No qualifying licensed sentence retained. |
| 退 | No qualifying licensed sentence retained. |
| 送 | No qualifying licensed sentence retained. |
| 逃 | No qualifying licensed sentence retained. |
| 逆 | No qualifying licensed sentence retained. |
| 通 | No qualifying licensed sentence retained. |
| 速 | No qualifying licensed sentence retained. |
| 造 | No qualifying licensed sentence retained. |
| 連 | No qualifying licensed sentence retained. |
| 週 | No qualifying licensed sentence retained. |
| 進 | No qualifying licensed sentence retained. |
| 遇 | No qualifying licensed sentence retained. |
| 遊 | No qualifying licensed sentence retained. |
| 運 | No qualifying licensed sentence retained. |
| 過 | No qualifying licensed sentence retained. |
| 道 | No qualifying licensed sentence retained. |
| 達 | No qualifying licensed sentence retained. |
| 遠 | No qualifying licensed sentence retained. |
| 適 | No qualifying licensed sentence retained. |
| 選 | No qualifying licensed sentence retained. |
| 遺 | No qualifying licensed sentence retained. |
| 避 | No qualifying licensed sentence retained. |
| 邊 | No qualifying licensed sentence retained. |
| 邑 | No qualifying licensed sentence retained. |
| 郡 | No qualifying licensed sentence retained. |
| 郵 | No qualifying licensed sentence retained. |
| 都 | No qualifying licensed sentence retained. |
| 鄕 | No qualifying licensed sentence retained. |
| 配 | No qualifying licensed sentence retained. |
| 酒 | No qualifying licensed sentence retained. |
| 醫 | No qualifying licensed sentence retained. |
| 里 | No qualifying licensed sentence retained. |
| 重 | No qualifying licensed sentence retained. |
| 野 | No qualifying licensed sentence retained. |
| 量 | No qualifying licensed sentence retained. |
| 金 | No qualifying licensed sentence retained. |
| 針 | No qualifying licensed sentence retained. |
| 鉛 | No qualifying licensed sentence retained. |
| 銀 | No qualifying licensed sentence retained. |
| 銃 | No qualifying licensed sentence retained. |
| 銅 | No qualifying licensed sentence retained. |
| 錄 | No qualifying licensed sentence retained. |
| 錢 | No qualifying licensed sentence retained. |
| 鍾 | No qualifying licensed sentence retained. |
| 鏡 | No qualifying licensed sentence retained. |
| 鐵 | No qualifying licensed sentence retained. |
| 鑛 | No qualifying licensed sentence retained. |
| 門 | No qualifying licensed sentence retained. |
| 閉 | No qualifying licensed sentence retained. |
| 開 | No qualifying licensed sentence retained. |
| 閑 | No qualifying licensed sentence retained. |
| 關 | No qualifying licensed sentence retained. |
| 防 | No qualifying licensed sentence retained. |
| 降 | No qualifying licensed sentence retained. |
| 限 | No qualifying licensed sentence retained. |
| 院 | No qualifying licensed sentence retained. |
| 陣 | No qualifying licensed sentence retained. |
| 除 | No qualifying licensed sentence retained. |
| 陰 | No qualifying licensed sentence retained. |
| 陸 | No qualifying licensed sentence retained. |
| 陽 | No qualifying licensed sentence retained. |
| 隊 | No qualifying licensed sentence retained. |
| 階 | No qualifying licensed sentence retained. |
| 際 | No qualifying licensed sentence retained. |
| 障 | No qualifying licensed sentence retained. |
| 險 | No qualifying licensed sentence retained. |
| 隱 | No qualifying licensed sentence retained. |
| 雄 | No qualifying licensed sentence retained. |
| 集 | No qualifying licensed sentence retained. |
| 雜 | No qualifying licensed sentence retained. |
| 離 | No qualifying licensed sentence retained. |
| 難 | No qualifying licensed sentence retained. |
| 雨 | No qualifying licensed sentence retained. |
| 雪 | No qualifying licensed sentence retained. |
| 雲 | No qualifying licensed sentence retained. |
| 電 | No qualifying licensed sentence retained. |
| 靑 | No qualifying licensed sentence retained. |
| 靜 | No qualifying licensed sentence retained. |
| 非 | No qualifying licensed sentence retained. |
| 革 | No qualifying licensed sentence retained. |
| 音 | No qualifying licensed sentence retained. |
| 順 | No qualifying licensed sentence retained. |
| 頌 | No qualifying licensed sentence retained. |
| 領 | No qualifying licensed sentence retained. |
| 頭 | No qualifying licensed sentence retained. |
| 題 | No qualifying licensed sentence retained. |
| 額 | No qualifying licensed sentence retained. |
| 願 | No qualifying licensed sentence retained. |
| 類 | No qualifying licensed sentence retained. |
| 顯 | No qualifying licensed sentence retained. |
| 風 | No qualifying licensed sentence retained. |
| 飛 | No qualifying licensed sentence retained. |
| 食 | No qualifying licensed sentence retained. |
| 飮 | No qualifying licensed sentence retained. |
| 養 | No qualifying licensed sentence retained. |
| 餘 | No qualifying licensed sentence retained. |
| 首 | No qualifying licensed sentence retained. |
| 香 | No qualifying licensed sentence retained. |
| 馬 | No qualifying licensed sentence retained. |
| 驗 | No qualifying licensed sentence retained. |
| 驚 | No qualifying licensed sentence retained. |
| 骨 | No qualifying licensed sentence retained. |
| 體 | No qualifying licensed sentence retained. |
| 高 | No qualifying licensed sentence retained. |
| 髮 | No qualifying licensed sentence retained. |
| 鬪 | No qualifying licensed sentence retained. |
| 魚 | No qualifying licensed sentence retained. |
| 鮮 | No qualifying licensed sentence retained. |
| 鳥 | No qualifying licensed sentence retained. |
| 鳴 | No qualifying licensed sentence retained. |
| 鷄 | No qualifying licensed sentence retained. |
| 麗 | No qualifying licensed sentence retained. |
| 黃 | No qualifying licensed sentence retained. |
| 黑 | No qualifying licensed sentence retained. |
| 點 | No qualifying licensed sentence retained. |
| 黨 | No qualifying licensed sentence retained. |
| 鼻 | No qualifying licensed sentence retained. |
| 齒 | No qualifying licensed sentence retained. |
| 龍 | No qualifying licensed sentence retained. |
## Past-paper sourcing position

Past-paper sentences from 한국어문회 기출 문제, 漢検 過去問, or another exam
body are not copied into redistributable seed data without an explicit compatible
license or written permission. Current hard cap: **zero sentence rows per past
paper**. Published 배정한자 and grade-membership lists may be used only for the
factual curriculum membership they state, with citation; they do not authorize
copying question prose. Any future permission or open-license lane must be
documented here before its first row is added. No current sentence is derived
from a past paper.
