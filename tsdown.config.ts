import { defineConfig } from "tsdown";
import githubTrendingBlacklist from "./src/github-trending-blacklist/userscript.config.ts";

export default defineConfig([githubTrendingBlacklist]);
