-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "for194Member" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- Seed categories from existing KnowledgeBase.category values
INSERT INTO "Category" ("name", "for194Member", "createdAt", "updatedAt")
SELECT DISTINCT "category", false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "KnowledgeBase"
WHERE "category" IS NOT NULL AND btrim("category") <> '';

-- Add new columns before migrating data
ALTER TABLE "KnowledgeBase" ADD COLUMN "categoryId" INTEGER;
ALTER TABLE "KnowledgeBase" ADD COLUMN "fullAnswer" TEXT;

-- Backfill new columns
UPDATE "KnowledgeBase"
SET "fullAnswer" = "answer"
WHERE "fullAnswer" IS NULL;

UPDATE "KnowledgeBase" kb
SET "categoryId" = c."id"
FROM "Category" c
WHERE c."name" = kb."category";

-- Enforce non-null after backfill
ALTER TABLE "KnowledgeBase" ALTER COLUMN "categoryId" SET NOT NULL;
ALTER TABLE "KnowledgeBase" ALTER COLUMN "fullAnswer" SET NOT NULL;

-- Remove old constraints/indexes on the old category column
DROP INDEX IF EXISTS "KnowledgeBase_category_question_key";
DROP INDEX IF EXISTS "KnowledgeBase_category_idx";

-- Drop old column and add new relational constraints/indexes
ALTER TABLE "KnowledgeBase" DROP COLUMN "category";
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");
CREATE INDEX "KnowledgeBase_categoryId_idx" ON "KnowledgeBase"("categoryId");
CREATE UNIQUE INDEX "KnowledgeBase_categoryId_question_key" ON "KnowledgeBase"("categoryId", "question");

ALTER TABLE "KnowledgeBase"
ADD CONSTRAINT "KnowledgeBase_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
