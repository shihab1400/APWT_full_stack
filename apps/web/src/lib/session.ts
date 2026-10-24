import "server-only";
import { cookies } from "next/headers";
import { decodeJwt } from "jose";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, type JwtPayload, type Role } from "@mindease/shared";

/**
 * Optimistic view of who is browsing, read from cookies without calling the API.
 * Good for choosing which links to show, never for authorization.
 */
export async function peekSession(): Promise<{ signedIn: boolean; role?: Role }> {
  const jar = await cookies();
  if (!jar.has(REFRESH_TOKEN_COOKIE)) return { signedIn: false };
  const token = jar.get(ACCESS_TOKEN_COOKIE)?.value;
  try {
    return { signedIn: true, role: token ? decodeJwt<JwtPayload>(token).role : undefined };
  } catch {
    return { signedIn: true };
  }
}
