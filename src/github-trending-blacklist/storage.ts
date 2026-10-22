import { decodeBlacklist, encodeBlacklist } from "./blacklist.js";

export function loadBlacklist(): Set<string> {
  return decodeBlacklist(GM_getValue<unknown>("github-trending-blacklist"));
}

export function saveBlacklist(repositories: ReadonlySet<string>): void {
  GM_setValue("github-trending-blacklist", encodeBlacklist(repositories));
}

export function onRemoteBlacklistChange(
  listener: (repositories: Set<string>) => void,
): void {
  GM_addValueChangeListener(
    "github-trending-blacklist",
    (_name, _oldValue, newValue, isRemote) => {
      if (isRemote) {
        listener(decodeBlacklist(newValue));
      }
    },
  );
}
