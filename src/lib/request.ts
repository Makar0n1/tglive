import { headers } from "next/headers";

// Resolve the client IP behind the nginx reverse proxy.
export async function getClientIp(): Promise<string | undefined> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim();
  return h.get("x-real-ip") ?? undefined;
}

export async function getUserAgent(): Promise<string | undefined> {
  const h = await headers();
  return h.get("user-agent") ?? undefined;
}
