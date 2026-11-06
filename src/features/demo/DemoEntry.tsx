import { useState } from "react";
import "./demo.css";

type Props = { onStart: () => Promise<void> };

// Portfolio visitors get a throwaway sandbox profile (see POST /api/demo/session).
export function DemoEntry({ onStart }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setPending(true);
    setError("");
    try {
      await onStart();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "체험을 시작하지 못했습니다.");
      setPending(false);
    }
  }

  return (
    <div className="demo-entry">
      <button disabled={pending} onClick={() => void start()} type="button">가입 없이 체험하기</button>
      {error && <p className="pin-message" role="alert">{error}</p>}
    </div>
  );
}
