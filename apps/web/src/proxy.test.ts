import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, type Role } from "@mindease/shared";
import { proxy } from "./proxy";

async function requestAs(path: string, role?: Role, { refresh = true } = {}) {
  const req = new NextRequest(new URL(path, "http://localhost:3000"));
  if (refresh) req.cookies.set(REFRESH_TOKEN_COOKIE, "opaque");
  if (role) {
    const token = await new SignJWT({ role, tier: "FREE" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .sign(new TextEncoder().encode("irrelevant-for-decode"));
    req.cookies.set(ACCESS_TOKEN_COOKIE, token);
  }
  return proxy(req);
}

const location = (res: Response) => res.headers.get("location");

describe("proxy", () => {
  it("sends guests to login with a return path", async () => {
    const res = await requestAs("/admin", undefined, { refresh: false });
    expect(location(res)).toBe("http://localhost:3000/login?next=%2Fadmin");
  });

  it.each([
    ["USER", "/admin", "/dashboard"],
    ["USER", "/doctor/patients", "/dashboard"],
    ["DOCTOR", "/dashboard", "/doctor"],
    ["ADMIN", "/doctor", "/admin"],
  ] as const)("redirects %s away from %s", async (role, path, home) => {
    expect(location(await requestAs(path, role))).toBe(`http://localhost:3000${home}`);
  });

  it.each([
    ["USER", "/dashboard"],
    ["DOCTOR", "/doctor"],
    ["ADMIN", "/admin"],
  ] as const)("lets %s into %s", async (role, path) => {
    expect(location(await requestAs(path, role))).toBeNull();
  });

  it("lets a session with an expired access cookie through for client refresh", async () => {
    expect(location(await requestAs("/admin"))).toBeNull();
  });

  it("sends signed-in users from login to their dashboard", async () => {
    expect(location(await requestAs("/login", "DOCTOR"))).toBe("http://localhost:3000/doctor");
  });

  it("leaves public pages alone", async () => {
    expect(location(await requestAs("/", undefined, { refresh: false }))).toBeNull();
  });

  it("does not treat lookalike paths as protected", async () => {
    expect(location(await requestAs("/administrator", undefined, { refresh: false }))).toBeNull();
  });
});
