# Werkbeschrijving — VVL Planning App

**Applicatie:** VVL Planning App  
**Organisatie:** V.V. Lekkerkerk  
**Bron FO:** Functioneel Ontwerp Planning Bar- en Keukendiensten, concept 4.0  
**Keuzes bij het FO:** [FO-KEUZES.md](FO-KEUZES.md)  
**Beveiliging / AVG:** [SECURITY.md](SECURITY.md)  
**Demo:** [DEMO.md](DEMO.md)

Dit is de werkbeschrijving voor admin, barcommissie en testers. Technische keuzes en wat bewust níét is gebouwd staan in FO-KEUZES. Als het FO en de app verschillen, geldt FO-KEUZES.

---

## 1. Wat doet de app?

De app plant **bar- en keukendiensten** voor de kantine van V.V. Lekkerkerk.

- Vrijwilligers schrijven zich in of ruilen twee bestaande persoonlijke diensten.
- Teamcoördinatoren vullen teamdiensten en schrijven teamleden in.
- De barcommissie maakt de 6-wekenplanning, publiceert, vult verplichtingen, zet het rooster officieel en print voor het clubhuis.

Huisstijl: clubkleuren en logo van V.V. Lekkerkerk.

---

## 2. Koppeling met het FO 4.0

Onderstaande tabel dekt de FO-onderwerpen. Geparkeerde punten verwijzen naar FO-KEUZES (akkoord 14 september 2026).

| FO-onderwerp | In de app | Waar / toelichting |
|--------------|-----------|-------------------|
| Doel: bar- en keukenplanning kantine | Ja | Hele app |
| Huisstijl club | Ja | Logo, kleuren, `/logo.png` |
| Rollen vrijwilliger / teamco / barcommissie / admin | Ja | §3; oude naam “Coördinator” → Barcommissie, “Bestuur” → Admin |
| Half-verplicht (3×/jaar) | Nee, bewust | Vervangen door volledig verplicht. [FO-KEUZES](FO-KEUZES.md) |
| Verplicht 1× / 6 weken (`FULL`) | Ja | Personen + automatische vulling |
| VR18+ 1× / 12 weken | Ja | Zelfde |
| Vrijstelling | Ja | Telt niet mee voor quota |
| Inhaaldienst | Ja | `makeupDue`; gaat voor bij automatisch vullen |
| No-show | Ja | Beheer → Diensten; kan inhaal veroorzaken |
| Persoonsnummer 7 cijfers | Ja | Automatisch `1000000`–`9999999` |
| Uniek e-mailadres voor login | Ja | Gedeeld adres is geparkeerd. [FO-KEUZES](FO-KEUZES.md) |
| Configureerbare dienstregels (FO §7) | Ja | Beheer → Dienstregels; zie §6 |
| Standaard di–zo bar én keuken | Ja | Seed-regels bij eerste start |
| Zondag keuken 12:00–15:00 | Ja | Altijd; extra voorwaarde geparkeerd. [FO-KEUZES](FO-KEUZES.md) |
| Late keuken bij Lekkerkerk 1 thuis | Ja | Regel “Zaterdag keuken laat” |
| Teamdienst jonge jeugd ochtend | Ja | O8–O12 / JO8–JO12 |
| Teamdienst oudere jeugd 2e + laatste | Ja | O13–O17 (JO/MO), incl. JO13-2 |
| Meerdere jeugdteams thuis | Ja | Eén team per dienst; wie dit seizoen het minst stond. Aantal plekken blijft de dienstregel. |
| Activiteiten (klaverjas e.d.) | Ja | Beheer → Jaarplanning |
| Vrijdag bar alleen bij klaverjas | Ja | Dienstregel met voorwaarde activiteit |
| Dashboard 4 controles | Ja | Open diensten, verplichtingen, inhaal, waarom niet ingepland |
| Inschrijven tot vrijwilligersdeadline | Ja | Daarna alleen beheer (en teamco voor het team) |
| Ruilen twee persoonlijke diensten (FO §53–56 / §89) | Ja | Beide akkoord + barcommissie; zie §7 |
| Eerlijk automatisch vullen (FO §34 / §89) | Ja | Inhaal → verplicht → minst dit jaar → langst geleden → voorkeur |
| Teamcoördinator-dashboard | Ja | Menu **Mijn team** |
| Herinnering 1 dag van tevoren | Ja | Alleen e-mail (SMTP). Geen push/WhatsApp |
| Bewerkbare mailteksten | Nee, bewust | Vaste teksten. [FO-KEUZES](FO-KEUZES.md) |
| Publiceren / officieel vastzetten | Ja | Beheer → Planning → Maak officieel |
| Seizoen 1 aug–31 jul | Ja | Beheer → Club; rollover archiveert lidmaatschappen |
| Wedstrijden KNVB/CSV | Ja | Geen live VoetbalAssist. [FO-KEUZES](FO-KEUZES.md) |
| Personenimport CSV | Ja | Geen automatische nieuwe teams |
| Excel-export | Ja | Planning → Excel; personenblad alleen beheer |
| Clubhuisprint deze week | Ja | Planning → Clubhuis-PDF (bar + keuken) |
| 6-weken-PDF | Ja | Planning → PDF |
| AVG / privacy | Ja | `/privacy`, export, retentie, wis contact |
| Hosting persistente schijf | Vastgelegd | Productie: `DATA_DIR`. Free = alleen demo |

