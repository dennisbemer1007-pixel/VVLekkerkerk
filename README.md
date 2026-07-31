# VVL Planning App

Eenvoudige planning-app voor bardiensten en keukendiensten bij **V.V. Lekkerkerk**.

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

1. Log in als beheerder: `admin@vvl.local` / `admin123`
2. Ga naar **Beheer → Personen → Uitnodigen per e-mail**
3. Kopieer de deeplink of open je e-mailprogramma
4. De persoon opent `/uitnodiging/...`, kiest een wachtwoord en ziet daarna alleen de menu’s bij hun rol

## Wat is er nieuw?

- **Inschrijven**: kies je naam (geen wachtwoord) → inschrijven op open diensten
- **Filters**: Vandaag, Deze week, Open, Mijn diensten
- **Kleurcodes**: groen = vol, geel = nog 1, rood = open
- **Beheer**: personen (deactiveren), diensten (bezetting, aan/uit), teams, wedstrijden → bardiensten
- **PDF**: standaard 6 weken, blokken per dienst

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
| Planning | Overzicht + **PDF download** |

## Productie

```bash
npm run build
set NODE_ENV=production
npm start
```

De Express-server serveert dan ook de gebouwde frontend.

## Klant-demo op Render (Free)

Geschikt om de app te laten uitproberen. Data blijft niet bewaard na idle sleep.

Zie **[docs/RENDER-DEMO.md](docs/RENDER-DEMO.md)** — kort: push naar Git, Render → Blueprint (`render.yaml`), inloggen met `admin@vvl.local` / `demo-test-2026`.
