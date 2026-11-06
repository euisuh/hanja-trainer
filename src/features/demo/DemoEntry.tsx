import { useState } from "react";
import "./demo.css";

type Props = { onStart: () => Promise<void> };

// Visitors can continue as a guest: a private throwaway profile (POST /api/demo/session).
export function DemoEntry({ onStart }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setPending(true);
    setError("");
    try {
      await onStart();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "게스트로 시작하지 못했습니다.");
      setPending(false);
    }
  }

  return (
    <div className="demo-entry">
      <button disabled={pending} onClick={() => void start()} type="button">게스트로 둘러보기</button>
      {error && <p className="pin-message" role="alert">{error}</p>}
    </div>
  );
}
