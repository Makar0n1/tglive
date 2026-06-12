// ───────────────────────────────────────────────────────────────────────────
// Optional web-push notifications — shipped as a NO-OP so the chat works with
// zero setup. `chat.ts` calls sendPushToAdmins(payload) whenever a visitor
// sends a message; by default nothing happens.
//
// To actually notify admins on their phone/desktop even when the tab is closed,
// replace this file with a real web-push implementation:
//   1. `npm i web-push`, generate VAPID keys,
//   2. add a PushSubscription model + an endpoint to store subscriptions,
//   3. register a service worker on the admin side,
//   4. here, load the admin subscriptions and webpush.sendNotification(...).
// The realtime SSE stream already delivers messages to any OPEN admin tab — push
// is only needed for closed/background tabs.
// ───────────────────────────────────────────────────────────────────────────

export type PushPayload = {
  title: string;
  body: string;
  tag?: string;
  threadId?: string;
  [key: string]: unknown;
};

export async function sendPushToAdmins(_payload: PushPayload): Promise<void> {
  // no-op — see the note above to enable real push
}
