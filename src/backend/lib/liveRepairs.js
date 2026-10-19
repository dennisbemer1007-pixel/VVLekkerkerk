import {
  buildTeamIndex,
  findTeamInIndex,
  isBareSeniorClubTeam,
  stripWeekendSuffix,
} from './knvbTeams.js';
import { defaultTeamFunctions } from './teamFunctions.js';
import { youthGender, youthTeamAliasKey } from './youthTeams.js';
import { toIsoDate } from './dates.js';
import { isStrayMidnightBarRule, isStrayMidnightBarService } from './clubDefaults.js';

/**
 * Kies welk JO/O-dubbelteam blijft: meeste leden, dan teamdienst aan, dan JO-naam, dan laagste id.
 * (Meiden/MO zitten niet in dezelfde alias-groep.)
 */
export function pickCanonicalYouthDuplicate(teams) {
  const list = (teams || []).filter((t) => t && t.active !== false);
  if (list.length < 2) return list[0] || null;
  return [...list].sort((a, b) => {
    const membersA = Number(a._count?.members ?? a.memberCount ?? 0);
    const membersB = Number(b._count?.members ?? b.memberCount ?? 0);
    if (membersA !== membersB) return membersB - membersA;
    const dutyA = a.teamDutyUse ? 1 : 0;
    const dutyB = b.teamDutyUse ? 1 : 0;
    if (dutyA !== dutyB) return dutyB - dutyA;
    const joA = /^JO/i.test(a.name) ? 1 : 0;
    const joB = /^JO/i.test(b.name) ? 1 : 0;
    if (joA !== joB) return joB - joA;
    return Number(a.id) - Number(b.id);
  })[0];
}

function restoreYouthTeamData(originalName) {
  const fn = defaultTeamFunctions(originalName);
  return {
    active: true,
    name: originalName,
    teamDutyUse: fn.teamDutyUse,
    teamDutySlots: JSON.stringify(fn.teamDutySlots),
    functionsConfigured: true,
  };
}

/**
 * #59 aliaste MO15-1 per ongeluk naar O15-1 en merge-de meiden met jongens.
 * Zet die merges terug: jongens-wedstrijden horen niet op MO-teams.
 */
