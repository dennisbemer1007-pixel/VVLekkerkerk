# Werkbeschrijvingen per rol

Drie handleidingen (PDF) voor de planning-app van V.V. Lekkerkerk, op basis van de live master na PR #35–#38.

| Bestand | Rol |
| --- | --- |
| [werkbeschrijving-vrijwilliger.pdf](werkbeschrijving-vrijwilliger.pdf) | Vrijwilliger / ouder (eenvoudig, vooral telefoon) |
| [werkbeschrijving-teamcoordinator.pdf](werkbeschrijving-teamcoordinator.pdf) | Teamcoördinator (bardienstcoördinator) |
| [werkbeschrijving-barcommissie.pdf](werkbeschrijving-barcommissie.pdf) | Barcommissie (vooral computer) |

Elke PDF heeft een titelpagina (clublogo, zwart/wit/grijs), een klikbare inhoudsopgave, genummerde hoofdstukken met stappen, screenshots uit de lokale oefenomgeving, tips, een FAQ en een korte bijlage **Optionele modules (nog uit)** (Agenda-koppeling, Toernooien, Scheidsrechters).

## Opnieuw maken

Lokale app + seeded demo moet draaien (`npm run dev`, accounts `lisa@vvl.demo` / `sandra@vvl.demo` / `mark@vvl.demo`, wachtwoord `demo123`).

```bash
node docs/werkbeschrijving/capture-shots.mjs
node docs/werkbeschrijving/generate-pdfs.mjs
```

Geen wijziging in app-code. Screenshots staan in `shots/`.
