import DOMPurify from "dompurify";
import katex, { type KatexOptions } from "katex";
import { Marked, type Token } from "marked";
import markedAlert from "marked-alert";
import markedFootnote from "marked-footnote";
import { gfmHeadingId } from "marked-gfm-heading-id";
import mermaid from "mermaid";
import Prism from "prismjs";
import "prismjs/components/prism-bash.js";
import "prismjs/components/prism-json.js";
import "prismjs/components/prism-markdown.js";
import "prismjs/components/prism-typescript.js";
import "prismjs/components/prism-yaml.js";

type SourceToken = Token & {
  items?: SourceToken[];
  lineStart?: number;
  lineEnd?: number;
};

export type SourceLines = false | "zero-based" | "one-based";

export interface RenderOptions {
  /** Adds source positions to rendered block, list-item, and table-row elements. */
  sourceLines?: SourceLines;
  /** A stable prefix for generated heading and footnote ids. */
  headingIdPrefix?: string;
  /** Resolves relative URLs after sanitization; it never installs navigation behavior. */
  baseUrl?: string | URL;
  /** KaTeX macros owned by the calling application's Markdown dialect. */
  katexMacros?: KatexOptions["macros"];
  /** The Mermaid palette is derived from these CSS variables when present. */
  theme?: "light" | "dark" | "auto";
  /** Shows copy buttons for ordinary fenced code blocks. Defaults to true. */
  codeCopyButton?: boolean;
}

export interface RenderResult {
  /** Number of block nodes receiving source metadata. */
  sourceLineNodes: number;
  /** Number of Mermaid blocks queued for rendering. */
  mermaidBlocks: number;
}

const INLINE_DOLLAR_MATH = /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n$]))\1(?=[\s?!.,:？！。，：]|$)/;
const BLOCK_DOLLAR_MATH = /^(\${1,2})\n((?:\\[^]|[^\\])+?)\n\1(?:\n|$)/;
const INLINE_BACKSLASH_MATH = /^\\\(([^\n]+?)\\\)/;
const BLOCK_BACKSLASH_MATH = /^\\\[\n?((?:\\[^]|[^\\])+?)\n?\\\](?:\n|$)/;
let renderSequence = 0;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function mathPlaceholder(text: string, display: boolean): string {
  const tag = display ? "div" : "span";
  return `<${tag} class="note-renderer-math" data-display="${display}">${escapeHtml(text)}</${tag}>`;
}

function mathExtensions() {
  return {
    extensions: [
      {
        name: "noteRendererInlineDollarMath",
        level: "inline" as const,
        start(source: string) {
          for (let offset = source.indexOf("$"); offset >= 0; offset = source.indexOf("$", offset + 1)) {
            if ((offset === 0 || /\s/.test(source[offset - 1]!)) && INLINE_DOLLAR_MATH.test(source.slice(offset))) return offset;
          }
          return undefined;
        },
        tokenizer(source: string) {
          const match = INLINE_DOLLAR_MATH.exec(source);
          return match ? { type: "noteRendererInlineDollarMath", raw: match[0], text: match[2].trim(), display: match[1].length === 2 } : undefined;
        },
        renderer(token: { text: string; display: boolean }) {
          return mathPlaceholder(token.text, token.display);
        },
      },
      {
        name: "noteRendererBlockDollarMath",
        level: "block" as const,
        tokenizer(source: string) {
          const match = BLOCK_DOLLAR_MATH.exec(source);
          return match ? { type: "noteRendererBlockDollarMath", raw: match[0], text: match[2].trim(), display: match[1].length === 2 } : undefined;
        },
        renderer(token: { text: string; display: boolean }) {
          return `${mathPlaceholder(token.text, token.display)}\n`;
        },
      },
      {
        name: "noteRendererInlineBackslashMath",
        level: "inline" as const,
        start(source: string) {
          const index = source.indexOf("\\(");
          return index < 0 ? undefined : index;
        },
        tokenizer(source: string) {
          const match = INLINE_BACKSLASH_MATH.exec(source);
          return match ? { type: "noteRendererInlineBackslashMath", raw: match[0], text: match[1], display: false } : undefined;
        },
        renderer(token: { text: string; display: boolean }) {
          return mathPlaceholder(token.text, token.display);
        },
      },
      {
        name: "noteRendererBlockBackslashMath",
        level: "block" as const,
        tokenizer(source: string) {
          const match = BLOCK_BACKSLASH_MATH.exec(source);
          return match ? { type: "noteRendererBlockBackslashMath", raw: match[0], text: match[1].trim(), display: true } : undefined;
        },
        renderer(token: { text: string; display: boolean }) {
          return `${mathPlaceholder(token.text, token.display)}\n`;
        },
      },
      {
        name: "noteRendererGitHubMath",
        level: "inline" as const,
        start(source: string) {
          const index = source.indexOf("$`");
          return index < 0 ? undefined : index;
        },
        tokenizer(source: string) {
          const match = /^\$`([^\n]*?)`\$/.exec(source);
          return match ? { type: "noteRendererGitHubMath", raw: match[0], text: match[1], display: false } : undefined;
        },
        renderer(token: { text: string; display: boolean }) {
          return mathPlaceholder(token.text, token.display);
        },
      },
    ],
  };
}

