# Render Free — klant-demo

Puur om de app te laten **testen**. Data blijft niet permanent (Free heeft geen vaste schijf).

## Beperkingen (verwacht gedrag)

- Na ~15 minuten geen bezoek: service “slaapt”. Volgende klik duurt ~30–60 seconden.
- Bij wake/redeploy is SQLite leeg → demo-data wordt opnieuw geladen.
- Foto-uploads en handmatige wijzigingen verdwijnen dus na sleep. Dat is ok voor een demo.

## Deploy (Blueprint)

1. Code naar GitHub/GitLab pushen.
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
3. Repo koppelen → `render.yaml` wordt herkend.
4. Deploy starten.

Of handmatig **Web Service**:

| Veld | Waarde |
|------|--------|
| Runtime | Node |
| Plan | Free |
| Build | `npm install --include=dev && npm run build:render` |
| Start | `npm run start:render` |
| Health check | `/api/health` |

## Inloggen (na seed)

Klikbare accounts staan op het loginscherm (`SEED_DEMO=true`).

| Rol | E-mail | Wachtwoord |
|-----|--------|------------|
| Bestuur | `admin@vvl.local` | `demo-test-2026` |
| Barcommissie | `mark@vvl.demo` | `demo123` |
| Teamcoördinator | `sandra@vvl.demo` | `demo123` |
| Vrijwilliger | `lisa@vvl.demo` (en tom, fatima, peter, anneke, kevin, noa, erik) | `demo123` |

Volledige lijst: [DEMO.md](DEMO.md).

## Tips voor de klant

- Eerste bezoek na pauze: even geduld (cold start).
- Daarna normaal klikken tot de service weer slaapt.
- Niet gebruiken om “echte” seizoensplanning op te slaan — alleen uitproberen.

## Productie (niet Free)

Echte seizoensdata, herinneringsmails en AVG-exports horen op **Render Starter** (of gelijkwaardig) met een **persistente schijf**.

| Veld | Waarde |
|------|--------|
| Plan | Starter (of hoger) |
| Disk | bijv. `/var/data` |
| `DATA_DIR` | `/var/data` |
| `SEED_DEMO` | `false` |
| `ADMIN_PASSWORD` | sterk, niet `admin123` |

SQLite landt dan op de schijf (`vvl.db`). Backup: `npm run db:backup`. Render Free wist de database bij slaapstand; herinneringen “1 dag van tevoren” lopen daar niet betrouwbaar.
