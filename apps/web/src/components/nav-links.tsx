"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

type Item = { href: string; label: string };

/**
 * The pathname is URL data, so on dynamic routes it must sit inside Suspense.
 * The fallback renders the same links without the active highlight.
 */
export function NavLinks({ items }: { items: Item[] }) {
  return (
    <Suspense fallback={<Links items={items} />}>
      <ActiveLinks items={items} />
    </Suspense>
  );
}

function ActiveLinks({ items }: { items: Item[] }) {
  return <Links items={items} pathname={usePathname()} />;
}

function Links({ items, pathname }: { items: Item[]; pathname?: string }) {
  return items.map((item) => {
    const active = !!pathname && (pathname === item.href || pathname.startsWith(`${item.href}/`));
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
          active ? "bg-primary-soft font-medium text-primary" : "text-muted hover:text-foreground"
        }`}
      >
        {item.label}
      </Link>
    );
  });
}
