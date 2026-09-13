import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { avatarBackground } from "../design/tokens";
import { Keypad } from "../features/pin/Keypad";
import { RecoveryCodeNotice } from "../features/pin/RecoveryCodeNotice";
import { avatarHue } from "../features/profile/avatarHue";
import { ApiClientError, apiClient } from "../lib/apiClient";
import type { PublicProfile } from "../../shared/api";
import "../features/pin/pin.css";

type UnlockScreenProps = {
  lockedUntil: number | null;
  onBack?: () => void;
  onUnlock: () => Promise<void>;
  profile: PublicProfile;
};

export function UnlockScreen({ lockedUntil: initialLockedUntil, onBack, onUnlock, profile }: UnlockScreenProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState(() => initialLockedUntil && initialLockedUntil > Date.now()
    ? `잠시 기다려 주세요. ${Math.ceil((initialLockedUntil - Date.now()) / 1_000)}초 후 다시 시도할 수 있습니다.`
    : "");
  const [pending, setPending] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [code, setCode] = useState("");
  const [issuedRecoveryCode, setIssuedRecoveryCode] = useState("");
  const pendingRef = useRef(false);
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

  useEffect(() => {
    if (!onBack) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || pendingRef.current) return;
      event.preventDefault();
      onBack();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onBack]);

  async function submit(value: string) {
    if (pendingRef.current || remaining) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    setAnnouncement("");
    try {
      const result = await apiClient.unlockPin(profile.id, value);
      if (result.recoveryCode) setIssuedRecoveryCode(result.recoveryCode);
      else await onUnlock();
    } catch (caught) {
      const wait = caught instanceof ApiClientError ? caught.retryAfter : undefined;
      if (wait) setLockedUntil(Date.now() + wait * 1_000);
      const invalidPin = caught instanceof ApiClientError && caught.code === "invalid_pin";
      const message = wait
        ? `잠시 기다려 주세요. ${wait}초 후 다시 시도할 수 있습니다.`
        : invalidPin ? "PIN이 올바르지 않습니다." : caught instanceof Error ? caught.message : "PIN을 확인하지 못했습니다.";
      setError(wait ? "" : message);
      setAnnouncement(message);
      setPin("");
      setShakeKey((key) => key + 1);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  async function recover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current || remaining || code.length !== 10) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    setAnnouncement("");
    try {
      await apiClient.recoverPin(profile.id, code);
      await onUnlock();
    } catch (caught) {
      const wait = caught instanceof ApiClientError ? caught.retryAfter : undefined;
      if (wait) setLockedUntil(Date.now() + wait * 1_000);
      const message = wait
        ? `잠시 기다려 주세요. ${wait}초 후 다시 시도할 수 있습니다.`
        : caught instanceof ApiClientError && caught.code === "invalid_pin"
          ? "복구 코드가 올바르지 않습니다."
          : caught instanceof Error ? caught.message : "복구 코드를 확인하지 못했습니다.";
      setError(wait ? "" : message);
      setAnnouncement(message);
      setCode("");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <main className="unlock-screen">
      <section className="unlock-card">
        {onBack && <button className="unlock-card__back" disabled={pending} onClick={() => { if (!pendingRef.current) onBack(); }} type="button">← 프로필 선택</button>}
        {onBack
          ? <span className="unlock-card__avatar" style={{ "--avatar-hue": avatarHue(profile.id), "--avatar-background": avatarBackground } as CSSProperties} aria-hidden="true">{[...profile.name][0]}</span>
          : <span className="unlock-card__mark" aria-hidden="true">字</span>}
        <h1>{onBack ? profile.name : "기기 잠금"}</h1>
        {issuedRecoveryCode ? <RecoveryCodeNotice code={issuedRecoveryCode} onDismiss={() => { setIssuedRecoveryCode(""); void onUnlock(); }} /> : recovering ? (
          <form className="pin-recovery-form" onSubmit={recover}>
            <label htmlFor="recovery-code">복구 코드를 입력하세요.</label>
            <input
              autoCapitalize="characters"
              autoComplete="off"
              autoFocus
              disabled={pending || Boolean(remaining)}
              id="recovery-code"
              maxLength={10}
              onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/gu, "").slice(0, 10))}
              spellCheck={false}
              value={code}
            />
            <button className="pin-action" disabled={pending || Boolean(remaining) || code.length !== 10} type="submit">PIN 해제</button>
            <button className="pin-action pin-action--secondary" disabled={pending} onClick={() => { setRecovering(false); setCode(""); setError(""); }} type="button">PIN 입력으로 돌아가기</button>
          </form>
        ) : (
          <>
            <p>4자리 PIN을 입력하세요.</p>
            <Keypad disabled={pending || Boolean(remaining)} key={shakeKey} onChange={setPin} onComplete={submit} shakeKey={shakeKey} value={pin} />
            {profile.isAdmin && <button className="unlock-card__recovery" disabled={pending || Boolean(remaining)} onClick={() => { setRecovering(true); setError(""); }} type="button">PIN을 잊으셨나요?</button>}
          </>
        )}
        {!issuedRecoveryCode && <><p className="pin-message">{remaining ? `${remaining}초 후 다시 시도할 수 있습니다.` : error}</p><p role="alert" aria-live="assertive" className="pin-announcement">{announcement}</p></>}
      </section>
    </main>
  );
}
