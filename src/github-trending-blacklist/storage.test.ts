import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadBlacklist,
  onRemoteBlacklistChange,
  saveBlacklist,
} from "./storage.js";

type ChangeListener = (
  name: string,
  oldValue: unknown,
  newValue: unknown,
  isRemote: boolean,
) => void;

describe("blacklist storage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads and validates the stored value", () => {
    vi.stubGlobal(
      "GM_getValue",
      vi.fn(() => ({
        version: 1,
        repositories: ["Owner/Repository", "invalid"],
      })),
    );

    expect(loadBlacklist()).toEqual(new Set(["owner/repository"]));
  });

  it("writes the versioned schema", () => {
    const setValue = vi.fn();
    vi.stubGlobal("GM_setValue", setValue);

    saveBlacklist(new Set(["z/repository", "a/repository"]));

    expect(setValue).toHaveBeenCalledWith("github-trending-blacklist", {
      version: 1,
      repositories: ["a/repository", "z/repository"],
    });
  });

  it("forwards only valid remote changes", () => {
    let changeListener: ChangeListener | undefined;
    vi.stubGlobal(
      "GM_addValueChangeListener",
      vi.fn((_name: string, listener: ChangeListener) => {
        changeListener = listener;
        return "listener-id";
      }),
    );
    const listener = vi.fn();

    onRemoteBlacklistChange(listener);
    changeListener?.(
      "github-trending-blacklist",
      undefined,
      { version: 1, repositories: ["Owner/Repository"] },
      false,
    );
    changeListener?.(
      "github-trending-blacklist",
      undefined,
      { version: 1, repositories: ["Owner/Repository"] },
      true,
    );

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(new Set(["owner/repository"]));
  });
});
