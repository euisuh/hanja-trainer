import { useActiveProfile } from "../profile/ProfileContext";
import { discardRejectedReviews, exportRejectedReviews, useReviewSyncStatus } from "./useAnswerSubmit";

export function ReviewSyncStatus() {
  const { id: profileId } = useActiveProfile();
  const { pendingCount, rejectedCount, failed, errorCode, retry } = useReviewSyncStatus();
  if (pendingCount === 0 && rejectedCount === 0) return null;

  function downloadRejected() {
    const url = URL.createObjectURL(new Blob([exportRejectedReviews(profileId)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `hanja-rejected-reviews-${profileId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function discardRejected() {
    if (window.confirm("보관 중인 저장 실패 기록을 삭제할까요? 내보내지 않은 기록은 복구할 수 없습니다.")) {
      discardRejectedReviews(profileId);
    }
  }

  return (
    <aside aria-live="polite" className="review-sync-status" role="status">
      <span>
        {pendingCount > 0 && (failed ? `학습 기록 ${pendingCount}건의 저장을 다시 시도합니다. ` : `학습 기록 ${pendingCount}건을 동기화 중입니다. `)}
        {rejectedCount > 0 && `저장하지 못한 학습 기록 ${rejectedCount}건을 보관 중입니다.`}
        {errorCode && <code>{errorCode}</code>}
      </span>
      {failed && pendingCount > 0 && <button onClick={retry} type="button">지금 재시도</button>}
      {rejectedCount > 0 && <details><summary>보관 기록 살펴보기</summary><pre>{exportRejectedReviews(profileId)}</pre></details>}
      {rejectedCount > 0 && <button onClick={downloadRejected} type="button">기록 내보내기</button>}
      {rejectedCount > 0 && <button onClick={discardRejected} type="button">보관 기록 삭제</button>}
    </aside>
  );
}
