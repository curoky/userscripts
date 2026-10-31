import { defineConfig } from "tsdown";

const metadata = `// ==UserScript==
// @name         JD Bill Exporter
// @namespace    https://github.com/curoky/userscripts
// @version      0.2.0
// @description  Export the manually selected JD order year as CSV with split-order relationships and deduplicated totals.
// @author       curoky
// @homepageURL  https://github.com/curoky/userscripts
// @supportURL   https://github.com/curoky/userscripts/issues
// @downloadURL  https://raw.githubusercontent.com/curoky/userscripts/master/dist/jd-bill-exporter.user.js
// @updateURL    https://raw.githubusercontent.com/curoky/userscripts/master/dist/jd-bill-exporter.user.js
// @match        https://order.jd.com/center/list.action*
// @match        https://order.jd.hk/center/list.action*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==`;

export default defineConfig({
  entry: { "jd-bill-exporter.user": "src/jd-bill-exporter/main.ts" },
  clean: true,
  dts: false,
  format: "iife",
  minify: false,
  outDir: "dist",
  outputOptions: { banner: metadata, entryFileNames: "[name].js" },
  platform: "browser",
  loader: { ".txt": "text" },
  sourcemap: false,
  target: "es2024",
});
