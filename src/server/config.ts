// ───────────────────────────────────────────────────────────────────────────
// Runtime config — how Telegrade reaches YOUR app's pieces. Call configureChat()
// once at server startup (e.g. in your Next.js instrumentation.ts `register()`),
// before any request is handled. The admin chat endpoints refuse access unless
// `getCurrentUser` returns a truthy value.
// ───────────────────────────────────────────────────────────────────────────

export type GetCurrentUser = () => Promise<unknown | null> | unknown | null;

export interface TelegradeConfig {
  /** Return your logged-in admin (any truthy value) or null. */
  getCurrentUser: GetCurrentUser;
}

let _getCurrentUser: GetCurrentUser = () => null;

/** Wire Telegrade to your auth. Call once at startup. */
export function configureChat(config: TelegradeConfig): void {
  _getCurrentUser = config.getCurrentUser;
}

/** Used internally by the admin routes. */
export async function getCurrentUser(): Promise<unknown | null> {
  return await _getCurrentUser();
}
