"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { DASHBOARD_BY_ROLE, type AuthUser, type Role } from "@mindease/shared";
import { Button, Logo } from "@/components/ui";
import { useLogout, useMe } from "@/lib/auth";

export interface NavItem {
  href: string;
  label: string;
}

/**
 * Layout for signed-in areas. proxy.ts already redirects most mismatches;
 * this catches the case where the access cookie had expired and the role
 * only became known after a refresh.
 */
export function AppShell({
  role,
  nav,
  children,
}: {
  role: Role;
  nav: NavItem[];
  children: (user: AuthUser) => React.ReactNode;
}) {
  const { data: user, isPending } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const logout = useLogout();

  useEffect(() => {
    if (isPending) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (user.role !== role) router.replace(DASHBOARD_BY_ROLE[user.role]);
  }, [user, isPending, role, router, pathname]);

  if (isPending || !user || user.role !== role) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted" aria-live="polite">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  pathname === item.href
                    ? "bg-primary-soft font-medium text-primary"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">{user.name}</span>
            <Button variant="secondary" onClick={() => logout.mutate()} disabled={logout.isPending}>
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {!user.emailVerified && (
          <p className="mb-6 rounded-lg bg-warning-soft px-4 py-2 text-sm">
            Please verify your email address. Check your inbox for the link.
          </p>
        )}
        {children(user)}
      </main>
    </div>
  );
}
