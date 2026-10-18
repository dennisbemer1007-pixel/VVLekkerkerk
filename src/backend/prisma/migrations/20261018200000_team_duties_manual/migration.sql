-- Teamplekken die de barcommissie heeft gezet of weggehaald niet meer herverdelen.
-- Eenmalig: de huidige officiële planning blijft zoals die nu staat (ook lege diensten
-- waarvan een 7x7-team al is weggehaald).

ALTER TABLE "Service" ADD COLUMN "teamDutiesManual" BOOLEAN NOT NULL DEFAULT 0;

UPDATE "Service" SET "teamDutiesManual" = 1 WHERE "locked" = 1;
