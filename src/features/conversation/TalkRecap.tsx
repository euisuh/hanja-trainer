import type { ConversationChunk } from "../../../shared/types";

type RecapChunk = Pick<ConversationChunk, "id" | "ja" | "kana" | "koCue" | "noteKo">;

export function TalkRecap({ chunks }: { chunks: readonly RecapChunk[] }) {
  if (chunks.length === 0) return null;
  return <section className="talk-screen__recap" aria-label="연습한 문장">
    <h2>연습한 문장</h2>
    <ul>{chunks.slice(0, 8).map((chunk) => <li key={chunk.id}>
      <strong lang="ja">{chunk.ja}</strong><span lang="ja">{chunk.kana}</span><p>{chunk.koCue}</p>
      {chunk.noteKo && <p>{chunk.noteKo}</p>}
    </li>)}</ul>
  </section>;
}
