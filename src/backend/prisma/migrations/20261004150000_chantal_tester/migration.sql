-- Testerronde Chantal: specifieke teams op een teamdienst-regel (7x7 / senioren).
-- Alleen een nieuwe kolom. Bestaande regels, diensten en personen blijven staan.
-- Geen schema-push op de live database.

ALTER TABLE "ServiceRule" ADD COLUMN "teamDutyTeamIds" TEXT NOT NULL DEFAULT '[]';
