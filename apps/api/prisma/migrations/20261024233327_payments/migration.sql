-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'REFUND_DUE';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "doctorId" TEXT,
ADD COLUMN     "method" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "reference" TEXT NOT NULL,
ADD COLUMN     "refundedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");

-- CreateIndex
CREATE INDEX "Payment_doctorId_status_idx" ON "Payment"("doctorId", "status");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
