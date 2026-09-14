# Demo — VVL Planning App

Rondleiding voor bestuur / product owner. De app moet lokaal draaien (`npm run dev`). Werkbeschrijving: [WERKBESCHRIJVING.md](WERKBESCHRIJVING.md).

## Klaarzetten

```bash
npm.cmd run demo:users
npm.cmd run dev
```

Open http://localhost:5173 — op het loginscherm staan alle demo-accounts klikbaar.

## Demo-accounts (wachtwoord `demo123`, behalve bestuur)

| Rol | E-mail | Wachtwoord | Wat je laat zien |
|-----|--------|------------|------------------|
| Bestuur | `admin@vvl.local` | `admin123` (lokaal) | Beheer, seizoen, AVG, CSV |
| Barcommissie | `mark@vvl.demo` | `demo123` | Planning, regels, officieel (niet tijdens losse demo) |
| Teamcoördinator | `sandra@vvl.demo` | `demo123` | Mijn team, inschrijven lid |
| Vrijwilliger (verplicht) | `lisa@vvl.demo` | `demo123` | Inschrijven, voorkeuren, export, ruilen |
| Vrijwilliger | `tom@vvl.demo` | `demo123` | Zelfde rol, geen verplichting |
| Vrijwilliger | `fatima@vvl.demo` | `demo123` | JO13-2 |
| Vrijwilliger (verplicht) | `peter@vvl.demo` | `demo123` | JO13-2 verplicht |
| Vrijwilliger (verplicht) | `anneke@vvl.demo` | `demo123` | JO11-1 verplicht |
| Vrijwilliger | `kevin@vvl.demo` | `demo123` | JO11-1 |
| Vrijwilliger | `noa@vvl.demo` | `demo123` | Senioren |
| Vrijwilliger | `erik@vvl.demo` | `demo123` | Geen team |

Openstaand (nog geen wachtwoord, alleen na volledige seed): uitnodiging `nieuw@vvl.demo`.

## Script (8–10 minuten)

### 1. Login als Lisa (vrijwilliger)
- Dashboard: eigen tellingen, geen Beheer-menu.
- **Inschrijven:** filter Open, schrijf in op een vrije persoonlijke dienst (of leg uit als alles vol is).
- **Voorkeuren:** weekdag uit, dagdeel aan; **Gegevens downloaden** (AVG-kopie).
- **Ruilen:** alleen als Lisa én iemand anders een toekomstige persoonlijke dienst hebben.
- **Planning:** rooster bekijken; Excel/PDF zitten achter login.

### 2. Login als Sandra (teamcoördinator)
- Menu **Mijn team**: leden + resterende verplichting, komende wedstrijden, teamdiensten.
- Schrijf een lid in op een open persoonlijke plek.
- **Uitnodigen:** ouder toevoegen (link kopiëren als SMTP uit staat).

### 3. Login als Mark (barcommissie)
- **Planning:** Excel-export en **Clubhuis-PDF** (deze week, bar + keuken).
- **Beheer → Dienstregels:** laat zien dat tijden configureerbaar zijn (FO §7), o.a. zondag keuken 12:00–15:00.
- **Beheer → Jaarplanning:** klaverjas → vrijdagbar.
- **Beheer → Planning:** voorstel / verplicht vullen. **Niet** “Maak officieel” tijdens een losse demo, tenzij je het rooster wilt vastzetten.

### 4. Login als bestuur
- **Beheer → Club:** seizoen 1 aug–31 jul, AVG-opschonen.
- **Beheer → Personen:** CSV-import (geen nieuwe teams automatisch), deactiveren, wis contact.
- Open `/privacy`.
- **Wedstrijden:** uitleg KNVB-/CSV-import, geen VoetbalAssist-livekoppeling.

### 5. Afronden
- Wijs op geparkeerde FO-punten: [FO-KEUZES.md](FO-KEUZES.md) (geen WhatsApp, geen gedeeld e-mailadres, geen extra zondagse keukenvoorwaarde).

## Video (optioneel)

Als Playwright + ffmpeg lokaal staan:

```bash
npm.cmd run demo:video
```

Uitvoer: `docs/demo/VVL-Planning-App-Demo.mp4`. Frames in `docs/demo-frames/` (git-negeert die map).

Zonder video is dit klikpad de demo. Screenshots van een lokale rondleiding staan in `docs/demo-frames/` (git-negeert die map).
