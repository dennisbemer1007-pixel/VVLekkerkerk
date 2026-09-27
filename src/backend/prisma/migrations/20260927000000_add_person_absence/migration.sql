-- Documentatie van het PersonAbsence-model (afwezigheid van personen).
-- Dit project gebruikt `prisma db push` als normale workflow (geen `prisma migrate`);
-- dit bestand documenteert de wijziging voor wie wél migrate gebruikt of de historie
-- wil naslaan. Voer bij db push uit met:
--   npx prisma db push --schema=src/backend/prisma/schema.prisma

-- CreateTable
CREATE TABLE "PersonAbsence" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "personId" INTEGER NOT NULL,
    "fromDate" DATETIME NOT NULL,
    "toDate" DATETIME NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PersonAbsence_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PersonAbsence_personId_fromDate_toDate_idx" ON "PersonAbsence"("personId", "fromDate", "toDate");
