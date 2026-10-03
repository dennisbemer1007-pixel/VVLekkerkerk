import crypto from 'crypto';
import { createEmpty, createExample, normalizeTournament, present, buildShifts } from '../../frontend/toernooi/engine.js';
import { parseMatchDateInput } from './authz.js';
import prisma from './prisma.js';
import { getClubSettings } from './season.js';

const include = {
  fields: { orderBy: { sortOrder: 'asc' } },
  poules: { orderBy: { sortOrder: 'asc' } },
  teams: { orderBy: { sortOrder: 'asc' } },
  matches: true,
};

function parseJson(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function tournamentsEnabled() {
  const settings = await getClubSettings();
  return Boolean(settings.tournamentsEnabled);
}

export function stateFromRow(row) {
  const scores = {};
  const manualReferees = {};
  for (const match of row.matches) {
    if (match.played) {
      scores[match.engineKey] = {
        played: true,
        home: match.scoreHome,
        away: match.scoreAway,
        penalties: match.penaltiesTeamKey || null,
      };
    }
    if (row.refereeMode === 'manual' && match.refereeKey) {
      manualReferees[match.engineKey] = match.refereeKey;
    }
  }
  return normalizeTournament({
    name: row.name,
    date: row.date,
    startTime: row.startTime,
    endTime: row.endTime,
    matchMinutes: row.matchMinutes,
    changeoverMinutes: row.changeoverMinutes,
    breakEnabled: row.breakEnabled,
    breakStart: row.breakStart,
    breakMinutes: row.breakMinutes,
    format: row.format,
    advance: row.advance,
    categoryMode: row.categoryMode,
    refereeMode: row.refereeMode,
    barShifts: row.barShifts,
    kitchenShifts: row.kitchenShifts,
    fields: row.fields.map((field) => ({
      id: field.key,
      name: field.name,
      split: field.split,
      partNames: parseJson(field.partNames),
    })),
    poules: row.poules.map((poule) => ({
      id: poule.key,
      name: poule.name,
      category: poule.category,
    })),
    teams: row.teams.map((team) => ({
      id: team.key,
      name: team.name,
      category: team.category,
      pouleId: team.pouleKey,
    })),
    manualReferees,
    scores,
  });
}

function editorPayload(row) {
  const state = stateFromRow(row);
  return {
    id: row.id,
    publicToken: row.publicToken,
    state,
    view: present(state),
  };
}

export async function loadTournament(id) {
  const row = await prisma.tournament.findUnique({ where: { id: Number(id) }, include });
  if (!row) return null;
  return editorPayload(row);
}

export async function listTournaments() {
  const rows = await prisma.tournament.findMany({
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, date: true, publicToken: true, updatedAt: true },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    date: row.date,
    publicToken: row.publicToken,
    updatedAt: row.updatedAt,
  }));
}

function matchData(match) {
  const score = match.score;
  return {
    phase: match.phase || 'poule',
    category: match.category || '',
    pouleKey: match.pouleId || '',
    round: Number(match.round) || 0,
    roundLabel: match.roundLabel || '',
    slotIndex: match.slotIndex == null ? null : Number(match.slotIndex),
    partKey: match.partId || '',
    homeKey: match.homeId || '',
    awayKey: match.awayId || '',
    homeLabel: match.homeLabel || '',
    awayLabel: match.awayLabel || '',
    refereeKey: match.refereeId || '',
    played: Boolean(score?.played),
    scoreHome: score?.played ? Number(score.home) || 0 : 0,
    scoreAway: score?.played ? Number(score.away) || 0 : 0,
    penaltiesTeamKey: score?.penalties || '',
  };
}

async function replaceKeyed(tx, model, tournamentId, rows) {
  const keys = rows.map((row) => row.key);
  if (!keys.length) {
    await tx[model].deleteMany({ where: { tournamentId } });
  } else {
    await tx[model].deleteMany({ where: { tournamentId, key: { notIn: keys } } });
  }
  for (const [index, row] of rows.entries()) {
    const { key, ...data } = row;
    await tx[model].upsert({
      where: { tournamentId_key: { tournamentId, key } },
      create: { tournamentId, key, sortOrder: index, ...data },
      update: { sortOrder: index, ...data },
    });
  }
}

async function replaceMatches(tx, tournamentId, matches) {
  const keys = matches.map((match) => match.id);
  if (!keys.length) {
    await tx.tournamentMatch.deleteMany({ where: { tournamentId } });
  } else {
    await tx.tournamentMatch.deleteMany({ where: { tournamentId, engineKey: { notIn: keys } } });
  }
  for (const match of matches) {
    const data = matchData(match);
    await tx.tournamentMatch.upsert({
      where: { tournamentId_engineKey: { tournamentId, engineKey: match.id } },
      create: { tournamentId, engineKey: match.id, ...data },
      update: data,
    });
  }
}

