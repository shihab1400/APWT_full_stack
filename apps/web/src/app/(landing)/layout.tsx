import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/** The home page runs its hero edge to edge, so it has no centred container. */
export default function LandingLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <main className="flex w-full flex-1 flex-col">{children}</main>
      <SiteFooter />
    </>
  );
}
