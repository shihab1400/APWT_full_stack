-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "moderateRiskScore" INTEGER NOT NULL,
ADD COLUMN     "slug" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "QuizAttempt" ADD COLUMN     "critical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxScore" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "QuizQuestion" ADD COLUMN     "critical" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RiskAlert" ADD COLUMN     "sourceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Quiz_slug_key" ON "Quiz"("slug");