export async function repairMoOWrongMerges(prisma) {
  const teams = await prisma.team.findMany({
    include: { _count: { select: { matches: true } } },
  });
  const moves = [];

  for (const team of teams) {
    const parsed = String(team.name).match(/^(.*?)\s*\(import-dubbel\s+([^)]+)\)\s*$/i);
    if (!parsed) continue;
    const originalName = parsed[1].trim();
    const key = parsed[2].trim().toUpperCase();
    const origGender = youthGender(originalName);
    if (!origGender) continue;
    // Foute alias gebruikte altijd een O…-key (MO werd als O opgeslagen).
    if (!/^O\d/i.test(key)) continue;

    const num = key.slice(1);

    if (origGender === 'girls') {
      if (team.active !== false) continue;
      await prisma.team.update({ where: { id: team.id }, data: restoreYouthTeamData(originalName) });
      moves.push({ action: 'restore-girls', id: team.id, name: originalName, key });
      continue;
    }

    // Jongensteam was weggegomd onder O-key; haal wedstrijden terug van MO-twin.
    const moTwin = teams.find(
      (t) => t.active !== false && youthTeamAliasKey(t.name) === `MO${num}`,
    );
    await prisma.team.update({ where: { id: team.id }, data: restoreYouthTeamData(originalName) });
    let movedMatches = 0;
    let movedDuties = 0;
    if (moTwin) {
      const matchResult = await prisma.match.updateMany({
        where: { teamId: moTwin.id },
        data: { teamId: team.id },
      });
      movedMatches = matchResult.count;
      const duties = await prisma.serviceTeamDuty.findMany({
        where: { teamId: moTwin.id },
        include: {
          service: { include: { enrollments: { where: { noShow: false }, select: { id: true } } } },
        },
      });
      for (const duty of duties) {
        if ((duty.service?.enrollments || []).length) continue;
        if (duty.service?.locked || duty.service?.teamDutiesManual) continue;
        await prisma.serviceTeamDuty.update({
          where: { id: duty.id },
          data: { teamId: team.id },
        });
        movedDuties += 1;
      }
    }
    moves.push({
      action: 'restore-boys-from-mo',
      id: team.id,
      name: originalName,
      moTwinId: moTwin?.id || null,
      moTwinName: moTwin?.name || null,
      movedMatches,
      movedDuties,
      key,
    });
  }

  // Wedstrijden op MO met jongens-tegenstander → terug naar O (maak O aan indien nodig).
  const active = await prisma.team.findMany({
    where: { active: { not: false } },
    include: { _count: { select: { matches: true } } },
  });
  for (const girls of active) {
    if (youthGender(girls.name) !== 'girls') continue;
    const gKey = youthTeamAliasKey(girls.name);
    if (!gKey?.startsWith('MO')) continue;
    const num = gKey.slice(2);
    const boysKey = `O${num}`;
    let boys = active.find((t) => youthTeamAliasKey(t.name) === boysKey);

    const onGirls = await prisma.match.findMany({
      where: { teamId: girls.id },
      select: { id: true, opponent: true },
    });
    if (!onGirls.length) continue;
    const hasGirlsOpponent = onGirls.some((m) => /\bMO\d/i.test(String(m.opponent || '')));
    // Jongens-tegenstander (O…) of — na foute #59-merge — alles zonder meiden-tegenstander.
    const moveIds = onGirls
      .filter((m) => {
        const opp = String(m.opponent || '');
        if (/\bMO\d/i.test(opp)) return false;
        if (/(?:^|[^A-Za-z])(?:J)?O\d/i.test(opp)) return true;
        return !hasGirlsOpponent;
      })
      .map((m) => m.id);
    if (!moveIds.length) continue;

    if (!boys) {
      const fn = defaultTeamFunctions(boysKey);
      boys = await prisma.team.create({
        data: {
          name: boysKey,
          availabilityUse: fn.availabilityUse,
          teamDutyUse: fn.teamDutyUse,
          teamDutySlots: JSON.stringify(fn.teamDutySlots),
          functionsConfigured: true,
          active: true,
        },
      });
      active.push({ ...boys, _count: { matches: 0 } });
      moves.push({ action: 'create-boys-sibling', id: boys.id, name: boys.name, from: girls.name });
    }

    let movedMatches = 0;
    for (const id of moveIds) {
      await prisma.match.update({ where: { id }, data: { teamId: boys.id } });
      movedMatches += 1;
    }
    const duties = await prisma.serviceTeamDuty.findMany({
      where: { teamId: girls.id },
      include: {
        service: { include: { enrollments: { where: { noShow: false }, select: { id: true } } } },
      },
    });
    let movedDuties = 0;
    for (const duty of duties) {
      if ((duty.service?.enrollments || []).length) continue;
      if (duty.service?.locked || duty.service?.teamDutiesManual) continue;
      await prisma.serviceTeamDuty.update({
        where: { id: duty.id },
        data: { teamId: boys.id },
      });
      movedDuties += 1;
    }
    moves.push({
      action: 'relink-mo-matches-to-boys',
      fromId: girls.id,
      from: girls.name,
      toId: boys.id,
      to: boys.name,
      movedMatches,
      movedDuties,
    });
  }

  return { repaired: moves.length, teams: moves };
}

/**
 * Dienstregels na za/zo-split: conditionTeamName "Lekkerkerk 1 (za/zo — controleer)",
 * inactief team, of conditionTeamId op de verkeerde weekend-variant (zo op een
 * zaterdagregel) → herstel naar de ploeg die bij de weekdag van de regel past.
 */
