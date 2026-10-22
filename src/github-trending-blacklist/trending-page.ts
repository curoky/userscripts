import { repositoryFromHref } from "./blacklist.js";

interface BlacklistActions {
  block(repository: string): void;
  clear(): void;
  unblock(repository: string): void;
}

function createButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-sm";
  button.textContent = label;
  return button;
}

function createManager(actions: BlacklistActions): HTMLDetailsElement {
  const manager = document.createElement("details");
  manager.className = "details-reset position-relative tmp-mr-2";
  manager.dataset.trendingBlacklistManager = "";

  const summary = document.createElement("summary");
  summary.className = "btn btn-sm";
  summary.innerHTML =
    'Blacklist <span class="Counter" data-trending-blacklist-count>0</span>';

  const panel = document.createElement("div");
  panel.className = "Box position-absolute right-0 mt-2 color-bg-overlay";
  panel.style.cssText = "width: 320px; z-index: 100;";

  const header = document.createElement("div");
  header.className = "Box-header d-flex flex-items-center flex-justify-between";

  const title = document.createElement("strong");
  title.textContent = "Blocked repositories";

  const clearButton = createButton("Clear all");
  clearButton.dataset.trendingBlacklistClear = "";
  clearButton.addEventListener("click", actions.clear);

  const list = document.createElement("div");
  list.dataset.trendingBlacklistList = "";

  header.append(title, clearButton);
  panel.append(header, list);
  manager.append(summary, panel);
  return manager;
}

function renderManager(
  manager: HTMLDetailsElement,
  repositories: ReadonlySet<string>,
  actions: BlacklistActions,
): void {
  const counter = manager.querySelector<HTMLElement>(
    "[data-trending-blacklist-count]",
  );
  const clearButton = manager.querySelector<HTMLButtonElement>(
    "[data-trending-blacklist-clear]",
  );
  const list = manager.querySelector<HTMLElement>(
    "[data-trending-blacklist-list]",
  );

  if (counter === null || clearButton === null || list === null) {
    return;
  }

  counter.textContent = String(repositories.size);
  clearButton.disabled = repositories.size === 0;
  list.replaceChildren();

  if (repositories.size === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "Box-row color-fg-muted";
    emptyState.textContent = "No blocked repositories.";
    list.append(emptyState);
    return;
  }

  for (const repository of [...repositories].sort()) {
    const row = document.createElement("div");
    row.className = "Box-row d-flex flex-items-center flex-justify-between";

    const name = document.createElement("code");
    name.textContent = repository;

    const removeButton = createButton("Remove");
    removeButton.dataset.trendingBlacklistRemove = repository;
    removeButton.setAttribute(
      "aria-label",
      `Remove ${repository} from blacklist`,
    );
    removeButton.addEventListener("click", () => actions.unblock(repository));

    row.append(name, removeButton);
    list.append(row);
  }
}

function enhanceRepositoryCard(
  article: HTMLElement,
  repositories: ReadonlySet<string>,
  actions: BlacklistActions,
): void {
  const link = article.querySelector<HTMLAnchorElement>("h2 a[href]");
  const repository =
    link === null
      ? undefined
      : repositoryFromHref(link.getAttribute("href") ?? "");

  if (repository === undefined) {
    return;
  }

  article.hidden = repositories.has(repository);

  if (article.querySelector("[data-trending-blacklist-block]") !== null) {
    return;
  }

  const actionsContainer = article.querySelector<HTMLElement>(
    ":scope > .float-right.d-flex",
  );

  if (actionsContainer === null) {
    return;
  }

  const blockButton = createButton("Block");
  blockButton.classList.add("tmp-mr-2");
  blockButton.dataset.trendingBlacklistBlock = repository;
  blockButton.setAttribute("aria-label", `Add ${repository} to blacklist`);
  blockButton.addEventListener("click", () => actions.block(repository));
  actionsContainer.prepend(blockButton);
}

export function enhanceTrendingPage(
  repositories: ReadonlySet<string>,
  actions: BlacklistActions,
): void {
  const pathParts = window.location.pathname.split("/").filter(Boolean);

  if (
    pathParts[0] !== "trending" ||
    pathParts.length > 2 ||
    pathParts[1] === "developers"
  ) {
    return;
  }

  const toolbar = document.querySelector<HTMLElement>(
    ".Box-header .table-list-header-toggle",
  );

  if (toolbar !== null) {
    let manager = toolbar.querySelector<HTMLDetailsElement>(
      "[data-trending-blacklist-manager]",
    );

    if (manager === null) {
      manager = createManager(actions);
      toolbar.prepend(manager);
    }

    renderManager(manager, repositories, actions);
  }

  for (const article of document.querySelectorAll<HTMLElement>(
    "article.Box-row",
  )) {
    enhanceRepositoryCard(article, repositories, actions);
  }
}