---

## 3. Voor wie? (rollen)

Access-rol is iets anders dan bardienst-verplichting.

| Rol | Mag je |
|-----|--------|
| **Vrijwilliger** | Alleen Inschrijven, Ruilen, Voorkeuren |
| **Teamcoördinator** | Dashboard, inschrijven, ruilen, planning, wedstrijden, voorkeuren, plus Mijn team + ouders uitnodigen |
| **Barcommissie** | Dashboard, planning, wedstrijden, Beheer — géén inschrijven, ruilen, voorkeuren (ruilgoedkeuring via Beheer → Ruilen) |
| **Admin** | Zelfde als barcommissie |

**Verplichting** (los van rol): geen / verplicht (min. 1× per 6 weken) / VR18+ (min. 1× per 12 weken). Vrijstelling telt niet mee. Inhaal komt bovenop.

Na inloggen zie je onder je rechten wat bij jouw rol hoort. Vrijwilligers landen op Inschrijven; barcommissie en admin op het dashboard.

---

## 4. Starten (lokaal)

1. `npm.cmd install`
2. `npm.cmd run setup`
3. `npm.cmd run demo:users` (zet alle demo-logins klaar)
4. `npm.cmd run dev` of `start-dev.cmd`
5. Browser: http://localhost:5173

**Admin (lokaal):** `admin@vvl.local` / `admin123`  
**Overige demo’s:** wachtwoord `demo123` — zie [DEMO.md](DEMO.md).

---

## 5. De 6-wekenronde (zo werkt de barcommissie)

Ga naar **Beheer → Planning**. Daar staan **4 genummerde stappen**:

1. **Diensten aanmaken / bijwerken** — diensten uit regels, thuiswedstrijden en activiteiten (handmatige/vastgezette blijven staan). Zorg dat Wedstrijden en Dienstregels kloppen.
2. **Concept publiceren** — vrijwilligers mogen inschrijven tot de deadline (optioneel: mail vrijwilligers).
3. **Vul open plekken (verplicht)** — schrijft verplichte leden, VR18+ en inhaal **automatisch** in op open persoonlijke plekken (eerlijke volgorde FO §34). Teamdiensten vult de teamco via **Mijn team** vóór stap 4.
4. **Maak officieel** — rooster op slot; alleen barcommissie/admin wijzigt daarna nog. Daarna print/Excel; herinneringen 1 dag van tevoren als SMTP aanstaat.

Status van de ronde staat bovenaan Beheer → Planning. Korte mailtekst voor testers: [MAIL-TOELICHTING-PLANNING.md](MAIL-TOELICHTING-PLANNING.md).

---

## 6. Hoe ontstaat een dienst? (FO §7)

Niet hardcoded “er is een thuiswedstrijd dus 09:00–12:00 bar”. De **dienstregels** zeggen:

- altijd op deze weekdag, of
- bij een thuiswedstrijd, of
- bij een thuiswedstrijd van een bepaald team, of
- bij een activiteit (bijv. klaverjas), of
- alleen handmatig.

**Standaardregels** (aanpasbaar in Beheer):

| Wanneer | Wat |
|---------|-----|
| Di 19:00–22:00 | Bar (1) |
| Wo 18:30–22:00 | Bar (1) |
| Do 18:30–00:00 | Bar (1) |
| Vr 18:30–00:00 | Bar (2), alleen bij klaverjasavond |
| Za 07:30–12:00 | Bar ochtend (3), teamdienst ochtend |
| Za 12:00–16:30 | Bar tweede shift (3), waarvan 2 teamdienst |
| Za 16:30–19:30 | Bar laatste shift (2), teamdienst laatste |
| Za 10:00–13:00 | Keuken ochtend (1) |
| Za 13:00–16:00 | Keuken middag (2) |
| Za 16:00–19:00 | Keuken laat (2), alleen Lekkerkerk 1 thuis |
| Zo 09:00–13:00 | Bar ochtend (1) |
| Zo 13:00–16:00 | Bar middag (1) |
| Zo 12:00–15:00 | Keuken (1), altijd |

