# Werkbeschrijving — VVL Planning App

**Applicatie:** VVL Planning App  
**Organisatie:** V.V. Lekkerkerk  
**Doel:** Digitaal plannen van bardiensten en keukendiensten voor vrijwilligers, teamcoördinatoren en bestuur.

---

## 1. Wat doet de app?

De app vervangt een papieren of ad-hoc planning door één overzichtelijke tool waarin:

- **bestuur / coördinatoren** diensten plannen en mensen uitnodigen;
- **vrijwilligers** zichzelf inschrijven op open diensten;
- **teamcoördinatoren** ouders/leden uitnodigen en namens hun team inschrijven;
- iedereen een **planning van 6 weken** kan bekijken en als **PDF** kan printen voor in de kantine.

De huisstijl (zwart/wit/grijs) en het clublogo van V.V. Lekkerkerk zijn doorgevoerd in de hele interface.

---

## 2. Voor wie? (rollen)

| Rol | Wat mag je? |
|-----|-------------|
| **Vrijwilliger** | Dashboard, inschrijven, planning & PDF, eigen voorkeuren |
| **Teamcoördinator** | Zelfde + teamleden inschrijven + ouders uitnodigen |
| **Coördinator / Bestuur** (bardienstcoördinator) | Alles, inclusief Beheer (personen, diensten, teams, wedstrijden, e-mail) |

Apart van de access-rol heeft iemand een **bardienst-verplichting**: geen / volledig (min. 1× per 6 weken) / half (min. 3× per jaar).

Na inloggen of na het aanmaken van een account zie je onder **“Jouw rechten”** precies wat bij jouw rol hoort.

Zie ook feedback/roadmap: [`docs/FEEDBACK-CHERYL-2026-07.md`](FEEDBACK-CHERYL-2026-07.md).

---

## 3. Starten van de app

1. Open een terminal in de projectmap `dienst-planner`.
2. Eerste keer: `npm.cmd install` → `npm.cmd run setup`
3. Elke keer: `npm.cmd run dev` *(of dubbelklik `start-dev.cmd`)*
4. Browser: **http://localhost:5173**

**Standaard beheerder (eerste keer):**  
`admin@vvl.local` / `admin123`

---

## 4. Belangrijkste schermen

### 4.1 Inloggen
- E-mail + wachtwoord.
- Uitnodiging ontvangen? Open de **deeplink** uit de mail (of gekopieerde link) om een account te maken.

### 4.2 Dashboard
- Tellingen: personen, diensten, inschrijvingen, **bezettingsgraad %**.
- Kleurstatus: **groen = vol**, **geel = nog 1 nodig**, **rood = open**.
- Overzicht “deze week” + snelle knoppen naar Inschrijven / Planning / Beheer.
- Beheer ziet ook: **wie heeft gestaan** (6 weken / jaar) en **wie zich niet zelf inschreef** in de huidige ronde.

### 4.3 Inschrijven
- Filters: Komende diensten, Vandaag, Deze week, Open diensten, Mijn diensten.
- Per dienst: type (bar/keuken), datum, tijd, locatie, bezetting, ingeschreven personen **met pasfoto of initialen**.
- Knop **Inschrijven** / **Uitschrijven** (uitschrijven tot vrijwilligersdeadline; beheer mag altijd wijzigen).

### 4.3b Voorkeuren
- Vaste weekdagen afvinken waarop je niet kunt staan.
- Optioneel voorkeur voor ochtend / middag / avond.
- Beheer kan dit ook per persoon instellen.

### 4.4 Planning
- Overzicht van ca. **6 weken**.
- Zelfde filters als bij Inschrijven.
- Knop **PDF (6 weken)** voor een printbare kantineversie.

### 4.5 Beheer (coördinator / bestuur)

| Tab | Functie |
|-----|---------|
| **Personen** | Uitnodigen per e-mail, pasfoto, rol, team, verplichte bardienst, deactiveren, deeplink kopiëren |
| **Diensten** | Bardienst/keukendienst toevoegen of bewerken (datum, tijd, bezetting, actief/uit) |
| **Teams** | Teams + coördinator; lid inschrijven op open dienst |
| **Wedstrijden** | Thuis/uitwedstrijden; knop om automatisch bardiensten te maken bij thuiswedstrijden |
| **E-mail** | SMTP mailserver aansluiten (Gmail / Outlook / eigen server) + testmail |

### 4.6 Teamcoördinator
- Menu **Mijn team** en **Uitnodigen**.
- Ouders toevoegen via e-mailuitnodiging (rol vrijwilliger).
- Leden inschrijven op open bardiensten.

---

## 5. Uitnodigingsproces (stap voor stap)

1. Beheerder gaat naar **Beheer → Personen**.
2. Vult **naam**, **e-mail**, optioneel telefoon, rol, team, **pasfoto** in.
3. Klikt **Uitnodiging maken**.
4. Als mailserver aanstaat → e-mail wordt verstuurd.  
   Zo niet → **kopieer de deeplink** (of open e-mailprogramma).
5. De persoon opent `/uitnodiging/...`, ziet **rol + rechten**, kiest een wachtwoord.
6. Account is actief; bij volgende bezoek: gewoon inloggen.

Uitnodigingslink is **14 dagen** geldig.

---

## 6. Mailserver (optioneel)

Pad: **Beheer → E-mail**

1. Kies voorinstelling (Gmail / Outlook / eigen server).
2. Vul host, poort, gebruikersnaam, wachtwoord, afzender in.
3. Zet **E-mail versturen** aan → Opslaan.
4. Stuur een **testmail**.

Zonder SMTP blijft de app werken met handmatig kopiëren van de uitnodigingslink.

---

## 7. Pasfoto’s

- Toe te voegen bij uitnodigen of bewerken van een persoon (JPG/PNG, max. 3 MB).
- Zichtbaar in: personenlijst, **teamverdeling**, **bardiensten/keukendiensten**.
- Geen foto? Dan initialen in een rond vlak.

---

## 8. Technische opbouw (kort)

| Onderdeel | Techniek |
|-----------|----------|
| Frontend | React + Vite + Tailwind |
| Backend | Express (API) |
| Database | Prisma + SQLite |
| PDF | PDFKit |
| Mail | Nodemailer (SMTP via Beheer) |
| Foto’s | Upload naar `/uploads/photos` |

---

## 9. Typische werkdag (voorbeeld)

1. Bestuur plant diensten (handmatig of via thuiswedstrijden).  
2. Nodigt nieuwe vrijwilligers uit (mail of WhatsApp-link).  
3. Vrijwilligers loggen in en schrijven zich in op open diensten.  
4. Teamcoördinator vult open plekken namens ouders.  
5. Dashboard toont of alles vol/open is.  
6. Planning → **PDF** printen voor in de kantine.

---

## 10. Demo / filmpje

Alles staat in de map `docs/`:

| Bestand | Inhoud |
|---------|--------|
| `docs/WERKBESCHRIJVING.md` | Tekstversie |
| `docs/WERKBESCHRIJVING.pdf` | **PDF-versie (printbaar)** |
| `docs/demo/VVL-Planning-App-Demo.mp4` | Demofilmpje (~35 sec) met alle schermen + PDF-rooster |
| `docs/demo/index.html` | Interactieve slideshow (afspelen / vorige-volgende) |

**PDF openen:** dubbelklik `docs/WERKBESCHRIJVING.pdf`  
**Filmpje openen:** dubbelklik `docs/demo/VVL-Planning-App-Demo.mp4`  
**Slideshow:** open `docs/demo/index.html` in je browser.

---

*Documentversie: juli 2026 — VVL Planning App*
