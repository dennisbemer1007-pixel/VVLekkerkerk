-- Sportlink Club.Dataservice: alleen nieuwe kolommen en nieuwe tabellen.
-- Bestaande wedstrijden, diensten, inschrijvingen en instellingen blijven ongemoeid.
-- De koppeling staat standaard uit en heeft geen Client ID.
-- Dit script is additief. Geen schema-push op de live database.

ALTER TABLE "ClubSettings" ADD COLUMN "clubName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ClubSettings" ADD COLUMN "sportlinkEnabled" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "ClubSettings" ADD COLUMN "sportlinkClientId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ClubSettings" ADD COLUMN "sportlinkLastSyncAt" DATETIME;
ALTER TABLE "ClubSettings" ADD COLUMN "sportlinkLastStatus" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ClubSettings" ADD COLUMN "sportlinkLastReport" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Match" ADD COLUMN "field" TEXT;
ALTER TABLE "Match" ADD COLUMN "source" TEXT;
ALTER TABLE "Match" ADD COLUMN "cancelled" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "Match" ADD COLUMN "manualEdit" BOOLEAN NOT NULL DEFAULT 0;

ALTER TABLE "Service" ADD COLUMN "cancelled" BOOLEAN NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "MatchChange" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "matchId" INTEGER,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "oldDate" DATETIME,
    "oldTime" TEXT,
    "newDate" DATETIME,
    "newTime" TEXT,
    "detail" TEXT NOT NULL DEFAULT '[]',
    "servicesMoved" INTEGER NOT NULL DEFAULT 0,
    "servicesCancelled" INTEGER NOT NULL DEFAULT 0,
    "servicesProtected" INTEGER NOT NULL DEFAULT 0,
    "mailsSent" INTEGER NOT NULL DEFAULT 0,
    "mailsFailed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" DATETIME,
    "acknowledgedById" INTEGER,
    CONSTRAINT "MatchChange_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "MatchChange_acknowledgedAt_createdAt_idx" ON "MatchChange"("acknowledgedAt", "createdAt");

CREATE TABLE IF NOT EXISTS "MatchChangeMail" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "changeId" INTEGER NOT NULL,
    "personId" INTEGER NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchChangeMail_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "MatchChange" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "MatchChangeMail_changeId_personId_key" ON "MatchChangeMail"("changeId", "personId");

-- Herkomst van bestaande wedstrijden vastleggen. manualEdit blijft overal uit: wedstrijden met een
-- wedstrijdnummer mag de sync bijwerken, wedstrijden zonder nummer raakt de sync nooit aan.
UPDATE "Match" SET "source" = 'csv' WHERE "source" IS NULL AND "matchNumber" IS NOT NULL;
UPDATE "Match" SET "source" = 'manual' WHERE "source" IS NULL;
