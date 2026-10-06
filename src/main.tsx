import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-sans-kr/400.css";
import "@fontsource/ibm-plex-sans-kr/600.css";
import "@fontsource/klee-one/600.css";
import "@fontsource-variable/noto-sans-kr";
import "@fontsource-variable/noto-serif-jp";
import "@fontsource-variable/noto-serif-kr";
import "@fontsource-variable/noto-serif-sc";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/space-grotesk";
import "@fontsource/zen-maru-gothic/500.css";
import "./design/talk.css";
import "./design/notebook-flashcards.css";
import { loadSessionToken } from "./platform/sessionToken";
import { restoreOutboxStorage } from "./platform/storage";

async function main() {
  // Both are best-effort and bounded: a hung native bridge must never block first render.
  await Promise.all([restoreOutboxStorage(), Promise.race([loadSessionToken(), new Promise((resolve) => setTimeout(resolve, 2_000))])]);
  const { App } = await import("./App");
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}

void main();
