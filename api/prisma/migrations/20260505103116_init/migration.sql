/*
  Warnings:

  - A unique constraint covering the columns `[category,question]` on the table `KnowledgeBase` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeBase_category_question_key" ON "KnowledgeBase"("category", "question");
