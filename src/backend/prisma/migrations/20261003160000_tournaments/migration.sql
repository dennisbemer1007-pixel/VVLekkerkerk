-- Toernooien: alleen nieuwe tabellen en nieuwe kolommen.
-- Bestaande rijen (personen, diensten, club) blijven staan.
-- `tournamentsEnabled` staat uit. Nieuwe dienstkolommen zijn leeg.
-- Dit project past het schema normaal toe met:
--   npx prisma db push --schema=src/backend/prisma/schema.prisma
-- Op de live SQLite-database is dit script additief en veilig om één keer te draaien
-- vóór of in plaats van een db push die tabellen zou willen herbouwen.

-- CreateTable
CREATE TABLE "Tournament" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL DEFAULT '09:00',
    "endTime" TEXT NOT NULL DEFAULT '16:00',
    "matchMinutes" INTEGER NOT NULL DEFAULT 12,
    "changeoverMinutes" INTEGER NOT NULL DEFAULT 3,
    "breakEnabled" BOOLEAN NOT NULL DEFAULT false,
    "breakStart" TEXT NOT NULL DEFAULT '12:00',
    "breakMinutes" INTEGER NOT NULL DEFAULT 30,
    "format" TEXT NOT NULL DEFAULT 'poules',
    "advance" INTEGER NOT NULL DEFAULT 2,
    "categoryMode" TEXT NOT NULL DEFAULT 'team',
    "refereeMode" TEXT NOT NULL DEFAULT 'auto',
    "barShifts" INTEGER NOT NULL DEFAULT 0,
    "kitchenShifts" INTEGER NOT NULL DEFAULT 0,
    "publicToken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TournamentField" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tournamentId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "split" TEXT NOT NULL DEFAULT 'full',
    "partNames" TEXT NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TournamentField_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TournamentPoule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tournamentId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'JO11',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TournamentPoule_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TournamentTeam" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tournamentId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'JO9',
    "pouleKey" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TournamentTeam_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TournamentMatch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tournamentId" INTEGER NOT NULL,
    "engineKey" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "pouleKey" TEXT NOT NULL DEFAULT '',
    "round" INTEGER NOT NULL DEFAULT 0,
    "roundLabel" TEXT NOT NULL DEFAULT '',
    "slotIndex" INTEGER,
    "partKey" TEXT NOT NULL DEFAULT '',
    "homeKey" TEXT NOT NULL DEFAULT '',
    "awayKey" TEXT NOT NULL DEFAULT '',
    "homeLabel" TEXT NOT NULL DEFAULT '',
    "awayLabel" TEXT NOT NULL DEFAULT '',
    "refereeKey" TEXT NOT NULL DEFAULT '',
    "played" BOOLEAN NOT NULL DEFAULT false,
    "scoreHome" INTEGER NOT NULL DEFAULT 0,
    "scoreAway" INTEGER NOT NULL DEFAULT 0,
    "penaltiesTeamKey" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "TournamentMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable (geen tabelkopie, bestaande rijen blijven)
ALTER TABLE "ClubSettings" ADD COLUMN "tournamentsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Service" ADD COLUMN "tournamentId" INTEGER REFERENCES "Tournament" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Service" ADD COLUMN "tournamentShiftKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Tournament_publicToken_key" ON "Tournament"("publicToken");
CREATE UNIQUE INDEX "TournamentField_tournamentId_key_key" ON "TournamentField"("tournamentId", "key");
CREATE UNIQUE INDEX "TournamentPoule_tournamentId_key_key" ON "TournamentPoule"("tournamentId", "key");
CREATE UNIQUE INDEX "TournamentTeam_tournamentId_key_key" ON "TournamentTeam"("tournamentId", "key");
CREATE UNIQUE INDEX "TournamentMatch_tournamentId_engineKey_key" ON "TournamentMatch"("tournamentId", "engineKey");
