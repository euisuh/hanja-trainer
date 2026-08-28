# Seed data format

`npm run seed:local -- <file...>` validates and loads seed files into local D1. Use `npm run seed:remote -- <file...>` only after reviewing the same files locally. Both commands are idempotent.

A simple seed file is an array of character entries, as in `characters.sample.json`:

```json
[
  {
    "key": "學",
    "meaningEn": "learn",
    "meaningKo": "배울",
    "variants": { "kr": "學", "jp": "学", "cn": "学" },
    "strokeCount": 16,
    "tracks": [
      {
        "track": "kr",
        "glyph": "學",
        "reading": "배울 학",
        "level": "8급",
        "levelOrd": 1,
        "sentences": [
          {
            "text": "學校에서 공부한다.",
            "translationKo": "학교에서 공부한다.",
            "source": "8급 기출 어휘",
            "sourceKind": "past_paper",
            "targetIndex": 0,
            "rank": 0
          }
        ]
      }
    ]
  }
]
```

`tracks` may contain any subset of `kr`, `jp`, and `cn`. The glyph must equal `variants[track]`, falling back to `key`. Track-specific fields are:

- `kr`: `reading`, `level`
- `jp`: `on`, `kun`, `kanken`, `jlpt`
- `cn`: `pinyin`, `meaning`, `hsk`, `tier`

`sourceKind` is `textbook`, `past_paper`, or `corpus`. `targetIndex` is a zero-based Unicode codepoint offset, not a UTF-16 string index.

Files that also define curriculum use `{ "characters": [...], "curriculumUnits": [...] }`. Each unit contains `track`, `level`, `ord`, `title`, `subtitle`, and `members: [{ "key", "ord" }]`. Every member key must occur in that file's `characters` array.

## Level ordinals

Ascending values mean harder material.

| KR level | 8급 | 7급II | 7급 | 6급II | 6급 | 5급II | 5급 | 4급II | 4급 | 3급II | 3급 | 2급 | 1급 | 특급II | 특급 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `levelOrd` | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |

| JP level | 10級 | 9級 | 8級 | 7級 | 6級 | 5級 | 4級 | 3級 | 準2級 | 2級 | 準1級 | 1級 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `levelOrd` | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |

| CN level | HSK 1 | HSK 2 | HSK 3 | HSK 4 | HSK 5 | HSK 6 | HSK 7-9 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `levelOrd` | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
