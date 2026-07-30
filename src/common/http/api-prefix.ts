const DEFAULT_API_PREFIX = '/api/v1';

export function normalizeApiPrefix(prefix: string | undefined): string {
  const normalized = (prefix ?? DEFAULT_API_PREFIX)
    .trim()
    .replace(/^\/+|\/+$/g, '');

  return normalized || DEFAULT_API_PREFIX.slice(1);
}