function recordSourceLines(tokens: SourceToken[]): SourceToken[] {
  let line = 0;
  for (const token of tokens) {
    const raw = token.raw ?? "";
    const body = raw.replace(/\n+$/, "");
    token.lineStart = line;
    token.lineEnd = line + (body.match(/\n/g)?.length ?? 0);
    line += raw.match(/\n/g)?.length ?? 0;
  }
  return tokens;
}

function sourceLine(line: number, mode: SourceLines): string {
  return String(mode === "one-based" ? line + 1 : line);
}

function setSourceRange(element: Element, token: SourceToken, mode: SourceLines): void {
  element.setAttribute("data-source-line-start", sourceLine(token.lineStart ?? 0, mode));
  element.setAttribute("data-source-line-end", sourceLine(token.lineEnd ?? 0, mode));
}

function applySourceLines(target: HTMLElement, tokens: SourceToken[], mode: SourceLines): number {
  if (!mode) return 0;
  const blocks = tokens.filter(token => !["space", "footnote", "footnotes"].includes(token.type));
  const children = Array.from(target.children).filter(element => !element.classList.contains("footnotes"));
  let childIndex = 0;
  let sourceLineNodes = 0;
  for (const token of blocks) {
    const block = children[childIndex];
    if (!block) {
      if (token.type === "html") continue;
      return 0;
    }
    if (token.type === "html") {
      const tag = /^\s*<([a-z][a-z\d-]*)\b/i.exec(token.raw ?? "")?.[1]?.toUpperCase();
      if (!tag || block.tagName !== tag) continue;
    }
    setSourceRange(block, token, mode);
    if (token.type === "list") applyListItemLines(block, token, mode);
    if (token.type === "table") applyTableRowLines(block, token, mode);
    childIndex += 1;
    sourceLineNodes += 1;
  }
  return childIndex === children.length ? sourceLineNodes : 0;
}

function applyListItemLines(list: Element, token: SourceToken, mode: SourceLines): void {
  const items = token.items ?? [];
  const listItems = Array.from(list.children).filter(element => element.tagName === "LI");
  if (items.length !== listItems.length) return;
  let line = token.lineStart ?? 0;
  items.forEach((item, index) => {
    const raw = item.raw ?? "";
    const body = raw.replace(/\n+$/, "");
    listItems[index]!.setAttribute("data-source-line-start", sourceLine(line, mode));
    listItems[index]!.setAttribute("data-source-line-end", sourceLine(line + (body.match(/\n/g)?.length ?? 0), mode));
    line += raw.match(/\n/g)?.length ?? 0;
  });
}

