# note-renderer

Browser-native Markdown rendering with sanitization, math, syntax highlighting and Mermaid. Hosts own navigation, file access, media policies and application actions.

## Host extensions

`renderMarkdown(markdown, element, options)` accepts optional synchronous `renderLink` and `renderImage` callbacks. Each receives:

- `element`: the sanitized anchor or image.
- `destination`: the sanitized authored URL, before `baseUrl` resolution.
- `resolvedDestination`: its URL after optional `baseUrl` resolution.

Return a DOM node to replace the element, mutate it and return nothing, or return nothing to preserve default rendering. Callbacks run synchronously after sanitization/URL resolution and before asynchronous diagram rendering. Descendants removed by an earlier callback are skipped. Hooks are trusted application code: returned DOM is not re-sanitized. Never obtain callback code from Markdown.

Without hooks, ordinary links and images remain ordinary links and images. The renderer does not classify file extensions, fetch host files, embed HTML documents, register artifacts or install application navigation. A host can interpret image syntax as an explicit media embed without changing ordinary link behavior. `codeBlockToolbarButtons` separately supplies host-owned toolbar controls; no registration UI is built in.

Build with `npm run build`; type-check with `npm run check`. Lu consumes this repository through its `file:../md` dependency; deploy the rebuilt `dist` with the host application. A package/GitHub release is not required for a local consumer build.
