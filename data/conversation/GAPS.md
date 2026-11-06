# Conversation content gaps

## Filled by authored lines (2026-11-06)

The authored policy is in `docs/talk-mode.md`. These gaps below are now filled with `authored` rows
(each carries a `reviewNote`; audio pending, see `audio-todo.json`). Per-unit gap files under `gaps/` still describe the original Tatoeba search.

- Unit 3: 袋はご利用ですか, お箸はお付けしますか, お弁当は温めますか, 合計で〜円になります, 千円お預かりします, 〜円のお返しです, ありがとうございました (staff); 袋お願いします, 温めてください, 現金でお願いします (learner). New scene 2 uses them. 以上でよろしいですか alone is not authored in unit 3: 以上ですか？ (#191216) stays (unit 5 has ご注文は以上でよろしいですか).
- Unit 5: 店内でお召し上がりですか, ご注文は以上でよろしいですか, 合計で〜円になります, サイズはどうなさいますか, こちらがおすすめです (staff); 二人です, 持ち帰りでお願いします (learner). New scene 3 covers the party-size exchange, 〜円になります and the recommendation reply.
- Unit 6: はい、止まります, いいえ、乗り換えはありません (staff confirmations). New scene 3.
- Unit 8: 試着室はあちらです, こちらは〜円になります, 在庫を確認いたしますので少々お待ちください, プレゼント用にお包みしましょうか (staff). New scene 3.
- Unit 4 (구어 줄임말과 말버릇) and unit 15 (문말 조사 ね・よ・かな): spoken-register chunks with no Tatoeba pair worth shipping as a casual/polite contrast. Authored (`authoredScope: "spoken"`): contractions 〜てる, 〜ちゃう/〜じゃう, 〜とく, って, じゃ, 〜んです/〜んだ; fillers えーと, ええと, あのー, うーん, まあ; sentence-final ね, よ, よね, かな, だっけ, けどね, もん, 〜ない？; casual/polite pairs for the same meaning. About two thirds are casual register. Unit numbers 4 and 15 replace the brainstorm map entries (numbers/time, workplace); those topics are not started.
### Status of the per-unit gap files (`gaps/unit-NN.md`)

Filled (authored, audio pending):
- gaps/unit-05: 二人です (二人です.); 店内でお召し上がりですか (店内でお召し上がりですか？); 持ち帰りでお願いします (持ち帰りでお願いします。); 以上でよろしいですか (as ご注文は以上でよろしいですか？); サイズはいかがなさいますか (サイズはどうなさいますか？, wording differs); staff reply to おすすめは何ですか (こちらがおすすめです。); 〜円になります (合計で千二百円になります。); ありがとうございました (staff). Scene 3 covers the party-size exchange.
- gaps/unit-06: staff answers to a confirmation question (はい、止まります。 / いいえ、乗り換えはありません。). Scene 3 uses both as NPC variants.
- gaps/unit-08: 在庫を確認します (在庫を確認いたしますので、少々お待ちください。); こちらは〜になります (こちらは五千四百円になります。); 試着室へどうぞ (試着室はあちらです。, wording differs); gift wrapping offer (プレゼント用にお包みしましょうか？, new). Scene 3 uses them.
- GAPS.md unit 3: 袋はご利用ですか, お箸はお付けしますか, 温めますか (お弁当は温めますか？), 〜円になります, お預かりします, お返し, 袋お願いします, 温めてください, 現金でお願いします.

Still open (not authored, no Tatoeba hit): gaps/unit-05 〜抜きでできますか; gaps/unit-06 〜で乗り換えですか, 〜は何番線ですか, 〜線に乗り換えて, まっすぐ行って、右ですね; gaps/unit-08 他の色はありますか (exact), サイズの答え (Mです / 〜センチです), 在庫はありますか, 取り置きお願いします, ちょっと…似合いますか replies; every item in gaps/unit-07, 09, 10, 11, 12, 13, 14 and 16 (those files are unchanged); GAPS.md unit 1 and unit 2 items.

- Still open: 日本語で何て言いますか, 〜ということですか, ちょっと分かりません, fast NPC opener in unit 2, サイズ answers in unit 8, all unit 16 hedges (not authored yet).

Chunks wanted by the curriculum with no natural Tatoeba sentence. Not invented.

## Unit 2

- 日本語で何て言いますか: only an unrelated "この動物は日本語で何と言いますか" (#220315, noun-specific, stiff).
- 〜ということですか: no standalone confirmation question; hits are noun-clause fragments.
- ちょっと分かりません (soft "I don't quite get it"): no hit.
- Fast NPC content line (any natural `hear` sentence) to open scene 1 so the repair request has something to repair: none in the unit (hear chunks are only repair replies). Scene 1 starts at the first honest turn until one is added.
- ちょっと分かりません is the soft form of 分かりません (chunk 8 cue steers toward it); still no Tatoeba hit.
- Retired from unit 2: もう一度ゆっくりお話しいただけますか？ (#9176323), a near-duplicate of すみません、もう一度言っていただけますか。 (#214201) and すみません、もう一度ゆっくり言ってください。 (#214202). すみません、何とおっしゃいましたか？ (#2929527) is now a `say` chunk (key tatoeba-2929527-say).
- もう一回言って (casual repeat request): no hit.
- すみません、早すぎましたか / もう少し速度を落として: no hit.

Chunks wanted by the curriculum that have no suitable Tatoeba sentence (CC BY 2.0 FR or CC0). Do not fill with invented Japanese.

## Unit 1 (인사와 맞장구)

- そうなんですね: no exact sentence. Substituted そうですか。(#5955917) and そうなんですか？(#2744751). Related casual form そうなんだ。(#5955920) exists but is not polite.
- お疲れ様です: no sentence. Substituted お疲れ様でした。(#688395).
- すみません as "thanks" (the third use): Tatoeba has no sentence that shows this use unambiguously; the text is identical to the "excuse me" use (#408301). Needs a scene or authored explanation, not a separate chunk.
- あ、どうぞ (casual offer to go first): no checked sentence; wanted as an NPC alternative to お先にどうぞ.
- よかったです (reply to 元気です): no checked sentence; wanted so scene 2 can continue after the NPC answer.
- Audio spot-check: aizuchi そうですか。 (#5955917) falls in pitch; Neural2 may render a rising question.
- Retired from unit 1: duplicate おはようございます (hear, #335372) until a listen card plays a different voice. Scene 1 cut to 3 turns (どういたしまして and 失礼します removed from the scene; chunks remain).
- どうも alone (#6865714, #8533930) exists but was left out: its thanks/greeting reading is ambiguous without context.

Wanted chunks with no natural Tatoeba sentence (CC BY 2.0 FR / CC0). Never paraphrase to fill these.

## Unit 3 (편의점 계산)

- 袋はご利用ですか / 袋はお付けしますか (staff bag question). Learner-side 袋は有りますか and ビニール袋に入れてください are shipped instead.
- お箸おつけしますか (staff chopsticks question). Only learner-side スプーンをいただけますか shipped.
- 〜円になります / 〜円お預かりします (staff total and payment phrases). 全部で三千円です is the closest real line.
- 温めますか as a standalone staff sentence and 温めてください (learner). Tatoeba has only the paired dialogues 「お弁当温めますか？」「あ、お願いします」 (#3989499) and 「こちら温めますか？」「いえ、結構です」 (#2806584), which hold two speakers in one sentence and cannot be a single chunk.
- 袋お願いします (learner). No exact sentence found.
- 以上でよろしいですか (polite staff form; 以上ですか？ #191216 shipped).
- 現金で(お願いします) (learner). 現金で支払います (#13183806) retired as unnatural at a till.
- お会計お願いします (#1014812) retired from unit 3: restaurant line, belongs to unit 5. Do not duplicate it here.
- 袋は有りますか？ (#2362311) retired: unusual orthography and the wrong question; 袋お願いします is logged above.
- いえ、結構です。 (#229316) stays as an alternative to 大丈夫です, not a scene target.