async function syncShifts(tx, tournamentId, state) {
  const blocks = buildShifts(state);
  const existing = await tx.service.findMany({ where: { tournamentId } });
  const wanted = new Set(blocks.map((block) => block.id));
  const remove = existing.filter((service) => !wanted.has(service.tournamentShiftKey)).map((service) => service.id);
  if (remove.length) {
    await tx.enrollment.deleteMany({ where: { serviceId: { in: remove } } });
    await tx.serviceTeamDuty.deleteMany({ where: { serviceId: { in: remove } } });
    await tx.service.deleteMany({ where: { id: { in: remove } } });
  }
  const date = parseMatchDateInput(state.date) || parseMatchDateInput(new Date());
  for (const block of blocks) {
    const data = {
      type: block.kind === 'bar' ? 'BAR' : 'KITCHEN',
      date,
      time: `${block.start} - ${block.end}`,
      location: state.name || 'Toernooi',
      required: 2,
      active: true,
      draft: false,
      locked: false,
      kind: 'PERSONAL',
      origin: 'MANUAL',
      slot: 'EXTRA',
      note: block.name,
      tournamentId,
      tournamentShiftKey: block.id,
    };
    const found = existing.find((service) => service.tournamentShiftKey === block.id);
    if (found) await tx.service.update({ where: { id: found.id }, data });
    else await tx.service.create({ data });
  }
}

async function writeState(tx, id, state, view) {
  await tx.tournament.update({
    where: { id },
    data: {
      name: state.name,
      date: state.date,
      startTime: state.startTime,
      endTime: state.endTime,
      matchMinutes: state.matchMinutes,
      changeoverMinutes: state.changeoverMinutes,
      breakEnabled: state.breakEnabled,
      breakStart: state.breakStart,
      breakMinutes: state.breakMinutes,
      format: state.format,
      advance: state.advance,
      categoryMode: state.categoryMode,
      refereeMode: state.refereeMode,
      barShifts: state.barShifts,
      kitchenShifts: state.kitchenShifts,
    },
  });
  await replaceKeyed(
    tx,
    'tournamentField',
    id,
    state.fields.map((field) => ({
      key: field.id,
      name: field.name,
      split: field.split,
      partNames: JSON.stringify(field.partNames || {}),
    })),
  );
  await replaceKeyed(
    tx,
    'tournamentPoule',
    id,
    (state.poules || []).map((poule) => ({
      key: poule.id,
      name: poule.name,
      category: poule.category,
    })),
  );
  await replaceKeyed(
    tx,
    'tournamentTeam',
    id,
    state.teams.map((team) => ({
      key: team.id,
      name: team.name,
      category: team.category,
      pouleKey: team.pouleId || '',
    })),
  );
  await replaceMatches(tx, id, view.matches);
  await syncShifts(tx, id, state);
}

export async function saveTournament(id, input) {
  const numeric = Number(id);
  const existing = await prisma.tournament.findUnique({ where: { id: numeric } });
  if (!existing) return null;
  const state = normalizeTournament(input);
  const view = present(state);
  await prisma.$transaction(async (tx) => {
    await writeState(tx, numeric, state, view);
  });
  return loadTournament(numeric);
}

export async function createTournament(seed) {
  const state = seed === 'example' ? createExample() : createEmpty();
  const created = await prisma.tournament.create({
    data: {
      name: state.name,
      date: state.date,
      publicToken: crypto.randomBytes(18).toString('base64url'),
    },
  });
  return saveTournament(created.id, state);
}

export async function applyScore(id, body) {
  const loaded = await loadTournament(id);
  if (!loaded) return null;
  const key = String(body?.engineKey || '');
  if (!key) {
    const err = new Error('Wedstrijd ontbreekt');
    err.status = 400;
    throw err;
  }
  const scores = { ...loaded.state.scores };
  if (body.played === false) delete scores[key];
  else {
    scores[key] = {
      played: true,
      home: Math.max(0, Number(body.home) || 0),
      away: Math.max(0, Number(body.away) || 0),
      penalties: body.penaltiesTeamKey || body.penalties || null,
    };
  }
  return saveTournament(id, { ...loaded.state, scores });
}

export async function deleteTournament(id) {
  const numeric = Number(id);
  const existing = await prisma.tournament.findUnique({ where: { id: numeric }, select: { id: true } });
  if (!existing) return false;
  const services = await prisma.service.findMany({ where: { tournamentId: numeric }, select: { id: true } });
  const serviceIds = services.map((service) => service.id);
  await prisma.$transaction(async (tx) => {
    if (serviceIds.length) {
      await tx.enrollment.deleteMany({ where: { serviceId: { in: serviceIds } } });
      await tx.serviceTeamDuty.deleteMany({ where: { serviceId: { in: serviceIds } } });
      await tx.service.deleteMany({ where: { id: { in: serviceIds } } });
    }
    await tx.tournament.delete({ where: { id: numeric } });
  });
  return true;
}

export async function loadPublic(token) {
  const row = await prisma.tournament.findUnique({ where: { publicToken: String(token || '') }, include });
  if (!row) return null;
  const state = stateFromRow(row);
  return {
    name: state.name,
    date: state.date,
    view: present(state),
  };
}
