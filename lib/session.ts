import { cookies } from "next/headers";

const COOKIE_NAME = "taxwise_session";

export async function getSession() {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  return { id: existing ?? crypto.randomUUID(), isNew: !existing };
}

export function sessionCookie(id: string) {
  return { name: COOKIE_NAME, value: id, options: { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30, path: "/" } };
}

