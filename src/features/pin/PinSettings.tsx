import { useEffect, useState } from "react";
import { ApiClientError, PIN_REQUIRED_EVENT, apiClient } from "../../lib/apiClient";
import { Keypad } from "./Keypad";
import { RecoveryCodeNotice } from "./RecoveryCodeNotice";

type Action = "set" | "change" | "remove";
type Stage = "current" | "next" | "confirm";

export function PinSettings() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [stage, setStage] = useState<Stage>("next");
  const [value, setValue] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [nextPin, setNextPin] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void apiClient.pinState(controller.signal).then((state) => {
      if (!controller.signal.aborted) setEnabled(state.enabled);
    }).catch(() => {
      if (!controller.signal.aborted) setLoadError(true);
    });
    return () => controller.abort();
  }, [retryKey]);

  function begin(nextAction: Action) {
    setAction(nextAction);
    setStage(nextAction === "set" ? "next" : "current");
    setValue("");
    setCurrentPin("");
    setNextPin("");
    setMessage("");
  }

  function fail(messageText: string) {
    setMessage(messageText);
    setValue("");
    setShakeKey((key) => key + 1);
  }

  async function save(pin: string, oldPin?: string) {
    setPending(true);
    try {
      const result = await apiClient.setPin(pin, oldPin);
      setEnabled(true);
      setAction(null);
      if (result.recoveryCode) setRecoveryCode(result.recoveryCode);
      else window.dispatchEvent(new Event(PIN_REQUIRED_EVENT));
    } catch (caught) {
      fail(caught instanceof ApiClientError && caught.code === "invalid_current_pin" ? "현재 PIN이 올바르지 않습니다." : "PIN을 저장하지 못했습니다.");
      setStage(oldPin ? "current" : "next");
      setCurrentPin("");
      setNextPin("");
    } finally {
      setPending(false);
    }
  }

  async function complete(pin: string) {
    if (action === "remove") {
      setPending(true);
      try {
        await apiClient.removePin(pin);
        setEnabled(false);
        setAction(null);
        setMessage("기기 잠금이 해제되었습니다.");
        window.dispatchEvent(new Event(PIN_REQUIRED_EVENT));
      } catch (caught) {
        fail(caught instanceof ApiClientError && caught.code === "admin_pin_required"
          ? "다른 프로필이 있는 동안에는 관리자 PIN을 해제할 수 없습니다."
          : "현재 PIN이 올바르지 않습니다.");
      } finally { setPending(false); }
      return;
    }
    if (stage === "current") { setCurrentPin(pin); setValue(""); setStage("next"); setMessage(""); return; }
    if (stage === "next") { setNextPin(pin); setValue(""); setStage("confirm"); setMessage(""); return; }
    if (pin !== nextPin) { fail("새 PIN이 일치하지 않습니다. 다시 입력하세요."); setStage("next"); setNextPin(""); return; }
    await save(pin, action === "change" ? currentPin : undefined);
  }

  const prompt = action === "remove" || stage === "current" ? "현재 PIN 입력" : stage === "next" ? "새 PIN 입력" : "새 PIN 확인";

  return (
    <section className="settings-card pin-setting">
      <header>기기 잠금</header>
      {loadError ? <div>
        <p role="alert">잠금 상태를 확인하지 못했습니다.</p>
        <button className="pin-action" onClick={() => { setLoadError(false); setRetryKey((key) => key + 1); }} type="button">다시 시도</button>
      </div> : enabled === null ? <p>잠금 상태 확인 중…</p> : recoveryCode ? (
        <RecoveryCodeNotice code={recoveryCode} onDismiss={() => {
          setRecoveryCode("");
          window.dispatchEvent(new Event(PIN_REQUIRED_EVENT));
        }} />
      ) : action ? (
        <div>
          <strong>{prompt}</strong>
          <Keypad disabled={pending} key={shakeKey} onChange={setValue} onComplete={complete} shakeKey={shakeKey} value={value} />
          <p aria-live="assertive" className="pin-message">{message}</p>
          <button className="pin-action pin-action--secondary" disabled={pending} onClick={() => setAction(null)} type="button">취소</button>
        </div>
      ) : (
        <div>
          <p>{enabled ? "이 기기는 PIN으로 보호됩니다." : "공유 기기에서 학습 기록을 보호합니다."}</p>
          <div className="pin-setting__actions">
            {enabled ? <><button className="pin-action" onClick={() => begin("change")} type="button">PIN 변경</button><button className="pin-action pin-action--secondary" onClick={() => begin("remove")} type="button">PIN 해제</button></> : <button className="pin-action" onClick={() => begin("set")} type="button">PIN 설정</button>}
          </div>
          <p aria-live="polite" className="pin-message">{message}</p>
        </div>
      )}
    </section>
  );
}
