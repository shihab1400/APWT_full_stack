"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { AttemptHistoryItem, ChatUsage } from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { RiskBadge } from "@/components/risk-badge";
import { Card } from "@/components/ui";
import { api } from "@/lib/api";
import { USER_NAV } from "./nav";

export default function UserDashboard() {
  return (
    <AppShell role="USER" nav={USER_NAV}>
      {(user) => (
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold">Hi {user.name.split(" ")[0]}, how are you today?</h1>
            <p className="mt-1 text-sm text-muted">
              Plan: <strong>{user.tier === "PAID" ? "Premium" : "Free"}</strong>
              {user.tier === "FREE" && (
                <>
                  {" · "}
                  <Link href="/pricing" className="text-primary hover:underline">
                    See Premium
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <ChatCard />
            <AssessmentCard />
            <Tile href="/doctors" title="Find a doctor" text="Browse verified professionals and their fees." />
          </div>
        </div>
      )}
    </AppShell>
  );
}

function ChatCard() {
  const usage = useQuery({ queryKey: ["chat", "usage"], queryFn: () => api<ChatUsage>("/chat/usage") });
  const left =
    usage.data && usage.data.limit !== null
      ? `${Math.max(0, usage.data.limit - usage.data.used)} free messages left today`
      : usage.data
        ? "Unlimited messages"
        : undefined;
  return <Tile href="/dashboard/chat" title="AI companion" text="Talk things through, any time." footer={left} />;
}

function AssessmentCard() {
  const history = useQuery({
    queryKey: ["assessment", "attempts"],
    queryFn: () => api<AttemptHistoryItem[]>("/assessment/attempts"),
  });
  const latest = history.data?.[0];
  return (
    <Tile
      href="/dashboard/assessment"
      title="Self-assessment"
      text="A short check-in on how you've been feeling."
      footer={
        latest ? (
          <span className="flex items-center gap-2">
            Last: {latest.score}/{latest.maxScore} <RiskBadge level={latest.riskLevel} />
          </span>
        ) : undefined
      }
    />
  );
}

function Tile({
  href,
  title,
  text,
  footer,
}: {
  href: string;
  title: string;
  text: string;
  footer?: React.ReactNode;
}) {
  return (
    <Link href={href} className="group">
      <Card className="flex h-full flex-col gap-1 transition-colors group-hover:border-primary">
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-muted">{text}</p>
        {footer && <div className="mt-3 text-xs text-muted">{footer}</div>}
      </Card>
    </Link>
  );
}
