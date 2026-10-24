import Link from "next/link";
import { PUBLIC_NAV } from "@/components/site-header";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <p className="font-semibold">MindEase Oasis</p>
          <p className="mt-2 text-sm text-muted">
            AI and expert support for mental health. Not a substitute for emergency care.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-2 text-sm">
          {PUBLIC_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-muted hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-2 text-sm">
          <Link href="/privacy" className="text-muted hover:text-foreground">
            Privacy policy
          </Link>
          <Link href="/terms" className="text-muted hover:text-foreground">
            Terms &amp; conditions
          </Link>
          <Link href="/emergency" className="font-medium text-danger hover:underline">
            In crisis? Call 999
          </Link>
        </div>
      </div>
    </footer>
  );
}
