/** Inschrijvingen die deze persoon zelf mag beëindigen (zichzelf en gekoppelde kinderen). */
export function unenrollActions(enrollments, personIds) {
  const ids = new Set((personIds || []).map((id) => Number(id)).filter((id) => id > 0));
  return (enrollments || [])
    .filter((row) => ids.has(Number(row.personId)))
    .map((row) => {
      const name = String(row.person?.name || '').trim();
      return {
        enrollmentId: row.id,
        personId: Number(row.personId),
        name,
        label: name ? `Uitschrijven ${name}` : 'Uitschrijven',
      };
    });
}
