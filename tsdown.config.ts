import { defineConfig } from "tsdown";
import githubTrendingBlacklist from "./src/github-trending-blacklist/userscript.config.ts";
import githubTrendingLanguagePriorities from "./src/github-trending-language-priorities/userscript.config.ts";

export default defineConfig([
  githubTrendingBlacklist,
  githubTrendingLanguagePriorities,
]);
