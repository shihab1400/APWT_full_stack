"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  BOOKING_WINDOW_DAYS,
  DAY_NAMES,
  SCHEDULE_STEP_MINUTES,
  weeklyAvailabilitySchema,
  type CreateBlockDto,
  type DoctorSchedule,
  type ScheduleSlot,
  type WeeklyWindow,
} from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { Alert, Button, Card, Field } from "@/components/ui";
import { api } from "@/lib/api";
import {
  dhakaDateKey,
  dhakaInstant,
  formatDateTime,
  formatLongDay,
  formatTime,
  groupByDay,
  minuteToTime,
  timeToMinute,
} from "@/lib/datetime";
import { DOCTOR_NAV } from "../nav";

const KEY = ["doctor", "schedule"];

export default function SchedulePage() {
  return <AppShell role="DOCTOR" nav={DOCTOR_NAV}>{() => <Schedule />}</AppShell>;
}

function Schedule() {
  const schedule = useQuery({ queryKey: KEY, queryFn: () => api<DoctorSchedule>("/doctor/schedule") });
  if (schedule.isPending) return <p className="text-sm text-muted">Loading…</p>;
  if (schedule.error) return <Alert>{schedule.error.message}</Alert>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">My schedule</h1>
        <p className="text-sm text-muted">
          Patients can book one-hour sessions inside your weekly hours, except blocked times. All
          times are Bangladesh time.
        </p>
      </div>
      {/* Remount with fresh windows after each save. */}
      <WeeklyHours key={JSON.stringify(schedule.data.windows)} initial={schedule.data.windows} />
      <Calendar slots={schedule.data.slots} />
      <Blocks schedule={schedule.data} />
    </div>
  );
}

// ───────────── Weekly hours ─────────────

function WeeklyHours({ initial }: { initial: WeeklyWindow[] }) {
  const qc = useQueryClient();
  const [windows, setWindows] = useState(initial);
  const [error, setError] = useState<string>();
  const save = useMutation({
    mutationFn: (w: WeeklyWindow[]) =>
      api<DoctorSchedule>("/doctor/schedule/weekly", { method: "PUT", body: { windows: w } }),
    onSuccess: (data) => qc.setQueryData(KEY, data),
    onError: (err) => setError(err.message),
  });
  const dirty = JSON.stringify(windows) !== JSON.stringify(initial);

  const update = (index: number, patch: Partial<WeeklyWindow>) =>
    setWindows((ws) => ws.map((w, i) => (i === index ? { ...w, ...patch } : w)));

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="font-medium">Weekly hours</h2>
        <p className="text-sm text-muted">Repeats every week. Add more than one range for breaks.</p>
      </div>
      <div className="flex flex-col divide-y divide-border">
        {DAY_NAMES.map((name, day) => {
          const ranges = windows
            .map((w, index) => ({ w, index }))
            .filter(({ w }) => w.dayOfWeek === day);
          return (
            <div key={name} className="flex flex-wrap items-start gap-3 py-3">
              <span className="w-24 pt-1.5 text-sm font-medium">{name}</span>
              <div className="flex flex-1 flex-col gap-2">
                {ranges.length === 0 && <span className="pt-1.5 text-sm text-muted">Closed</span>}
                {ranges.map(({ w, index }) => (
                  <div key={index} className="flex flex-wrap items-center gap-2 text-sm">
                    <TimeInput
                      label={`${name} start`}
                      minute={w.startMinute}
                      onChange={(m) => update(index, { startMinute: m })}
                    />
                    <span aria-hidden>–</span>
                    <TimeInput
                      label={`${name} end`}
                      minute={w.endMinute}
                      onChange={(m) => update(index, { endMinute: m })}
                    />
                    <Button
                      variant="ghost"
                      aria-label={`Remove ${name} ${minuteToTime(w.startMinute)} to ${minuteToTime(w.endMinute)}`}
                      onClick={() => setWindows((ws) => ws.filter((_, i) => i !== index))}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  const last = ranges.at(-1)?.w;
                  const start = last ? Math.min(last.endMinute + 60, 22 * 60) : 10 * 60;
                  setWindows((ws) => [...ws, { dayOfWeek: day, startMinute: start, endMinute: Math.min(start + 180, 24 * 60) }]);
                }}
              >
                + Add hours
              </Button>
            </div>
          );
        })}
      </div>
      {error && <Alert>{error}</Alert>}
      {save.isSuccess && !dirty && <Alert tone="info">Weekly hours saved.</Alert>}
      <div className="flex gap-2">
        <Button
          disabled={!dirty || save.isPending}
          onClick={() => {
            setError(undefined);
            const parsed = weeklyAvailabilitySchema.safeParse({ windows });
            if (!parsed.success) return setError(parsed.error.issues[0]?.message);
            save.mutate(parsed.data.windows);
          }}
        >
          {save.isPending ? "Saving…" : "Save weekly hours"}
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => setWindows(initial)}>
            Undo changes
          </Button>
        )}
      </div>
    </Card>
  );
}

function TimeInput({ label, minute, onChange }: { label: string; minute: number; onChange: (m: number) => void }) {
  return (
    <input
      type="time"
      aria-label={label}
      step={SCHEDULE_STEP_MINUTES * 60}
      // 24:00 is a valid end of day but not a valid <input type="time"> value.
      value={minute >= 24 * 60 ? "23:59" : minuteToTime(minute)}
      onChange={(e) => {
        if (!e.target.value) return;
        const m = timeToMinute(e.target.value);
        onChange(m === 23 * 60 + 59 ? 24 * 60 : m);
      }}
      className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
    />
  );
}

