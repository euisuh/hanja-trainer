import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConversationChunk, ConversationScene, ConversationSceneTurn } from "../../../shared/types";
import { apiUrl } from "../../platform/apiUrl";
import { LocalRecorder, localRecordingSupported, type LocalRecordingState } from "../study/speech";
import { enqueuePendingConversationAttempt } from "./attemptOutbox";
import { createSceneState, expectedReplyId, pickNpcLines, scenePassed, sceneReducer, type SceneAction } from "./sceneMachine";
import { SourceAttribution } from "../source/SourceAttribution";

type SceneChunk = ConversationChunk & { audioUrl: string };
type Props = { scene: ConversationScene & { turns: ConversationSceneTurn[] }; chunks: SceneChunk[]; profileId: number; onExit: () => void };

function attemptId(): string { return crypto.randomUUID(); }

export function SceneRunner({ scene, chunks, profileId, onExit }: Props) {
  const [state, setState] = useState(() => createSceneState(pickNpcLines(scene.turns)));
  const [recording, setRecording] = useState<LocalRecordingState>(() => localRecordingSupported() ? { status: "idle" } : { status: "unsupported" });
  const recorderRef = useRef<LocalRecorder | null>(null);
  const submittedResults = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chunkById = useMemo(() => new Map(chunks.map((chunk) => [chunk.id, chunk])), [chunks]);
  const turn = scene.turns[state.turnIndex];
  const targetId = turn?.speaker === "npc" ? state.npcPlayed[state.turnIndex] : expectedReplyId(scene.turns, state.turnIndex, state.npcPlayed);
  const target = targetId ? chunkById.get(targetId) : undefined;
  const npcTurn = scene.turns.slice(0, state.turnIndex + 1).reverse().find(({ speaker }) => speaker === "npc");
  const npc = npcTurn ? chunkById.get(state.npcPlayed[scene.turns.indexOf(npcTurn)] ?? 0) : undefined;
  const dispatch = useCallback((action: SceneAction) => setState((current) => sceneReducer(current, action, scene.turns)), [scene.turns]);
  const start = () => dispatch({ type: "start" });

  useEffect(() => {
    const recorder = new LocalRecorder((next) => { setRecording(next); if (next.status === "ready") dispatch({ type: "answer", latencyMs: next.onsetMs }); });
    recorderRef.current = recorder;
    return () => { recorder.dispose(); if (recorderRef.current === recorder) recorderRef.current = null; };
  }, [dispatch]);

  const replay = useCallback(() => {
    if (!npc) return;
    audioRef.current?.pause();
    const audio = new Audio(apiUrl(npc.audioUrl));
    audioRef.current = audio;
    void audio.play().catch(() => undefined);
  }, [npc]);

  useEffect(() => { if (state.phase === "npc") replay(); }, [replay, state.phase]);
  useEffect(() => {
    for (const result of state.results.slice(submittedResults.current)) {
      const chunk = chunkById.get(result.chunkId);
      if (chunk) enqueuePendingConversationAttempt(profileId, { clientAttemptId: attemptId(), chunkId: chunk.id, sceneId: scene.id, role: chunk.role, grade: result.grade, answeredAt: Date.now(), latencyMs: result.latencyMs, hints: result.hints, loop: "roleplay", input: result.latencyMs === null ? "tap" : "voice" });
    }
    submittedResults.current = state.results.length;
  }, [chunkById, profileId, scene.id, state.results]);

  const record = useCallback(() => {
    if (recording.status === "recording") recorderRef.current?.stop();
    else if (recording.status !== "requesting" && recording.status !== "unsupported") void recorderRef.current?.record();
  }, [recording.status]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target.matches("button, input, textarea, select") || event.target.isContentEditable)) return;
      if (event.key === "Escape") { event.preventDefault(); onExit(); }
      else if (event.key === " ") { event.preventDefault(); replay(); }
      else if (event.key === "r" || event.key === "R") { event.preventDefault(); record(); }
      else if (event.key === "h" || event.key === "H") { event.preventDefault(); dispatch({ type: "hint" }); }
      else if (event.key === "Enter" && state.phase !== "learner" && state.phase !== "grading") { event.preventDefault(); recorderRef.current?.discard(); dispatch({ type: "next" }); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch, onExit, record, replay, state.phase]);

  if (state.phase === "intro") return <section className="talk-root talk-scene"><p className="talk-scene__meta">p.{scene.ord} · 대화 연습</p><h1>{scene.titleKo}</h1><p>{scene.settingKo}</p><p>{scene.goalKo}</p><button onClick={start} type="button">장면 시작</button><button onClick={onExit} type="button">돌아가기</button></section>;
  if (state.phase === "complete") return <section className="talk-root talk-scene"><p className="talk-scene__meta">대화 연습 끝</p><h1>{scenePassed(state) ? "통과" : "다시 연습"}</h1><button onClick={() => { submittedResults.current = 0; setState(createSceneState(pickNpcLines(scene.turns))); }} type="button">다시 하기</button><button onClick={onExit} type="button">끝내기</button></section>;
  return <section className="talk-root talk-scene" data-scene-phase={state.phase}>
    <header className="talk-scene__meta"><span>{scene.titleKo}</span><span>{state.turnIndex + 1} / {scene.turns.length}</span></header>
    <div className="talk-scene__spread">
      <article className="talk-scene__their"><small>상대방</small>{state.npcTextVisible && <><strong lang="ja">{npc?.ja}</strong><small className="talk-screen__source">출처 · <SourceAttribution source={npc?.sourceRef} sourceAuthor={npc?.sourceAuthor} /></small></>}<button onClick={replay} type="button">다시 듣기 <kbd>Space</kbd></button></article>
      <article className="talk-scene__yours"><small>내 차례</small>{state.phase !== "npc" && <><p className="talk-scene__cue">{target?.koCue}</p>{state.phase === "reveal" && <><strong className="talk-scene__target" lang="ja">{target?.ja}</strong>{target?.noteKo && <small className="talk-screen__source talk-screen__note">{target.noteKo}</small>}<small className="talk-screen__source">출처 · <SourceAttribution source={target?.sourceRef} sourceAuthor={target?.sourceAuthor} /></small></>}</>}</article>
    </div>
    <footer className="talk-scene__bar">
      {(state.phase === "npc" || state.phase === "reveal") && <button onClick={() => dispatch({ type: "next" })} type="button">다음 <kbd>Enter</kbd></button>}
      {state.phase === "learner" && <><button onClick={() => dispatch({ type: "hint" })} type="button">힌트 <kbd>H</kbd></button><button disabled={recording.status === "requesting" || recording.status === "unsupported"} onClick={record} type="button">{recording.status === "recording" ? "녹음 중지" : "말하기"} <kbd>R</kbd></button><button onClick={() => dispatch({ type: "answer", latencyMs: null })} type="button">말했어요</button></>}
      {state.phase === "grading" && <div role="group" aria-label="자기 평가"><button onClick={() => dispatch({ type: "grade", grade: "again" })} type="button">못함</button><button onClick={() => dispatch({ type: "grade", grade: "hard" })} type="button">막힘</button><button onClick={() => dispatch({ type: "grade", grade: "good" })} type="button">바로</button></div>}
    </footer>
  </section>;
}
