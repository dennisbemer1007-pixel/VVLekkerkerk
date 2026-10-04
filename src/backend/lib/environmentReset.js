import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveDataDir, sqliteFilePathFromUrl } from './dataDir.js';

const schemaDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../prisma');

/** Alleen dit woord (na trim, hoofdletters negeren) start het wissen. */
export const CONFIRM_WORD = 'opschonen';

/**
 * Rollen die blijven. Bestuur en Coördinator zijn de oude namen voor Admin en Barcommissie.
 * Iedere andere rol (vrijwilliger, teamcoördinator, ouder, kind) gaat weg.
 */
export const KEPT_ROLES = ['Barcommissie', 'Admin', 'Bestuur', 'Coördinator'];

const MAIL_LOG_NAMES = new Set([
  'mail.log',
  'maillog.json',
  'maillog.txt',
  'mail-log.json',
  'mail-log.log',
]);

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function confirmWordOk(value) {
  return String(value ?? '').trim().toLowerCase() === CONFIRM_WORD;
}

export function resolveSqliteFilePath(url = process.env.DATABASE_URL) {
  let file = sqliteFilePathFromUrl(url);
  if (!file) return null;
  if (path.isAbsolute(file)) return file;
  const fromSchema = path.resolve(schemaDir, file);
  const fromCwd = path.resolve(process.cwd(), file);
  if (fs.existsSync(fromSchema)) return fromSchema;
  if (fs.existsSync(fromCwd)) return fromCwd;
  return fromSchema;
}

/** Het bestand dat deze Prisma-verbinding echt open heeft. */
export async function connectedSqliteFile(db) {
  try {
    const rows = await db.$queryRawUnsafe('PRAGMA database_list');
    const main = (rows || []).find((row) => row.name === 'main') || rows?.[0];
    if (main?.file) return main.file;
  } catch {
    /* val terug op het pad uit DATABASE_URL */
  }
  return resolveSqliteFilePath();
}

export function backupDirectoryFor(dbPath) {
  return resolveDataDir() || (dbPath ? path.dirname(dbPath) : null);
}

function mailLogDirectories(dbPath, destDir) {
  const dirs = new Set();
  const dataDir = resolveDataDir();
  if (dataDir) dirs.add(dataDir);
  if (dbPath) dirs.add(path.dirname(dbPath));
  if (destDir) dirs.add(destDir);
  return [...dirs];
}

export function countMailLogFiles(dirs) {
  let count = 0;
  for (const dir of dirs) {
    if (!dir || !fs.existsSync(dir)) continue;
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (MAIL_LOG_NAMES.has(String(name).toLowerCase())) count += 1;
    }
  }
  return count;
}

function removeMailLogFiles(dirs) {
  let count = 0;
  for (const dir of dirs) {
    if (!dir || !fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!MAIL_LOG_NAMES.has(String(name).toLowerCase())) continue;
      fs.unlinkSync(path.join(dir, name));
      count += 1;
    }
  }
  return count;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function assertBackupNonEmpty(dest) {
  let size = 0;
  try {
    size = fs.statSync(dest).size;
  } catch {
    size = 0;
  }
  if (!size) {
    try {
      fs.unlinkSync(dest);
    } catch {
      /* leeg of afwezig bestand hoeft niet te blijven staan */
    }
    throw httpError('Back-up mislukt: bestand is leeg', 500);
  }
}

/**
 * Consistente kopie van het SQLite-bestand, vóór elke wis-actie.
 * Mislukt dit, dan gooit de functie en is er nog niets gewist.
 */
export async function backupSqliteDatabase(db, { dbPath, destDir } = {}) {
  const source = dbPath || resolveSqliteFilePath();
  if (!source || !fs.existsSync(source)) {
    throw httpError('Geen databasebestand om te back-uppen', 500);
  }
  const dir = destDir || backupDirectoryFor(source);
  if (!dir) throw httpError('Geen map voor de back-up', 500);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    throw httpError(`Back-up mislukt: ${err.message}`, 500);
  }

  let filename = `vvl-opschonen-${stamp()}.db`;
  let dest = path.join(dir, filename);
  if (fs.existsSync(dest)) {
    filename = `vvl-opschonen-${stamp()}-${process.pid}.db`;
    dest = path.join(dir, filename);
  }

  const escaped = dest.replace(/'/g, "''");
  let vacuumOk = false;
  try {
    await db.$executeRawUnsafe(`VACUUM INTO '${escaped}'`);
    vacuumOk = true;
  } catch {
    try {
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
    } catch {
      /* volgende poging is een gewone kopie */
    }
    try {
      await db.$queryRawUnsafe('PRAGMA wal_checkpoint(FULL)');
    } catch {
      /* checkpoint is een extra, de kopie blijft de terugval */
    }
    try {
      fs.copyFileSync(source, dest);
      if (!vacuumOk) {
        for (const ext of ['-wal', '-shm']) {
          const side = `${source}${ext}`;
          if (fs.existsSync(side)) fs.copyFileSync(side, `${dest}${ext}`);
        }
      }
    } catch (err) {
      try {
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
      } catch {
        /* niets achterlaten */
      }
      throw httpError(`Back-up mislukt: ${err.message}`, 500);
    }
  }

  assertBackupNonEmpty(dest);
  return { filename, path: dest, directory: dir };
}

