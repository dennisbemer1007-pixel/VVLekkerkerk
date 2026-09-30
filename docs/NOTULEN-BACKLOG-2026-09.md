# Notulen vrijwilliger / barcommissie — backlog

Bron: notulen sessie (september/oktober 2026).

## Meegenomen in deze release

### Vrijwilliger
- Diensten: scroll naar boven bij aanklikken
- Mijn diensten: alleen toekomst (geen verleden)
- Mijn diensten: ruilen-knop weg
- Ruilen: labels “Jij geeft af” / “Jij krijgt”
- Nav: Ik → Mijn gegevens
- “Gestaan dit seizoen” weg

### Barcommissie / beheer
- Nav: Open → Dashboard, Rooster → Diensten, Mensen → Personen
- Mijn diensten in barcommissie-nav
- Geen inschrijven in het verleden (UI + API)
- Dashboard-aandacht: alleen verplichte; no-show met aantal + laatste datum
- “Niet zelf ingeschreven” = verplicht en nergens op de planning
- Personen: kolommen telefoon, e-mail, vrijgesteld; e-mail bewerkbaar
- Kind van / ouder alleen bij bewerken (niet bij nieuw)
- E-mailpresets: Outlook en eigen server weg
- Wedstrijd toevoegen: wedstrijdnummer en spelniveau weg uit het formulier

## Later / groter

| Item | Toelichting |
|------|-------------|
| Meerdere planningperiodes | Nu 1 `PlanningRound`. Nodig: meerdere periodes (bijv. t/m 20 okt én 21 okt–1 jan) + switch op dashboard |
| Zelfde look & feel Open/Rooster als vrijwilliger | MasterDetail overal |
| Plusje + popup voor wedstrijd/dienst toevoegen | Personen heeft al een modal |
| Officieel 24 okt wel/niet | Nader onderzoek: welke dienst/status inconsistent |
| Alle personen-bug | AssignPanel limiet / filters nalopen |
| Uitnodigen-knop | Restcases (geen mailserver / geen token) |
| Teamdienst alleen via teamcoördinator | Al grotendeels zo; UI-copy aanscherpen |
| Opslaan vs Opslaan+uitnodigen | Knoppen splitsen |
| Vol = geen inschrijfoptie | Al grotendeels; edge-cases checken |
