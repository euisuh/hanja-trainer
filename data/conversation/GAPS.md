# Conversation content gaps

## Filled by authored lines (2026-11-06)

The authored policy is in `docs/talk-mode.md`. These gaps below are now filled with `authored` rows
(each carries a `reviewNote`; audio pending, see `audio-todo.json`). Per-unit gap files under `gaps/` still describe the original Tatoeba search.

- Unit 3: 袋はご利用ですか, お箸はお付けしますか, お弁当は温めますか, 合計で〜円になります, 千円お預かりします, 〜円のお返しです, ありがとうございました (staff); 袋お願いします, 温めてください, 現金でお願いします (learner). New scene 2 uses them. 以上でよろしいですか alone is not authored in unit 3: 以上ですか？ (#191216) stays (unit 5 has ご注文は以上でよろしいですか).
- Unit 5: 店内でお召し上がりですか, ご注文は以上でよろしいですか, 合計で〜円になります, サイズはどうなさいますか, こちらがおすすめです (staff); 二人です, 持ち帰りでお願いします (learner). New scene 3 covers the party-size exchange, 〜円になります and the recommendation reply.
- Unit 6: はい、止まります, いいえ、乗り換えはありません (staff confirmations). New scene 3.
- Unit 8: 試着室はあちらです, こちらは〜円になります, 在庫を確認いたしますので少々お待ちください, プレゼント用にお包みしましょうか (staff). New scene 3.
- Unit 4 (구어 줄임말과 말버릇) and unit 15 (문말 조사 ね・よ・かな): spoken-register chunks with no Tatoeba pair worth shipping as a casual/polite contrast. Authored (`authoredScope: "spoken"`): contractions 〜てる, 〜ちゃう/〜じゃう, 〜とく, って, じゃ, 〜んです/〜んだ; fillers えーと, ええと, あのー, うーん, まあ; sentence-final ね, よ, よね, かな, だっけ, けどね, もん, 〜ない？; casual/polite pairs for the same meaning. About two thirds are casual register. Unit numbers 4 and 15 replace the brainstorm map entries (numbers/time, workplace); those topics are not started.
## Travel units 17-19 (2026-11-06)

New units for a Korean-native, travel-first learner: 17 표·승강장·택시, 18 호텔·숙박, 19 숫자·가격·시간. Every Japanese line is a verified Tatoeba sentence unless listed here. Authored share after this change: 131/697 unique chunks (18.8%, cap 20%, not raised); authored npc lines are at most 24% of any new unit. Audio keys are in `audio-todo.json`.

- Unit 17 authored staff (npc): 窓口でお買い求めください, 三番線です, 五番線です, あちらの券売機でできますよ, おいくらにしますか？, 千八百円になります, どちらへ行かれますか. Learner (spoken): 京都行きは何番線ですか (no Tatoeba hit with a real destination: only ダウンタウン行き #203857), このICカードにチャージしたいんですが (チャージ has no usable hit), 二千円お願いします, 駅に行きたいんですが, まっすぐですね / 右ですね / 左ですね (confirmations, also open in gaps/unit-06).
- Unit 18 authored staff (npc): 午後三時からです, 午後二時からです, 十一時までにお願いします, はい、大丈夫ですよ, 申し訳ございません、少し難しいです, お部屋の鍵をお預かりします, またのご利用をお待ちしております, 申し訳ございません。すぐ係の者がお伺いします, 申し訳ございません。別のお部屋をご用意します, ほかに何かございますか, すぐにお持ちします, こちらのカードに書いてあります, お部屋番号を教えていただけますか. Learner (spoken): キムと申します, チェックアウトを一時間遅らせていただけませんか (late checkout: no Tatoeba hit), タオルをもう一枚いただけますか, Wi-Fiがつながらないんですが.
- Unit 19 authored staff (npc): 千二百円です, 二千円です, 一万二千円です, 申し訳ございません、お値引きはしておりません, はい、お使いいただけます, 申し訳ございません、現金のみです, レシートはお渡ししますか？, 二千五百円になります, はい、パスポートをお見せください, 申し訳ございません、免税はできないんです, 営業時間は十時から七時までです (#189349 has no owner on Tatoeba, so it cannot carry attribution), 三時四十五分です, 二十分ぐらいです. Learner or friend lines (spoken): じゃあ、これにします, ちょっと高いので、やめておきます (polite refusal), 現金でお願いします (reused from unit 3), 大人二枚と、子ども一枚お願いします, 一万円札でもいいですか, 定休日はありますか, 三千円だったよ, いいよ、一人千五百円ね.
- Dropped because the Tatoeba row has no owner (cannot be attributed): #142099 切符は１枚１０００円です, #146174 乗り場は何番線ですか, #146180 乗り換えはありますか, #123466, #200406, #215169, #186549, #83396, #187432.
- Left out as unsure, not authored: ICカードの残高不足の案内 (残高が足りません vs 不足しています varies by railway), タクシーでの「ここを右に」の道案内, ルームサービスの注文, モーニングコールの職員側の言い方, 返金・キャンセル料の説明, 手荷物を宅配便で送る依頼, 免税カウンターでの手続き説明の全文.

### Status of the per-unit gap files (`gaps/unit-NN.md`)

Filled (authored, audio pending):
- gaps/unit-05: 二人です (二人です.); 店内でお召し上がりですか (店内でお召し上がりですか？); 持ち帰りでお願いします (持ち帰りでお願いします。); 以上でよろしいですか (as ご注文は以上でよろしいですか？); サイズはいかがなさいますか (サイズはどうなさいますか？, wording differs); staff reply to おすすめは何ですか (こちらがおすすめです。); 〜円になります (合計で千二百円になります。); ありがとうございました (staff). Scene 3 covers the party-size exchange.
- gaps/unit-06: staff answers to a confirmation question (はい、止まります。 / いいえ、乗り換えはありません。). Scene 3 uses both as NPC variants.
- gaps/unit-08: 在庫を確認します (在庫を確認いたしますので、少々お待ちください。); こちらは〜になります (こちらは五千四百円になります。); 試着室へどうぞ (試着室はあちらです。, wording differs); gift wrapping offer (プレゼント用にお包みしましょうか？, new). Scene 3 uses them.
- GAPS.md unit 3: 袋はご利用ですか, お箸はお付けしますか, 温めますか (お弁当は温めますか？), 〜円になります, お預かりします, お返し, 袋お願いします, 温めてください, 現金でお願いします.

## Filled by authored lines (2026-11-07)

26 new unique chunks; audio pending in `audio-todo.json`. Each has a self-contained Korean cue, kana reading, review note and usage note. Unique authored share is 158/723 (21.85%), up from 132/697 (18.94%); overall cap is now 25%, per-unit NPC cap unchanged at 50%. The older 131/697 figure above describes the previous recorded snapshot, not the measured starting count for this addition.

- Unit 2 (4): 日本語で何て言いますか; 明日までに出すということですか (〜ということですか); ちょっと分かりません; この紙に名前を書いて、明日までに出してください (NPC opener). Scene 1 now opens with the instruction and repeats it after the repair requests. The opener supplies content for the fast-explanation situation; no playback-speed setting is added.
- Unit 5 (2): 玉ねぎ抜きでできますか; わさび抜きでできますか. Ingredient omission requests, not allergy-safety guarantees.
- Unit 6 (4): 池袋で乗り換えですか; 新宿で乗り換えですか; 山手線は何番線ですか; 東京行きは何番線ですか. Learner station questions, with no route or platform answer asserted.
- Unit 8 (7): Mです; Lです; 二十四センチです; 二十五センチです; 他の色はありますか; 在庫はありますか; 取り置きをお願いします. Letter sizes are for clothes; centimeter sizes are for shoes.
- Unit 16 (9, all `authoredScope: "spoken"`): それはちょっと…; ちょっと難しいです; どうでしょう; そうかもしれませんね; そうかもしれませんが、私は少し違うと思います; 私は違うと思います; もう少し考えたほうがいいと思います; そうですね、でも少し高いと思います; 確かに便利ですが、少し高いと思います. These cover soft refusal, cautious response, concession and 〜と思います softeners. Scene 2 now uses the complete concession-and-disagreement reply in place of the weak 基本的には賛成です ending.

## Filled by authored lines (2026-11-07, second batch)

7 new unique chunks, no scene changes; audio pending in `audio-todo.json`. Unique authored share is 165/730 (22.60%), under the 25% cap; unit 6 authored npc lines are 3 of 45. Rows carry `authoredOn`, not an owner review; see `authored-review.md`.

- Unit 1 (2, spoken): そうなんですね (aizuchi for new information); よかったです (relief reply after 元気です).
- Unit 6 (2): 次の駅で山手線に乗り換えてください (npc; 〜線に乗り換えて with a named line); まっすぐ行って、右ですね (spoken; combined direction confirmation).
- Unit 16 (3, spoken): 私もです; そうなんですよ; 一理ありますね (partial concession; shipped with ね rather than the bare 一理あります).

## Still open

Per-unit `gaps/unit-NN.md` files retain the original corpus-search results; filled items are recorded above.

- Unit 2: もう一回言って (casual repeat request); すみません、早すぎましたか; もう少し速度を落として. Retained as unfilled corpus gaps; not needed for the scoped polite repair exchange.
- Unit 5: no remaining item from this task's scope.
- Unit 6: filled on 2026-11-07 (second batch, below).
- Unit 8: ちょっと…似合いますか replies. Fit judgments need clearer context; not authored here.
- Unit 16: polite/mid-register っていうか; polite 逆に; ごもっともです (service-register, out of place in an opinion unit); additional opinion-opening NPC lines. 私もです, そうなんですよ and 一理ありますね were filled on 2026-11-07 (second batch, below). The original per-unit owner-native-status check remains unchecked.
- Units 7, 9, 10, 11, 12, 13 and 14: all original per-unit gaps remain outside this task.
- Unit 1: そうなんですね and よかったです were filled on 2026-11-07 (second batch, below). あ、どうぞ (casual NPC offer) stays open: unit 1 ships no casual register. すみません as thanks and どうも alone stay open as noted in the unit 1 section.
- Units 17–19: the unsure travel items listed above remain open; those units are unchanged.

## Unit 2 corpus-search history

- Retired: もう一度ゆっくりお話しいただけますか？ (#9176323), a near-duplicate of すみません、もう一度言っていただけますか。 (#214201) and すみません、もう一度ゆっくり言ってください。 (#214202). すみません、何とおっしゃいましたか？ (#2929527) is a `say` chunk (key tatoeba-2929527-say).
- The authored additions above fill the original no-hit gaps for 日本語で何て言いますか, 〜ということですか, ちょっと分かりません and an NPC opener. They carry no Tatoeba attribution.

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
