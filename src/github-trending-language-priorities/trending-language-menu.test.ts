import { beforeEach, describe, expect, it } from "vitest";
import { prioritizeTrendingLanguages } from "./trending-language-menu.js";

function renderLanguageMenus(languages: string[]): void {
  document.body.innerHTML = `
    <details id="select-menu-spoken-language">
      <div data-filter-list>
        <a><span data-menu-button-text>English</span></a>
        <a><span data-menu-button-text>Chinese</span></a>
      </div>
    </details>
    <details id="select-menu-language">
      <div data-filter-list>
        ${languages
          .map(
            (language) =>
              `<a href="/trending/${language.toLowerCase()}"><span data-menu-button-text>${language}</span></a>`,
          )
          .join("")}
      </div>
    </details>
  `;
}

function languageNames(): string[] {
  return [
    ...document.querySelectorAll(
      "#select-menu-language [data-filter-list] > a [data-menu-button-text]",
    ),
  ].map((item) => item.textContent?.trim() ?? "");
}

describe("prioritizeTrendingLanguages", () => {
  beforeEach(() => {
    renderLanguageMenus([
      "Unknown languages",
      "C++",
      "Java",
      "Go",
      "Shell",
      "JavaScript",
      "Python",
      "Ruby",
      "Swift",
      "Rust",
      "C",
      "TypeScript",
      "Zig",
    ]);
  });

  it("moves preferred languages to the top in priority order", () => {
    prioritizeTrendingLanguages();

    expect(languageNames()).toEqual([
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
      "Swift",
      "Unknown languages",
      "Ruby",
    ]);
  });

  it("skips missing preferred languages and preserves other menus", () => {
    renderLanguageMenus(["Ruby", "Go", "Python", "Java"]);

    prioritizeTrendingLanguages();

    expect(languageNames()).toEqual(["Python", "Go", "Java", "Ruby"]);
    expect(
      [
        ...document.querySelectorAll(
          "#select-menu-spoken-language [data-menu-button-text]",
        ),
      ].map((item) => item.textContent?.trim()),
    ).toEqual(["English", "Chinese"]);
  });

  it("is idempotent", () => {
    prioritizeTrendingLanguages();
    const once = languageNames();

    prioritizeTrendingLanguages();

    expect(languageNames()).toEqual(once);
  });
});
