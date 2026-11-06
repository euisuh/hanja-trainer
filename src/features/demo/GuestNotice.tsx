import "./demo.css";

// Guests never see real profiles; "로그인" ends the guest session and returns to sign-in.
export function GuestNotice({ onSignIn }: { onSignIn: () => void }) {
  return (
    <aside className="guest-notice" aria-label="게스트 안내">
      <p>게스트 진행 상황은 이 브라우저에 7일간 보관됩니다. 7일 동안 사용하지 않으면 삭제됩니다.</p>
      <button onClick={onSignIn} type="button">로그인</button>
    </aside>
  );
}
