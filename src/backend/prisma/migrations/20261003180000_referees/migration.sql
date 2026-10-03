-- Scheidsrechters: alleen nieuwe tabellen en nieuwe kolommen.
-- Bestaande rijen (personen, wedstrijden, diensten, club) blijven staan.
-- `refereesEnabled` staat uit. `refereeLevels` is leeg: niemand is beschikbaar.
-- Dit project past het schema normaal toe met:
--   npx prisma db push --schema=src/backend/prisma/schema.prisma
-- Op de live SQLite-database is dit script additief en veilig om één keer te draaien
-- vóór of in plaats van een db push die tabellen zou willen herbouwen.
-- Niet samenvoegen met de toernooi-migratie: die blijft een apart script.

-- AlterTable (geen tabelkopie, bestaande rijen blijven)
ALTER TABLE "Person" ADD COLUMN "refereeLevels" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ClubSettings" ADD COLUMN "refereesEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RefereeCategory" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "needed" BOOLEAN NOT NULL
);

-- CreateTable
CREATE TABLE "RefereeAssignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "matchId" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "personId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'voorgesteld',
    "source" TEXT NOT NULL DEFAULT 'auto',
    "openReason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RefereeAssignment_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RefereeAssignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RefereeSwap" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fromAssignmentId" INTEGER NOT NULL,
    "toAssignmentId" INTEGER NOT NULL,
    "requesterId" INTEGER NOT NULL,
    "counterpartyId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RefereeSwap_fromAssignmentId_fkey" FOREIGN KEY ("fromAssignmentId") REFERENCES "RefereeAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RefereeSwap_toAssignmentId_fkey" FOREIGN KEY ("toAssignmentId") REFERENCES "RefereeAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RefereeSwap_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RefereeSwap_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RefereeAssignment_matchId_key" ON "RefereeAssignment"("matchId");
CREATE INDEX "RefereeAssignment_personId_idx" ON "RefereeAssignment"("personId");
CREATE INDEX "RefereeSwap_requesterId_status_idx" ON "RefereeSwap"("requesterId", "status");
CREATE INDEX "RefereeSwap_counterpartyId_status_idx" ON "RefereeSwap"("counterpartyId", "status");