function applyTableRowLines(table: Element, token: SourceToken, mode: SourceLines): void {
  table.querySelectorAll("tbody > tr").forEach((row, index) => {
    const line = (token.lineStart ?? 0) + 2 + index;
    row.setAttribute("data-source-line-start", sourceLine(line, mode));
    row.setAttribute("data-source-line-end", sourceLine(line, mode));
  });
}

function createParser(capture: (tokens: SourceToken[]) => void, headingIdPrefix: string): Marked {
  const parser = new Marked();
  parser.use({ gfm: true, breaks: false });
  parser.use(gfmHeadingId({ prefix: headingIdPrefix }));
  parser.use(markedAlert({ variants: ["note", "tip", "important", "warning", "caution"].map(type => ({ type, icon: "" })) }));
  parser.use(markedFootnote({ prefixId: `${headingIdPrefix}footnote-` }));
  parser.use(mathExtensions(), {
    hooks: {
      processAllTokens(tokens) {
        capture(recordSourceLines(tokens as SourceToken[]));
        return tokens;
      },
    },
    renderer: {
      checkbox({ checked }) {
        return `<span class="note-renderer-checkbox" data-checked="${checked}"></span> `;
      },
      code({ text, lang }) {
        const language = String(lang ?? "").trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
        if (language === "math") return `${mathPlaceholder(text, true)}\n`;
        if (language === "mermaid") return `<div class="note-renderer-mermaid"><pre><code class="language-mermaid">${escapeHtml(text)}</code></pre></div>`;
        return `<pre><code class="language-${escapeHtml(language)}">${escapeHtml(text)}</code></pre>`;
      },
    },
  });
  return parser;
}

function restoreCheckboxes(target: HTMLElement): void {
  target.querySelectorAll<HTMLElement>(".note-renderer-checkbox").forEach(marker => {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = marker.dataset.checked === "true";
    checkbox.disabled = true;
    checkbox.tabIndex = -1;
    checkbox.setAttribute("aria-hidden", "true");
    marker.closest("li")?.classList.add("task-list-item");
    marker.closest("li")?.parentElement?.classList.add("contains-task-list");
    marker.replaceWith(checkbox);
  });
}

function configureUrls(target: HTMLElement, headingIdPrefix: string, baseUrl?: string | URL): void {
  target.querySelectorAll<HTMLAnchorElement | HTMLImageElement>("a[href], img[src]").forEach(element => {
    const attribute = element instanceof HTMLAnchorElement ? "href" : "src";
    const value = element.getAttribute(attribute);
    if (!value) return;
    if (value.startsWith("#")) {
      const targetId = value.slice(1);
      if (!targetId.startsWith(headingIdPrefix) && target.querySelector(`#${CSS.escape(`${headingIdPrefix}${targetId}`)}`)) {
        element.setAttribute(attribute, `#${headingIdPrefix}${targetId}`);
      }
      return;
    }
    if (!baseUrl || /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith("/")) return;
    try {
      element.setAttribute(attribute, new URL(value, baseUrl).href);
    } catch {
      // DOMPurify has already removed unsafe URL schemes. Preserve malformed relative values for host diagnostics.
    }
  });
}

function renderMath(target: HTMLElement, macros?: KatexOptions["macros"]): void {
  target.querySelectorAll<HTMLElement>(".note-renderer-math").forEach(placeholder => {
    try {
      katex.render(placeholder.textContent ?? "", placeholder, { displayMode: placeholder.dataset.display === "true", throwOnError: false, strict: false, macros });
    } catch {
      placeholder.classList.add("note-renderer-math-error");
    }
  });
}

