/** Hulpteksten per pagina / beheer-tab */

export const PAGE_HELP = {
  dashboard: {
    purpose:
      'Dit is je startscherm. Je ziet in één oogopslag hoe vol de bardiensten zijn, en je gaat snel naar inschrijven of planning.',
    actions: [
      'Bekijk bezetting van bardiensten (groen = vol, geel = nog 1 nodig, rood = open)',
      'Open snelle knoppen naar Inschrijven, Planning of Beheer',
      'Als beheerder: zie wie vaak heeft gestaan en wie zich niet zelf inschrijft',
    ],
  },
  inschrijven: {
    purpose:
      'Hier schrijf je jezelf in of uit voor open bardiensten. Zo vullen we het rooster samen.',
    actions: [
      'Filter op open diensten, deze week, vandaag of jouw diensten',
      'Schrijf je in op een dienst met nog plek',
      'Schrijf je uit zolang de vrijwilligersfase open is',
    ],
  },
  planning: {
    purpose:
      'Overzicht van de komende weken: wie staat wanneer. Handig om te checken en om een PDF voor de kantine te printen.',
    actions: [
      'Bekijk alle diensten in de periode (ongeveer 6 weken)',
      'Filter op open of jouw diensten',
      'Als beheerder: Update om de planning gelijk te trekken met thuiswedstrijden',
      'Download het PDF-rooster (zelfde tijdsblokken ma–zo) voor in de kantine',
    ],
  },
  voorkeuren: {
    purpose:
      'Geef aan wanneer je niet kunt staan en welke dagdelen je voorkeur hebben. De planning gebruikt dit bij het automatisch vullen van open plekken.',
    actions: [
      'Vink vaste weekdagen af waarop je niet beschikbaar bent',
      'Kies optioneel voorkeur voor ochtend, middag of avond',
      'Sla op zodat beheer en auto-invulling hiermee rekening houden',
    ],
  },
  beheer: {
    purpose:
      'Volledig beheer van vrijwilligers, diensten, teams, wedstrijden en de planningsronde. Alleen voor coördinator en bestuur.',
    actions: [
      'Personen uitnodigen en rollen/verplichtingen instellen',
      'Diensten toevoegen of historiek nabouwen',
      'Concept-planning maken, publiceren en open plekken vullen',
      'Wedstrijden bekijken en importeren, e-mailserver instellen',
    ],
  },
  beheerPersonen: {
    purpose:
      'Beheer wie meedoet: uitnodigen, rol, team en bardienst-verplichting. Zo weet de app wie vrijwillig meedoet en wie verplicht is.',
    actions: [
      'Nieuwe mensen uitnodigen per e-mail',
      'Rol en verplichting (geen / half / volledig) instellen',
      'Team, beschikbaarheid en voorkeuren beheren',
      'Account activeren of deactiveren',
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
      'De planningsronde: voorstel uit wedstrijden, publiceren voor vrijwilligers, mailen, en daarna open plekken vullen met verplichte bardienst.',
    actions: [
      'Planning bijwerken: ochtend/middag/avond uit thuiswedstrijden, overige diensten verwijderen',
      'Publiceren en vrijwilligersfase openen',
      'Mails sturen en open plekken automatisch vullen',
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
      'Als beheerder: KNVB-bestand importeren; thuiswedstrijden vullen ochtend-, middag- of avonddienst',
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
      'Jouw team: schrijf ouders of teamleden in op open bardiensten namens je team.',
    actions: [
      'Open diensten bekijken',
      'Een teamlid of ouder op een dienst inschrijven',
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
    teams: PAGE_HELP.beheerTeams,
    mail: PAGE_HELP.beheerMail,
  };
  return map[tab] || PAGE_HELP.beheer;
}
