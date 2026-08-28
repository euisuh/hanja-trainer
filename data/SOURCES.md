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
