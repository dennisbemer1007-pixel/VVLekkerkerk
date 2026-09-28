/** Keuzes voor de popup "Voor wie schrijf je in?". */
export function voorWieChoices(user, linked = []) {
  const choices = [];
  if (user?.id) {
    choices.push({
      id: user.id,
      name: user.name || 'Jezelf',
      label: 'Jezelf',
    });
  }
  for (const person of linked || []) {
    if (!person?.id || person.id === user?.id) continue;
    choices.push({
      id: person.id,
      name: person.name,
      label: person.name,
    });
  }
  return choices;
}

export function needsVoorWiePopup(choices) {
  return (choices || []).length > 1;
}
