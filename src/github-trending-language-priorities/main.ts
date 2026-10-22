import { prioritizeTrendingLanguages } from "./trending-language-menu.js";

document.addEventListener("pjax:end", prioritizeTrendingLanguages);
document.addEventListener("turbo:render", prioritizeTrendingLanguages);
window.addEventListener("popstate", prioritizeTrendingLanguages);

prioritizeTrendingLanguages();
