import { useEffect, useRef, useState } from "react";
import { ApiClientError, apiClient } from "../../lib/apiClient";
import type { PublicProfile } from "../../shared/api";
import { useFocusTrap } from "../../shared/useFocusTrap";
import { Keypad } from "../pin/Keypad";

type PinStage = "first" | "confirm";

function limitedName(value: string): string {
  return [...value].slice(0, 24).join("");
}

function failureMessage(caught: unknown): string {
  if (caught instanceof ApiClientError && caught.code === "admin_pin_required") return "프로필을 추가하려면 먼저 관리자 PIN을 설정해 주세요.";
  if (caught instanceof ApiClientError && caught.code === "profile_limit") return "프로필은 최대 5개까지 만들 수 있습니다.";
  if (caught instanceof Error) return caught.message;
  return "프로필을 변경하지 못했습니다.";
}

export function ProfileSettings() {
  const [profiles, setProfiles] = useState<PublicProfile[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [pinStage, setPinStage] = useState<PinStage | null>(null);
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [renameId, setRenameId] = useState<number | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PublicProfile | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const cancelDelete = useRef<HTMLButtonElement>(null);
  const deleteDialog = useRef<HTMLDivElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement | null>(null);
  const profileSection = useRef<HTMLElement>(null);

  async function refresh(signal?: AbortSignal) {
    const result = await apiClient.profiles(signal);
    setProfiles(result.profiles);
  }

  useEffect(() => {
    const controller = new AbortController();
    void apiClient.profiles(controller.signal).then((result) => setProfiles(result.profiles)).catch((caught: unknown) => {
      if (!controller.signal.aborted) setMessage(failureMessage(caught));
    });
    return () => controller.abort();
  }, []);

  useFocusTrap({
    active: deleteTarget !== null,
    containerRef: deleteDialog,
    target: "container",
    selector: "button:not(:disabled)",
    initialFocusRef: cancelDelete,
    onKeyDown: (event) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        setDeleteTarget(null);
      }
    },
    restoreFocus: () => {
      const trigger = deleteTrigger.current;
      if (trigger?.isConnected) trigger.focus();
      else profileSection.current?.focus();
    },
  });

  function resetCreate() {
    setCreateOpen(false);
    setName("");
    setPinStage(null);
    setPin("");
    setFirstPin("");
  }

  async function create(pinValue?: string) {
    const trimmed = name.trim();
    if (!trimmed) { setMessage("프로필 이름을 입력해 주세요."); return; }
    setPending(true);
    setMessage("");
    try {
      await apiClient.createProfile({ name: trimmed, ...(pinValue ? { pin: pinValue } : {}) });
      await refresh();
      resetCreate();
      setMessage(`${trimmed} 프로필을 만들었습니다.`);
    } catch (caught) {
      setMessage(failureMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function completePin(value: string) {
    if (pinStage === "first") {
      setFirstPin(value);
      setPin("");
      setPinStage("confirm");
      setMessage("");
      return;
    }
    if (value !== firstPin) {
      setFirstPin("");
      setPin("");
      setPinStage("first");
      setMessage("PIN이 일치하지 않습니다. 다시 입력해 주세요.");
      return;
    }
    await create(value);
  }

  async function saveRename(profileId: number) {
    const trimmed = renameName.trim();
    if (!trimmed) { setMessage("프로필 이름을 입력해 주세요."); return; }
    setPending(true);
    setMessage("");
    try {
      await apiClient.renameProfile(profileId, { name: trimmed });
      await refresh();
      setRenameId(null);
      setMessage(`${trimmed}(으)로 이름을 바꿨습니다.`);
    } catch (caught) {
      setMessage(failureMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    const deletedName = deleteTarget.name;
    setPending(true);
    setMessage("");
    try {
      await apiClient.deleteProfile(deleteTarget.id);
      await refresh();
      setDeleteTarget(null);
      setMessage(`${deletedName} 프로필을 삭제했습니다.`);
    } catch (caught) {
      setMessage(failureMessage(caught));
    } finally {
      setPending(false);
    }
  }

  const count = profiles?.length ?? 0;
  const atLimit = count >= 5;

  return (
    <section className="settings-card profile-setting" ref={profileSection} tabIndex={-1}>
      <header><span>프로필 관리</span><small>{count} / 5</small></header>
      {profiles === null ? <p>프로필을 불러오는 중…</p> : (
        <>
          <ul className="profile-setting__list">
            {profiles.map((profile) => (
              <li key={profile.id}>
                {renameId === profile.id ? (
                  <form onSubmit={(event) => { event.preventDefault(); void saveRename(profile.id); }}>
                    <label><input aria-label={`${profile.name} 새 이름`} autoFocus disabled={pending} onChange={(event) => setRenameName(limitedName(event.target.value))} value={renameName} /></label>
                    <button disabled={pending || !renameName.trim()} type="submit">저장</button>
                    <button disabled={pending} onClick={() => setRenameId(null)} type="button">취소</button>
                  </form>
                ) : (
                  <>
                    <span><strong>{profile.name}</strong>{profile.isAdmin && <small>관리자</small>}</span>
                    <div>
                      <button disabled={pending} onClick={() => { setRenameId(profile.id); setRenameName(profile.name); setMessage(""); }} type="button" aria-label={`${profile.name} 이름 변경`}>이름 변경</button>
                      {!profile.isAdmin && <button className="profile-setting__delete" disabled={pending} onClick={(event) => { deleteTrigger.current = event.currentTarget; setDeleteTarget(profile); }} type="button" aria-label={`${profile.name} 프로필 삭제`}>삭제</button>}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>

          {deleteTarget && (
            <div className="profile-delete-modal" role="presentation">
              <div aria-describedby="profile-delete-description" aria-labelledby="profile-delete-title" aria-modal="true" className="profile-setting__confirm" ref={deleteDialog} role="alertdialog">
                <strong id="profile-delete-title">{deleteTarget.name} 프로필을 삭제할까요?</strong>
                <p id="profile-delete-description">이 프로필의 모든 학습 진도는 영구적으로 삭제되며 되돌릴 수 없습니다.</p>
                <div><button className="profile-setting__delete" disabled={pending} onClick={() => void remove()} type="button">영구 삭제</button><button disabled={pending} onClick={() => setDeleteTarget(null)} ref={cancelDelete} type="button">취소</button></div>
              </div>
            </div>
          )}

          {createOpen ? (
            <div className="profile-setting__create">
              {pinStage ? (
                <>
                  <strong>{pinStage === "first" ? "새 프로필 PIN 입력" : "새 프로필 PIN 확인"}</strong>
                  <Keypad disabled={pending} onChange={setPin} onComplete={completePin} value={pin} />
                </>
              ) : (
                <>
                  <label><span>프로필 이름</span><input autoFocus disabled={pending} onChange={(event) => setName(limitedName(event.target.value))} value={name} /></label>
                  <small>{[...name].length} / 24</small>
                  <div>
                    <button disabled={pending || !name.trim()} onClick={() => void create()} type="button">PIN 없이 만들기</button>
                    <button disabled={pending || !name.trim()} onClick={() => { setPinStage("first"); setMessage(""); }} type="button">PIN 설정 후 만들기</button>
                  </div>
                </>
              )}
              <button disabled={pending} onClick={resetCreate} type="button">추가 취소</button>
            </div>
          ) : <button disabled={atLimit || pending} onClick={() => { setCreateOpen(true); setMessage(""); }} type="button">프로필 추가</button>}
        </>
      )}
      {atLimit && <p>프로필을 더 만들려면 기존 프로필을 삭제해 주세요.</p>}
      <p aria-live="polite" className="profile-setting__message">{message}</p>
    </section>
  );
}
