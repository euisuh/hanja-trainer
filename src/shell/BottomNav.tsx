import { NavLink } from "react-router-dom";

const items = [
  { label: "지도", key: "H", to: "/home" },
  { label: "복습", key: "R", to: "/review" },
  { label: "통계", key: "T", to: "/stats" },
  { label: "설정", key: ",", to: "/settings" },
] as const;

export function BottomNav() {
  return (
    <div className="bottom-nav-shell">
      <nav className="bottom-nav" aria-label="주요 화면">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? "active" : undefined}>
            {item.label}<kbd>{item.key}</kbd>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
