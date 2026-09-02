import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { PublicProfile } from "../shared/api";
import "../features/pin/pin.css";

type Props = { profiles: PublicProfile[]; onSelect: (profile: PublicProfile) => Promise<void> };

export function ProfilePicker({ profiles, onSelect }: Props) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { buttons.current[0]?.focus(); }, [profiles]);

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % profiles.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + profiles.length) % profiles.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = profiles.length - 1;
    if (next === null) return;
    event.preventDefault();
    buttons.current[next]?.focus();
  }

  async function select(profile: PublicProfile) {
    if (pendingId !== null) return;
    setPendingId(profile.id);
    setError("");
    try {
      await onSelect(profile);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "프로필을 선택하지 못했습니다.");
      setPendingId(null);
    }
  }

  return (
    <main className="profile-picker">
      <section className="profile-picker__card" aria-labelledby="profile-picker-title">
        <span className="unlock-card__mark" aria-hidden="true">字</span>
        <h1 id="profile-picker-title">누가 학습하나요?</h1>
        <p>프로필을 선택하세요.</p>
        <div className="profile-picker__options">
          {profiles.map((profile, index) => (
            <button
              aria-label={`${profile.name}${profile.hasPin ? ", PIN 필요" : ""}`}
              className="profile-picker__option"
              disabled={pendingId !== null}
              key={profile.id}
              onClick={() => void select(profile)}
              onKeyDown={(event) => moveFocus(event, index)}
              ref={(button) => { buttons.current[index] = button; }}
              type="button"
            >
              <span className="profile-picker__avatar" aria-hidden="true">{[...profile.name][0]}</span>
              <strong>{profile.name}</strong>
              {profile.hasPin && <span className="profile-picker__lock" aria-hidden="true">PIN</span>}
            </button>
          ))}
        </div>
        {error && <p className="pin-message" role="alert">{error}</p>}
      </section>
    </main>
  );
}
