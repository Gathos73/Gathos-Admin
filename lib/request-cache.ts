// Memory only: scoped to this browser document, never persisted or shared by users.
const FRESH_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 100;
type Entry = { expires: number; promise: Promise<unknown> };
const entries = new Map<string, Entry>();

export function clearRequestCache(): void {
  entries.clear();
}

export function cachedRequest<T>(
  key: string,
  loader: () => Promise<T>,
  signal?: AbortSignal | null,
  force = false,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (force) entries.delete(key);
  let entry = entries.get(key);
  if (!entry || entry.expires <= Date.now()) {
    const next: Entry = { expires: Infinity, promise: Promise.resolve() };
    next.promise = loader().then((value) => {
      next.expires = Date.now() + FRESH_MS;
      return value;
    }).catch((error: unknown) => {
      if (entries.get(key) === next) entries.delete(key);
      throw error;
    });
    entries.delete(key);
    if (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value!);
    entries.set(key, next);
    entry = next;
  }
  const promise = entry.promise as Promise<T>;
  if (!signal) return promise;
  // Cancelling one page must not cancel a request shared with another page.
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => { signal.removeEventListener("abort", abort); resolve(value); },
      (error: unknown) => { signal.removeEventListener("abort", abort); reject(error); },
    );
  });
}
