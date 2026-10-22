import { beforeEach, describe, expect, it, vi } from "vitest";
import { enhanceTrendingPage } from "./trending-page.js";

function renderFixture(): void {
  document.body.innerHTML = `
    <div class="Box">
      <div class="Box-header">
        <div class="table-list-header-toggle"></div>
      </div>
      <article class="Box-row">
        <div class="float-right d-flex"><a class="btn">Star</a></div>
        <h2><a href="/Cloudflare/Security-Audit-Skill">Repository</a></h2>
      </article>
    </div>
  `;
}

describe("enhanceTrendingPage", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/trending");
    renderFixture();
  });

  it("adds a block action and blacklist manager", () => {
    const block = vi.fn();

    enhanceTrendingPage(new Set(), {
      block,
      clear: vi.fn(),
      unblock: vi.fn(),
    });

    const blockButton = document.querySelector<HTMLButtonElement>(
      "[data-trending-blacklist-block]",
    );
    blockButton?.click();

    expect(block).toHaveBeenCalledWith("cloudflare/security-audit-skill");
    expect(
      document.querySelector("[data-trending-blacklist-manager]"),
    ).not.toBeNull();
  });

  it("enhances language-filtered repository pages", () => {
    window.history.replaceState({}, "", "/trending/python?since=daily");

    enhanceTrendingPage(new Set(), {
      block: vi.fn(),
      clear: vi.fn(),
      unblock: vi.fn(),
    });

    expect(
      document.querySelector("[data-trending-blacklist-block]"),
    ).not.toBeNull();
  });

  it("does not enhance the trending developers page", () => {
    window.history.replaceState({}, "", "/trending/developers");

    enhanceTrendingPage(new Set(), {
      block: vi.fn(),
      clear: vi.fn(),
      unblock: vi.fn(),
    });

    expect(
      document.querySelector("[data-trending-blacklist-block]"),
    ).toBeNull();
  });

  it("hides blocked cards and can request removal", () => {
    const unblock = vi.fn();

    enhanceTrendingPage(new Set(["cloudflare/security-audit-skill"]), {
      block: vi.fn(),
      clear: vi.fn(),
      unblock,
    });

    expect(document.querySelector<HTMLElement>("article")?.hidden).toBe(true);

    const removeButton = document.querySelector<HTMLButtonElement>(
      "[data-trending-blacklist-remove]",
    );
    removeButton?.click();

    expect(unblock).toHaveBeenCalledWith("cloudflare/security-audit-skill");
  });

  it("does not add duplicate controls when rendered again", () => {
    const actions = {
      block: vi.fn(),
      clear: vi.fn(),
      unblock: vi.fn(),
    };

    enhanceTrendingPage(new Set(), actions);
    enhanceTrendingPage(new Set(), actions);

    expect(
      document.querySelectorAll("[data-trending-blacklist-manager]"),
    ).toHaveLength(1);
    expect(
      document.querySelectorAll("[data-trending-blacklist-block]"),
    ).toHaveLength(1);
  });
});
