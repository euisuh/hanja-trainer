import { useActiveProfile } from "../profile/ProfileContext";
import { discardRejectedSummaries, exportRejectedSummaries, useSessionSummaryStatus } from "./useSessionSummary";

export function SessionSummaryStatus() {
  const { id: profileId } = useActiveProfile();
  const { errorCode, pendingCount, pendingFailed, rejectedCount, retry } = useSessionSummaryStatus();
  if (pendingCount === 0 && rejectedCount === 0) return null;

  function downloadRejected() {
    const url = URL.createObjectURL(new Blob([exportRejectedSummaries(profileId)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `hanja-rejected-session-summaries-${profileId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function discardRejected() {
    if (window.confirm("보관 중인 저장 실패 결과를 삭제할까요? 내보내지 않은 결과는 복구할 수 없습니다.")) discardRejectedSummaries(profileId);
  }

  return (
    <aside aria-live="polite" className="review-sync-status session-summary-status" role="status">
      <span>
        {pendingCount > 0 && (pendingFailed ? `학습 결과를 저장하지 못했습니다 · ${pendingCount}` : `학습 결과 저장 중 · ${pendingCount}`)}
        {pendingCount > 0 && rejectedCount > 0 && " "}
        {rejectedCount > 0 && `저장할 수 없는 학습 결과를 ${rejectedCount}건 보관 중입니다.`}
        {errorCode && <code>{errorCode}</code>}
      </span>
      {pendingFailed && pendingCount > 0 && <button onClick={retry} type="button">저장 다시 시도</button>}
      {rejectedCount > 0 && <button onClick={downloadRejected} type="button">결과 내보내기</button>}
      {rejectedCount > 0 && <button onClick={discardRejected} type="button">보관 결과 삭제</button>}
    </aside>
  );
}
