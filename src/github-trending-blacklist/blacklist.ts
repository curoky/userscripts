export interface BlacklistValue {
  version: 1;
  repositories: string[];
}

function normalizeRepository(value: string): string | undefined {
  const parts = value.trim().toLowerCase().split("/");

  if (
    parts.length !== 2 ||
    parts.some((part) => part.length === 0 || /\s/.test(part))
  ) {
    return undefined;
  }

  return `${parts[0]}/${parts[1]}`;
}

export function repositoryFromHref(href: string): string | undefined {
  const url = new URL(href, "https://github.com");

  if (url.origin !== "https://github.com") {
    return undefined;
  }

  return normalizeRepository(url.pathname.slice(1));
}

export function decodeBlacklist(value: unknown): Set<string> {
  if (typeof value !== "object" || value === null) {
    return new Set();
  }

  const candidate = value as {
    version?: unknown;
    repositories?: unknown;
  };

  if (candidate.version !== 1 || !Array.isArray(candidate.repositories)) {
    return new Set();
  }

  const repositories = candidate.repositories.flatMap((repository) => {
    if (typeof repository !== "string") {
      return [];
    }

    const normalized = normalizeRepository(repository);
    return normalized === undefined ? [] : [normalized];
  });

  return new Set(repositories);
}

export function encodeBlacklist(
  repositories: ReadonlySet<string>,
): BlacklistValue {
  return {
    version: 1,
    repositories: [...repositories].sort(),
  };
}
