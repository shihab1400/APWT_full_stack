"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { AttemptHistoryItem, QuizSummary } from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { RiskBadge } from "@/components/risk-badge";
import { Alert, ButtonLink, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { USER_NAV } from "../nav";

export default function AssessmentHome() {
  return <AppShell role="USER" nav={USER_NAV}>{() => <Assessments />}</AppShell>;
}

function Assessments() {
  const quizzes = useQuery({
    queryKey: ["assessment", "quizzes"],
    queryFn: () => api<QuizSummary[]>("/assessment/quizzes"),
  });
  const history = useQuery({
    queryKey: ["assessment", "attempts"],
    queryFn: () => api<AttemptHistoryItem[]>("/assessment/attempts"),
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Self-assessment</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Short, widely used questionnaires to help you reflect on how you&apos;ve been feeling over
          the last two weeks. They are a starting point, not a diagnosis.
        </p>
      </div>

      {quizzes.error && <Alert>{quizzes.error.message}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        {quizzes.data?.map((q) => (
          <Card key={q.id} className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">{q.title}</h2>
            {q.description && <p className="text-sm text-muted">{q.description}</p>}
            <p className="text-xs text-muted">
              {q.questionCount} questions · about {Math.max(1, Math.round(q.questionCount / 3))} min
            </p>
            <ButtonLink href={`/dashboard/assessment/${q.id}`} className="mt-auto w-fit">
              Start
            </ButtonLink>
          </Card>
        ))}
      </div>

      <section aria-labelledby="history" className="flex flex-col gap-3">
        <h2 id="history" className="text-lg font-semibold">
          Your results
        </h2>
        {history.data?.length === 0 ? (
          <p className="text-sm text-muted">You haven&apos;t taken an assessment yet.</p>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Assessment</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">Level</th>
                </tr>
              </thead>
              <tbody>
                {history.data?.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">{new Date(a.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">{a.quizTitle}</td>
                    <td className="px-4 py-3">
                      {a.score} / {a.maxScore}
                    </td>
                    <td className="px-4 py-3">
                      <RiskBadge level={a.riskLevel} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        <p className="text-xs text-muted">
          Feeling worse? <Link href="/dashboard/chat" className="text-primary hover:underline">Talk to the AI companion</Link>{" "}
          or <Link href="/doctors" className="text-primary hover:underline">find a doctor</Link>.
        </p>
      </section>
    </div>
  );
}
