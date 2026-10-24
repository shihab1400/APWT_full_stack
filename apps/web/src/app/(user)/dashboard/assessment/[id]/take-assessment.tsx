"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AttemptResult, Hotline, QuizForTaking, RiskLevel } from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { CrisisCard } from "@/components/crisis-card";
import { DoctorCard } from "@/components/doctor-card";
import { RiskBadge } from "@/components/risk-badge";
import { Alert, Button, ButtonLink, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { FALLBACK_HOTLINES } from "@/lib/fallback-hotlines";
import { USER_NAV } from "../../nav";

export function TakeAssessment() {
  const { id } = useParams<{ id: string }>();
  return <AppShell role="USER" nav={USER_NAV}>{() => <Quiz id={id} />}</AppShell>;
}

function Quiz({ id }: { id: string }) {
  const qc = useQueryClient();
  const quiz = useQuery({
    queryKey: ["assessment", "quiz", id],
    queryFn: () => api<QuizForTaking>(`/assessment/quizzes/${id}`),
  });
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const submit = useMutation({
    mutationFn: (values: number[]) =>
      api<AttemptResult>(`/assessment/quizzes/${id}/attempts`, {
        method: "POST",
        body: { answers: values },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["assessment", "attempts"] });
      window.scrollTo({ top: 0 });
    },
  });

  if (quiz.isPending) return <p className="text-sm text-muted">Loading…</p>;
  if (quiz.error) return <Alert>{quiz.error.message}</Alert>;
  if (submit.data) {
    return (
      <Result
        result={submit.data}
        onRetake={() => {
          setAnswers({});
          submit.reset();
        }}
      />
    );
  }

  const questions = quiz.data.questions;
  const answered = Object.keys(answers).length;
  const complete = answered === questions.length;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Link href="/dashboard/assessment" className="text-sm text-primary hover:underline">
        ← All assessments
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{quiz.data.title}</h1>
        {quiz.data.description && <p className="mt-2 text-muted">{quiz.data.description}</p>}
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (complete) submit.mutate(questions.map((_, i) => answers[i]));
        }}
      >
        {questions.map((q, i) => (
          <Card key={q.id} className="p-5">
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-3 font-medium">
                <span className="text-muted">{i + 1}.</span> {q.text}
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {q.options.map((o, j) => (
                  <label
                    key={o.label}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      answers[i] === j
                        ? "border-primary bg-primary-soft"
                        : "border-border hover:border-primary"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q-${i}`}
                      checked={answers[i] === j}
                      onChange={() => setAnswers((a) => ({ ...a, [i]: j }))}
                      className="accent-[var(--primary)]"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </Card>
        ))}

        {submit.error && <Alert>{submit.error.message}</Alert>}
        <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 shadow-sm">
          <span className="text-sm text-muted" aria-live="polite">
            {answered} of {questions.length} answered
          </span>
          <Button type="submit" disabled={!complete || submit.isPending}>
            {submit.isPending ? "Scoring…" : "See my results"}
          </Button>
        </div>
      </form>
    </div>
  );
}

const SUMMARY: Record<RiskLevel, string> = {
  LOW: "Your answers suggest few or mild symptoms right now. Keep looking after yourself, and check in again any time things change.",
  MODERATE:
    "Your answers suggest you've been having a hard time lately. Talking things through can help. Try the AI companion, and consider speaking with a professional if this continues.",
  HIGH: "Your answers suggest you're going through a lot right now. We recommend speaking with a doctor. You don't have to handle this alone.",
};

function Result({ result, onRetake }: { result: AttemptResult; onRetake: () => void }) {
  const hotlines = useQuery({
    queryKey: ["content", "hotlines"],
    queryFn: () => api<Hotline[]>("/content/hotlines"),
    enabled: result.critical,
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <p className="text-sm text-muted">{result.quizTitle}</p>
        <div className="flex flex-wrap items-end gap-4">
          <p className="text-4xl font-semibold">
            {result.score}
            <span className="text-xl text-muted"> / {result.maxScore}</span>
          </p>
          <RiskBadge level={result.riskLevel} />
        </div>
        <p className="leading-7">{SUMMARY[result.riskLevel]}</p>
        <p className="text-xs text-muted">
          This screening is not a diagnosis. Only a qualified professional can assess your mental
          health.
        </p>
      </Card>

      {result.critical && (
        <CrisisCard hotlines={hotlines.data?.length ? hotlines.data : FALLBACK_HOTLINES}>
          <p className="text-sm">
            You mentioned having thoughts of being better off dead or hurting yourself. Please
            talk to someone now. These lines are free and open 24/7.
          </p>
        </CrisisCard>
      )}

      {result.recommendDoctor && result.doctors.length > 0 && (
        <section aria-labelledby="recommended" className="flex flex-col gap-3">
          <h2 id="recommended" className="text-lg font-semibold">
            Recommended: speak with a doctor
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {result.doctors.map((d) => (
              <DoctorCard key={d.id} doctor={d} />
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/dashboard/chat">Talk to the AI companion</ButtonLink>
        <ButtonLink href="/dashboard/assessment" variant="secondary">
          All assessments
        </ButtonLink>
        <Button variant="ghost" onClick={onRetake}>
          Retake
        </Button>
      </div>
    </div>
  );
}
