import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  DOCTOR_FEE_MIN,
  type AdminDoctorRow,
  type DoctorProfileDto,
  type DoctorProfileStatus,
  type DoctorSelfProfile,
} from '@mindease/shared';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { DoctorProfile, User } from '../generated/prisma/client.js';
import { LicenseStorage, sniffLicenseType, type UploadedFileLike } from './license-storage.js';

type ProfileWithUser = DoctorProfile & { user: Pick<User, 'name' | 'email' | 'status'> };

const withUser = { user: { select: { name: true, email: true, status: true } } } as const;

/** Doctors' own profile and credentials, and the admin approval workflow (FR_1, FR_9). */
@Injectable()
export class DoctorProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LicenseStorage,
    private readonly notifications: NotificationsService,
  ) {}

  async getOwn(userId: string): Promise<DoctorSelfProfile> {
    return toSelf(await this.ownProfile(userId));
  }

  async updateOwn(userId: string, dto: DoctorProfileDto): Promise<DoctorSelfProfile> {
    const profile = await this.ownProfile(userId);
    const updated = await this.prisma.doctorProfile.update({
      where: { id: profile.id },
      data: { ...dto, clinicAddress: dto.clinicAddress || null },
      include: withUser,
    });
    return toSelf(updated);
  }

  async uploadLicense(userId: string, file: UploadedFileLike | undefined) {
    if (!file?.size) throw new BadRequestException('Choose a licence file to upload');
    const profile = await this.ownProfile(userId);
    // Once verified, the licence on record is the one the admin approved.
    if (profile.approvalStatus === 'APPROVED') {
      throw new ConflictException('Your licence is already verified. Contact support to change it.');
    }
    const type = sniffLicenseType(file.buffer);
    if (!type) throw new UnsupportedMediaTypeException('Upload a PDF, PNG or JPG file');

    const key = await this.storage.save(file.buffer, type);
    const updated = await this.prisma.doctorProfile.update({
      where: { id: profile.id },
      data: { licenseFile: key, licenseMimeType: type },
      include: withUser,
    });
    if (profile.licenseFile) await this.storage.remove(profile.licenseFile);
    return toSelf(updated);
  }

  async ownLicense(userId: string) {
    return this.licenseOf(await this.ownProfile(userId));
  }

  async submit(userId: string): Promise<DoctorSelfProfile> {
    const profile = await this.ownProfile(userId);
    const status = statusOf(profile);
    if (status === 'APPROVED') throw new ConflictException('Your profile is already verified');
    if (status === 'SUBMITTED') throw new ConflictException('Your profile is already under review');
    const missing = missingOf(profile);
    if (missing.length) {
      throw new BadRequestException(`Complete your profile first: ${missing.join(', ')}`);
    }

    const updated = await this.prisma.doctorProfile.update({
      where: { id: profile.id },
      data: { approvalStatus: 'PENDING', submittedAt: new Date(), rejectReason: null },
      include: withUser,
    });
    await this.notifications.notifyAdmins({
      type: 'DOCTOR_SUBMITTED',
      title: `${profile.user.name} submitted a profile for verification`,
      body: profile.specialization ?? undefined,
      link: '/admin/doctors',
    });
    return toSelf(updated);
  }

  // ───────────── Admin ─────────────

  async adminList(status?: DoctorProfileStatus): Promise<AdminDoctorRow[]> {
    const where = {
      SUBMITTED: { approvalStatus: 'PENDING', submittedAt: { not: null } },
      INCOMPLETE: { approvalStatus: 'PENDING', submittedAt: null },
      APPROVED: { approvalStatus: 'APPROVED' },
      REJECTED: { approvalStatus: 'REJECTED' },
    } as const;
    const rows = await this.prisma.doctorProfile.findMany({
      where: status ? where[status] : {},
      include: { user: { select: { name: true, email: true, status: true, id: true } } },
      orderBy: [{ submittedAt: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((p) => {
      const { missing: _missing, ...self } = toSelf(p);
      return {
        ...self,
        userId: p.userId,
        accountStatus: p.user.status,
        createdAt: p.createdAt.toISOString(),
      };
    });
  }

  async adminLicense(profileId: string) {
    const profile = await this.prisma.doctorProfile.findUnique({ where: { id: profileId } });
    if (!profile) throw new NotFoundException('Doctor not found');
    return this.licenseOf(profile);
  }

  async approve(actorId: string, profileId: string) {
    const profile = await this.submittedProfile(profileId);
    await this.prisma.$transaction([
      this.prisma.doctorProfile.update({
        where: { id: profile.id },
        data: { approvalStatus: 'APPROVED', verified: true, reviewedAt: new Date(), rejectReason: null },
      }),
      this.prisma.auditLog.create({
        data: { actorId, action: 'DOCTOR_APPROVED', targetType: 'DoctorProfile', targetId: profile.id },
      }),
    ]);
    await this.notifications.notify(profile.userId, {
      type: 'DOCTOR_APPROVED',
      title: 'Your profile is verified',
      body: 'Patients can now find and book you. Set your weekly hours so they can see open slots.',
      link: '/doctor/schedule',
      email: true,
    });
  }

  async reject(actorId: string, profileId: string, reason: string) {
    const profile = await this.submittedProfile(profileId);
    await this.prisma.$transaction([
      this.prisma.doctorProfile.update({
        where: { id: profile.id },
        data: {
          approvalStatus: 'REJECTED',
          verified: false,
          reviewedAt: new Date(),
          submittedAt: null,
          rejectReason: reason,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId,
          action: 'DOCTOR_REJECTED',
          targetType: 'DoctorProfile',
          targetId: profile.id,
          reason,
        },
      }),
    ]);
    await this.notifications.notify(profile.userId, {
      type: 'DOCTOR_REJECTED',
      title: 'Your profile needs changes',
      body: reason,
      link: '/doctor/profile',
      email: true,
    });
  }

  private async submittedProfile(profileId: string) {
    const profile = await this.prisma.doctorProfile.findUnique({ where: { id: profileId } });
    if (!profile) throw new NotFoundException('Doctor not found');
    if (profile.approvalStatus !== 'PENDING' || !profile.submittedAt) {
      throw new ConflictException('Only profiles waiting for review can be approved or rejected');
    }
    return profile;
  }

  private async ownProfile(userId: string): Promise<ProfileWithUser> {
    const profile = await this.prisma.doctorProfile.findUnique({ where: { userId }, include: withUser });
    if (!profile) throw new NotFoundException('Doctor profile not found');
    return profile;
  }

  private licenseOf(profile: DoctorProfile) {
    if (!profile.licenseFile || !profile.licenseMimeType) {
      throw new NotFoundException('No licence uploaded');
    }
    return { stream: this.storage.open(profile.licenseFile), mimeType: profile.licenseMimeType };
  }
}

function statusOf(p: DoctorProfile): DoctorProfileStatus {
  if (p.approvalStatus === 'APPROVED') return 'APPROVED';
  if (p.approvalStatus === 'REJECTED') return 'REJECTED';
  return p.submittedAt ? 'SUBMITTED' : 'INCOMPLETE';
}

function missingOf(p: DoctorProfile): string[] {
  const missing: string[] = [];
  if (!p.specialization) missing.push('specialization');
  if (!p.qualifications) missing.push('qualifications');
  if (p.experienceYears == null) missing.push('experience');
  if (p.fee.toNumber() < DOCTOR_FEE_MIN) missing.push('consultation fee');
  if (!p.bio) missing.push('bio');
  if (!p.licenseFile) missing.push('licence');
  return missing;
}

function toSelf(p: ProfileWithUser): DoctorSelfProfile {
  return {
    id: p.id,
    name: p.user.name,
    email: p.user.email,
    specialization: p.specialization,
    qualifications: p.qualifications,
    experienceYears: p.experienceYears,
    fee: p.fee.toNumber(),
    bio: p.bio,
    clinicAddress: p.clinicAddress,
    hasLicense: !!p.licenseFile,
    licenseMimeType: p.licenseMimeType,
    status: statusOf(p),
    rejectReason: p.rejectReason,
    submittedAt: p.submittedAt?.toISOString() ?? null,
    reviewedAt: p.reviewedAt?.toISOString() ?? null,
    missing: missingOf(p),
  };
}