async function planningResetCount(db) {
  const round = await db.planningRound.findUnique({ where: { id: 1 } });
  if (!round) return 0;
  const dirty =
    round.official ||
    round.fromDate ||
    round.toDate ||
    round.volunteerDeadline ||
    round.volunteerNotifiedAt ||
    round.mandatoryNotifiedAt ||
    round.publishedAt ||
    (round.status && round.status !== 'DRAFT');
  return dirty ? 1 : 0;
}

export async function previewEnvironmentReset(db, { dbPath, destDir } = {}) {
  const keptWhere = { role: { in: KEPT_ROLES } };
  const [
    diensten,
    inschrijvingen,
    ruilverzoeken,
    meldingen,
    noShows,
    afwezigheden,
    wedstrijden,
    links,
    personenWeg,
    personenBlijven,
    teams,
    dienstregels,
    activiteiten,
    mail,
    club,
    planningsrondes,
    toernooien,
  ] = await Promise.all([
    db.service.count(),
    db.enrollment.count(),
    db.swapRequest.count(),
    db.notification.count(),
    db.enrollment.count({ where: { noShow: true } }),
    db.personAbsence.count(),
    db.match.count(),
    db.person.count({
      where: {
        OR: [{ inviteToken: { not: null } }, { passwordResetToken: { not: null } }],
      },
    }),
    db.person.count({ where: { NOT: keptWhere } }),
    db.person.count({ where: keptWhere }),
    db.team.count(),
    db.serviceRule.count(),
    db.activity.count(),
    db.mailSettings.findUnique({ where: { id: 1 } }),
    db.clubSettings.findUnique({ where: { id: 1 } }),
    planningResetCount(db),
    db.tournament.count(),
  ]);

  const maillog = countMailLogFiles(mailLogDirectories(dbPath || resolveSqliteFilePath(), destDir));

  return {
    wissen: [
      { key: 'diensten', label: 'Diensten', count: diensten },
      { key: 'inschrijvingen', label: 'Inschrijvingen (ook kinderen / hoort bij)', count: inschrijvingen },
      { key: 'ruilverzoeken', label: 'Ruilverzoeken', count: ruilverzoeken },
      { key: 'meldingen', label: 'Meldingen', count: meldingen },
      { key: 'noShows', label: 'No-shows', count: noShows },
      { key: 'afwezigheden', label: 'Afwezigheden', count: afwezigheden },
      { key: 'planningsrondes', label: 'Planningsrondes en officiële roosters', count: planningsrondes },
      { key: 'wedstrijden', label: 'Wedstrijden (incl. KNVB-import)', count: wedstrijden },
      { key: 'links', label: 'Uitnodigings- en resetlinks', count: links },
      { key: 'maillog', label: 'Maillog', count: maillog },
      { key: 'personen', label: 'Personen zonder rol Barcommissie of Admin', count: personenWeg },
      { key: 'toernooien', label: 'Toernooien', count: toernooien },
    ],
    blijft: [
      { key: 'accounts', label: 'Barcommissie- en admin-accounts', count: personenBlijven },
      { key: 'teams', label: 'Teams (incl. speeltijden)', count: teams },
      { key: 'dienstregels', label: 'Dienstregels', count: dienstregels },
      { key: 'jaarplanning', label: 'Jaarplanning', count: activiteiten },
      { key: 'mailteksten', label: 'Mailteksten', count: mail ? 1 : 0 },
      { key: 'club', label: 'Clubgegevens en overige instellingen', count: club ? 1 : 0 },
    ],
  };
}

