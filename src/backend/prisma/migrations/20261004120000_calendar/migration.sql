-- Agenda-koppeling: alleen nieuwe kolommen en één nieuwe tabel.
-- Bestaande rijen (personen, wedstrijden, diensten, club) blijven staan.
-- `calendarEnabled` staat uit. Zonder schakelaar is er geen feed en geen knop.
-- Dit script is additief. Geen schema-push op de live database.

-- AlterTable
ALTER TABLE "ClubSettings" ADD COLUMN "calendarEnabled" BOOLEAN NOT NULL DEFAULT false;
-- SQLite weigert CURRENT_TIMESTAMP als default bij ADD COLUMN (niet-constante waarde).
ALTER TABLE "Match" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00';
UPDATE "Match" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL OR "updatedAt" <= '1970-01-01 00:00:00';

-- CreateTable
CREATE TABLE "CalendarFeed" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "token" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "personId" INTEGER,
    "teamId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalendarFeed_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CalendarFeed_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarFeed_token_key" ON "CalendarFeed"("token");
CREATE UNIQUE INDEX "CalendarFeed_personId_key" ON "CalendarFeed"("personId");
CREATE UNIQUE INDEX "CalendarFeed_teamId_key" ON "CalendarFeed"("teamId");
