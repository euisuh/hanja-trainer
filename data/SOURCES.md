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
`scripts/generate-kr-through-4geup.mjs` reproduces the six character files from
checkouts of the pinned grade pack and HanjaDict plus an extracted Unihan
directory; it performs no network lookup and emits no sentence prose.

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

Japanese and Chinese selections require an exact target-glyph match and store
its Unicode codepoint offset in `target_index`. Korean selections are modern
Hangul sentences with `target_index: null`; the target Hanja is displayed as a
separate label. All rows contain at most 24 Unicode code points. No source
sentence is generated, machine-translated, back-translated, or paraphrased.

## Tatoeba corpus

Originally retrieved 2026-08-28 and refreshed 2026-09-03 through the public
[Tatoeba sentence search API](https://api.tatoeba.org/).
Every `Tatoeba #{id}` row links to
`https://tatoeba.org/sentences/show/{id}`, which carries the sentence,
contributor, and license record. Tatoeba exports are released under
[CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/), with some
individual entries under CC0. These rows use `source_kind: corpus`.

`scripts/refresh-polite-sentences.mjs` reproduces the register refresh. It
searches for Japanese です/ます-family endings and simplified-Chinese (`Hans`)
sentences containing 您, excludes unapproved source and Korean translation
rows, requires an exact target glyph and a linked Korean translation, and
keeps the 24-code-point ceiling. Japanese candidates containing numeric glyphs
are excluded to preserve the kana-only reading contract. Existing polite rows
remain frozen. For each casual row with qualifying candidates, the shortest
source sentence wins; polite and direct Korean translations break ties. Rows
without a qualifying candidate remain unchanged.

The refreshed selection contains 281 Japanese rank-0 mappings, 252 with a
です/ます-family ending; 205 rows changed and 29 retained their casual fallback.
Chinese retains 431 identities (430 rank-0 and one rank-1) serialized as 526
rows because later HSK files repeat lower-level identities. Of those, 104
identities (146 serialized rows) contain 您; all 96 newly eligible identities
(136 serialized rows) changed, while 327 identities had no qualifying
simplified-Chinese candidate and retained their prior sentence.

## Korean modern polite lane

Issue #156 adopts the issue #150 decision to relax the literal-glyph rule only
for Korean. The official per-language
[Korean Tatoeba export](https://downloads.tatoeba.org/exports/per_language/kor/kor_sentences.tsv.bz2)
was retrieved 2026-09-02. It contains 15,897 rows and has SHA-256
`6ddb636c5e598ca65c29e27c0a57e547d4854264fc594aaa1adc6af527eee095`. The export is covered by the Tatoeba license and
attribution terms above.

`scripts/refresh-kr-polite-sentences.mjs` verifies that frozen-export hash,
then searches all 3,654 rows containing Hangul, no Han code point, at most
24 Unicode code points, and a polite `-요` or `-습니다`-family ending. A
normal mapping must contain, at the start of a Hangul word, the complete
reading of a two-character compound in `data/words/kr-wiktionary.json`, and
that sourced compound must list the target character as a member. Shortest
sentence and then lowest Tatoeba id break ties. Matching a bare 음 syllable is intentionally
insufficient because native words and homophones do not identify a Hanja.

71 mappings use the sourced-compound rule. 48 further mappings use the
reviewed exceptions below: an exact frozen Tatoeba id and token plus an
explicit 한자어 spelling, 훈 meaning, 음 context, or numeric value. The script
validates every exception before writing. Duplicate Tatoeba ids are allowed
only when every character independently passes one of these rules; a session
may consequently repeat a sentence.

Every row records its `Tatoeba #{id}` attribution and uses
`source_kind: corpus`, `target_index: null`, and `reading: null`.
`translation_ko` equals the unmodified Korean source text. Korean coverage
is 119 of 1000 characters. Japanese and Chinese retain the literal-glyph
offset contract unchanged. Across all tracks, 830 of 3,866 pairs have rank-0
sentences; one extra rank makes 831 unique seeded sentence identities.

### Reviewed Korean exceptions

| Character | Rule | Token | Source | Justification |
| --- | --- | --- | --- | --- |
| 從 | 훈 | `따라오세요` | Tatoeba #11106971 | 좇다와 같은 따라가다의 뜻 |
| 稱 | 훈 | `부르세요` | Tatoeba #1587076 | 일컫다와 같은 부르다의 뜻 |
| 滿 | 훈 | `가득` | Tatoeba #2478242 | 차서 가득한 상태 |
| 精 | 한자어 | `정신` | Tatoeba #8861378 | 정신 (精神) |
| 宗 | 한자어 | `종교` | Tatoeba #978656 | 종교 (宗教) |
| 結 | 한자어 | `결혼` | Tatoeba #13114035 | 결혼 (結婚) |
| 的 | 한자어 | `목적` | Tatoeba #6289889 | 목적 (目的) |
| 族 | 한자어 | `가족` | Tatoeba #13187810 | 가족 (家族) |
| 本 | 한자어 | `일본` | Tatoeba #13661161 | 일본 (日本) |
| 現 | 한자어 | `현재` | Tatoeba #13170403 | 현재 (現在) |
| 部 | 한자어 | `부서` | Tatoeba #10585906 | 부서 (部署) |
| 江 | 음 | `강물` | Tatoeba #1218636 | 강물의 강 |
| 內 | 훈 | `안에` | Tatoeba #4952515 | 안쪽의 뜻 |
| 立 | 훈 | `서 있어요` | Tatoeba #12146765 | 서다의 활용 |
| 每 | 한자어 | `매일` | Tatoeba #1533099 | 매일 (每日) |
| 事 | 훈 | `일이에요` | Tatoeba #13174332 | 일 또는 사건의 뜻 |
| 上 | 훈 | `위에` | Tatoeba #5099448 | 위쪽의 뜻 |
| 前 | 훈 | `앞은` | Tatoeba #13143784 | 앞쪽의 뜻 |
| 左 | 훈 | `왼쪽` | Tatoeba #13152276 | 왼쪽의 뜻 |
| 下 | 훈 | `내려가세요` | Tatoeba #10587917 | 아래로 가다의 뜻 |
| 同 | 한자어 | `동감` | Tatoeba #1587220 | 동감 (同感) |
| 面 | 훈 | `얼굴` | Tatoeba #11114979 | 낯 또는 얼굴의 뜻 |
| 命 | 훈 | `삶` | Tatoeba #2990082 | 목숨 또는 생명의 뜻 |
| 算 | 한자어 | `계산` | Tatoeba #1587141 | 계산 (計算) |
| 色 | 음 | `색은` | Tatoeba #8406161 | 빛깔을 뜻하는 색 |
| 少 | 훈 | `조금` | Tatoeba #3947816 | 적은 양의 뜻 |
| 數 | 한자어 | `수학` | Tatoeba #3191523 | 수학 (數學) |
| 有 | 훈 | `있어요` | Tatoeba #330713 | 존재하다의 뜻 |
| 入 | 한자어 | `입장` | Tatoeba #1015633 | 입장 (入場) |
| 住 | 훈 | `살고` | Tatoeba #8119523 | 거주하며 살다의 뜻 |
| 紙 | 훈 | `종이` | Tatoeba #3947786 | 종이의 뜻 |
| 千 | 수 | `1000` | Tatoeba #11106713 | 일천의 수값 |
| 春 | 훈 | `봄` | Tatoeba #13105958 | 봄의 뜻 |
| 年 | 한자어 | `내년` | Tatoeba #8119471 | 내년 (來年) |
| 大 | 한자어 | `대학생` | Tatoeba #7098211 | 대학생 (大學生) |
| 萬 | 수 | `만 엔` | Tatoeba #11106224 | 일만의 수값 |
| 民 | 한자어 | `주민` | Tatoeba #952518 | 주민 (住民) |
| 山 | 음 | `산이` | Tatoeba #963697 | 산의 뜻 |
| 三 | 수 | `셋` | Tatoeba #11105879 | 석 삼의 수값 |
| 室 | 훈 | `방은` | Tatoeba #1587175 | 방 또는 집의 뜻 |
| 十 | 한자어 | `오십` | Tatoeba #13216699 | 오십 (五十) |
| 二 | 수 | `두 개` | Tatoeba #13137948 | 두 이의 수값 |
| 一 | 수 | `하나` | Tatoeba #11106062 | 한 일의 수값 |
| 日 | 한자어 | `매일` | Tatoeba #1533099 | 매일 (每日) |
| 長 | 훈 | `긴 연설` | Tatoeba #11114977 | 길다의 활용이며 길 도로와 구별 |
| 弟 | 훈 | `동생` | Tatoeba #10605298 | 아우 또는 어린 형제의 뜻 |
| 八 | 수 | `8년` | Tatoeba #13206022 | 여덟의 수값 |
| 兄 | 한자어 | `형제` | Tatoeba #13131854 | 형제 (兄弟) |

### Remaining Korean gaps

881 characters have no qualifying row under the frozen corpus and
mapping rule.

| Character | Reason |
| --- | --- |
| 丁 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 七 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 不 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 中 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 九 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 乳 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 亂 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 五 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 亡 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 交 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 京 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 仁 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 今 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 仕 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 他 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 仙 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 代 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 令 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 以 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 件 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 伏 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 伐 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 休 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 位 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 低 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 佛 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 使 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 來 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 例 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 依 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 侵 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 便 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 係 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 俗 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 保 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 信 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 修 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 個 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 倍 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 候 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 假 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 偉 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 健 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 傑 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 傳 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 傷 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 傾 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 價 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 儀 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 億 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 儉 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 儒 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 優 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 元 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 充 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 先 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 光 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 兒 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 全 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 兩 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 公 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 六 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 共 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 兵 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 具 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 冊 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 再 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 冬 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 冷 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 凶 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 出 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 分 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 切 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 刑 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 列 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 初 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 判 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 別 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 利 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 到 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 制 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 券 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 刻 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 則 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 副 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 創 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 劇 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 力 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 功 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 加 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 助 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 努 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 勇 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 勉 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 務 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 勝 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 勞 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 勢 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 勤 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 勸 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 包 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 化 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 北 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 區 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 午 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 半 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 卒 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 卓 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 協 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 南 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 博 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 占 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 印 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 危 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 卵 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 卷 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 厚 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 原 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 去 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 參 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 友 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 反 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 叔 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 取 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 受 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 口 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 古 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 句 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 可 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 史 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 右 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 各 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 合 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 吉 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 名 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 向 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 君 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 吸 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 告 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 周 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 味 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 呼 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 品 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 員 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 唱 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 商 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 善 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 喜 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 單 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 器 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 嚴 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 四 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 回 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 因 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 困 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 固 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 圍 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 園 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 圓 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 圖 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 團 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 土 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 在 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 地 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 均 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 城 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 域 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 基 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 堂 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 堅 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 報 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 場 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 境 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 墓 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 增 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 壁 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 壇 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 壓 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 士 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 壯 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 夏 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 夕 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 外 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 多 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 夜 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 天 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 太 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 失 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 奇 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 奉 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 好 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 如 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 妙 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 妨 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 妹 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 姉 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 始 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 姓 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 委 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 姿 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 威 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 婚 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 婦 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 孔 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 存 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 孝 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 季 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 孤 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 孫 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 宅 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 守 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 安 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 完 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 官 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 定 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 客 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 宣 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 宮 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 害 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 容 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 宿 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 寄 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 密 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 富 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 寒 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 察 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 寢 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 實 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 寫 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 寶 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 寸 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 寺 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 射 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 將 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 專 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 尊 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 對 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 導 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 小 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 就 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 局 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 居 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 屈 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 屋 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 展 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 層 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 屬 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 島 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 崇 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 川 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 州 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 巨 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 差 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 己 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 布 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 希 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 帝 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 席 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 帳 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 帶 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 常 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 干 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 床 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 序 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 底 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 店 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 府 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 度 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 座 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 庫 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 庭 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 康 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 廣 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 廳 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 延 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 建 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 式 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 引 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 弱 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 張 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 強 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 彈 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 形 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 往 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 待 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 律 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 後 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 徒 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 得 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 復 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 德 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 心 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 必 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 志 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 忠 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 快 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 怒 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 思 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 急 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 性 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 怨 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 恨 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 恩 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 息 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 患 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 悲 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 情 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 惠 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 惡 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 想 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 意 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 愛 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 感 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 態 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 慮 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 慰 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 慶 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 憤 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 憲 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 應 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 成 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 戒 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 或 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 戰 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 戶 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 房 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 所 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 才 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 打 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 批 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 承 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 技 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 投 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 抗 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 折 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 拍 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 招 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 拜 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 持 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 指 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 掃 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 授 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 採 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 探 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 接 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 推 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 提 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 揮 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 援 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 損 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 擇 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 擊 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 操 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 擔 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 據 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 擧 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 支 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 收 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 改 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 攻 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 放 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 政 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 故 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 效 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 救 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 敗 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 敢 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 散 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 敬 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 整 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 敵 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 斗 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 料 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 新 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 斷 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 方 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 施 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 旅 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 旗 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 早 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 明 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 易 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 星 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 映 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 昨 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 是 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 晝 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 普 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 景 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 智 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 暇 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 暖 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 暗 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 暴 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 曜 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 曲 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 更 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 最 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 月 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 服 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 朗 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 望 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 朝 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 期 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 木 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 未 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 末 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 朱 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 朴 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 李 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 材 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 村 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 束 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 東 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 松 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 板 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 林 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 果 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 柳 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 査 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 核 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 根 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 格 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 案 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 條 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 植 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 業 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 極 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 榮 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 構 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 樂 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 標 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 模 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 樣 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 樹 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 橋 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 機 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 檀 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 檢 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 權 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 次 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 歎 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 歡 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 步 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 武 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 歲 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 歷 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 歸 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 死 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 殘 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 段 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 殺 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 毒 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 比 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 毛 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 氏 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 氣 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 水 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 氷 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 永 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 求 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 決 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 河 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 油 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 治 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 況 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 泉 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 法 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 波 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 注 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 洋 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 洗 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 洞 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 活 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 派 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 流 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 浴 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 海 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 消 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 液 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 深 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 混 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 淸 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 減 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 測 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 港 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 湖 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 源 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 溫 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 漁 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 演 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 漢 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 潔 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 潮 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 激 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 濟 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 火 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 灰 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 災 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 炭 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 烈 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 無 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 煙 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 熱 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 燃 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 燈 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 營 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 爆 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 爭 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 爲 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 牛 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 牧 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 特 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 犬 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 狀 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 獎 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 獨 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 玉 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 王 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 珍 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 班 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 球 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 理 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 環 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 甘 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 産 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 用 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 田 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 由 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 甲 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 申 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 留 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 略 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 番 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 畫 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 異 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 當 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 疑 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 疲 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 痛 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 登 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 發 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 白 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 百 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 益 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 盛 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 盜 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 盡 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 監 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 目 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 直 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 相 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 省 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 看 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 眞 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 眼 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 着 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 督 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 知 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 短 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 石 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 砲 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 破 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 硏 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 碑 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 確 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 示 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 祕 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 祖 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 祝 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 神 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 票 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 祭 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 禁 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 禮 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 秀 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 私 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 秋 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 移 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 稅 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 程 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 種 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 穀 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 積 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 究 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 空 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 窓 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 窮 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 章 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 童 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 端 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 競 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 竹 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 笑 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 第 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 筆 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 等 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 筋 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 管 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 節 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 範 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 篇 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 築 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 簡 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 籍 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 米 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 粉 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 糧 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 系 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 紀 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 約 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 紅 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 納 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 純 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 級 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 素 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 細 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 終 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 組 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 給 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 統 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 絲 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 絶 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 經 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 綠 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 線 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 緣 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 練 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 縮 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 總 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 績 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 織 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 繼 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 續 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 缺 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 置 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 罰 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 羅 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 羊 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 美 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 群 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 義 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 習 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 考 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 者 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 耳 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 聖 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 聞 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 聲 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 職 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 聽 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 肅 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 肉 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 育 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 背 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 胞 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 能 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 脈 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 脫 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 腸 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 臣 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 至 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 致 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 與 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 興 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 舊 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 舌 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 舍 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 舞 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 航 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 船 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 良 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 花 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 苦 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 草 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 華 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 落 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 葉 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 蓄 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 藝 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 藥 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 處 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 虛 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 號 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 蟲 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 血 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 衆 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 術 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 街 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 衛 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 衣 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 表 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 裝 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 製 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 複 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 西 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 要 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 見 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 規 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 視 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 親 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 覺 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 覽 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 觀 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 角 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 解 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 言 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 計 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 討 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 訓 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 訪 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 設 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 許 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 評 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 試 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 詩 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 話 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 誌 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 認 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 誠 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 誤 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 說 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 課 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 調 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 談 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 請 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 論 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 講 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 謝 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 謠 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 證 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 識 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 警 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 議 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 護 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 變 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 讚 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 豆 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 豊 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 象 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 豫 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 負 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 財 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 貧 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 貨 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 貯 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 貴 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 買 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 費 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 資 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 賊 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 賞 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 賢 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 賣 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 質 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 赤 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 走 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 起 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 趣 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 足 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 身 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 軍 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 輕 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 輪 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 轉 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 辯 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 農 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 迎 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 近 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 退 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 送 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 逃 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 逆 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 通 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 速 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 造 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 連 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 週 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 進 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 遇 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 遊 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 過 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 達 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 遠 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 適 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 選 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 遺 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 避 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 邊 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 邑 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 郡 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 郵 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 鄕 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 配 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 酒 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 醫 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 里 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 重 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 野 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 量 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 金 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 針 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 鉛 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 銃 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 銅 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 錄 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 錢 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 鍾 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 鏡 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 鐵 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 鑛 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 門 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 閉 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 開 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 閑 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 關 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 防 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 降 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 限 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 陣 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 除 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 陰 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 陸 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 陽 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 隊 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 階 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 際 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 障 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 險 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 隱 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 雄 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 集 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 雜 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 離 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 難 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 雨 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 雪 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 雲 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 電 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 靑 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 靜 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 非 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 革 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 音 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 順 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 頌 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 領 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 頭 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 額 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 願 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 類 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 顯 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 風 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 飛 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 食 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 飮 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 養 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 餘 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 首 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 香 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 馬 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 驗 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 驚 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 骨 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 體 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 高 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 髮 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 鬪 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 魚 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 鮮 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 鳥 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 鳴 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 鷄 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 麗 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 黃 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 黑 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 點 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 黨 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 鼻 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 齒 | No qualifying row contains an attested compound, and no reviewed exception applies. |
| 龍 | No qualifying row contains an attested compound, and no reviewed exception applies. |

## Past-paper sourcing position

Past-paper sentences from 한국어문회 기출 문제, 漢検 過去問, or another exam
body are not copied into redistributable seed data without an explicit compatible
license or written permission. Current hard cap: **zero sentence rows per past
paper**. Published 배정한자 and grade-membership lists may be used only for the
factual curriculum membership they state, with citation; they do not authorize
copying question prose. Any future permission or open-license lane must be
documented here before its first row is added. No current sentence is derived
from a past paper.
