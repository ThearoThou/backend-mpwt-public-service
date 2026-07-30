export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

export interface RequestContextSource {
  ip?: string | undefined;
  socket?: { remoteAddress?: string | undefined } | undefined;
  headers?: Record<string, string | string[] | undefined> | undefined;
}

export function getRequestContext(
  request: RequestContextSource,
): RequestContext {
  const userAgent = request.headers?.['user-agent'];

  return {
    ip:
      normalizeValue(request.ip) ??
      normalizeValue(request.socket?.remoteAddress),
    userAgent: normalizeValue(
      Array.isArray(userAgent) ? userAgent[0] : userAgent,
    ),
  };
}

function normalizeValue(value: string | undefined): string | null {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0
    ? null
    : normalized;
}
