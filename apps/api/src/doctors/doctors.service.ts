import { Injectable, NotFoundException } from '@nestjs/common';
import type { PublicDoctor } from '@mindease/shared';
import { publicDoctorWhere } from '../content/content.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PUBLIC_REVIEW_STATUSES } from '../reviews/reviews.service.js';

// Only fields that are safe to show a guest: no email, licence or patient data.
const publicSelect = {
  id: true,
  specialization: true,
  bio: true,
  qualifications: true,
  experienceYears: true,
  fee: true,
  user: { select: { name: true } },
} as const;

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(filters: { q?: string; specialization?: string }): Promise<PublicDoctor[]> {
    const doctors = await this.prisma.doctorProfile.findMany({
      where: {
        ...publicDoctorWhere,
        ...(filters.specialization
          ? { specialization: { equals: filters.specialization, mode: 'insensitive' } }
          : {}),
        ...(filters.q
          ? {
              OR: [
                { user: { name: { contains: filters.q, mode: 'insensitive' } } },
                { specialization: { contains: filters.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: publicSelect,
      orderBy: { user: { name: 'asc' } },
    });
    const ratings = await this.ratingsFor(doctors.map((d) => d.id));
    return doctors.map((d) => toPublic(d, ratings.get(d.id)));
  }

  async getPublic(id: string): Promise<PublicDoctor> {
    const doctor = await this.prisma.doctorProfile.findFirst({
      where: { id, ...publicDoctorWhere },
      select: publicSelect,
    });
    if (!doctor) throw new NotFoundException('Doctor not found');
    const ratings = await this.ratingsFor([id]);
    return toPublic(doctor, ratings.get(id));
  }

  async specializations(): Promise<string[]> {
    const rows = await this.prisma.doctorProfile.findMany({
      where: { ...publicDoctorWhere, specialization: { not: null } },
      distinct: ['specialization'],
      select: { specialization: true },
      orderBy: { specialization: 'asc' },
    });
    return rows.map((r) => r.specialization!);
  }

  private async ratingsFor(doctorIds: string[]) {
    if (!doctorIds.length) return new Map<string, { avg: number | null; count: number }>();
    const rows = await this.prisma.review.groupBy({
      by: ['doctorId'],
      where: { doctorId: { in: doctorIds }, status: { in: PUBLIC_REVIEW_STATUSES } },
      _avg: { rating: true },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.doctorId, { avg: r._avg.rating, count: r._count._all }]));
  }
}

type DoctorRow = {
  id: string;
  specialization: string | null;
  bio: string | null;
  qualifications: string | null;
  experienceYears: number | null;
  fee: { toNumber(): number };
  user: { name: string };
};

function toPublic(d: DoctorRow, rating?: { avg: number | null; count: number }): PublicDoctor {
  return {
    id: d.id,
    name: d.user.name,
    specialization: d.specialization,
    bio: d.bio,
    qualifications: d.qualifications,
    experienceYears: d.experienceYears,
    fee: d.fee.toNumber(),
    rating: rating?.avg != null ? Math.round(rating.avg * 10) / 10 : null,
    reviewCount: rating?.count ?? 0,
  };
}
