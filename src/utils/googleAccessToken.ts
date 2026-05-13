/** Ключ OAuth access token (Google); храним в sessionStorage — сужает окно XSS vs localStorage. */
export const GOOGLE_OAUTH_ACCESS_TOKEN_KEY = 'google_access_token';

/** Одноразовая миграция с localStorage на sessionStorage. */
export function readGoogleAccessToken(): string | null {
  const fromSession = sessionStorage.getItem(GOOGLE_OAUTH_ACCESS_TOKEN_KEY);
  if (fromSession) return fromSession;
  const legacy = localStorage.getItem(GOOGLE_OAUTH_ACCESS_TOKEN_KEY);
  if (legacy) {
    sessionStorage.setItem(GOOGLE_OAUTH_ACCESS_TOKEN_KEY, legacy);
    localStorage.removeItem(GOOGLE_OAUTH_ACCESS_TOKEN_KEY);
    return legacy;
  }
  return null;
}

export function setGoogleAccessToken(token: string): void {
  sessionStorage.setItem(GOOGLE_OAUTH_ACCESS_TOKEN_KEY, token);
}

export function clearGoogleAccessToken(): void {
  sessionStorage.removeItem(GOOGLE_OAUTH_ACCESS_TOKEN_KEY);
  localStorage.removeItem(GOOGLE_OAUTH_ACCESS_TOKEN_KEY);
}
