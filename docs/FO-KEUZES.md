# FO-keuzes (vastgelegd 13 september 2026)

Keuzes bij Functioneel Ontwerp Planning Bar- en Keukendiensten 4.0. Wat hier **geparkeerd** staat is bewust niet gebouwd. Wat **vastgelegd** staat is in de app verwerkt; verfijning mag later, maar de lijn is leidend.

## Vastgelegd en gebouwd

### Rolnaam: Barcommissie en Admin
De access-rol heet **Barcommissie** (niet Coördinator). De voormalige rol **Bestuur** heet **Admin**. Teamcoördinator is ongewijzigd (teamrol). Bestaande accounts met rol `Coördinator` of `Bestuur` worden bij opstarten gemigreerd.

### Tabbladen per rol
- **Vrijwilliger:** Inschrijven, Ruilen (geen Dashboard, Planning, Wedstrijden, geen tab Voorkeuren).
- **Bardienstcoördinator** (rol Teamcoördinator): zelfde als vrijwilliger, plus **Mijn team**. Geen uitnodigen; ouders vult hij/zij op naam.
- **Barcommissie** en **Admin:** Dashboard, Planning, Wedstrijden, Beheer. Geen Inschrijven of Ruilen. Ruilverzoeken keuren ze goed via **Beheer → Ruilen**. Beschikbaarheid van personen blijft via Beheer.

### Half-verplicht eruit
Verplichting `HALF` (3×/jaar) bestaat niet meer. Bestaande `HALF` wordt `FULL` (1×/6 weken). Geldige waarden: `NONE`, `FULL`, `VR18`.

### Persoonsnummer
Intern nummer is automatisch, **random, 7 cijfers** (`1000000`–`9999999`). Geen `VVL-00001`. E-mail blijft uniek voor login; dat is niet herzien.

### Jeugd-teamdiensten (O8–O17)
Bij stap 1 van de planning reserveert de app teamplekken voor jeugdteams die **thuis** spelen:

- **O8 t/m O12**, 07:30–12:00: 2 teamplekken + 1 open plek (standaard 3).
- **O13 t/m O17** (inclusief JO13-2), 12:00–16:30: 2 teamplekken.
- **O13 t/m O17**, 16:30–19:30: 1 teamplek + 1 open plek.

Vrijwilligers/verplichte vullen de open plek; de bardienstcoördinator vult de teamplekken met namen van ouders (geen e-mail nodig). Meerdere teams thuis: elk team krijgt de eigen teamplekken; `required` groeit mee.

### Planningsperiode
De barcommissie kiest zelf van/tot (bijvoorbeeld oktober t/m december), maximaal 13 maanden. Niet meer hardcoded 6 weken.

### Ruilen (voorlopige controleregels, wél in productie)
Bron: FO §53–56 / §89; details later aanscherpen.

- Alleen twee bestaande **persoonlijke** inschrijvingen; er ontstaat nooit een open plek.
- Teamdiensten vallen buiten deze flow (dat gaat via de teamcoördinator).
- Beide personen moeten akkoord geven; daarna keurt de **barcommissie** goed (e-mail naar barcommissie als SMTP aanstaat; anders Admin als fallback). Goedkeuren in **Beheer → Ruilen**, zichtbaar op het dashboard.
- Alleen toekomstige, gepubliceerde diensten. No-show kan niet. Niemand mag dubbel op dezelfde dienst komen.
- Maximaal één openstaand ruilverzoek per persoon.
- Wedstrijdblokkade blokkeert goedkeuring tot de barcommissie bewust overrulet (`ignoreMatchBlock`), zelfde patroon als inschrijven.
- Bij goedkeuring wisselen `personId` én `makeup` mee (inhaal volgt de persoon, niet het tijdslot). Reden wordt `Geruild met …`.
- Geen aparte afmeld-/uitschrijf-workflow via ruilen.

### Eerlijke automatische vulling (voorlopige volgorde, wél in productie)
Bron: FO §34 / §89; later herzien.

