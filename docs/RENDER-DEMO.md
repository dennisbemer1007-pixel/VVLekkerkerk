# Render — productie

De live service is **vvl-planning-demo** (Starter, Frankfurt). Het bouwplan staat in `render.yaml`.

## Wat het bouwplan vastzet

| Onderdeel | Waarde |
|-----------|--------|
| Plan | Starter ($7/maand, blijft aan) |
| Schijf | `vvl-data`, gekoppeld aan `/var/data`, 1 GB |
| `DATA_DIR` | `/var/data` (database: `/var/data/vvl.db`) |
| `SEED_DEMO` | `false` (geen oefenaccounts op het loginscherm) |
| `ADMIN_EMAIL` | `admin@vvl.local` |
| `ADMIN_PASSWORD` | alleen in het Render-dashboard, niet in git |
| Health check | `/api/health` |

Een nieuwe deploy maakt het schema bij en laat bestaande clubdata staan.

## Eerste keer na deze omschakeling

De oude database stond op de tijdelijke schijf van de container. Die verhuist niet mee. Na de eerste deploy met de vaste schijf is de planning leeg. Log in als `admin@vvl.local` met het wachtwoord uit **Environment**.

Zet in **Environment** een eigen `ADMIN_PASSWORD` van minstens 8 tekens. Gebruik niet `admin123`. De server start niet met dat standaardwachtwoord zolang `SEED_DEMO` uit staat.

Zolang het account nog het oude standaardwachtwoord heeft, zet een herstart het wachtwoord gelijk aan `ADMIN_PASSWORD`. Een wachtwoord dat je daarna in de app zelf kiest, blijft staan.

## Mail

SMTP stel je in via **Beheer → E-mail**. Zonder SMTP werkt de site wel, maar gaan uitnodigingen en herinneringen niet weg.

## Backup

`npm run db:backup` schrijft een kopie van de SQLite-database. De vaste schijf overleeft een deploy; een backup blijft verstandig.
