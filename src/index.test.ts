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

test("display math directly after a paragraph line interrupts the paragraph", async () => {
  const { renderMarkdown } = await import("./index.js");
  const target = document.createElement("div");

  await renderMarkdown("If\n\\[\nt_{\\rm AR}=a_{\\rm AR}+b_{\\rm AR}T,\\qquad\nt_{\\rm AG}=a_{\\rm AG}+b_{\\rm AG}T,\n\\]\nthen their difference is\n$$\n\\Delta t=(a_{\\rm AR}-a_{\\rm AG})T.\n$$\nso the gap grows with T.", target);

  expect(target.querySelectorAll(".katex-display")).toHaveLength(2);
  expect([...target.querySelectorAll("p")].map(paragraph => paragraph.textContent)).toEqual(["If", "then their difference is", "so the gap grows with T."]);
});

test("escaped brackets inside a paragraph stay literal text", async () => {
  const { renderMarkdown } = await import("./index.js");
  const target = document.createElement("div");

  await renderMarkdown("see\n\\[not math] here", target);

  expect(target.querySelectorAll(".katex")).toHaveLength(0);
  expect(target.textContent).toContain("[not math] here");
});
