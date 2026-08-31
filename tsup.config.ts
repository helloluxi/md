import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
  },
  {
    entry: { "note-renderer": "src/index.ts" },
    format: ["iife"],
    globalName: "NoteRenderer",
    splitting: false,
    minify: true,
    sourcemap: false,
    outExtension: () => ({ js: ".global.js" }),
  },
]);
