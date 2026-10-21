import { decodeBlacklist, encodeBlacklist } from "./blacklist.js";
import { enhanceTrendingPage } from "./ui.js";

let repositories = decodeBlacklist(
  GM_getValue<unknown>("github-trending-blacklist"),
);

function render(): void {
  enhanceTrendingPage(repositories, {
    block(repository) {
      const nextRepositories = new Set(repositories).add(repository);
      GM_setValue(
        "github-trending-blacklist",
        encodeBlacklist(nextRepositories),
      );
      repositories = nextRepositories;
      render();
    },
    clear() {
      GM_setValue("github-trending-blacklist", encodeBlacklist(new Set()));
      repositories = new Set();
      render();
    },
    unblock(repository) {
      const nextRepositories = new Set(repositories);
      nextRepositories.delete(repository);
      GM_setValue(
        "github-trending-blacklist",
        encodeBlacklist(nextRepositories),
      );
      repositories = nextRepositories;
      render();
    },
  });
}

document.addEventListener("pjax:end", render);
document.addEventListener("turbo:render", render);
window.addEventListener("popstate", render);

GM_addValueChangeListener(
  "github-trending-blacklist",
  (_name, _oldValue, newValue, isRemote) => {
    if (!isRemote) {
      return;
    }

    repositories = decodeBlacklist(newValue);
    render();
  },
);

render();
