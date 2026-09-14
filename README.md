# VVL Planning App

Eenvoudige planning-app voor bardiensten en keukendiensten bij **V.V. Lekkerkerk**.

Handleiding: [docs/WERKBESCHRIJVING.md](docs/WERKBESCHRIJVING.md) · FO-keuzes: [docs/FO-KEUZES.md](docs/FO-KEUZES.md) · Demo: [docs/DEMO.md](docs/DEMO.md) · Beveiliging: [docs/SECURITY.md](docs/SECURITY.md)

## Windows: PowerShell-fout bij `npm`?

Als je ziet: *running scripts is disabled*, gebruik één van deze opties:

- Dubbelklik **`start-dev.cmd`** in Verkenner, of in cmd/PowerShell: `.\start-dev.cmd`
- Of: `npm.cmd run dev` (met `.cmd` erachter)
- Of (eenmalig, veilig voor je account):  
  `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`

## Mailserver (optioneel)

In de app: **Beheer → E-mail**.

1. Kies een voorinstelling (Gmail / Outlook / eigen server)
2. Vul host, poort, gebruikersnaam, wachtwoord en afzender in
3. Zet **E-mail versturen** aan → **Opslaan**
4. Stuur een **testmail**

Als dit aanstaat, gaan uitnodigingen automatisch per e-mail. Zo niet, blijft de deeplink beschikbaar om te kopiëren.

## Accounts & uitnodigingen

1. Log in als beheerder: `admin@vvl.local` / `admin123` (alleen lokaal)
2. Demo-rollen: zie [docs/DEMO.md](docs/DEMO.md) (`npm run demo:users`)
3. Ga naar **Beheer → Personen** om mensen uit te nodigen
4. De persoon opent `/uitnodiging/...`, kiest een wachtwoord

## Wat is er nieuw?

- Inloggen met e-mail en wachtwoord; ruilen; teamdashboard; keuken; VR18+/inhaal
- Planning: Excel, clubhuis-PDF, 6-weken-PDF, officieel vastzetten
- Beheer: dienstregels, seizoen, AVG, personen-CSV

## Database opnieuw (na update)

Stop eerst de app (`Ctrl+C`). Daarna:

```bash
del src\backend\prisma\dev.db
npm.cmd run setup
npm.cmd run dev
```

## Starten (3 stappen)

1. Installeer dependencies:

```bash
npm install
```

2. Database aanmaken:

```bash
npm run setup
```

3. App starten:

```bash
npm run dev
```

- Frontend: http://localhost:5173  
- Backend API: http://localhost:3001  

## Pagina's

| Pagina | Functie |
|--------|---------|
| Dashboard | Tellingen + snelle links |
| Personen | Naam, telefoon, rol |
| Diensten | Bardienst / keukendienst, datum, tijd |
| Inschrijvingen | Vrijwilliger koppelen aan dienst |
| Planning | Overzicht, Excel, clubhuis-PDF en 6-weken-PDF |
| Mijn team | Teamcoördinator: leden, verplichting, inschrijven |
| Beheer → Club | Seizoen, AVG-opschonen, hostingnotitie |

## Productie

```bash
npm run build
set NODE_ENV=production
npm start
```

De Express-server serveert dan ook de gebouwde frontend.

Zet een sterke `ADMIN_PASSWORD` (niet `admin123`). Voor persistente SQLite op een volume: `DATA_DIR=/var/data`. Backup: `npm run db:backup`.

Kopieer `.env.example` naar `.env`.

## Klant-demo op Render (Free)

Geschikt om de app te laten uitproberen. Data blijft niet bewaard na idle sleep.

Zie **[docs/RENDER-DEMO.md](docs/RENDER-DEMO.md)** — kort: push naar Git, Render → Blueprint (`render.yaml`), inloggen met `admin@vvl.local` / `demo-test-2026`.

Productie: Starter + persistente schijf (`DATA_DIR`). Keuzes: [docs/FO-KEUZES.md](docs/FO-KEUZES.md).
