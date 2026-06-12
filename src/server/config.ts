// ───────────────────────────────────────────────────────────────────────────
// Runtime config — how tglive reaches YOUR app's pieces. Call configureChat()
// once at server startup (Next.js instrumentation.ts `register()`), before any
// request is handled. The admin chat endpoints refuse access unless
// `getCurrentUser` returns a truthy value.
//
// IMPORTANT: the resolver is stored on `globalThis`, NOT in a module-scope
// variable. With `transpilePackages` Next bundles this module SEPARATELY into the
// instrumentation bundle and into each route handler, so a plain module variable
// set in instrumentation would be invisible to the routes (each gets its own copy
// → admin always 401). globalThis is shared across all of them in the Node runtime.
// ───────────────────────────────────────────────────────────────────────────

export type GetCurrentUser = () => Promise<unknown | null> | unknown | null;

export interface TgliveConfig {
  /** Return your logged-in admin (any truthy value) or null. */
  getCurrentUser: GetCurrentUser;
}

const KEY = "__tglive_getCurrentUser__";
type Store = Record<string, GetCurrentUser | undefined>;

/** Wire tglive to your auth. Call once at server startup. */
export function configureChat(config: TgliveConfig): void {
  (globalThis as unknown as Store)[KEY] = config.getCurrentUser;
}

/** Used internally by the admin routes. */
export async function getCurrentUser(): Promise<unknown | null> {
  const fn = (globalThis as unknown as Store)[KEY];
  return fn ? await fn() : null;
}
