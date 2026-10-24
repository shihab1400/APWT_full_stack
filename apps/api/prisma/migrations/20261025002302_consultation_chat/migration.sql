-- AlterEnum
ALTER TYPE "RiskSource" ADD VALUE 'CONSULTATION';

-- AlterTable
ALTER TABLE "ConsultationMessage" ADD COLUMN     "flagged" BOOLEAN NOT NULL DEFAULT false;
