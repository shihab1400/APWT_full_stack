import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminReviewItem,
  DoctorReviewItem,
  ModerateReviewDto,
  PublicReview,
  ReviewDto,
  ReviewStatus,
} from '@mindease/shared';
import { publicDoctorWhere } from '../content/content.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Review } from '../generated/prisma/client.js';

/** Reviews that count toward the public rating: flagged ones stay up until an admin hides them. */
export const PUBLIC_REVIEW_STATUSES: ReviewStatus[] = ['VISIBLE', 'FLAGGED'];

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** One rating per completed appointment (FR_4). */
  async create(patientId: string, appointmentId: string, dto: ReviewDto): Promise<PublicReview> {
    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, patientId },
      include: { review: true, doctor: { select: { userId: true } } },
    });
    if (!appt) throw new NotFoundException('Appointment not found');
    if (appt.status !== 'COMPLETED') {
      throw new ConflictException('You can rate a doctor once the session is completed');
    }
    if (appt.review) throw new ConflictException('You have already rated this session');

    let review: Review;
    try {
      review = await this.prisma.review.create({
        data: {
          appointmentId,
          userId: patientId,
          doctorId: appt.doctorId,
          rating: dto.rating,
          comment: dto.comment || null,
        },
      });
    } catch {
      // Unique on appointmentId: a double submit lost the race.
      throw new ConflictException('You have already rated this session');
    }
    await this.notifications.notify(appt.doctor.userId, {
      type: 'REVIEW_RECEIVED',
      title: `New ${dto.rating}-star review`,
      body: dto.comment ? dto.comment.slice(0, 140) : undefined,
      link: '/doctor/reviews',
    });
    return toPublic(review);
  }

  async listPublic(doctorId: string): Promise<PublicReview[]> {
    const doctor = await this.prisma.doctorProfile.findFirst({
      where: { id: doctorId, ...publicDoctorWhere },
      select: { id: true },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');
    const rows = await this.prisma.review.findMany({
      where: { doctorId, status: { in: PUBLIC_REVIEW_STATUSES } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map(toPublic);
  }

  async listForDoctor(doctorUserId: string): Promise<DoctorReviewItem[]> {
    const rows = await this.prisma.review.findMany({
      where: { doctor: { userId: doctorUserId } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map(toDoctorItem);
  }

  /** A doctor asks admins to look at a review; it stays public until they decide. */
  async report(doctorUserId: string, reviewId: string, reason: string): Promise<DoctorReviewItem> {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, doctor: { userId: doctorUserId } },
    });
    if (!review) throw new NotFoundException('Review not found');
    if (review.status === 'HIDDEN') throw new ConflictException('This review is already hidden');
    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: { status: 'FLAGGED', reportReason: reason },
    });
    await this.notifications.notifyAdmins({
      type: 'REVIEW_REPORTED',
      title: 'A review was reported by a doctor',
      body: reason,
      link: '/admin/reviews',
    });
    return toDoctorItem(updated);
  }

  // ───────────── Admin (FR #23) ─────────────

  async adminList(status?: ReviewStatus): Promise<AdminReviewItem[]> {
    const rows = await this.prisma.review.findMany({
      where: { status },
      include: {
        doctor: { select: { id: true, user: { select: { name: true } } } },
        user: { select: { id: true, name: true, email: true } },
      },
      // Reported ones first, then newest.
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 300,
    });
    return rows.map((r) => ({
      ...toDoctorItem(r),
      appointmentId: r.appointmentId,
      moderatedAt: r.moderatedAt?.toISOString() ?? null,
      doctor: { id: r.doctor.id, name: r.doctor.user.name },
      patient: r.user,
    }));
  }

  async moderate(actorId: string, reviewId: string, dto: ModerateReviewDto) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    const action = { VISIBLE: 'REVIEW_RESTORED', FLAGGED: 'REVIEW_FLAGGED', HIDDEN: 'REVIEW_HIDDEN' }[dto.status];
    await this.prisma.$transaction([
      this.prisma.review.update({
        where: { id: reviewId },
        data: {
          status: dto.status,
          moderatedAt: new Date(),
          // Restoring clears a doctor's report once it has been dealt with.
          ...(dto.status === 'VISIBLE' ? { reportReason: null } : {}),
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId,
          action,
          targetType: 'Review',
          targetId: reviewId,
          reason: dto.reason,
          meta: { from: review.status, to: dto.status },
        },
      }),
    ]);
    return { ok: true };
  }
}

function toPublic(r: Review): PublicReview {
  return { id: r.id, rating: r.rating, comment: r.comment, createdAt: r.createdAt.toISOString() };
}

function toDoctorItem(r: Review): DoctorReviewItem {
  return { ...toPublic(r), status: r.status, reportReason: r.reportReason };
}