1. Openstaande inhaaldiensten eerst  
2. Verplicht lid (6 weken) vóór VR18+ (12 weken)  
3. Wie dit kalenderjaar het minst persoonlijk heeft gestaan  
4. Wie het langst geleden (of nog nooit) een persoonlijke dienst had  
5. Dagdeelvoorkeur  
6. Persoonsnummer als stabiele tie-break  

Teamdiensten en no-shows tellen niet mee. Geen extra straf op oude historie buiten dit jaar.

### Bardienstcoördinator
`/teams` (**Mijn team**): ouders/leden op naam, hoe vaak ze al hebben gestaan, komende wedstrijden, open teamplekken invullen. Ouders hebben geen account of e-mail nodig. De coordinator kan zichzelf ook inschrijven/ruilen als vrijwilliger.

### Herinneringen (1 dag van tevoren)
E-mail **1 dag voor** een ingeplande dienst, alleen als SMTP aanstaat. Geen push, geen WhatsApp. `Enrollment.remindedAt` voorkomt dubbele mails. De server draait dit elk uur en bij `/api/health` (max. eens per 50 minuten). Barcommissie kan **Herinneringen morgen** forceren. Productie mag niet “in slaap” vallen, anders mist de cron.

### Publiceren als officieel
Na **Maak officieel** worden gepubliceerde diensten in de **gekozen periode** vergrendeld (`Service.locked`, ronde `OFFICIAL`). Alleen barcommissie/admin mag daarna in- of uitschrijven. Bardienstcoördinatoren vullen teamdiensten vóór dit moment.

### Seizoen
Seizoen loopt **1 augustus t/m 31 juli**, label `YYYY-YYYY`. Rollover archiveert actieve `PersonTeam`-rijen (oud label, inactief) en kopieert ze naar het nieuwe label. `Person.teamId`, diensten, inschrijvingen, no-shows en inhaaldiensten blijven staan.

### Personenimport
CSV `naam;email;telefoon;team;rol;verplichting`. **Maakt geen teams aan**; onbekend team → hele import geweigerd. Bestaand e-mailadres → bijwerken. Optioneel uitnodigingsmail als SMTP aanstaat.

### Excel-export
`/api/planning/export.xlsx`: bladen Diensten en Inschrijvingen. Blad Personen alleen voor barcommissie/admin.

### Clubhuisprint
PDF van de **huidige week**, bar én keuken. Titel “officieel” als de ronde vergrendeld is. Het rooster-PDF volgt de gekozen periode (per 6 kolommen een pagina).

### AVG
Auditlogs **24 maanden**. Contact, foto en inlog van gedeactiveerde accounts na **24 maanden** wissen. Roosterhistorie blijft. Publieke pagina `/privacy`. Eigen export als **Excel** via Inschrijven (`GET /api/persons/me/export.xlsx`).

### Hosting
Productie: **Render Starter** (of gelijkwaardig) met persistente schijf (`DATA_DIR`). Render Free is alleen demo: data verdwijnt bij slaapstand; herinneringen lopen dan niet betrouwbaar.

## Geparkeerd (bewust niet gebouwd)

Afgesproken 14 september 2026 (product owner akkoord met de voorgestelde lijn):

1. **Zondagse keuken** — blijft **altijd 12:00–15:00** (standaardregel). Geen extra voorwaarde tot de club die later vastlegt.  
2. **Meerdere jeugdteams thuis** — geen extra verdeelregel. Elk team volgt de bestaande teamdienst-regels.  
3. **VoetbalAssist live** — niet gekoppeld. Wedstrijden blijven via KNVB-/CSV-import.  
4. **Gedeeld e-mailadres** — e-mail blijft uniek voor login.  
5. **Push / WhatsApp / bewerkbare mailteksten** — niet in deze versie. Alleen vaste e-mailteksten (uitnodiging, reset, herinnering).  

Verfijning van ruilen en planner-volgorde mag later; de regels hierboven blijven gelden tot een nieuwe keuze.
