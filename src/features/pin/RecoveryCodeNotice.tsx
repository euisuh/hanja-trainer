type RecoveryCodeNoticeProps = {
  code: string;
  onDismiss: () => void;
};

export function RecoveryCodeNotice({ code, onDismiss }: RecoveryCodeNoticeProps) {
  return (
    <div className="pin-recovery" role="status">
      <strong>복구 코드를 적어 두세요</strong>
      <code>{code}</code>
      <p>PIN을 잊었을 때 필요합니다. 안전한 곳에 적어 두세요. 이 코드는 다시 표시되지 않습니다.</p>
      <button className="pin-action" onClick={onDismiss} type="button">확인했습니다</button>
    </div>
  );
}
