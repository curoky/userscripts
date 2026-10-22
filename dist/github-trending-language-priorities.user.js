// ==UserScript==
// @name         GitHub Trending Language Priorities
// @namespace    https://github.com/curoky/userscripts
// @version      0.2.0
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
// ==/UserScript==
(function() {

//#region src/github-trending-language-priorities/trending-language-menu.ts
	function prioritizeTrendingLanguages() {
		const languageList = document.querySelector("#select-menu-language [data-filter-list]");
		if (languageList === null) return;
		const itemsByLanguage = new Map([...languageList.querySelectorAll(":scope > a")].map((item) => [item.querySelector("[data-menu-button-text]")?.textContent?.trim(), item]));
		const prioritizedItems = [
			"Python",
			"C++",
			"Go",
			"Rust",
			"TypeScript",
			"JavaScript",
			"Java",
			"C",
			"Zig",
			"Shell",
			"Swift"
		].flatMap((language) => {
			const item = itemsByLanguage.get(language);
			return item === void 0 ? [] : [item];
		});
		const prioritizedLanguages = document.createDocumentFragment();
		prioritizedLanguages.append(...prioritizedItems);
		languageList.prepend(prioritizedLanguages);
	}

//#endregion
//#region src/github-trending-language-priorities/main.ts
	document.addEventListener("pjax:end", prioritizeTrendingLanguages);
	document.addEventListener("turbo:render", prioritizeTrendingLanguages);
	window.addEventListener("popstate", prioritizeTrendingLanguages);
	prioritizeTrendingLanguages();

//#endregion
})();