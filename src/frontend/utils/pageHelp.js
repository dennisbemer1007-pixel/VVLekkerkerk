/** Hulpteksten per pagina / beheer-tab */

export const PAGE_HELP = {
  dashboard: {
    purpose:
      'Dit is je startscherm. Voor de barcommissie staan hier een snelle link naar de 4-stappenplanning, plus vier controles: open diensten, niet-ingevulde verplichtingen, inhaaldiensten en waarom iemand niet is ingepland.',
    actions: [
      'Barplanning maken: open Beheer → Planning (4 stappen)',
      'Klik op een controlekaart om de concrete lijst te zien',
      'Ruilverzoeken na wederzijds akkoord keur je goed via Beheer → Ruilen',
    ],
  },
  inschrijven: {
    purpose:
      'Hier schrijf je jezelf in of uit voor open bardiensten. Zo vullen we het rooster samen.',
    actions: [
      'Filter op komende diensten, open diensten, deze week, vandaag of jouw diensten',
      'Schrijf je in op een dienst met nog plek',
      'Schrijf je uit zolang de vrijwilligersfase open is (niet na officieel maken)',
    ],
  },
  planning: {
    purpose:
      'Overzicht van de komende weken: wie staat wanneer. Handig om te checken en om een PDF voor de kantine te printen.',
    actions: [
      'Bekijk alle diensten in de gekozen planningsperiode',
      'Filter op open of jouw diensten',
      'Als beheerder: diensten bijwerken vanuit regels en thuiswedstrijden',
      'Download Excel, clubhuis-PDF (deze week) of het rooster-PDF van de periode',
    ],
  },
  voorkeuren: {
    purpose:
      'Geef aan wanneer je niet kunt staan en welke dagdelen je voorkeur hebben. De planning gebruikt dit bij het automatisch vullen van open plekken.',
    actions: [
      'Vink vaste weekdagen af waarop je niet beschikbaar bent',
      'Kies optioneel voorkeur voor ochtend, middag of avond',
      'Sla op zodat beheer en auto-invulling hiermee rekening houden',
      'Download een kopie van je eigen gegevens (AVG)',
    ],
  },
  ruilen: {
    purpose:
      'Ruil twee bestaande persoonlijke diensten. Beide personen moeten akkoord zijn, daarna keurt de barcommissie goed. Er ontstaat geen open plek.',
    actions: [
      'Kies jouw komende dienst en de dienst van iemand anders',
      'Wacht tot de andere persoon akkoord geeft',
      'De barcommissie keurt daarna goed of af',
    ],
  },
  beheer: {
    purpose:
      'Volledig beheer van vrijwilligers, diensten, teams, wedstrijden en de planningsronde. Alleen voor barcommissie en admin.',
    actions: [
      'Personen uitnodigen en rollen/verplichtingen instellen',
      'Diensten toevoegen of historiek nabouwen',
      'Concept-planning maken, publiceren en open plekken vullen',
      'Wedstrijden bekijken en importeren, e-mailserver instellen',
      'Club: seizoenswisseling, AVG-opschonen en hostingnotitie',
    ],
  },
  beheerRuilen: {
    purpose:
      'Goedkeuren of afwijzen van ruilverzoeken nadat beide personen akkoord zijn. Vrijwilligers sturen verzoeken via hun eigen Ruilen-tabblad.',
    actions: [
      'Bekijk openstaande verzoeken ter goedkeuring',
      'Keur goed of wijs af',
      'Let op een eventuele wedstrijdblokkade (bewust overrulen mag)',
    ],
  },
  beheerPersonen: {
    purpose:
      'Beheer wie meedoet: uitnodigen, rol, team en bardienst-verplichting. Zo weet de app wie vrijwillig meedoet en wie verplicht is.',
    actions: [
      'Nieuwe mensen uitnodigen per e-mail',
      'Rol en verplichting (geen / verplicht / VR18+) instellen',
      'Team, bardienstcoördinator en teamdienst-shifts (ochtend / middag / avond)',
      'Account activeren of deactiveren',
      'CSV importeren (naam;email;telefoon;team;rol;verplichting) — teams moeten al bestaan',
    ],
  },
  beheerDiensten: {
    purpose:
      'Handmatig bardiensten toevoegen of aanpassen, ook in het verleden. Zo kun je een handmatig gemaakt rooster alsnog laten meetellen.',
    actions: [
      'Bardienst toevoegen (ook historische datums)',
      'Bezetting en tijden wijzigen',
      'Personen op een dienst zetten of eraf halen (beheer-override)',
    ],
  },
  beheerPlanning: {
    purpose:
      'Hier maak je de barplanning in 4 stappen: diensten aanmaken → publiceren → verplichte mensen automatisch inschrijven → officieel vastzetten.',
    actions: [
      'Stap 1: Kies de periode en maak diensten aan (inclusief jeugd-teamdiensten)',
      'Stap 2: Concept publiceren (vrijwilligers mogen inschrijven tot de deadline)',
      'Stap 3: Vul open vrijwilligersplekken — teamplekken vult de bardienstcoördinator',
      'Stap 4: Maak officieel (vergrendelt de gekozen periode)',
    ],
  },
  beheerRegels: {
    purpose:
      'Dagen, tijden, aantallen en voorwaarden van diensten zijn configureerbaar. De barcommissie past regels aan zonder ontwikkelaar.',
    actions: [
      'Deze regels zijn de standaard van elk rooster; je hoeft ze niet opnieuw in te voeren',
      'Optioneel: regels opnieuw toepassen op de gekozen planningsperiode',
      'Vrijdag-klaverjas en late keuken Lekkerkerk 1 zitten in de standaardregels',
    ],
  },
  beheerActiviteiten: {
    purpose:
      'Jaarplanning: klaverjasavonden, toernooien en andere activiteiten die diensten kunnen activeren.',
    actions: [
      'Activiteit met datum en type vastleggen',
      'Personen vooraf inplannen; die namen blijven staan bij het bijwerken',
      'Valt de activiteit in de planningsperiode, dan ontstaan bijbehorende diensten',
    ],
  },
  beheerTeams: {
    purpose:
      'Teams en coördinatoren beheren. Per team stel je de wedstrijdduur in (voor de buffer na de wedstrijd).',
    actions: [
      'Team aanmaken en coördinator koppelen',
      'Wedstrijdduur in minuten instellen (standaard 90)',
      'Als teamcoördinator: leden op open diensten inschrijven',
    ],
  },
  wedstrijden: {
    purpose:
      'Alle clubwedstrijden in één overzicht. Filter op datum, team, wedstrijdnummer of spelniveau. Standaard zie je alleen komende wedstrijden.',
    actions: [
      'Filteren op datum, team, wedstrijdnummer of spelniveau',
      'Ook gespeelde wedstrijden tonen via “Toon alle wedstrijden”',
      'Als beheerder: KNVB-bestand importeren; ontbrekende jeugdteams worden automatisch aangemaakt',
    ],
  },
  beheerMail: {
    purpose:
      'SMTP-mailserver aansluiten zodat uitnodigingen en planningsmails automatisch verstuurd worden.',
    actions: [
      'Host, poort en inloggegevens van je mailprovider invullen',
      'Testmail sturen om te controleren of het werkt',
      'Zonder SMTP kun je uitnodigingslinks nog steeds kopiëren',
    ],
  },
  teams: {
    purpose:
      'Jouw team(s): leden/ouders, hoe vaak ze al hebben gestaan, komende wedstrijden en teamdiensten. Vul ouders in op naam (geen e-mail nodig).',
    actions: [
      'Voeg een ouder toe met alleen de naam',
      'Zie wie al heeft gestaan en hoe vaak',
      'Zet een ouder op een open teamdienst-plek',
    ],
  },
  beheerClub: {
    purpose:
      'Seizoen, AVG-bewaartermijnen en hosting. Rollover archiveert teamkoppelingen; roosterhistorie blijft.',
    actions: [
      'Huidig seizoen (1 augustus t/m 31 juli) controleren',
      'Nieuw seizoen starten (teamkoppelingen archiveren)',
      'AVG-opschonen: oude auditlogs en contact van gedeactiveerde accounts',
    ],
  },
  privacy: {
    purpose:
      'Wat we bewaren en hoe lang: planning uitvoeren, geen push of WhatsApp. Contact van inactieve accounts na 24 maanden weg.',
    actions: [
      'Lees de bewaartermijnen',
      'Download je gegevens via Inschrijven → Gegevens downloaden (Excel) als je bent ingelogd',
    ],
  },
  uitnodigen: {
    purpose:
      'Nodig ouders of vrijwilligers uit per e-mail. Zij maken zelf een account via de link.',
    actions: [
      'Naam en e-mail invullen',
      'Uitnodiging versturen of de link kopiëren',
      'Openstaande uitnodigingen opnieuw versturen',
    ],
  },
  login: {
    purpose:
      'Log in met je e-mailadres en wachtwoord om je in te schrijven voor diensten of (als beheerder) het rooster te beheren.',
    actions: [
      'Inloggen met je clubaccount',
      'Wachtwoord vergeten? Vraag een resetlink aan',
      'Nog geen account? Gebruik de uitnodigingslink uit je e-mail',
    ],
  },
  wachtwoordVergeten: {
    purpose:
      'Vraag een veilige link aan om je wachtwoord opnieuw in te stellen. Om privacyredenen zie je altijd hetzelfde bevestigingsbericht.',
    actions: [
      'Vul het e-mailadres van je account in',
      'Open de link in de mail (24 uur geldig)',
      'Terug naar inloggen als je je wachtwoord weer weet',
    ],
  },
  wachtwoordReset: {
    purpose: 'Kies hier een nieuw wachtwoord voor je VVL Planning-account.',
    actions: [
      'Kies een wachtwoord van minstens 8 tekens',
      'Bevestig en log daarna opnieuw in',
    ],
  },
  uitnodiging: {
    purpose:
      'Je bent uitgenodigd voor de VVL Planning App. Maak hier je account af met een wachtwoord.',
    actions: [
      'Controleer je naam en rol',
      'Kies een wachtwoord (minstens 8 tekens)',
      'Daarna kun je meteen inloggen en je inschrijven',
    ],
  },
};

export function helpForBeheerTab(tab, mode = 'full') {
  if (mode === 'teams') return PAGE_HELP.teams;
  if (mode === 'invite') return PAGE_HELP.uitnodigen;
  const map = {
    personen: PAGE_HELP.beheerPersonen,
    diensten: PAGE_HELP.beheerDiensten,
    planning: PAGE_HELP.beheerPlanning,
    ruilen: PAGE_HELP.beheerRuilen,
    regels: PAGE_HELP.beheerRegels,
    activiteiten: PAGE_HELP.beheerActiviteiten,
    teams: PAGE_HELP.beheerTeams,
    mail: PAGE_HELP.beheerMail,
    club: PAGE_HELP.beheerClub,
  };
  return map[tab] || PAGE_HELP.beheer;
}
