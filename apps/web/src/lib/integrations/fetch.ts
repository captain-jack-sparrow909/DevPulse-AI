/**
 * Research fetches must NOT use Next.js Data Cache.
 * Large RSS/API bodies (e.g. vercel.com/atom > 2MB) fail with:
 * "items over 2MB can not be cached".
 */
export const researchFetchInit = {
  cache: "no-store" as const,
};

export async function researchFetch(
  input: string | URL,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = 15_000, ...rest } = init || {};
  return fetch(input, {
    ...rest,
    cache: "no-store",
    signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
  });
}
