# FO-keuzes (vastgelegd 13 september 2026)

Keuzes bij Functioneel Ontwerp Planning Bar- en Keukendiensten 4.0. Wat hier **geparkeerd** staat is bewust niet gebouwd. Wat **vastgelegd** staat is in de app verwerkt; verfijning mag later, maar de lijn is leidend.

## Vastgelegd en gebouwd

### Rolnaam: Barcommissie
De access-rol heet **Barcommissie** (niet Coördinator). Bestuur blijft naast deze rol bestaan. Teamcoördinator is ongewijzigd (teamrol). Bestaande accounts met rol `Coördinator` worden bij opstarten gemigreerd.

### Half-verplicht eruit
Verplichting `HALF` (3×/jaar) bestaat niet meer. Bestaande `HALF` wordt `FULL` (1×/6 weken). Geldige waarden: `NONE`, `FULL`, `VR18`.

### Persoonsnummer
Intern nummer is automatisch, **random, 7 cijfers** (`1000000`–`9999999`). Geen `VVL-00001`. E-mail blijft uniek voor login; dat is niet herzien.

### JO13-2 geen extra teamdienst
Tweede + laatste teamdienst alleen voor MO17, O16/JO16, MO15/JO15/O15, en **O13-1 / JO13-1 / O13-1JM**. JO13-2 en andere O13-elftallen krijgen die extra teamdienst niet. Jonge jeugd O8–O12 blijft ochtend-teamdienst.

### Ruilen (voorlopige controleregels, wél in productie)
Bron: FO §53–56 / §89; details later aanscherpen.

- Alleen twee bestaande **persoonlijke** inschrijvingen; er ontstaat nooit een open plek.
- Teamdiensten vallen buiten deze flow (dat gaat via de teamcoördinator).
- Beide personen moeten akkoord geven; daarna keurt de **barcommissie** goed.
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

### Teamcoördinator-dashboard
`/teams` is een echt overzicht: leden + resterende persoonlijke verplichting, komende wedstrijden, teamdiensten, en inschrijven van een lid op een open persoonlijke plek. `GET /api/teams` toont voor een teamcoördinator alleen de eigen teams.

### Herinneringen (1 dag van tevoren)
E-mail **1 dag voor** een ingeplande dienst, alleen als SMTP aanstaat. Geen push, geen WhatsApp. `Enrollment.remindedAt` voorkomt dubbele mails. De server draait dit elk uur en bij `/api/health` (max. eens per 50 minuten). Barcommissie kan **Herinneringen morgen** forceren. Productie mag niet “in slaap” vallen, anders mist de cron.

### Publiceren als officieel
Na **Maak officieel** worden gepubliceerde diensten in het 6-wekenvenster vergrendeld (`Service.locked`, ronde `OFFICIAL`). Alleen barcommissie/bestuur mag daarna in- of uitschrijven. Teamcoördinatoren vullen teamdiensten vóór dit moment.

### Seizoen
Seizoen loopt **1 augustus t/m 31 juli**, label `YYYY-YYYY`. Rollover archiveert actieve `PersonTeam`-rijen (oud label, inactief) en kopieert ze naar het nieuwe label. `Person.teamId`, diensten, inschrijvingen, no-shows en inhaaldiensten blijven staan.

### Personenimport
CSV `naam;email;telefoon;team;rol;verplichting`. **Maakt geen teams aan**; onbekend team → hele import geweigerd. Bestaand e-mailadres → bijwerken. Optioneel uitnodigingsmail als SMTP aanstaat.

### Excel-export
`/api/planning/export.xlsx`: bladen Diensten en Inschrijvingen. Blad Personen alleen voor barcommissie/bestuur.

### Clubhuisprint
PDF van de **huidige week**, bar én keuken. Titel “officieel” als de ronde vergrendeld is. De 6-weken-PDF toont eveneens keukenrijen.

### AVG
Auditlogs **24 maanden**. Contact, foto en inlog van gedeactiveerde accounts na **24 maanden** wissen. Roosterhistorie blijft. Publieke pagina `/privacy`. Eigen export via Voorkeuren (`GET /api/persons/me/export`).

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
