import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

export const VISITOR_COOKIE = "pf_visitor";
const VISITOR_TTL_DAYS = 365;

// Normalize a contact string so the same person is recognized whether they
// type a phone, email, or @handle. Phones -> digits; emails/handles -> lower.
export function normalizeContact(contact: string | null | undefined): string | null {
  if (!contact) return null;
  const trimmed = contact.trim().toLowerCase();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d]/g, "");
  // Treat as phone if it's mostly digits and long enough.
  if (digits.length >= 7 && digits.length / trimmed.length > 0.5) {
    return `tel:${digits.slice(-10)}`;
  }
  return `id:${trimmed.replace(/^@/, "")}`;
}

async function setVisitorCookie(cookieId: string) {
  const store = await cookies();
  store.set(VISITOR_COOKIE, cookieId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + VISITOR_TTL_DAYS * 86400000),
  });
}

export async function getVisitorCookieId(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(VISITOR_COOKIE)?.value;
}

// Resolve (or create) the unified Visitor for the current browser, linking
// chat and leads. Identity precedence: cookie -> matching contact -> new.
// Sets/updates the visitor cookie as needed.
export async function resolveVisitor(input: {
  name?: string | null;
  contact?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const cookieId = await getVisitorCookieId();
  const contactKey = normalizeContact(input.contact);

  let visitor = cookieId
    ? await prisma.visitor.findUnique({ where: { cookieId } })
    : null;

  // Cross-device merge: a new/unknown browser that provides a known contact is
  // recognized as the same person.
  if (!visitor && contactKey) {
    visitor = await prisma.visitor.findFirst({ where: { contactKey } });
    if (visitor) {
      // Point this browser at the existing person.
      await setVisitorCookie(visitor.cookieId);
    }
  }

  if (!visitor) {
    const newCookieId = crypto.randomBytes(16).toString("hex");
    visitor = await prisma.visitor.create({
      data: {
        cookieId: newCookieId,
        name: input.name || null,
        contact: input.contact || null,
        contactKey,
        ip: input.ip || null,
        userAgent: input.userAgent || null,
      },
    });
    await setVisitorCookie(newCookieId);
    return visitor;
  }

  // Backfill identity details we learn over time.
  const patch: { name?: string; contact?: string; contactKey?: string; lastSeenAt: Date; ip?: string } = {
    lastSeenAt: new Date(),
  };
  if (input.name && !visitor.name) patch.name = input.name;
  if (input.contact && !visitor.contact) patch.contact = input.contact;
  if (contactKey && !visitor.contactKey) patch.contactKey = contactKey;
  if (input.ip) patch.ip = input.ip;

  visitor = await prisma.visitor.update({ where: { id: visitor.id }, data: patch });
  return visitor;
}
