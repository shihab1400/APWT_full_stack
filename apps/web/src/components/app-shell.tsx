"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { DASHBOARD_BY_ROLE, type AuthUser, type Role } from "@mindease/shared";
import { UnreadBadge } from "@/components/consultations";
import { NotificationBell } from "@/components/notification-bell";
import { Button, Logo } from "@/components/ui";
import { api } from "@/lib/api";
import { useLogout, useMe } from "@/lib/auth";

function VerifyEmailBanner({ email }: { email: string }) {
  const resend = useMutation({
    mutationFn: () => api<void>("/auth/resend-verification", { method: "POST" }),
  });
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning-soft px-4 py-2 text-sm">
      <p>
        Please verify your email address. We sent a link to <strong>{email}</strong>.
      </p>
      {resend.isSuccess ? (
        <span role="status" className="text-muted">
          New link sent. Check your inbox and spam folder.
        </span>
      ) : (
        <span className="flex items-center gap-2">
          {resend.error && <span className="text-danger">{resend.error.message}</span>}
          <Button variant="ghost" disabled={resend.isPending} onClick={() => resend.mutate()}>
            {resend.isPending ? "Sending…" : "Resend email"}
          </Button>
        </span>
      )}
    </div>
  );
}

export interface NavItem {
  href: string;
  label: string;
  /** Show the unread consultation message count. */
  badge?: "messages";
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

  // Longest matching prefix wins, so /dashboard/chat highlights "AI companion", not "Overview".
  const activeHref = nav
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

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
                aria-current={activeHref === item.href ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  activeHref === item.href
                    ? "bg-primary-soft font-medium text-primary"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {item.label}
                {item.badge === "messages" && <UnreadBadge />}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <span className="hidden text-sm text-muted sm:inline">{user.name}</span>
            <Button variant="secondary" onClick={() => logout.mutate()} disabled={logout.isPending}>
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {!user.emailVerified && <VerifyEmailBanner email={user.email} />}
        {children(user)}
      </main>
    </div>
  );
}
