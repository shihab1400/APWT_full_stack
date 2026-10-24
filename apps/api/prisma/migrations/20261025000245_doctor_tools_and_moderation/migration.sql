-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "shareAssessments" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "moderatedAt" TIMESTAMP(3),
ADD COLUMN     "reportReason" TEXT;

-- AlterTable
ALTER TABLE "RiskAlert" ADD COLUMN     "followUpNote" TEXT,
ADD COLUMN     "followedUpAt" TIMESTAMP(3);