export async function repairSeniorConditionTeamRules(prisma) {
  const rules = await prisma.serviceRule.findMany({
    where: {
      OR: [
        { conditionType: 'HOME_MATCH_TEAM' },
        { conditionType: 'NO_HOME_MATCH_TEAM' },
      ],
    },
  });
  const teams = await prisma.team.findMany();
  const activeTeams = teams.filter((t) => t.active !== false);
  const index = buildTeamIndex(activeTeams);
  let updated = 0;
  const details = [];
  for (const rule of rules) {
    const nameRaw = rule.conditionTeamName || '';
    const needsNameCleanup = /\(za\/zo/i.test(nameRaw);
    const linked = rule.conditionTeamId
      ? teams.find((t) => t.id === rule.conditionTeamId)
      : null;
    const linkedDead = linked && linked.active === false;

    const cleaned =
      nameRaw
        .replace(/\s*\(za\/zo\s*[—–-]\s*controleer\)\s*$/i, '')
        .replace(/\s*\(oud-gecombineerd\)\s*$/i, '')
        .trim() ||
      String(linked?.name || '')
        .replace(/\s*\(oud-gecombineerd\)\s*$/i, '')
        .trim();
    if (!cleaned) continue;

    // Weekdag van de regel → za- of zo-variant (zaterdag-keuken mag niet op (zo) blijven).
    const preferDate =
      Number(rule.weekday) === 0
        ? new Date('2026-10-25T12:00:00')
        : new Date('2026-10-24T12:00:00');
    const preferred = findTeamInIndex(index, cleaned, { date: preferDate });
    const bareName = stripWeekendSuffix(cleaned);
    const wrongWeekend =
      preferred &&
      linked &&
      linked.active !== false &&
      linked.id !== preferred.id &&
      isBareSeniorClubTeam(bareName);

    if (!needsNameCleanup && !linkedDead && linked && !wrongWeekend) continue;

    const data = {
      conditionTeamName: bareName || cleaned,
      ...(preferred ? { conditionTeamId: preferred.id } : { conditionTeamId: null }),
    };
    if (
      data.conditionTeamName === rule.conditionTeamName &&
      data.conditionTeamId === rule.conditionTeamId
    ) {
      continue;
    }
    await prisma.serviceRule.update({ where: { id: rule.id }, data });
    updated += 1;
    details.push({
      id: rule.id,
      name: rule.name,
      from: rule.conditionTeamName,
      to: data.conditionTeamName,
      teamId: data.conditionTeamId,
      wrongWeekend: Boolean(wrongWeekend),
    });
  }
  return { updated, details };
}

/**
 * KNVB exporteert "O15-1", de app heeft vaak "JO15-1". Zonder merge spelen wedstrijden
 * op een leeg O-team terwijl ouders op JO staan — dan krijgt O16/O15-2 nooit teamdienst.
 * Meiden (MO…) worden hier nooit met jongens samengevoegd.
 */
export async function repairJoOYouthDuplicates(prisma) {
  const teams = await prisma.team.findMany({
    where: { active: { not: false } },
    include: { _count: { select: { members: true } } },
  });
  const byKey = new Map();
  for (const team of teams) {
    const key = youthTeamAliasKey(team.name);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(team);
  }

  const moves = [];
  for (const [key, group] of byKey) {
    if (group.length < 2) continue;
    const canonical = pickCanonicalYouthDuplicate(group);
    if (!canonical) continue;
    for (const team of group) {
      if (team.id === canonical.id) continue;

      const matches = await prisma.match.updateMany({
        where: { teamId: team.id },
        data: { teamId: canonical.id },
      });
      const duties = await prisma.serviceTeamDuty.updateMany({
        where: { teamId: team.id, service: { locked: false, teamDutiesManual: false } },
        data: { teamId: canonical.id },
      });
      const enrollments = await prisma.enrollment.updateMany({
        where: { forTeamId: team.id },
        data: { forTeamId: canonical.id },
      });
      const assignedServices = await prisma.service.updateMany({
        where: { assignedTeamId: team.id },
        data: { assignedTeamId: canonical.id },
      });
      const rules = await prisma.serviceRule.updateMany({
        where: { conditionTeamId: team.id },
        data: { conditionTeamId: canonical.id },
      });

      const memberships = await prisma.personTeam.findMany({ where: { teamId: team.id } });
      for (const row of memberships) {
        await prisma.personTeam
          .upsert({
            where: {
              personId_teamId_season: {
                personId: row.personId,
                teamId: canonical.id,
                season: row.season || '',
              },
            },
            create: {
              personId: row.personId,
              teamId: canonical.id,
              season: row.season || '',
              active: row.active !== false,
            },
            update: { active: true },
          })
          .catch(() => {});
        await prisma.personTeam
          .delete({
            where: {
              personId_teamId_season: {
                personId: row.personId,
                teamId: team.id,
                season: row.season || '',
              },
            },
          })
          .catch(() => {});
      }
      const persons = await prisma.person.updateMany({
        where: { teamId: team.id },
        data: { teamId: canonical.id },
      });

      // teamDutyTeamIds op dienstregels: vervang dubbel-id door canonieke id
      const dutyRules = await prisma.serviceRule.findMany({
        where: { teamDutyTeamIds: { not: '[]' } },
        select: { id: true, teamDutyTeamIds: true },
      });
      for (const rule of dutyRules) {
        let ids = [];
        try {
          ids = JSON.parse(rule.teamDutyTeamIds || '[]');
        } catch {
          ids = [];
        }
        if (!Array.isArray(ids) || !ids.map(Number).includes(Number(team.id))) continue;
        const next = [
          ...new Set(
            ids
              .map(Number)
              .filter((id) => id !== Number(team.id))
              .concat(Number(canonical.id)),
          ),
        ];
        await prisma.serviceRule.update({
          where: { id: rule.id },
          data: { teamDutyTeamIds: JSON.stringify(next) },
        });
      }

      await prisma.team.update({
        where: { id: team.id },
        data: {
          active: false,
          name: `${team.name} (import-dubbel ${key})`,
          teamDutyUse: false,
        },
      });

      moves.push({
        key,
        from: team.name,
        to: canonical.name,
        fromId: team.id,
        toId: canonical.id,
        matches: matches.count,
        duties: duties.count,
        enrollments: enrollments.count,
        assignedServices: assignedServices.count,
        rules: rules.count,
        memberships: memberships.length,
        persons: persons.count,
      });
    }
  }

  return { merged: moves.length, teams: moves };
}

/**
 * Import maakte “Lekkerkerk 1 (za)” naast het bestaande “Lekkerkerk 1”.
 * Zolang het ongesplitste team nog actief is, horen wedstrijden en mensen bij dat team.
 * Bewust gesplitste za/zo-teams (origineel heet dan … (oud-gecombineerd)) blijven staan.
 */
export async function repairAccidentalWeekendTeams(prisma) {
  const teams = await prisma.team.findMany();
  const activeByName = new Map(teams.filter((t) => t.active !== false).map((t) => [t.name, t]));
  const moves = [];

  for (const team of teams) {
    if (team.active === false) continue;
    if (!/\((za|zo)\)$/i.test(team.name)) continue;
    const bare = stripWeekendSuffix(team.name);
    if (!bare || bare === team.name) continue;
    const canonical = activeByName.get(bare);
    if (!canonical || canonical.id === team.id) continue;

    const matches = await prisma.match.updateMany({ where: { teamId: team.id }, data: { teamId: canonical.id } });
    const duties = await prisma.serviceTeamDuty.updateMany({
      where: { teamId: team.id, service: { locked: false, teamDutiesManual: false } },
      data: { teamId: canonical.id },
    });
    const enrollments = await prisma.enrollment.updateMany({
      where: { forTeamId: team.id },
      data: { forTeamId: canonical.id },
    });
    const assignedServices = await prisma.service.updateMany({
      where: { assignedTeamId: team.id },
      data: { assignedTeamId: canonical.id },
    });
    const rules = await prisma.serviceRule.updateMany({
      where: { conditionTeamId: team.id },
      data: { conditionTeamId: canonical.id },
    });

    const memberships = await prisma.personTeam.findMany({ where: { teamId: team.id } });
    for (const row of memberships) {
      await prisma.personTeam.upsert({
        where: {
          personId_teamId_season: {
            personId: row.personId,
            teamId: canonical.id,
            season: row.season || '',
          },
        },
        create: {
          personId: row.personId,
          teamId: canonical.id,
          season: row.season || '',
          active: row.active !== false,
        },
        update: { active: true },
      });
      await prisma.personTeam.delete({
        where: {
          personId_teamId_season: {
            personId: row.personId,
            teamId: team.id,
            season: row.season || '',
          },
        },
      }).catch(() => {});
    }

    const persons = await prisma.person.updateMany({ where: { teamId: team.id }, data: { teamId: canonical.id } });
    await prisma.team.update({
      where: { id: team.id },
      data: { active: false, name: `${team.name} (import-dubbel)` },
    });
    activeByName.delete(team.name);
    moves.push({
      from: team.name,
      to: canonical.name,
      fromId: team.id,
      toId: canonical.id,
      matches: matches.count,
      duties: duties.count,
      enrollments: enrollments.count,
      assignedServices: assignedServices.count,
      rules: rules.count,
      memberships: memberships.length,
      persons: persons.count,
    });
  }

  const totals = moves.reduce(
    (acc, row) => ({
      matches: acc.matches + row.matches,
      duties: acc.duties + row.duties,
      enrollments: acc.enrollments + row.enrollments,
      assignedServices: acc.assignedServices + row.assignedServices,
      rules: acc.rules + row.rules,
      memberships: acc.memberships + row.memberships,
      persons: acc.persons + row.persons,
    }),
    { matches: 0, duties: 0, enrollments: 0, assignedServices: 0, rules: 0, memberships: 0, persons: 0 },
  );
  return { merged: moves.length, teams: moves, totals };
}

/**
 * Kinderen kregen het team van de ouder/coördinator. Ze horen daar niet als lid.
 * Alleen loskoppelen als het kind nog nooit een teamdienst voor dat team heeft gedaan.
 */
export async function unlinkGuardianCopiedTeam(prisma) {
  const children = await prisma.person.findMany({
    where: { guardianId: { not: null }, teamId: { not: null }, active: true },
    include: {
      guardian: { select: { id: true, name: true, teamId: true, team: { select: { name: true } } } },
      team: { select: { name: true } },
      enrollments: { where: { kind: 'TEAM', noShow: false }, select: { forTeamId: true } },
    },
  });
  const changed = [];
  for (const child of children) {
    const guardianTeamId = child.guardian?.teamId;
    if (!guardianTeamId || child.teamId !== guardianTeamId) continue;
    const stood = (child.enrollments || []).some((row) => Number(row.forTeamId) === Number(guardianTeamId));
    if (stood) continue;
    await prisma.person.update({ where: { id: child.id }, data: { teamId: null } });
    const links = await prisma.personTeam.deleteMany({ where: { personId: child.id, teamId: guardianTeamId } });
    changed.push({
      id: child.id,
      name: child.name,
      teamId: guardianTeamId,
      teamName: child.team?.name || child.guardian?.team?.name || null,
      guardianId: child.guardian?.id || null,
      guardianName: child.guardian?.name || null,
      membershipsRemoved: links.count,
    });
  }
  return { unlinked: changed.length, people: changed };
}

function isUtcSaturday(date) {
  const iso = toIsoDate(date);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return false;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)).getUTCDay() === 6;
}

/**
 * Verwijdert AUTO-bardiensten 19:30–00:00 zonder inschrijvingen.
 * Alleen als geen actieve zaterdagregel die tijden nog voorschrijft
 * (anders zet de backfill ze meteen terug). Handmatig en ingevuld blijven.
 */
export async function removeStrayMidnightBarServices(prisma) {
  const rules = await prisma.serviceRule.findMany({
    where: { active: true, type: 'BAR', weekday: 6 },
  });
  if (rules.some((rule) => isStrayMidnightBarRule(rule))) {
    return { removed: 0, skippedRuleActive: true };
  }

  const services = await prisma.service.findMany({
    where: { type: 'BAR', origin: 'AUTO' },
    include: { enrollments: { select: { id: true } } },
  });
  const removed = [];
  for (const service of services) {
    if (!isStrayMidnightBarService(service)) continue;
    if (!isUtcSaturday(service.date)) continue;
    await prisma.service.delete({ where: { id: service.id } });
    removed.push({ id: service.id, date: toIsoDate(service.date), time: service.time });
  }
  return { removed: removed.length, services: removed, skippedRuleActive: false };
}

export { deactivateDuplicateServices, deactivateOrphanAutoServices } from './serviceDedup.js';

