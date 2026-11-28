# Sportlink-koppeling (Club.Dataservice)

De app kan het thuisprogramma van een club automatisch uit **Sportlink Club.Dataservice** lezen.
Dit is de vervanger van de handmatige CSV-import (die blijft gewoon werken).

## Aanzetten (Beheer → Instellingen → Sportlink-koppeling)

1. Vraag in Sportlink Club het **Client ID** van de club op (Koppelingen → Club.Dataservice).
2. Vul het Client ID in, vul de **clubnaam zoals Sportlink die gebruikt** in (leeg = Lekkerkerk) en klik *Opslaan*.
   Het Client ID wordt versleuteld opgeslagen (zoals het SMTP-wachtwoord) en nergens meer getoond.
3. Zet de schakelaar op **Aan** (staat standaard uit) en klik *Nu synchroniseren* om te testen.
4. Daarna draait de sync elke nacht vanaf 04:00 (Europe/Amsterdam). Bij een fout probeert de app het na 3 uur opnieuw.

Zonder Client ID of met de schakelaar uit gebeurt er niets (geen netwerkverkeer, geen wijzigingen).
Alleen een Admin kan instellingen wijzigen. De barcommissie kan op het dashboard *Nu synchroniseren* kiezen en meldingen afhandelen.

## Wat de sync doet

| Situatie in Sportlink | In de app |
| --- | --- |
| Nieuwe wedstrijd | Wordt toegevoegd (sleutel = wedstrijdnummer). Er worden **geen** diensten aangemaakt: de barcommissie werkt de planning zelf bij. |
| Verplaatst (andere datum) | Wedstrijd wordt bijgewerkt. Gekoppelde diensten schuiven mee naar de nieuwe datum (tijd volgt de dienstregel), inschrijvingen blijven staan. |
| Andere aanvangstijd, zelfde dag | Wedstrijd wordt bijgewerkt, dienst blijft staan; de barcommissie krijgt een melding. |
| Afgelast | Wedstrijd krijgt het label *Afgelast* (nooit verwijderd). Gekoppelde diensten krijgen status *Afgelast*: zichtbaar, inschrijvingen blijven bewaard, tellen niet als open plek, geen herinneringen, niet in agenda/PDF. |
| Afgelasting ingetrokken | Wedstrijd en diensten worden weer actief (melding aan de barcommissie, geen mail). |
| Wedstrijd verdwijnt uit Sportlink | Blijft staan; alleen gemeld in het rapport. |

* Op dezelfde dag nog een andere thuiswedstrijd? Dan blijft de dienst staan (de koppeling schuift naar die wedstrijd).
* Handmatig beschermde diensten (handmatig aangemaakt, teamplek handmatig gezet, jaarplanning/activiteit, toernooi) worden **niet** aangepast, maar wel gemeld met reden.
* Staat er al een dienst op de nieuwe datum en tijd, dan wordt niets verschoven en volgt een conflictmelding.
* Officieel vergrendelde diensten schuiven mee (inschrijvingen blijven), maar staan duidelijk in de melding.
* De sync deelt **nooit** iemand in en voert **geen** automatische planning uit.

## Handmatig aangepaste wedstrijden

Een wedstrijd die in *Wedstrijden* is aangemaakt of bewerkt krijgt het label *Handmatig*. De sync slaat die over en schrijft
`overgeslagen, handmatig` in het rapport. In het bewerkformulier kan het vinkje weer uit, dan beheert Sportlink de wedstrijd weer.

## Mail en dashboard

* Ingeschreven vrijwilligers krijgen **één mail per wijziging** (verplaatst: oude en nieuwe datum/tijd; afgelast: de dienst vervalt).
  Een tweede sync stuurt nooit dezelfde mail opnieuw (uniek per wijziging en persoon).
* De mailteksten zijn te bewerken onder Beheer → E-mail (*Dienst verplaatst*, *Dienst vervalt*), met o.a. `{wedstrijd}`, `{oudedatum}`, `{oudetijd}`, `{nieuwedatum}`, `{nieuwetijd}`.
* De bestaande mailschakelaar (Beheer → E-mail → *E-mail versturen*) geldt ook hier. Staat mail uit, dan wordt er niets verstuurd en later ook niet ingehaald; dat staat in het syncrapport.
* De barcommissie ziet op het dashboard *Wijzigingen uit Sportlink* met per wedstrijd wat er met de diensten gebeurde, en krijgt een melding in de bel.

## Technisch

* Endpoints: `https://data.sportlink.com/programma` (venster 42 dagen, `weekoffset` per 5 weken zodat vensters overlappen, `uit=nee`, `aantalregels=500`) en `afgelastingen`. Een wedstrijd geldt ook als afgelast als `status` "afgelast/vervallen/uitgesteld" bevat.
* Database: alleen additieve SQL (`20261128120000_sportlink_dataservice`), nooit `prisma db push` op de live database.
* Code: `src/backend/lib/sportlink/` (`client.js`, `sync.js`, `changes.js`), routes in `src/backend/routes/sportlink.js`, test: `scripts/sportlink-sync-check.js`.
* Teamherkenning gebruikt de clubnaam-instelling (`ClubSettings.clubName`, leeg = Lekkerkerk) in plaats van een vaste naam.
