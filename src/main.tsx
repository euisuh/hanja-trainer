import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/noto-sans-kr";
import "@fontsource-variable/noto-serif-jp";
import "@fontsource-variable/noto-serif-kr";
import "@fontsource-variable/noto-serif-sc";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/space-grotesk";
import { restoreOutboxStorage } from "./platform/storage";

async function main() {
  await restoreOutboxStorage();
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