// ───────────── Upcoming slots ─────────────

const SLOT_STYLE: Record<ScheduleSlot["state"], string> = {
  OPEN: "border-primary/40 bg-surface hover:border-primary hover:bg-primary-soft",
  BLOCKED: "border-dashed border-border bg-border/40 text-muted line-through hover:border-danger",
  REQUESTED: "border-amber-400 bg-warning-soft",
  BOOKED: "border-primary bg-primary text-white",
};

const SLOT_LABEL: Record<ScheduleSlot["state"], string> = {
  OPEN: "open, select to block",
  BLOCKED: "blocked, select to re-open",
  REQUESTED: "requested by a patient",
  BOOKED: "booked",
};

function Calendar({ slots }: { slots: ScheduleSlot[] }) {
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: (slot: ScheduleSlot) =>
      slot.state === "BLOCKED"
        ? api<DoctorSchedule>(`/doctor/schedule/blocks/${slot.blockId}`, { method: "DELETE" })
        : api<DoctorSchedule>("/doctor/schedule/blocks", {
            method: "POST",
            body: { startsAt: slot.startsAt, endsAt: slot.endsAt } satisfies CreateBlockDto,
          }),
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });
  const days = groupByDay(slots, (s) => s.startsAt);

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="font-medium">Next {BOOKING_WINDOW_DAYS} days</h2>
        <p className="text-sm text-muted">
          Select an open slot to block it, or a blocked slot to open it again. Requests and bookings
          are managed in{" "}
          <Link href="/doctor/appointments" className="text-primary hover:underline">
            Appointments
          </Link>
          .
        </p>
      </div>
      <ul className="flex flex-wrap gap-3 text-xs text-muted" aria-label="Legend">
        {(["OPEN", "REQUESTED", "BOOKED", "BLOCKED"] as const).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={`inline-block size-3 rounded border ${SLOT_STYLE[s]}`} />
            {s.charAt(0) + s.slice(1).toLowerCase()}
          </li>
        ))}
      </ul>
      {toggle.error && <Alert>{toggle.error.message}</Alert>}
      {days.length === 0 ? (
        <p className="text-sm text-muted">Add weekly hours above to open slots for booking.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {days.map(([key, daySlots]) => (
            <div key={key} className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <h3 className="w-44 shrink-0 pt-1.5 text-sm font-medium">{formatLongDay(daySlots[0].startsAt)}</h3>
              <div className="flex flex-wrap gap-2">
                {daySlots.map((s) => {
                  const clickable = s.state === "OPEN" || s.state === "BLOCKED";
                  return (
                    <button
                      key={s.startsAt}
                      type="button"
                      disabled={!clickable || toggle.isPending}
                      onClick={() => toggle.mutate(s)}
                      aria-label={`${formatTime(s.startsAt)}, ${SLOT_LABEL[s.state]}`}
                      className={`rounded-lg border px-2.5 py-1 text-sm transition-colors disabled:cursor-default ${SLOT_STYLE[s.state]}`}
                    >
                      {formatTime(s.startsAt)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ───────────── Longer blocks ─────────────

function Blocks({ schedule }: { schedule: DoctorSchedule }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string>();
  const today = dhakaDateKey(new Date().toISOString());
  const add = useMutation({
    mutationFn: (dto: CreateBlockDto) =>
      api<DoctorSchedule>("/doctor/schedule/blocks", { method: "POST", body: dto }),
    onSuccess: (data) => qc.setQueryData(KEY, data),
    onError: (err) => setError(err.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<DoctorSchedule>(`/doctor/schedule/blocks/${id}`, { method: "DELETE" }),
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="font-medium">Time off</h2>
        <p className="text-sm text-muted">Block a longer period, such as a day off or a conference.</p>
      </div>
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setError(undefined);
          const f = new FormData(e.currentTarget);
          const startsAt = dhakaInstant(String(f.get("fromDate")), String(f.get("fromTime") || "00:00"));
          const endsAt = dhakaInstant(String(f.get("toDate")), String(f.get("toTime") || "23:59"));
          if (endsAt <= startsAt) return setError("The end must be after the start");
          add.mutate({ startsAt, endsAt, reason: String(f.get("reason") || "") || undefined });
        }}
      >
        <Field id="fromDate" name="fromDate" type="date" label="From" min={today} defaultValue={today} required />
        <Field id="fromTime" name="fromTime" type="time" label="Time" defaultValue="00:00" />
        <Field id="toDate" name="toDate" type="date" label="Until" min={today} defaultValue={today} required />
        <Field id="toTime" name="toTime" type="time" label="Time" defaultValue="23:59" />
        <Field id="reason" name="reason" label="Note (optional)" maxLength={200} />
        <Button type="submit" className="w-fit" disabled={add.isPending}>
          {add.isPending ? "Blocking…" : "Block period"}
        </Button>
      </form>
      {error && <Alert>{error}</Alert>}
      {schedule.blocks.length > 0 && (
        <ul className="flex flex-col divide-y divide-border text-sm">
          {schedule.blocks.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {formatDateTime(b.startsAt)} – {formatDateTime(b.endsAt)}
                {b.reason && <span className="text-muted"> · {b.reason}</span>}
              </span>
              <Button variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(b.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
