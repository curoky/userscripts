import { defineConfig } from "tsdown";

const metadata = `// ==UserScript==
// @name         GitHub Trending Blacklist
// @namespace    https://github.com/curoky/userscripts
// @version      0.1.0
// @description  Hide repositories you do not want to see on GitHub Trending.
// @author       curoky
// @homepageURL  https://github.com/curoky/userscripts
// @supportURL   https://github.com/curoky/userscripts/issues
// @downloadURL  https://raw.githubusercontent.com/curoky/userscripts/main/dist/github-trending-blacklist.user.js
// @updateURL    https://raw.githubusercontent.com/curoky/userscripts/main/dist/github-trending-blacklist.user.js
// @match        https://github.com/trending*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @run-at       document-idle
// @noframes
// ==/UserScript==`;

export default defineConfig({
  entry: {
    "github-trending-blacklist.user": "src/github-trending-blacklist/main.ts",
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
