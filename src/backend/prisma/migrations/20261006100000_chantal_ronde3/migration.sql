-- Testerronde 3: extra diensten (pubquiz e.d.) mogen open voor zelf-inschrijven.
-- Klaverjas blijft vooraf door de barcommissie. Alleen een nieuwe kolom.

ALTER TABLE "Activity" ADD COLUMN "openForEnrollment" BOOLEAN NOT NULL DEFAULT 1;
UPDATE "Activity" SET "openForEnrollment" = 0 WHERE lower("type") = 'klaverjas';
