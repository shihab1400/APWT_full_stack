-- AlterTable
ALTER TABLE "BlogPost" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'Wellbeing';

-- AlterTable
ALTER TABLE "DoctorProfile" ADD COLUMN     "experienceYears" INTEGER;

-- AlterTable
ALTER TABLE "Faq" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'General',
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Hotline" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "description" TEXT,
    "availability" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Hotline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlogPost_published_publishedAt_idx" ON "BlogPost"("published", "publishedAt");

-- CreateIndex
CREATE INDEX "Faq_category_order_idx" ON "Faq"("category", "order");