Teamdiensten: aantal plekken uit de dienstregel (ochtend 3, middag 2, avond 2). Eén thuisspelend team uit de ingestelde leeftijdsgroep vult de teamplekken (standaard ochtend O8–O12 met 2, middag O13–O17 met 2, avond O13–O17 met 1); bij meerdere thuisteams het team dat dit seizoen het minst heeft gestaan.

---

## 7. Inschrijven, ruilen, blokkades

### Inschrijven
Filters: komende / vandaag / deze week / open / mijn diensten. Inschrijven tot de vrijwilligersfase sluit. Beheer mag altijd wijzigen. Na **officieel** alleen barcommissie.

Een vrijwilliger mag niet iemand anders inschrijven (IDOR-blokkade). Teamco mag teamleden inschrijven.

Wedstrijdblokkade: rond de eigen wedstrijd (incl. marge) kun je niet op een overlappende dienst. Beheer kan bewust overrulen.

### Ruilen (FO §53–56)
Kies jouw komende **persoonlijke** dienst en die van iemand anders. Die persoon gaat akkoord; daarna gaat het verzoek naar de **barcommissie** (e-mail als SMTP aanstaat, plus Dashboard en Beheer → Ruilen). Er ontstaat geen open plek. Teamdiensten gaan via de teamcoördinator. Details: [FO-KEUZES](FO-KEUZES.md).

---

## 8. Schermen (wat je als gebruiker doet)

### 8.1 Inloggen
E-mail + wachtwoord. Wachtwoord vergeten stuurt een link (zelfde bevestiging of het adres bestaat, i.v.m. privacy). Uitnodiging: link uit de mail. Op demo/dev staan klikbare demo-accounts.

### 8.2 Dashboard
Tellingen en voor de barcommissie vier controles: open diensten, niet-ingevulde verplichtingen, inhaaldiensten, waarom iemand niet is ingepland.

### 8.3 Inschrijven
Zie §7.

### 8.4 Ruilen
Zie §7.

### 8.5 Planning
Ongeveer 6 weken. Excel, clubhuis-PDF (deze week) en 6-weken-PDF. Beheer: Update vanuit regels + wedstrijden.

### 8.6 Wedstrijden
Overzicht + KNVB-/CSV-import (geen live VoetbalAssist).

### 8.7 Voorkeuren
Weekdagen afvinken waarop je niet kunt. Voorkeur ochtend/middag/avond. **Gegevens downloaden** (AVG).

### 8.8 Mijn team (teamcoördinator)
Leden en resterende verplichting, komende wedstrijden, teamdiensten, lid inschrijven op een open persoonlijke plek.

### 8.9 Beheer (barcommissie / admin)

| Tab | Functie |
|-----|---------|
| Personen | Uitnodigen, rol, verplichting, team, deactiveren, CSV-import, wis contact (AVG) |
| Diensten | Handmatig / historisch invoeren, no-show |
| Planning | 4 stappen: diensten aanmaken, publiceren, verplicht vullen, officieel + herinneringen |
| Ruilen | Ruilverzoeken goedkeuren of afwijzen |
| Dienstregels | Dagen, tijden, aantallen, voorwaarden |
| Jaarplanning | Klaverjas, toernooi, enz. |
| Teams | Coördinator, wedstrijdduur, teamdienst-functies |
| E-mail | SMTP |
| Club | Seizoen, AVG-opschonen, hostingnotitie |

---

## 9. AVG in de praktijk

Zie ook `/privacy` en [SECURITY.md](SECURITY.md).

- **Inzage / kopie:** Voorkeuren → Gegevens downloaden.
- **Wijzigen:** barcommissie past personen aan.
- **Wissen van contact:** account deactiveren, daarna **Wis contact** (e-mail, telefoon, foto, inlog). Namen in roosters blijven (verplichting/inhaal).
- **Retentie:** audit 24 maanden; contact inactief 24 maanden (`deactivatedAt`).
- **Dataminimalisatie:** vrijwilligers krijgen geen clubbrede personenlijst en geen e-mail/telefoon van anderen.

---

## 10. Productie

Zie [RENDER-DEMO.md](RENDER-DEMO.md) (Free = uitproberen) en [SECURITY.md](SECURITY.md).

- Sterke `ADMIN_PASSWORD` (niet `admin123`)
- Persistente schijf `DATA_DIR`
- `SEED_DEMO=false`
- `APP_URL` / `CORS_ORIGIN` / `MAIL_SECRET`
- SMTP voor uitnodigingen en herinneringen
- Backup: `npm run db:backup`

---

## 11. Testen

```bash
npm.cmd run test          # unit (geen server)
npm.cmd run test:accept   # acceptatie + regressie (server moet draaien)
npm.cmd run test:security # OWASP-gerichte checks (server moet draaien)
```
