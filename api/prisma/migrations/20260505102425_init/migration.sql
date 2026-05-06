-- CreateEnum
CREATE TYPE "ReviewSource" AS ENUM ('UNKNOWN_ANSWER', 'THUMB_DOWN');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'RESOLVED', 'IGNORED');

-- CreateTable
CREATE TABLE "KnowledgeBase" (
    "id" SERIAL NOT NULL,
    "category" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" SERIAL NOT NULL,
    "userQuestion" TEXT NOT NULL,
    "aiResponse" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "isThumbUp" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingReview" (
    "id" SERIAL NOT NULL,
    "question" TEXT NOT NULL,
    "aiResponse" TEXT,
    "source" "ReviewSource" NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeBase_category_idx" ON "KnowledgeBase"("category");
