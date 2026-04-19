/**
 * Authenticated fetch wrapper for the overlay's API calls.
 *
 * The overlay starts with the bearer token in
 * `window.__PyanchorConfig.token`. After bootstrap exchanges the
 * token for an HttpOnly session cookie (since v0.5.1), bootstrap
 * blanks the field — so this helper has to read the token lazily
 * via `getToken()` rather than capturing it at factory time.
 *
 * When `getToken()` returns an empty / null string, the
 * Authorization header is omitted and the request rides on the
 * cookie alone.
 */

export interface FetchHelperOptions {
  /** Base URL the runtime serves under (e.g. "/_pyanchor"). */
  baseUrl: string;
  /**
   * Returns the current bearer token, or empty/null if the bootstrap
   * has already cleared it. Called on every request so the change
   * after the session-exchange POST is observed.
   */
  getToken(): string | null;
  /** Optional fetch override — defaults to global fetch. Useful for tests. */
  fetchImpl?: typeof fetch;
  /**
   * Generic fallback message when a non-2xx response has no `{error}`
   * field. Defaults to English "Request failed." for callers that
   * don't pass a localized override.
   */
  defaultErrorMessage?: string;
}

export interface FetchJson {
  <T>(input: string, init?: RequestInit): Promise<T>;
}

const DEFAULT_ERROR_MESSAGE = "Request failed.";

/**
 * Returns a typed fetchJson helper.
 *
 * Behavior:
 *   - 2xx response → JSON parse + return
 *   - non-2xx → reject with the server's `{error}` field, falling
 *     back to a generic "Request failed." message
 *   - cache: no-store on every request (overlay polls live state)
 */
export function createFetchJson(opts: FetchHelperOptions): FetchJson {
  const fetchImpl: typeof fetch = opts.fetchImpl ?? fetch;
  const defaultError = opts.defaultErrorMessage ?? DEFAULT_ERROR_MESSAGE;
  return async <T>(input: string, init?: RequestInit): Promise<T> => {
    const token = opts.getToken();
    const response = await fetchImpl(input, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {})
      },
      cache: "no-store"
    });
    const data = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      throw new Error(data?.error ?? defaultError);
    }
    return data;
  };
}

/**
 * Compose `${baseUrl}${suffix}` while collapsing any double slashes
 * at the join. Pure, no side effects.
 */
export const runtimePath = (baseUrl: string, suffix: string): string =>
  `${baseUrl.replace(/\/+$/, "")}/${suffix.replace(/^\/+/, "")}`;
