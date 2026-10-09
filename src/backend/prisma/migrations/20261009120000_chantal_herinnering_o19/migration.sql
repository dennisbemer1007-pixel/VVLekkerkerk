-- Chantal ronde voor live: teamco-herinnering, O19 alleen ochtend/keuken, vaste personen in dienstregels.

ALTER TABLE "Team" ADD COLUMN "morningBarOrKitchenOnly" BOOLEAN NOT NULL DEFAULT 0;

ALTER TABLE "ServiceRule" ADD COLUMN "fixedPersonId" INTEGER;

ALTER TABLE "ServiceTeamDuty" ADD COLUMN "coordinatorRemindedAt" DATETIME;
