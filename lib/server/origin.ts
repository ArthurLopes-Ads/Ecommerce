export function isTrustedOrigin(request: Request): boolean {
  const expectedOrigin = process.env.NEXTAUTH_URL ?? process.env.SITE_URL;
  const requestOrigin = request.headers.get("origin");

  if (!expectedOrigin || !requestOrigin) return false;

  try {
    return new URL(requestOrigin).origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}
