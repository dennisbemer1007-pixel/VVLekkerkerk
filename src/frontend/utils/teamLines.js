/** Eén regel per teamplek: teamnaam zolang de coördinator geen naam heeft gezet. */
export function teamSpotLines(service) {
  const duties = service?.teamDuties || [];
  const named = (service?.enrollments || []).filter((row) => row.kind === 'TEAM' && !row.noShow);
  const lines = [];
  for (const duty of duties) {
    const teamId = Number(duty.teamId ?? duty.team?.id);
    const teamName = duty.team?.name || 'Team';
    const reserved = Math.max(1, Number(duty.reserved) || 1);
    const forTeam = named.filter((row) => Number(row.forTeamId || row.forTeam?.id) === teamId);
    for (let index = 0; index < reserved; index += 1) {
      const enrollment = forTeam[index];
      if (enrollment) {
        lines.push({
          key: `naam-${enrollment.id}`,
          label: enrollment.person?.name || 'Naam',
          team: false,
          enrollment,
        });
      } else {
        lines.push({
          key: `team-${duty.id || teamId}-${index}`,
          label: teamName,
          team: true,
          enrollment: null,
        });
      }
    }
  }
  return lines;
}

export function occupancyFraction(service) {
  const filled = service?.enrolled ?? (service?.enrollments || []).filter((row) => !row.noShow).length;
  const needed = service?.required ?? 0;
  return `${filled}/${needed}`;
}

/** Namen op het rooster: vrijwilligers plus teamplek (teamnaam of ouder). */
export function rosterSpotSummary(service) {
  const personal = (service?.enrollments || [])
    .filter((row) => row.kind !== 'TEAM' && !row.noShow)
    .map((row) => row.person?.name)
    .filter(Boolean);
  const team = teamSpotLines(service).map((line) => line.label);
  return [...personal, ...team];
}
