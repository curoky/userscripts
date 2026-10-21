import { describe, expect, it } from "vitest";
import {
  decodeBlacklist,
  encodeBlacklist,
  repositoryFromHref,
} from "./blacklist.js";

describe("repositoryFromHref", () => {
  it("normalizes a GitHub repository path", () => {
    expect(repositoryFromHref("/Cloudflare/Security-Audit-Skill")).toBe(
      "cloudflare/security-audit-skill",
    );
  });

  it("rejects non-repository and off-site links", () => {
    expect(repositoryFromHref("/trending")).toBeUndefined();
    expect(repositoryFromHref("/owner/repository/issues")).toBeUndefined();
    expect(
      repositoryFromHref("https://example.com/owner/repository"),
    ).toBeUndefined();
  });
});

describe("blacklist serialization", () => {
  it("validates, normalizes, and deduplicates stored repositories", () => {
    expect(
      decodeBlacklist({
        version: 1,
        repositories: ["Owner/Repository", "owner/repository", "invalid", 42],
      }),
    ).toEqual(new Set(["owner/repository"]));
  });

  it("rejects unknown schema versions", () => {
    expect(
      decodeBlacklist({ version: 2, repositories: ["owner/repository"] }),
    ).toEqual(new Set());
  });

  it("writes a deterministic versioned value", () => {
    expect(encodeBlacklist(new Set(["z/repo", "a/repo"]))).toEqual({
      version: 1,
      repositories: ["a/repo", "z/repo"],
    });
  });
});