async function wipeInside(tx, { actorId, backupFilename }) {
  const kept = await tx.person.findMany({
    where: { role: { in: KEPT_ROLES } },
    select: { id: true },
  });
  const keptIds = kept.map((person) => person.id);
  const keptList = keptIds.length ? keptIds : [-1];

  const gewist = {
    diensten: await tx.service.count(),
    inschrijvingen: await tx.enrollment.count(),
    ruilverzoeken: await tx.swapRequest.count(),
    meldingen: await tx.notification.count(),
    noShows: await tx.enrollment.count({ where: { noShow: true } }),
    afwezigheden: await tx.personAbsence.count(),
    planningsrondes: await planningResetCount(tx),
    wedstrijden: await tx.match.count(),
    links: await tx.person.count({
      where: { OR: [{ inviteToken: { not: null } }, { passwordResetToken: { not: null } }] },
    }),
    personen: await tx.person.count({ where: { id: { notIn: keptList } } }),
  };

  await tx.refereeSwap.deleteMany();
  await tx.refereeAssignment.deleteMany();
  await tx.swapRequest.deleteMany();
  await tx.notification.deleteMany();
  await tx.enrollment.deleteMany();
  await tx.serviceTeamDuty.deleteMany();
  await tx.service.deleteMany();
  await tx.tournamentMatch.deleteMany();
  await tx.tournamentTeam.deleteMany();
  await tx.tournamentPoule.deleteMany();
  await tx.tournamentField.deleteMany();
  await tx.tournament.deleteMany();
  await tx.match.deleteMany();
  await tx.personAbsence.deleteMany();

  await tx.person.updateMany({
    where: {
      guardianId: { not: null },
      NOT: { guardianId: { in: keptList } },
    },
    data: { guardianId: null },
  });
  await tx.team.updateMany({
    where: {
      coordinatorId: { not: null },
      NOT: { coordinatorId: { in: keptList } },
    },
    data: { coordinatorId: null },
  });
  await tx.auditLog.updateMany({
    where: {
      actorId: { not: null },
      NOT: { actorId: { in: keptList } },
    },
    data: { actorId: null },
  });
  await tx.person.updateMany({
    where: { id: { in: keptList } },
    data: {
      inviteToken: null,
      inviteExpiresAt: null,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
    },
  });
  await tx.calendarFeed.deleteMany({
    where: { personId: { notIn: keptList } },
  });
  await tx.person.deleteMany({ where: { id: { notIn: keptList } } });

  await tx.planningRound.updateMany({ data: { active: false } });
  await tx.planningRound.deleteMany({ where: { id: { not: 1 } } });
  await tx.planningRound.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      label: 'Planning',
      status: 'DRAFT',
      official: false,
      active: true,
    },
    update: {
      label: 'Planning',
      fromDate: null,
      toDate: null,
      status: 'DRAFT',
      volunteerDeadline: null,
      volunteerNotifiedAt: null,
      mandatoryNotifiedAt: null,
      publishedAt: null,
      official: false,
      active: true,
    },
  });

  const detail = `backup ${backupFilename}; gewist ${JSON.stringify(gewist)}`.slice(0, 2000);
  await tx.auditLog.create({
    data: {
      actorId: actorId || null,
      action: 'environment.reset',
      entity: 'Environment',
      detail,
    },
  });

  return gewist;
}

export async function runEnvironmentReset(db, options = {}) {
  const { actorId = null, confirm, destDir, dbPath, failForTest = false } = options;
  if (!confirmWordOk(confirm)) {
    throw httpError('Typ OPSCHONEN om te bevestigen', 400);
  }

  const source = dbPath || (await connectedSqliteFile(db));
  const backup = await backupSqliteDatabase(db, { dbPath: source, destDir });

  let gewist;
  try {
    gewist = await db.$transaction(
      async (tx) => {
        const counts = await wipeInside(tx, { actorId, backupFilename: backup.filename });
        if (failForTest) {
          throw httpError('Opschonen afgebroken', 500);
        }
        return counts;
      },
      { timeout: 30000 },
    );
  } catch (err) {
    if (!err.status) err.status = 500;
    throw err;
  }

  let maillog = 0;
  let mailWarning = '';
  try {
    maillog = removeMailLogFiles(mailLogDirectories(source, backup.directory));
  } catch (err) {
    mailWarning = ` Maillog wissen mislukt: ${err.message}`;
  }
  gewist.maillog = maillog;

  const blijftPersonen = await db.person.count({ where: { role: { in: KEPT_ROLES } } });
  const message = `Omgeving opgeschoond. Gewist: ${gewist.diensten} diensten, ${gewist.inschrijvingen} inschrijvingen, ${gewist.ruilverzoeken} ruilverzoeken, ${gewist.meldingen} meldingen, ${gewist.afwezigheden} afwezigheden, ${gewist.wedstrijden} wedstrijden en ${gewist.personen} personen. Back-up: ${backup.filename}.${mailWarning}`;

  return {
    message,
    backup: backup.filename,
    backupPath: backup.path,
    gewist,
    blijft: { personen: blijftPersonen },
  };
}
