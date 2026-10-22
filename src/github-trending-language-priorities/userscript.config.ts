import { defineConfig } from "tsdown";

const metadata = `// ==UserScript==
// @name         GitHub Trending Language Priorities
// @namespace    https://github.com/curoky/userscripts
// @version      0.1.0
// @description  Move preferred languages to the top of the GitHub Trending language menu.
// @author       curoky
// @homepageURL  https://github.com/curoky/userscripts
// @supportURL   https://github.com/curoky/userscripts/issues
// @downloadURL  https://raw.githubusercontent.com/curoky/userscripts/main/dist/github-trending-language-priorities.user.js
// @updateURL    https://raw.githubusercontent.com/curoky/userscripts/main/dist/github-trending-language-priorities.user.js
// @match        https://github.com/trending*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==`;

export default defineConfig({
  entry: {
    "github-trending-language-priorities.user":
      "src/github-trending-language-priorities/main.ts",
  },
  clean: true,
  dts: false,
  format: "iife",
  minify: false,
  outDir: "dist",
  outputOptions: {
    banner: metadata,
    entryFileNames: "[name].js",
  },
  platform: "browser",
  sourcemap: false,
  target: "es2024",
});
