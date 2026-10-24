"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  createQuizSchema,
  quizQuestionSchema,
  quizSettingsSchema,
  type AdminQuiz,
  type AdminQuizQuestion,
  type CreateQuizDto,
  type QuizQuestionInput,
  type QuizSettingsInput,
} from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { Alert, Button, Card, Field } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { ADMIN_NAV } from "../nav";

const KEY = ["admin", "quizzes"];
const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft";

export default function AssessmentsAdminPage() {
  return <AppShell role="ADMIN" nav={ADMIN_NAV}>{() => <Assessments />}</AppShell>;
}

function Assessments() {
  const quizzes = useQuery({ queryKey: KEY, queryFn: () => api<AdminQuiz[]>("/admin/quizzes") });
  const [selected, setSelected] = useState<string>();

  if (quizzes.isPending) return <p className="text-sm text-muted">Loading…</p>;
  if (quizzes.error) return <Alert>{quizzes.error.message}</Alert>;
  const quiz = quizzes.data.find((q) => q.id === selected) ?? quizzes.data[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Assessments</h1>
        <p className="text-sm text-muted">
          Edit questions, scores and the thresholds that trigger a doctor recommendation. Changes
          apply to the next submission and are recorded in the audit log.
        </p>
      </div>
      <div role="tablist" aria-label="Assessment" className="flex flex-wrap gap-1">
        {quizzes.data.map((q) => (
          <button
            key={q.id}
            role="tab"
            aria-selected={quiz?.id === q.id}
            onClick={() => setSelected(q.id)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              quiz?.id === q.id ? "bg-primary-soft font-medium text-primary" : "text-muted hover:text-foreground"
            }`}
          >
            {q.title}
            {!q.active && <span className="ml-1 text-xs">(draft)</span>}
          </button>
        ))}
      </div>
      {quiz && (
        <>
          {/* Remount when switching quizzes or after saves, so forms show fresh values. */}
          <Settings key={`${quiz.id}-${quiz.updatedAt}`} quiz={quiz} />
          <Questions quiz={quiz} />
        </>
      )}
      <NewAssessment onCreated={setSelected} />
    </div>
  );
}

// ───────────── Settings and thresholds ─────────────

function Settings({ quiz }: { quiz: AdminQuiz }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<QuizSettingsInput>({
    title: quiz.title,
    description: quiz.description ?? "",
    moderateRiskScore: quiz.moderateRiskScore,
    highRiskScore: quiz.highRiskScore,
    active: quiz.active,
  });
  const [error, setError] = useState<string>();
  const save = useMutation({
    mutationFn: (body: QuizSettingsInput) => api<AdminQuiz>(`/admin/quizzes/${quiz.id}`, { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (err) => setError(err.message),
  });
  const set = (patch: Partial<QuizSettingsInput>) => {
    setForm((f) => ({ ...f, ...patch }));
    setError(undefined);
  };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-medium">Scoring logic</h2>
          <p className="text-sm text-muted">
            Highest possible score: {quiz.maxScore} · {quiz.attemptCount} submissions · updated{" "}
            {formatDateTime(quiz.updatedAt)}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            quiz.active ? "bg-primary-soft text-primary" : "bg-warning-soft text-foreground"
          }`}
        >
          {quiz.active ? "Published" : "Draft"}
        </span>
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = quizSettingsSchema.safeParse(form);
          if (!parsed.success) return setError(parsed.error.issues[0]?.message);
          save.mutate(form);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="title" label="Title" value={form.title} onChange={(e) => set({ title: e.target.value })} />
          <Field
            id="description"
            label="Description"
            value={form.description ?? ""}
            onChange={(e) => set({ description: e.target.value })}
          />
          <Field
            id="moderate"
            type="number"
            min={1}
            label="Moderate-risk score"
            hint="Scores at or above this show as Moderate."
            value={form.moderateRiskScore}
            onChange={(e) => set({ moderateRiskScore: Number(e.target.value) })}
          />
          <Field
            id="high"
            type="number"
            min={1}
            max={quiz.maxScore || undefined}
            label="High-risk threshold score"
            hint="Scores at or above this are High and recommend a doctor."
            value={form.highRiskScore}
            onChange={(e) => set({ highRiskScore: Number(e.target.value) })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => set({ active: e.target.checked })}
            className="size-4 accent-[var(--primary)]"
          />
          Published (visible to users)
        </label>
        {error && <Alert>{error}</Alert>}
        {save.isSuccess && !error && <Alert tone="info">Saved. The new logic applies to the next submission.</Alert>}
        <Button type="submit" className="w-fit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save logic"}
        </Button>
      </form>
    </Card>
  );
}

// ───────────── Questions ─────────────

function Questions({ quiz }: { quiz: AdminQuiz }) {
  const [adding, setAdding] = useState(false);
  return (
    <section aria-labelledby="questions" className="flex flex-col gap-3">
      <h2 id="questions" className="text-lg font-semibold">
        Questions ({quiz.questions.length})
      </h2>
      {quiz.questions.map((q) => (
        <QuestionCard key={`${q.id}-${quiz.updatedAt}`} quiz={quiz} question={q} />
      ))}
      {adding ? (
        <QuestionEditor quizId={quiz.id} onDone={() => setAdding(false)} />
      ) : (
        <Button variant="secondary" className="w-fit" onClick={() => setAdding(true)}>
          + Add question
        </Button>
      )}
    </section>
  );
}

function QuestionCard({ quiz, question: q }: { quiz: AdminQuiz; question: AdminQuizQuestion }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const remove = useMutation({
    mutationFn: () => api<AdminQuiz>(`/admin/quizzes/${quiz.id}/questions/${q.id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  if (editing) return <QuestionEditor quizId={quiz.id} question={q} onDone={() => setEditing(false)} />;
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium">
          <span className="text-muted">Q{q.order}.</span> {q.text}
          {q.critical && (
            <span className="ml-2 rounded-full bg-danger-soft px-2 py-0.5 text-xs text-danger">critical</span>
          )}
        </p>
        <div className="flex gap-1">
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Update
          </Button>
          <Button
            variant="ghost"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`Delete question ${q.order}? Past results keep their scores.`)) remove.mutate();
            }}
          >
            Delete
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted">{q.options.map((o) => `${o.label} (${o.score})`).join(" · ")}</p>
      {remove.error && <Alert>{remove.error.message}</Alert>}
    </Card>
  );
}

const DEFAULT_OPTIONS = [
  { label: "Not at all", score: 0 },
  { label: "Several days", score: 1 },
  { label: "More than half the days", score: 2 },
  { label: "Nearly every day", score: 3 },
];

function QuestionEditor({
  quizId,
  question,
  onDone,
}: {
  quizId: string;
  question?: AdminQuizQuestion;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<QuizQuestionInput>({
    text: question?.text ?? "",
    options: question?.options ?? DEFAULT_OPTIONS,
    critical: question?.critical ?? false,
  });
  const [error, setError] = useState<string>();
  const save = useMutation({
    mutationFn: (body: QuizQuestionInput) =>
      question
        ? api<AdminQuiz>(`/admin/quizzes/${quizId}/questions/${question.id}`, { method: "PATCH", body })
        : api<AdminQuiz>(`/admin/quizzes/${quizId}/questions`, { method: "POST", body }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: KEY });
      onDone();
    },
    onError: (err) => setError(err.message),
  });
  const setOption = (i: number, patch: Partial<{ label: string; score: number }>) =>
    setForm((f) => ({ ...f, options: f.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));

  return (
    <Card className="flex flex-col gap-3 border-primary p-4">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = quizQuestionSchema.safeParse(form);
          if (!parsed.success) return setError(parsed.error.issues[0]?.message);
          save.mutate(form);
        }}
      >
        <Field
          id={`text-${question?.id ?? "new"}`}
          label={question ? `Question ${question.order}` : "New question"}
          value={form.text}
          onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Answer options and scores</legend>
          {form.options.map((o, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                aria-label={`Option ${i + 1} text`}
                className={`${inputClass} min-w-48 flex-1`}
                value={o.label}
                onChange={(e) => setOption(i, { label: e.target.value })}
              />
              <input
                aria-label={`Option ${i + 1} score`}
                type="number"
                min={0}
                max={10}
                className={`${inputClass} w-20`}
                value={o.score}
                onChange={(e) => setOption(i, { score: Number(e.target.value) })}
              />
              <Button
                type="button"
                variant="ghost"
                disabled={form.options.length <= 2}
                onClick={() => setForm((f) => ({ ...f, options: f.options.filter((_, j) => j !== i) }))}
              >
                Remove
              </Button>
            </div>
          ))}
          {form.options.length < 8 && (
            <Button
              type="button"
              variant="ghost"
              className="w-fit"
              onClick={() => setForm((f) => ({ ...f, options: [...f.options, { label: "", score: 0 }] }))}
            >
              + Add option
            </Button>
          )}
        </fieldset>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.critical ?? false}
            onChange={(e) => setForm((f) => ({ ...f, critical: e.target.checked }))}
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          <span>
            Critical item
            <span className="block text-muted">Any answer above 0 makes the result High and shows the emergency hotlines.</span>
          </span>
        </label>
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save question"}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ───────────── New assessment ─────────────

function NewAssessment({ onCreated }: { onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const create = useMutation({
    mutationFn: (body: CreateQuizDto) => api<AdminQuiz>("/admin/quizzes", { method: "POST", body }),
    onSuccess: async (quiz) => {
      await qc.invalidateQueries({ queryKey: KEY });
      onCreated(quiz.id);
      setOpen(false);
    },
    onError: (err) => setError(err.message),
  });

  if (!open) {
    return (
      <Button variant="ghost" className="w-fit" onClick={() => setOpen(true)}>
        + New assessment
      </Button>
    );
  }
  return (
    <Card>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const parsed = createQuizSchema.safeParse({ slug: f.get("slug"), title: f.get("title") });
          if (!parsed.success) return setError(parsed.error.issues[0]?.message);
          create.mutate(parsed.data);
        }}
      >
        <h2 className="font-medium">New assessment</h2>
        <p className="text-sm text-muted">It starts as a draft. Add questions, set thresholds, then publish.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="new-title" name="title" label="Title" />
          <Field id="new-slug" name="slug" label="Short name" hint="e.g. sleep-check" />
        </div>
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" disabled={create.isPending}>
            Create
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
