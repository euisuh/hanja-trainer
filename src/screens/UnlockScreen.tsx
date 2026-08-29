import { useEffect, useState } from "react";
import { Keypad } from "../features/pin/Keypad";
import { ApiClientError, apiClient } from "../lib/apiClient";
import "../features/pin/pin.css";

type UnlockScreenProps = { lockedUntil: number | null; onUnlock: () => void };

export function UnlockScreen({ lockedUntil: initialLockedUntil, onUnlock }: UnlockScreenProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState(() => initialLockedUntil && initialLockedUntil > Date.now()
    ? `잠시 기다려 주세요. ${Math.ceil((initialLockedUntil - Date.now()) / 1_000)}초 후 다시 시도할 수 있습니다.`
    : "");
  const [pending, setPending] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(initialLockedUntil);
  const [now, setNow] = useState(() => Date.now());
  const remaining = lockedUntil && lockedUntil > now ? Math.ceil((lockedUntil - now) / 1_000) : 0;

  useEffect(() => {
    if (!lockedUntil) return;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= lockedUntil) {
        setLockedUntil(null);
        setError("");
        setAnnouncement("");
      }
    };
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  async function submit(value: string) {
    if (pending || remaining) return;
    setPending(true);
    setError("");
    setAnnouncement("");
    try {
      await apiClient.unlockPin(value);
      onUnlock();
    } catch (caught) {
      const wait = caught instanceof ApiClientError ? caught.retryAfter : undefined;
      if (wait) setLockedUntil(Date.now() + wait * 1_000);
      const message = wait ? `잠시 기다려 주세요. ${wait}초 후 다시 시도할 수 있습니다.` : "PIN이 올바르지 않습니다.";
      setError(wait ? "" : message);
      setAnnouncement(message);
      setPin("");
      setShakeKey((key) => key + 1);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="unlock-screen">
      <section className="unlock-card">
        <span className="unlock-card__mark" aria-hidden="true">字</span>
        <h1>기기 잠금</h1>
        <p>4자리 PIN을 입력하세요.</p>
        <Keypad disabled={pending || Boolean(remaining)} key={shakeKey} onChange={setPin} onComplete={submit} shakeKey={shakeKey} value={pin} />
        <p className="pin-message">{remaining ? `${remaining}초 후 다시 시도할 수 있습니다.` : error}</p>
        <p role="alert" aria-live="assertive" className="pin-announcement">{announcement}</p>
      </section>
    </main>
  );
}
