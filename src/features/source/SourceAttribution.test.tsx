import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SourceAttribution } from "./SourceAttribution";

describe("SourceAttribution", () => {
  it("links Tatoeba sentence attribution and licence", () => {
    const html = renderToStaticMarkup(<SourceAttribution source="Tatoeba #123" />);

    expect(html).toContain('href="https://tatoeba.org/sentences/show/123"');
    expect(html).toContain(">Tatoeba #123</a>");
    expect(html).toContain('href="https://creativecommons.org/licenses/by/2.0/fr/"');
    expect(html).toContain(">CC BY 2.0 FR</a>");
  });
});
