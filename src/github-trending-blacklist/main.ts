import {
  loadBlacklist,
  onRemoteBlacklistChange,
  saveBlacklist,
} from "./storage.js";
import { enhanceTrendingPage } from "./trending-page.js";

let repositories = loadBlacklist();

function replaceBlacklist(nextRepositories: Set<string>): void {
  saveBlacklist(nextRepositories);
  repositories = nextRepositories;
  render();
}

const actions = {
  block(repository: string) {
    replaceBlacklist(new Set(repositories).add(repository));
  },
  clear() {
    replaceBlacklist(new Set());
  },
  unblock(repository: string) {
    const nextRepositories = new Set(repositories);
    nextRepositories.delete(repository);
    replaceBlacklist(nextRepositories);
  },
};

function render(): void {
  enhanceTrendingPage(repositories, actions);
}

document.addEventListener("pjax:end", render);
document.addEventListener("turbo:render", render);
window.addEventListener("popstate", render);

onRemoteBlacklistChange((nextRepositories) => {
  repositories = nextRepositories;
  render();
});

render();
