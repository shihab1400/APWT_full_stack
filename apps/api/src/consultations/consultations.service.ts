import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AttemptHistoryItem,
  ConsultationNoteItem,
  Earnings,
  PatientDetail,
  PatientSummary,
} from '@mindease/shared';
import { appointmentInclude, toItem } from '../appointments/appointments.service.js';
import { DHAKA_OFFSET_MS } from '../common/dhaka-time.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ConsultationNote, Prisma } from '../generated/prisma/client.js';

/** A doctor's patients are people with a paid request, a confirmed or a completed session with them. */
const CARE_STATUSES = ['REQUESTED', 'ACCEPTED', 'COMPLETED'] as const;
const ASSESSMENT_HISTORY = 20;

const attemptInclude = { quiz: { select: { title: true } } } as const;
type AttemptRow = Prisma.QuizAttemptGetPayload<{ include: typeof attemptInclude }>;

/** Doctor-side records: patients, private notes and earnings (FR #29–31). */
@Injectable()
export class ConsultationsService {
  constructor(private readonly prisma: PrismaService) {}

  async patients(doctorUserId: string): Promise<PatientSummary[]> {
    const appts = await this.prisma.appointment.findMany({
      where: { doctor: { userId: doctorUserId }, status: { in: [...CARE_STATUSES] } },
      select: {
        status: true,
        startsAt: true,
        shareAssessments: true,
        patient: { select: { id: true, name: true } },
      },
      orderBy: { startsAt: 'asc' },
    });

    const now = new Date();
    const byPatient = new Map<string, PatientSummary>();
    for (const a of appts) {
      const p = byPatient.get(a.patient.id) ?? {
        id: a.patient.id,
        name: a.patient.name,
        appointmentCount: 0,
        lastSessionAt: null,
        nextSessionAt: null,
        latestAssessment: null,
        sharesAssessments: false,
      };
      p.appointmentCount++;
      p.sharesAssessments ||= a.shareAssessments;
      const at = a.startsAt.toISOString();
      if (a.startsAt <= now) p.lastSessionAt = at;
      else p.nextSessionAt ??= at;
      byPatient.set(a.patient.id, p);
    }

    const sharing = [...byPatient.values()].filter((p) => p.sharesAssessments).map((p) => p.id);
    if (sharing.length) {
      const latest = await this.prisma.quizAttempt.findMany({
        where: { userId: { in: sharing } },
        include: attemptInclude,
        orderBy: { createdAt: 'desc' },
        distinct: ['userId'],
      });
      for (const a of latest) byPatient.get(a.userId)!.latestAssessment = toAttempt(a);
    }

    // Upcoming patients first, then most recently seen.
    return [...byPatient.values()].sort(
      (a, b) =>
        (a.nextSessionAt ?? '9').localeCompare(b.nextSessionAt ?? '9') ||
        (b.lastSessionAt ?? '').localeCompare(a.lastSessionAt ?? ''),
    );
  }

  async patient(doctorUserId: string, patientId: string): Promise<PatientDetail> {
    const appts = await this.prisma.appointment.findMany({
      where: { doctor: { userId: doctorUserId }, patientId, status: { not: 'PENDING_PAYMENT' } },
      include: {
        ...appointmentInclude,
        // Only this doctor's own notes, even if the patient sees other doctors.
        notes: { where: { doctor: { userId: doctorUserId } }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { startsAt: 'desc' },
    });
    const inCare = appts.filter((a) => (CARE_STATUSES as readonly string[]).includes(a.status));
    if (!inCare.length) throw new NotFoundException('Patient not found');

    const sharesAssessments = inCare.some((a) => a.shareAssessments);
    const assessments = sharesAssessments
      ? await this.prisma.quizAttempt.findMany({
          where: { userId: patientId },
          include: attemptInclude,
          orderBy: { createdAt: 'desc' },
          take: ASSESSMENT_HISTORY,
        })
      : [];

    return {
      patient: { id: inCare[0].patient.id, name: inCare[0].patient.name },
      sharesAssessments,
      assessments: assessments.map(toAttempt),
      appointments: appts.map((a) => ({ ...toItem(a), notes: a.notes.map(toNote) })),
    };
  }

  /** Notes go on a confirmed or completed session and are only ever shown to their author. */
  async addNote(doctorUserId: string, appointmentId: string, body: string): Promise<ConsultationNoteItem> {
    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, doctor: { userId: doctorUserId } },
      select: { id: true, doctorId: true, status: true },
    });
    if (!appt) throw new NotFoundException('Appointment not found');
    if (appt.status !== 'ACCEPTED' && appt.status !== 'COMPLETED') {
      throw new ConflictException('Notes can be added to confirmed or completed sessions');
    }
    const note = await this.prisma.consultationNote.create({
      data: { appointmentId, doctorId: appt.doctorId, body },
    });
    return toNote(note);
  }

  async updateNote(doctorUserId: string, noteId: string, body: string): Promise<ConsultationNoteItem> {
    const { count } = await this.prisma.consultationNote.updateMany({
      where: { id: noteId, doctor: { userId: doctorUserId } },
      data: { body },
    });
    if (!count) throw new NotFoundException('Note not found');
    return toNote(await this.prisma.consultationNote.findUniqueOrThrow({ where: { id: noteId } }));
  }

  /** Completed, paid consultations (FR #31). Payouts from the platform account are handled outside the app. */
  async earnings(doctorUserId: string, now = new Date()): Promise<Earnings> {
    const rows = await this.prisma.appointment.findMany({
      where: {
        doctor: { userId: doctorUserId },
        status: 'COMPLETED',
        payment: { status: 'SUCCEEDED' },
      },
      include: {
        patient: { select: { name: true } },
        payment: { select: { amount: true, reference: true, paidAt: true } },
      },
      orderBy: { startsAt: 'desc' },
    });
    const items = rows.map((a) => ({
      appointmentId: a.id,
      patientName: a.patient.name,
      type: a.type,
      sessionAt: a.startsAt.toISOString(),
      fee: a.payment!.amount.toNumber(),
      paymentReference: a.payment!.reference,
      paidAt: a.payment!.paidAt?.toISOString() ?? null,
    }));
    const month = dhakaMonth(now);
    return {
      items,
      totals: {
        sessions: items.length,
        earned: items.reduce((t, i) => t + i.fee, 0),
        thisMonth: items
          .filter((i) => dhakaMonth(new Date(i.sessionAt)) === month)
          .reduce((t, i) => t + i.fee, 0),
      },
    };
  }
}

/** "2026-10" for the Dhaka calendar month of an instant. */
const dhakaMonth = (d: Date) => new Date(d.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 7);

function toNote(n: ConsultationNote): ConsultationNoteItem {
  return {
    id: n.id,
    appointmentId: n.appointmentId,
    body: n.body,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}

function toAttempt(a: AttemptRow): AttemptHistoryItem {
  return {
    id: a.id,
    quizTitle: a.quiz.title,
    score: a.score,
    maxScore: a.maxScore,
    riskLevel: a.riskLevel,
    critical: a.critical,
    createdAt: a.createdAt.toISOString(),
  };
}
