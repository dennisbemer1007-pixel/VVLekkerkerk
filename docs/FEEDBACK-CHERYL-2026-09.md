# Cheryl-feedback september 2026 — hoe ingebouwd

Bron: mail + `Testlijst_Planningsapp_Concept_4.xlsx` tab 3/4/5.

## Mail / essentieel

1. **Jeugd-teamdiensten bij thuiswedstrijd** — `ServiceTeamDuty` reserveert plekken op de zaterdagse bardienst. Generator in `teamDutyPlanning.js` + `serviceGeneration.js`. Tijden: 07:30–12:00 (O8–O12, 2 team + 1 open), 12:00–16:30 (O13–O17, 2 team), 16:30–19:30 (O13–O17, 1 team + 1 open). Stap 3 (`autoFill.js`) vult alleen `personalOpen`.
2. **Bardienstcoördinator vult ouders** — rol Teamcoördinator: Inschrijven + Ruilen + Mijn team. `POST /api/teams/:id/parents` (alleen naam). Dashboard toont `teamDutyCount`.
3. **Planperiode zelf kiezen** — datums op `PlanningRound.fromDate/toDate`, UI in Beheer → Planning, max. 13 maanden (`planningPeriod.js`).

## Tab vrijwilliger

4. **Wachtwoord 6 vs 8** — alle labels en validatie op min. 8 tekens.
5. **Compact inschrijven** — `DienstCard` compact: klik voor namen, knop Inschrijven; badge “Jij” als je erop staat. Standaardfilter: komende diensten.
6. **Foute reden “barcommissie heeft ingepland”** — zelf inschrijven is altijd bron `SELF` → “Zelf ingeschreven”.
7. **Tab Voorkeuren weg** — geen menu-item, `/voorkeuren` gaat naar Inschrijven. Dagdeelvoorkeur alleen nog in Beheer (auto-planning).
8. **AVG JSON** — download is Excel (`/api/persons/me/export.xlsx`).
9. **Inschrijvingen niet bij komende diensten** — standaard alle komende diensten (niet alleen open); “Mijn diensten” inclusief de laatste 8 weken.
10. **Ruilen-lijst te lang** — zoekveld op naam/datum/tijd.

## Tab bardienstcoördinator

11. **Zelfde schermen als vrijwilliger + team** — `roles.js`: `inschrijven`, `ruilen`, `teams`.
12. **Geen uitnodigen, wel namen** — geen Uitnodigen-tab; ouders zonder e-mail.
13. **Inzicht wie al stond** — per ouder het aantal teamdiensten.

## Tab beheer

14. **Bewerken scrollt naar formulier** — personen, diensten, dienstregels, jaarplanning.
15. **Beschikbaarheid** — vaste weekdagen “kan niet” in het personenformulier.
16. **Jaarplanning namen vasthouden** — personen vooraf inplannen op de activiteit; inschrijvingen blijven bij sync.
17. **Teams niet herkend bij import** — onbekend jeugdteam wordt aangemaakt met standaard teamdienst-shifts.
18. **“Persoonlijke verplichting nog niet voldaan”** — weg bij de coordinator; vervangen door “hoe vaak gestaan”.
19. **Standaard dienstregels** — copy + automatische toepassing in stap 1; bestaande zaterdag-barregels worden bij start gelijkgetrokken met 07:30/12:00/16:30.

## Overig

20. **JO13-2** — ook teamdienst middag+avond (alle O13–O17).
21. **Aftrap 16:00** — middag (grens 16:30).
22. **PDF/Excel** — volgen de gekozen periode.