function enableCopyButtons(target: HTMLElement): void {
  target.querySelectorAll<HTMLPreElement>("pre").forEach(pre => {
    if (pre.querySelector(".note-renderer-copy")) return;
    const code = pre.querySelector("code");
    if (!code || code.classList.contains("language-mermaid")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "note-renderer-copy";
    button.textContent = "Copy";
    button.addEventListener("click", async () => {
      await navigator.clipboard?.writeText(code.textContent ?? "");
      button.textContent = "Copied";
      window.setTimeout(() => { button.textContent = "Copy"; }, 1000);
    });
    pre.append(button);
  });
}

function themeValue(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function mermaidIsDark(theme: NonNullable<RenderOptions["theme"]>): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  const explicitTheme = document.documentElement.dataset.theme || document.body.dataset.theme;
  if (explicitTheme === "dark" || explicitTheme === "light") return explicitTheme === "dark";
  const channels = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g)?.map(Number);
  if (channels && channels.length >= 3) {
    const [red, green, blue] = channels.map(channel => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue! < 0.45;
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function configureMermaid(theme: NonNullable<RenderOptions["theme"]>): void {
  const dark = mermaidIsDark(theme);
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    darkMode: dark,
    themeVariables: {
      background: themeValue("--note-renderer-background", dark ? "#0d1117" : "#ffffff"),
      primaryColor: themeValue("--note-renderer-surface", dark ? "#161b22" : "#f6f8fa"),
      primaryTextColor: themeValue("--note-renderer-text", dark ? "#e6edf3" : "#1f2328"),
      primaryBorderColor: themeValue("--note-renderer-accent", dark ? "#58a6ff" : "#0969da"),
      lineColor: themeValue("--note-renderer-muted", dark ? "#8b949e" : "#57606a"),
    },
  });
}

async function renderMermaid(target: HTMLElement, theme: NonNullable<RenderOptions["theme"]>): Promise<number> {
  const holders = Array.from(target.querySelectorAll<HTMLElement>(".note-renderer-mermaid"));
  if (holders.length === 0) return 0;
  configureMermaid(theme);
  for (const [index, holder] of holders.entries()) {
    const source = holder.textContent ?? "";
    try {
      const { svg, bindFunctions } = await mermaid.render(`note-renderer-mermaid-${crypto.randomUUID()}-${index}`, source);
      const diagram = document.createElement("div");
      diagram.className = "note-renderer-mermaid-diagram";
      diagram.setAttribute("role", "img");
      diagram.setAttribute("aria-label", "Mermaid diagram");
      diagram.innerHTML = svg;
      holder.replaceChildren(diagram);
      bindFunctions?.(diagram);
    } catch {
      holder.classList.add("note-renderer-mermaid-error");
      Prism.highlightAllUnder(holder);
    }
  }
  return holders.length;
}

/** Renders canonical note Markdown into an existing browser element. */
export async function renderMarkdown(markdown: string, target: HTMLElement, options: RenderOptions = {}): Promise<RenderResult> {
  const sourceLines = options.sourceLines ?? false;
  const headingIdPrefix = options.headingIdPrefix ?? `note-renderer-${++renderSequence}-`;
  let tokens: SourceToken[] = [];
  const parser = createParser(captured => { tokens = captured; }, headingIdPrefix);
  const html = parser.parse(markdown, { async: false });
  target.classList.add("note-renderer");
  target.innerHTML = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "iframe", "object", "embed", "form", "fieldset", "legend", "label", "input", "button", "textarea", "select", "option", "optgroup", "datalist", "output", "svg", "math"],
    FORBID_ATTR: ["style", "srcdoc"],
    ADD_TAGS: ["details", "summary"],
  });
  const sourceLineNodes = applySourceLines(target, tokens, sourceLines);
  configureUrls(target, headingIdPrefix, options.baseUrl);
  restoreCheckboxes(target);
  renderMath(target, options.katexMacros);
  if (options.codeCopyButton ?? true) enableCopyButtons(target);
  const mermaidBlocks = await renderMermaid(target, options.theme ?? "auto");
  Prism.highlightAllUnder(target);
  return { sourceLineNodes, mermaidBlocks };
}
