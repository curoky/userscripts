// ==UserScript==
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
// ==/UserScript==
(function() {

//#region src/github-trending-blacklist/blacklist.ts
	function normalizeRepository(value) {
		const parts = value.trim().toLowerCase().split("/");
		if (parts.length !== 2 || parts.some((part) => part.length === 0 || /\s/.test(part))) return;
		return `${parts[0]}/${parts[1]}`;
	}
	function repositoryFromHref(href) {
		const url = new URL(href, "https://github.com");
		if (url.origin !== "https://github.com") return;
		return normalizeRepository(url.pathname.slice(1));
	}
	function decodeBlacklist(value) {
		if (typeof value !== "object" || value === null) return /* @__PURE__ */ new Set();
		const candidate = value;
		if (candidate.version !== 1 || !Array.isArray(candidate.repositories)) return /* @__PURE__ */ new Set();
		const repositories = candidate.repositories.flatMap((repository) => {
			if (typeof repository !== "string") return [];
			const normalized = normalizeRepository(repository);
			return normalized === void 0 ? [] : [normalized];
		});
		return new Set(repositories);
	}
	function encodeBlacklist(repositories) {
		return {
			version: 1,
			repositories: [...repositories].sort()
		};
	}

//#endregion
//#region src/github-trending-blacklist/ui.ts
	function createButton(label) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "btn btn-sm";
		button.textContent = label;
		return button;
	}
	function createManager(actions) {
		const manager = document.createElement("details");
		manager.className = "details-reset position-relative tmp-mr-2";
		manager.dataset.trendingBlacklistManager = "";
		const summary = document.createElement("summary");
		summary.className = "btn btn-sm";
		summary.innerHTML = "Blacklist <span class=\"Counter\" data-trending-blacklist-count>0</span>";
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
	function renderManager(manager, repositories, actions) {
		const counter = manager.querySelector("[data-trending-blacklist-count]");
		const clearButton = manager.querySelector("[data-trending-blacklist-clear]");
		const list = manager.querySelector("[data-trending-blacklist-list]");
		if (counter === null || clearButton === null || list === null) return;
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
			removeButton.setAttribute("aria-label", `Remove ${repository} from blacklist`);
			removeButton.addEventListener("click", () => actions.unblock(repository));
			row.append(name, removeButton);
			list.append(row);
		}
	}
	function enhanceRepositoryCard(article, repositories, actions) {
		const link = article.querySelector("h2 a[href]");
		const repository = link === null ? void 0 : repositoryFromHref(link.getAttribute("href") ?? "");
		if (repository === void 0) return;
		article.hidden = repositories.has(repository);
		if (article.querySelector("[data-trending-blacklist-block]") !== null) return;
		const actionsContainer = article.querySelector(":scope > .float-right.d-flex");
		if (actionsContainer === null) return;
		const blockButton = createButton("Block");
		blockButton.classList.add("tmp-mr-2");
		blockButton.dataset.trendingBlacklistBlock = repository;
		blockButton.setAttribute("aria-label", `Add ${repository} to blacklist`);
		blockButton.addEventListener("click", () => actions.block(repository));
		actionsContainer.prepend(blockButton);
	}
	function enhanceTrendingPage(repositories, actions) {
		if (window.location.pathname !== "/trending") return;
		const toolbar = document.querySelector(".Box-header .table-list-header-toggle");
		if (toolbar !== null) {
			let manager = toolbar.querySelector("[data-trending-blacklist-manager]");
			if (manager === null) {
				manager = createManager(actions);
				toolbar.prepend(manager);
			}
			renderManager(manager, repositories, actions);
		}
		for (const article of document.querySelectorAll("article.Box-row")) enhanceRepositoryCard(article, repositories, actions);
	}

//#endregion
//#region src/github-trending-blacklist/main.ts
	let repositories = decodeBlacklist(GM_getValue("github-trending-blacklist"));
	function render() {
		enhanceTrendingPage(repositories, {
			block(repository) {
				const nextRepositories = new Set(repositories).add(repository);
				GM_setValue("github-trending-blacklist", encodeBlacklist(nextRepositories));
				repositories = nextRepositories;
				render();
			},
			clear() {
				GM_setValue("github-trending-blacklist", encodeBlacklist(/* @__PURE__ */ new Set()));
				repositories = /* @__PURE__ */ new Set();
				render();
			},
			unblock(repository) {
				const nextRepositories = new Set(repositories);
				nextRepositories.delete(repository);
				GM_setValue("github-trending-blacklist", encodeBlacklist(nextRepositories));
				repositories = nextRepositories;
				render();
			}
		});
	}
	document.addEventListener("pjax:end", render);
	document.addEventListener("turbo:render", render);
	window.addEventListener("popstate", render);
	GM_addValueChangeListener("github-trending-blacklist", (_name, _oldValue, newValue, isRemote) => {
		if (!isRemote) return;
		repositories = decodeBlacklist(newValue);
		render();
	});
	render();

//#endregion
})();