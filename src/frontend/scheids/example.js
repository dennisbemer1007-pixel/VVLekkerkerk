/** Voorbeelddata voor de scheidsrechter-mock. Niet gekoppeld aan de database. */

export const EXAMPLE_PEOPLE = [
  { email: 'anneke@vvl.demo', name: 'Anneke Mulder', teams: ['JO11-1'], levels: ['pupillen'] },
  { email: 'kevin@vvl.demo', name: 'Kevin de Boer', teams: ['JO11-1'], levels: ['pupillen'] },
  { email: 'lisa@vvl.demo', name: 'Lisa Bakker', teams: ['JO15-1'], levels: ['pupillen', 'junioren'] },
  { email: 'tom@vvl.demo', name: 'Tom van Dam', teams: ['JO15-1'], levels: [] },
  { email: 'sandra@vvl.demo', name: 'Sandra de Vries', teams: ['JO15-1'], levels: ['junioren'] },
  { email: 'fatima@vvl.demo', name: 'Fatima El Amrani', teams: ['JO13-2'], levels: ['junioren'] },
  { email: 'peter@vvl.demo', name: 'Peter Smit', teams: ['JO13-2'], levels: ['junioren'] },
  { email: 'noa@vvl.demo', name: 'Noa Visser', teams: ['Senioren 1'], levels: ['senioren'] },
  { email: 'erik@vvl.demo', name: 'Erik Hofman', teams: [], levels: ['pupillen', 'junioren', 'senioren'] },
  { email: 'mark@vvl.demo', name: 'Mark Jansen', teams: [], levels: [] },
];

export function upcomingSaturday(weeksAhead = 0, from = new Date()) {
  const date = new Date(from);
  date.setHours(12, 0, 0, 0);
  const add = (6 - date.getDay() + 7) % 7;
  const days = (add === 0 ? 7 : add) + weeksAhead * 7;
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function row(id, date, time, team, opponent, field, home = true) {
  return { id, date, time, team, opponent, field, home };
}

/** Thuiswedstrijden zoals na een KNVB-import, plus uitwedstrijden als blokkade. */
export function buildExampleMatches(from = new Date()) {
  const first = upcomingSaturday(0, from);
  const second = upcomingSaturday(1, from);
  const third = upcomingSaturday(2, from);
  return [
    row('a-jo8', first, '08:30', 'JO8-1', 'VV Lekdijk', 'Veld 1'),
    row('a-jo9', first, '08:30', 'JO9-1', 'SV Ouderkerk', 'Veld 2'),
    row('a-jo10', first, '08:30', 'JO10-1', 'VV Krimpenerwaard', 'Veld 3'),
    row('a-jo11', first, '09:30', 'JO11-1', 'SV Capelle', 'Veld 1'),
    row('a-jo12', first, '10:45', 'JO12-1', 'VV Berkenwoude', 'Veld 2'),
    row('a-mo11', first, '11:00', 'MO11-1', 'SV Bolnes', 'Veld 3'),
    row('a-jo13', first, '12:15', 'JO13-2', 'VV Ridderkerk', 'Veld 1'),
    row('a-jo15', first, '13:45', 'JO15-1', 'VV Krimpen', 'Veld 2'),
    row('a-sen1', first, '14:30', 'Senioren 1', 'VV Nieuwerkerk', 'Veld 3'),
    row('a-jo17', first, '15:15', 'JO17-1', 'VV Streefkerk', 'Veld 1'),
    row('a-sen2', first, '16:15', 'Senioren 2', 'ASWH', 'Veld 2'),
    row('a-jo12b', first, '16:45', 'JO12-2', 'VV Bergambacht', 'Veld 3'),

    row('b-jo11', second, '10:00', 'JO11-1', 'FC IJsselmonde', 'Veld 2'),
    row('b-mo12', second, '10:00', 'MO12-1', 'VV Haastrecht', 'Veld 1'),
    row('b-jo15-uit', second, '11:30', 'JO15-1', 'VV Bergambacht', '', false),
    row('b-jo13-uit', second, '11:30', 'JO13-2', 'SV Slikkerveer', '', false),
    row('b-jo19', second, '11:30', 'JO19-1', 'VV Streefkerk', 'Veld 1'),
    row('b-sen1-uit', second, '15:00', 'Senioren 1', 'RVVH', '', false),
    row('b-sen2', second, '15:00', 'Senioren 2', 'DCV', 'Veld 2'),

    row('c-jo12', third, '09:30', 'JO12-2', 'VV Lekkerkerk', 'Veld 1'),
    row('c-mo15', third, '13:00', 'MO15-1', 'VV Haastrecht', 'Veld 2'),
    row('c-jo13', third, '14:30', 'JO13-2', 'VV Krimpen', 'Veld 1'),
  ];
}

export function formatSlotDate(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  return date.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
}
