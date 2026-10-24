import { NextRequest, NextResponse } from "next/server";
import { decodeJwt } from "jose";
import {
  ACCESS_TOKEN_COOKIE,
  DASHBOARD_BY_ROLE,
  REFRESH_TOKEN_COOKIE,
  type JwtPayload,
  type Role,
} from "@mindease/shared";

/** Which role owns each protected area. */
const AREAS: { prefix: string; role: Role }[] = [
  { prefix: "/dashboard", role: "USER" },
  { prefix: "/doctor", role: "DOCTOR" },
  { prefix: "/admin", role: "ADMIN" },
];

const AUTH_PAGES = ["/login", "/register"];

/**
 * Optimistic redirects only: the token is decoded, not verified. The API
 * enforces every permission; this just keeps people out of the wrong UI.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has(REFRESH_TOKEN_COOKIE);
  const role = roleFrom(req.cookies.get(ACCESS_TOKEN_COOKIE)?.value);

  const area = AREAS.find(
    (a) => pathname === a.prefix || pathname.startsWith(`${a.prefix}/`),
  );

  if (area) {
    if (!hasSession) {
      const login = new URL("/login", req.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
    // Role unknown means the access cookie expired; the page refreshes it client-side.
    if (role && role !== area.role) {
      return NextResponse.redirect(new URL(DASHBOARD_BY_ROLE[role], req.url));
    }
  }

  if (AUTH_PAGES.includes(pathname) && hasSession && role) {
    return NextResponse.redirect(new URL(DASHBOARD_BY_ROLE[role], req.url));
  }

  return NextResponse.next();
}

function roleFrom(token: string | undefined): Role | undefined {
  if (!token) return undefined;
  try {
    return decodeJwt<JwtPayload>(token).role;
  } catch {
    return undefined;
  }
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
