import { useCallback, useEffect, useRef, useState } from "react";
import type { ConversationChunkPayload } from "../../../shared/api";
import { apiUrl } from "../../platform/apiUrl";
import { SourceAttribution } from "../source/SourceAttribution";
import { hearGrade, SLOW_LISTEN_PLAYBACK_RATE } from "./listenCardModel";

type Props = {
  card: ConversationChunkPayload;
  choices: readonly ConversationChunkPayload[];
  capstone?: boolean;
  onNext: (grade: ReturnType<typeof hearGrade>, replays: number, input: "keyboard" | "tap") => void;
};

export function ListenCard({ card, choices, capstone = false, onNext }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [replays, setReplays] = useState(0);
  const [answered, setAnswered] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = useCallback((slow = false) => {
    audioRef.current?.pause();
    const audio = new Audio(apiUrl(card.audioUrl));
    audio.playbackRate = slow ? SLOW_LISTEN_PLAYBACK_RATE : 1;
    audioRef.current = audio;
    void audio.play().catch(() => undefined);
  }, [card.audioUrl]);

  useEffect(() => {
    play();
    return () => audioRef.current?.pause();
  }, [play]);

  const replay = useCallback((slow = false) => {
    setReplays((value) => value + 1);
    play(slow);
  }, [play]);

  const confirm = useCallback((input: "keyboard" | "tap") => {
    if (selectedId === null) return;
    if (answered) { onNext(hearGrade(selectedId === card.id, replays), replays, input); return; }
    setAnswered(true);
  }, [answered, card.id, onNext, replays, selectedId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches("button, input, textarea, select, audio") || target.isContentEditable)) return;
      if (event.key === " ") { event.preventDefault(); replay(); return; }
      if (/^[1-4]$/u.test(event.key)) {
        const choice = choices[Number(event.key) - 1];
        if (choice) { event.preventDefault(); setSelectedId(choice.id); }
        return;
      }
      if (event.key === "Enter" && selectedId !== null) { event.preventDefault(); confirm("keyboard"); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [choices, confirm, replay, selectedId]);

  const correct = selectedId === card.id;
  return <div className="talk-screen__listen">
    <p className="talk-screen__cue">듣고 뜻을 고르세요.</p>
    <div aria-label="뜻 고르기" className="talk-screen__intents">
      {choices.map((choice, index) => <button aria-pressed={selectedId === choice.id} className={selectedId === choice.id ? "is-preselected" : undefined} disabled={answered} key={choice.id} onClick={() => setSelectedId(choice.id)} type="button">{choice.koCue} <kbd>{index + 1}</kbd></button>)}
    </div>
    {answered && <div className="talk-screen__answer">
      <p>{correct ? "맞았습니다." : "다시 확인하세요."}</p>
      <small className="talk-screen__source">출처 · <SourceAttribution source={card.sourceRef} sourceAuthor={card.sourceAuthor} /></small>
    </div>}
    <footer className="talk-screen__bar">
      <button onClick={() => replay()} type="button">다시 듣기 <kbd>Space</kbd></button>
      <button disabled={capstone || replays === 0} onClick={() => replay(true)} type="button">느리게 {SLOW_LISTEN_PLAYBACK_RATE}×</button>
      <button disabled={selectedId === null} onClick={() => confirm("tap")} type="button">{answered ? "다음 쪽" : "확인"} <kbd>Enter</kbd></button>
    </footer>
  </div>;
}
