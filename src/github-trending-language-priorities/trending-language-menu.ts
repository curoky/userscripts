export function prioritizeTrendingLanguages(): void {
  const languageList = document.querySelector<HTMLElement>(
    "#select-menu-language [data-filter-list]",
  );

  if (languageList === null) {
    return;
  }

  const itemsByLanguage = new Map(
    [...languageList.querySelectorAll<HTMLElement>(":scope > a")].map(
      (item) => [
        item.querySelector("[data-menu-button-text]")?.textContent?.trim(),
        item,
      ],
    ),
  );

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
    "Swift",
  ].flatMap((language) => {
    const item = itemsByLanguage.get(language);
    return item === undefined ? [] : [item];
  });

  const prioritizedLanguages = document.createDocumentFragment();
  prioritizedLanguages.append(...prioritizedItems);
  languageList.prepend(prioritizedLanguages);
}
