import { Suspense } from "react";
import { DASHBOARD_BY_ROLE } from "@mindease/shared";
import { ButtonLink, Logo } from "@/components/ui";
import { NavLinks } from "@/components/nav-links";
import { peekSession } from "@/lib/session";

export const PUBLIC_NAV = [
  { href: "/doctors", label: "Doctors" },
  { href: "/resources", label: "Resources" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          <NavLinks items={PUBLIC_NAV} />
          <EmergencyLink />
        </nav>
        <div className="flex items-center gap-2">
          <Suspense fallback={<GuestActions />}>
            <AccountActions />
          </Suspense>
          <details className="relative md:hidden">
            <summary
              aria-label="Menu"
              className="cursor-pointer list-none rounded-lg border border-border px-3 py-2 text-sm [&::-webkit-details-marker]:hidden"
            >
              Menu
            </summary>
            <nav
              aria-label="Main"
              className="absolute right-0 z-20 mt-2 flex w-48 flex-col gap-1 rounded-xl border border-border bg-surface p-2 shadow-lg"
            >
              <NavLinks items={PUBLIC_NAV} />
              <EmergencyLink />
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

function EmergencyLink() {
  return (
    <a
      href="/emergency"
      className="rounded-lg bg-danger-soft px-3 py-1.5 text-sm font-medium text-danger hover:underline"
    >
      Emergency help
    </a>
  );
}

async function AccountActions() {
  const session = await peekSession();
  if (!session.signedIn) return <GuestActions />;
  return (
    <ButtonLink href={session.role ? DASHBOARD_BY_ROLE[session.role] : "/login"}>
      My dashboard
    </ButtonLink>
  );
}

function GuestActions() {
  return (
    <>
      <ButtonLink href="/login" variant="ghost" className="hidden sm:inline-flex">
        Log in
      </ButtonLink>
      <ButtonLink href="/register">Get started</ButtonLink>
    </>
  );
}
