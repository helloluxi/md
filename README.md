# note-renderer

`note-renderer` is the shared browser Markdown module for `lu` and `lutex`.

It owns the canonical GFM dialect, GFM heading ids, alerts, footnotes, dollar and GitHub math, KaTeX rendering, Mermaid rendering in strict mode, Prism syntax highlighting, HTML sanitization, relative URL resolution, and the common DOM/CSS contract. Its stylesheet supplies the shared prose presentation and structural safeguards, including bounded images and horizontally scrollable wide content.

It deliberately does not own application behavior: goal-variable substitution, Bash actions, file jumps, persistent diagram controls, Neovim navigation, outlines, interactive image controls, and live reload remain host adapters.

## Use

```ts
import { renderMarkdown } from "note-renderer";
import "note-renderer/style.css";

await renderMarkdown(markdown, element, {
  sourceLines: "zero-based",
  headingIdPrefix: "note-42-",
  baseUrl: new URL("https://notes.example/dir/"),
  katexMacros: { "\\RR": "\\mathbb{R}" },
});
```

`sourceLines` is disabled by default. When enabled, block elements receive `data-source-line-start` and `data-source-line-end`; lists additionally mark each `li`, and tables mark each body row. Use `"zero-based"` for direct source-array indexing or `"one-based"` for editor-facing line numbers. Heading ids receive a unique render prefix by default, and local heading links are rewritten to match it; pass `headingIdPrefix` when a host needs a stable id namespace.

The renderer never attaches link navigation or other host behavior. `baseUrl` only resolves relative `href` and `src` values after sanitization.

## DOM contract

The root receives `.note-renderer`. Generated classes are `.note-renderer-math`, `.note-renderer-math-error`, `.note-renderer-mermaid`, `.note-renderer-mermaid-diagram`, `.note-renderer-mermaid-error`, `.note-renderer-checkbox`, `.note-renderer-code-block`, `.note-renderer-code-block-toolbar`, `.note-renderer-code-block-language`, `.note-renderer-code-block-actions`, and `.note-renderer-copy`. Ordinary fenced code blocks are wrapped in a `.note-renderer-code-block` whose toolbar carries the uppercase language label plus a `.note-renderer-code-block-actions` group holding, unless `codeCopyButton` is false, the copy button; host actions such as a Bash Run button belong in that group, before the copy button.

The supplied stylesheet includes KaTeX, its fonts, and the Prism Tomorrow token theme. It handles canonical prose, responsive images, renderer-owned structure, and wide-content overflow. Hosts customize that presentation through `--note-renderer-background`, `--note-renderer-surface`, `--note-renderer-text`, `--note-renderer-muted`, `--note-renderer-accent`, `--note-renderer-success`, `--note-renderer-important`, `--note-renderer-warning`, `--note-renderer-border`, `--note-renderer-code-background`, `--note-renderer-code-toolbar`, `--note-renderer-error`, `--note-renderer-font-family`, and `--note-renderer-font-mono`.

## Consumer release flow

1. Change this package and create a commit and tag, for example `v0.2.0`.
2. Update each consumer dependency to the pinned tag or commit, for example `"note-renderer": "git+ssh://git@github.com/ORG/note-renderer.git#v0.2.0"`.
3. Run the consumer's package install to update its lockfile, then commit the dependency and lockfile together.

No submodule or renderer daemon is required.
