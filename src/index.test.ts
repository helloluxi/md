import { expect, test } from "bun:test";
import { parseHTML } from "linkedom";

test("renders inline dollar math next to CJK prose and punctuation", async () => {
  const dom = parseHTML("<!doctype html><html><body></body></html>");
  Object.defineProperty(dom.document, "compatMode", { value: "CSS1Compat" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.document,
    navigator: dom.window.navigator,
    Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    HTMLAnchorElement: dom.window.HTMLAnchorElement,
    HTMLImageElement: dom.window.HTMLImageElement,
    HTMLPreElement: dom.window.HTMLPreElement,
    getComputedStyle: dom.window.getComputedStyle,
  });
  const { renderMarkdown } = await import("./index.js");
  const target = document.createElement("div");

  await renderMarkdown("中$A$，中$B$–$C$、", target);

  expect(target.querySelectorAll(".katex")).toHaveLength(3);
});
