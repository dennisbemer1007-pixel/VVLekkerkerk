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

| Rol | E-mail | Wachtwoord |
|-----|--------|------------|
| Bestuur | `admin@vvl.local` | `demo-test-2026` (of jouw `ADMIN_PASSWORD`) |
| Demo-vrijwilligers | `lisa@vvl.demo` e.a. | `demo123` |

Zie ook `scripts/seed-mock.js` voor alle demo-accounts.

## Tips voor de klant

- Eerste bezoek na pauze: even geduld (cold start).
- Daarna normaal klikken tot de service weer slaapt.
- Niet gebruiken om “echte” seizoensplanning op te slaan — alleen uitproberen.
