"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  NOTE_MAX,
  type AppointmentItem,
  type ConsultationNoteItem,
  type PatientDetail,
} from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { StatusBadge, When } from "@/components/appointment-parts";
import { RiskBadge } from "@/components/risk-badge";
import { Alert, Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { DOCTOR_NAV } from "../../nav";

export function PatientRecord() {
  const { id } = useParams<{ id: string }>();
  return <AppShell role="DOCTOR" nav={DOCTOR_NAV}>{() => <Record patientId={id} />}</AppShell>;
}

function Record({ patientId }: { patientId: string }) {
  const record = useQuery({
    queryKey: ["doctor", "patients", patientId],
    queryFn: () => api<PatientDetail>(`/doctor/patients/${patientId}`),
  });
  if (record.isPending) return <p className="text-sm text-muted">Loading…</p>;
  if (record.error) return <Alert>{record.error.message}</Alert>;
  const r = record.data;
  const latest = r.assessments[0];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/doctor/patients" className="text-sm text-primary hover:underline">
        ← All patients
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{r.patient.name}</h1>
        {latest && <RiskBadge level={latest.riskLevel} />}
      </div>
      <p className="-mt-4 text-xs text-muted">
        Confidential. Your notes are visible only to you and never shown to the patient.
      </p>

      <section aria-labelledby="assessments" className="flex flex-col gap-3">
        <h2 id="assessments" className="text-lg font-semibold">
          Self-assessments
        </h2>
        {!r.sharesAssessments ? (
          <Card>
            <p className="text-sm text-muted">The patient hasn&apos;t shared their assessment results with you.</p>
          </Card>
        ) : r.assessments.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">No assessments taken yet.</p>
          </Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Assessment</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">Risk level</th>
                </tr>
              </thead>
              <tbody>
                {r.assessments.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-4 py-3">{formatDateTime(a.createdAt)}</td>
                    <td className="px-4 py-3">{a.quizTitle}</td>
                    <td className="px-4 py-3">
                      {a.score}/{a.maxScore}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap items-center gap-2">
                        <RiskBadge level={a.riskLevel} />
                        {a.critical && <span className="text-xs text-danger">Self-harm item answered</span>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section aria-labelledby="sessions" className="flex flex-col gap-3">
        <h2 id="sessions" className="text-lg font-semibold">
          Sessions and notes
        </h2>
        {r.appointments.map((a) => (
          <Session key={a.id} appointment={a} patientId={patientId} />
        ))}
      </section>
    </div>
  );
}

function Session({
  appointment: a,
  patientId,
}: {
  appointment: AppointmentItem & { notes: ConsultationNoteItem[] };
  patientId: string;
}) {
  const canNote = a.status === "ACCEPTED" || a.status === "COMPLETED";
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <When appointment={a} />
        <StatusBadge status={a.status} />
      </div>
      {a.patientNote && (
        <p className="text-sm">
          <span className="text-muted">Patient&apos;s note: </span>
          {a.patientNote}
        </p>
      )}
      {a.notes.map((n) => (
        <NoteView key={n.id} note={n} patientId={patientId} />
      ))}
      {canNote && <NoteEditor appointmentId={a.id} patientId={patientId} />}
    </Card>
  );
}

function NoteView({ note, patientId }: { note: ConsultationNoteItem; patientId: string }) {
  const [editing, setEditing] = useState(false);
  const edited = note.updatedAt !== note.createdAt;
  if (editing) {
    return <NoteEditor note={note} patientId={patientId} onDone={() => setEditing(false)} />;
  }
  return (
    <div className="rounded-lg bg-background px-3 py-2 text-sm">
      <p className="whitespace-pre-wrap leading-6">{note.body}</p>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
        Written {formatDateTime(note.createdAt)}
        {edited && ` · edited ${formatDateTime(note.updatedAt)}`}
        <button type="button" className="text-primary hover:underline" onClick={() => setEditing(true)}>
          Edit
        </button>
      </p>
    </div>
  );
}

/** Adds a note to a session, or edits an existing one. */
function NoteEditor({
  appointmentId,
  note,
  patientId,
  onDone,
}: {
  appointmentId?: string;
  note?: ConsultationNoteItem;
  patientId: string;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(!!note);
  const [body, setBody] = useState(note?.body ?? "");
  const save = useMutation({
    mutationFn: () =>
      note
        ? api<ConsultationNoteItem>(`/doctor/notes/${note.id}`, { method: "PATCH", body: { body } })
        : api<ConsultationNoteItem>(`/doctor/appointments/${appointmentId}/notes`, { method: "POST", body: { body } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["doctor", "patients", patientId] });
      setBody("");
      setOpen(false);
      onDone?.();
    },
  });

  if (!open) {
    return (
      <Button variant="secondary" className="w-fit" onClick={() => setOpen(true)}>
        Add note
      </Button>
    );
  }
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (body.trim()) save.mutate();
      }}
    >
      <label htmlFor={`note-${note?.id ?? appointmentId}`} className="text-sm font-medium">
        {note ? "Edit note" : "Consultation note"}
      </label>
      <textarea
        id={`note-${note?.id ?? appointmentId}`}
        rows={4}
        maxLength={NOTE_MAX}
        value={body}
        autoFocus
        onChange={(e) => setBody(e.target.value)}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
      />
      {save.error && <Alert>{save.error.message}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" disabled={!body.trim() || save.isPending}>
          {save.isPending ? "Saving…" : "Save note"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            onDone?.();
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
