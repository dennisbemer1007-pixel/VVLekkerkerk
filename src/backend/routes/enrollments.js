import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';
import { isAdminRole, publicPersonBrief } from '../lib/roles.js';
import { teamIdsForActor } from '../lib/authz.js';
import { isMandatoryObligation } from '../lib/obligation.js';
import { blocksForPerson, overlappingMatchBlocks } from '../lib/matchBlocks.js';
import { writeAudit } from '../lib/audit.js';
import { addWeeks, endOfDay, startOfDay } from '../lib/dates.js';
import { pendingForEnrollment } from '../lib/swapQueries.js';
import { friendlyEnrollmentReason, serviceCapacity, teamDutyOpenForTeam } from '../lib/teamDutyPlanning.js';
import { personTeamIds } from '../lib/teamFunctions.js';
import { serviceInclude } from '../lib/serviceHelpers.js';

const router = Router();

function mapEnrollment(enrollment) {
  if (!enrollment) return null;
  return {
    ...enrollment,
    person: publicPersonBrief(enrollment.person),
    service: enrollment.service
      ? {
          id: enrollment.service.id,
          type: enrollment.service.type,
          date: enrollment.service.date,
          time: enrollment.service.time,
          draft: enrollment.service.draft,
          active: enrollment.service.active,
        }
      : undefined,
  };
}

async function canManageEnrollment(actor, targetPersonId) {
  if (actor.id === Number(targetPersonId)) return true;
  if (isAdminRole(actor.role)) return true;

  if (actor.role === 'Teamcoördinator') {
    const target = await prisma.person.findUnique({
      where: { id: Number(targetPersonId) },
      include: { team: true, teamMemberships: { where: { active: true } } },
    });
    if (!target) return false;
    const allowed = await teamIdsForActor(actor);
    if (target.teamId && allowed.has(target.teamId)) return true;
    if (target.team?.coordinatorId === actor.id) return true;
    for (const m of target.teamMemberships || []) {
      if (allowed.has(m.teamId)) return true;
    }
  }
  return false;
}

function enrollmentSource(actor, targetPersonId) {
  if (Number(actor.id) === Number(targetPersonId)) return 'SELF';
  if (isAdminRole(actor.role)) return 'ADMIN';
  if (actor.role === 'Teamcoördinator') return 'TEAM';
  return 'SELF';
}

/** Ouders op de teamdienst van hun eigen thuiswedstrijd mogen niet door de wedstrijdblokkade worden tegengehouden. */
function intendsTeamDuty(service, person, actor, requestedTeamId) {
  if (!service) return false;
  const dutyTeams = (service.teamDuties || []).map((d) => d.teamId);
  if (!dutyTeams.length) return false;
  if (
    requestedTeamId &&
    dutyTeams.includes(requestedTeamId) &&
    teamDutyOpenForTeam(service, requestedTeamId) > 0
  ) {
    return true;
  }
  const fillingForSomeoneElse = Number(actor.id) !== Number(person.id);
  if (!fillingForSomeoneElse) return false;
  if (!isAdminRole(actor.role) && actor.role !== 'Teamcoördinator') return false;
  const personTeams = new Set(personTeamIds(person));
  return dutyTeams.some(
    (teamId) => teamDutyOpenForTeam(service, teamId) > 0 && (personTeams.has(teamId) || isAdminRole(actor.role)),
  );
}

router.get(
  '/',
  requireAuth(async (req, res, next) => {
    try {
      let where = {};
      if (isAdminRole(req.person.role)) {
        where = {};
      } else if (req.person.role === 'Teamcoördinator') {
        const teamIds = [...(await teamIdsForActor(req.person))];
        where = {
          OR: [
            { personId: req.person.id },
            ...(teamIds.length ? [{ person: { teamId: { in: teamIds } } }] : []),
          ],
        };
      } else {
        where = { personId: req.person.id };
      }

      const enrollments = await prisma.enrollment.findMany({
        where,
        include: { person: true, service: true },
        orderBy: { createdAt: 'desc' },
      });
      res.json(enrollments.map(mapEnrollment));
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/',
  requireAuth(async (req, res, next) => {
    try {
      const { serviceId, personId, ignoreMatchBlock } = req.body;
      if (!serviceId || !personId) {
        return res.status(400).json({ error: 'Dienst en persoon zijn verplicht' });
      }

      const targetId = Number(personId);
      if (!(await canManageEnrollment(req.person, targetId))) {
        return res.status(403).json({
          error: 'Je mag alleen jezelf (of teamleden als teamcoördinator) inschrijven',
        });
      }

      const person = await prisma.person.findUnique({
        where: { id: targetId },
        include: { team: true, teamMemberships: { where: { active: true } } },
      });
      if (!person?.active) {
        return res.status(400).json({ error: 'Deze persoon is niet actief' });
      }

      const servicePreview = await prisma.service.findUnique({
        where: { id: Number(serviceId) },
        include: serviceInclude,
      });
      const requestedTeamId = req.body.forTeamId ? Number(req.body.forTeamId) : null;
      const fillingTeamDuty = intendsTeamDuty(servicePreview, person, req.person, requestedTeamId);
      const coordinatorNamingTeam =
        fillingTeamDuty &&
        (req.person.role === 'Teamcoördinator' || isAdminRole(req.person.role));
      if (servicePreview?.locked && !isAdminRole(req.person.role) && !coordinatorNamingTeam) {
        return res.status(403).json({
          error: 'Dit rooster is officieel. Alleen de barcommissie kan nog wijzigen.',
        });
      }
      if (servicePreview && Number(req.person.id) === targetId && !requestedTeamId) {
        const cap = serviceCapacity(servicePreview);
        if (cap.personalOpen <= 0 && cap.teamOpen > 0) {
          return res.status(409).json({
            error:
              'De open plekken op deze dienst zijn voor het jeugdteam. De bardienstcoördinator vult de ouders in.',
          });
        }
      }
      if (servicePreview && !fillingTeamDuty) {
        const matches = await prisma.match.findMany({
          where: {
            date: {
              gte: startOfDay(addWeeks(servicePreview.date, -1)),
              lte: endOfDay(addWeeks(servicePreview.date, 1)),
            },
          },
          include: { team: true },
        });
        const blocks = blocksForPerson(person, matches);
        const overlap = overlappingMatchBlocks(servicePreview, blocks);
        if (overlap.length && !(ignoreMatchBlock && isAdminRole(req.person.role))) {
          return res.status(409).json({
            error: isAdminRole(req.person.role)
              ? 'Let op: deze persoon heeft een wedstrijd en valt binnen de ingestelde blokkeertijd. Toch inplannen?'
              : 'Je hebt een wedstrijd die overlap heeft met deze dienst.',
            code: 'MATCH_BLOCK',
            canOverride: isAdminRole(req.person.role),
          });
        }
      }

      try {
        const enrollment = await prisma.$transaction(async (tx) => {
          const service = await tx.service.findUnique({
            where: { id: Number(serviceId) },
            include: serviceInclude,
          });
          if (!service || !service.active) {
            const err = new Error('Dienst niet gevonden of uitgeschakeld');
            err.status = 404;
            throw err;
          }
          if (service.draft && !isAdminRole(req.person.role)) {
            const err = new Error(
              'Deze dienst is nog een concept en niet open voor inschrijving',
            );
            err.status = 403;
            throw err;
          }
          if (service.enrollments.length >= service.required) {
            const err = new Error('Deze dienst is al vol');
            err.status = 409;
            throw err;
          }

          const existing = await tx.enrollment.findUnique({
            where: {
              serviceId_personId: {
                serviceId: Number(serviceId),
                personId: targetId,
              },
            },
          });
          if (existing) {
            const err = new Error('Je staat al ingeschreven voor deze dienst');
            err.status = 409;
            throw err;
          }

          let source = enrollmentSource(req.person, targetId);
          const capacity = serviceCapacity(service);
          const personTeams = new Set(personTeamIds(person));
          const requestedTeamId = req.body.forTeamId ? Number(req.body.forTeamId) : null;
          const fillingForSomeoneElseEarly = Number(req.person.id) !== targetId;
          if (
            req.person.role === 'Teamcoördinator' &&
            (requestedTeamId || (fillingForSomeoneElseEarly && source === 'TEAM'))
          ) {
            source = 'TEAM';
          }
          const actorTeamIds = source === 'TEAM' ? await teamIdsForActor(req.person) : new Set();
          const dutyTeams = (service.teamDuties || []).map((d) => d.teamId);
          let forTeamId = null;
          let kind = 'PERSONAL';

          const pickTeamDuty = () => {
            if (requestedTeamId && dutyTeams.includes(requestedTeamId) && teamDutyOpenForTeam(service, requestedTeamId) > 0) {
              return requestedTeamId;
            }
            for (const teamId of dutyTeams) {
              if (!personTeams.has(teamId) && source !== 'ADMIN') continue;
              if (source === 'TEAM' && !actorTeamIds.has(teamId) && !isAdminRole(req.person.role)) continue;
              if (teamDutyOpenForTeam(service, teamId) > 0) return teamId;
            }
            return null;
          };

          const fillingForSomeoneElse = Number(req.person.id) !== targetId;
          if ((fillingForSomeoneElse && (source === 'TEAM' || source === 'ADMIN')) || requestedTeamId) {
            const dutyTeam = pickTeamDuty();
            if (dutyTeam) {
              kind = 'TEAM';
              forTeamId = dutyTeam;
            }
          }

          if (service.locked && !isAdminRole(req.person.role) && kind !== 'TEAM') {
            const err = new Error(
              'Dit rooster is officieel. Alleen de barcommissie kan nog wijzigen.',
            );
            err.status = 403;
            throw err;
          }
          if (
            service.locked &&
            kind === 'TEAM' &&
            req.person.role !== 'Teamcoördinator' &&
            !isAdminRole(req.person.role)
          ) {
            const err = new Error(
              'Dit rooster is officieel. Alleen de barcommissie kan nog wijzigen.',
            );
            err.status = 403;
            throw err;
          }

          if (kind === 'TEAM') {
            if (!isAdminRole(req.person.role) && teamDutyOpenForTeam(service, forTeamId) <= 0) {
              const err = new Error('Alle teamdienst-plekken van dit team zijn al ingevuld');
              err.status = 409;
              throw err;
            }
            if (source === 'TEAM' && !actorTeamIds.has(forTeamId) && !isAdminRole(req.person.role)) {
              const err = new Error('Je mag alleen ouders van je eigen team op de teamdienst zetten');
              err.status = 403;
              throw err;
            }
          } else {
            if (capacity.personalOpen <= 0) {
              const err = new Error(
                capacity.teamOpen > 0
                  ? 'De open plekken op deze dienst zijn voor het jeugdteam. De bardienstcoördinator vult de ouders in.'
                  : 'Deze dienst is al vol',
              );
              err.status = 409;
              throw err;
            }
          }

          const isMakeup = kind === 'PERSONAL' && (person.makeupDue ?? 0) > 0;
          const reason = friendlyEnrollmentReason(source, {
            makeup: isMakeup,
            obligation: person.obligation,
          });

          return tx.enrollment.create({
            data: {
              serviceId: Number(serviceId),
              personId: targetId,
              source,
              kind,
              forTeamId,
              reason,
              makeup: isMakeup,
            },
            include: { person: true, service: true, forTeam: true },
          });
        });

        if (ignoreMatchBlock && isAdminRole(req.person.role)) {
          await writeAudit({
            actorId: req.person.id,
            action: 'enrollment.match_block_override',
            entity: 'Enrollment',
            entityId: enrollment.id,
            detail: `${person.name} op dienst ${serviceId}`,
          });
        }

        if (enrollment.makeup) {
          await prisma.person.update({
            where: { id: targetId },
            data: { makeupDue: { decrement: 1 } },
          });
        }

        res.status(201).json(mapEnrollment(enrollment));
      } catch (e) {
        if (e.status) {
          return res.status(e.status).json({ error: e.message });
        }
        if (e.code === 'P2002') {
          return res.status(409).json({ error: 'Je staat al ingeschreven voor deze dienst' });
        }
        throw e;
      }
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/:id/reassign',
  requireAuth(async (req, res, next) => {
    try {
      const enrollmentId = Number(req.params.id);
      const nextPersonId = Number(req.body?.personId);
      if (!nextPersonId) {
        return res.status(400).json({ error: 'Kies de andere ouder' });
      }
      const enrollment = await prisma.enrollment.findUnique({
        where: { id: enrollmentId },
        include: { service: { include: serviceInclude }, person: true },
      });
      if (!enrollment) return res.status(404).json({ error: 'Inschrijving niet gevonden' });
      if (enrollment.kind !== 'TEAM' || !enrollment.forTeamId) {
        return res.status(400).json({
          error: 'Alleen een ingevulde teamdienst-plek kun je omzetten naar een andere ouder',
        });
      }
      if (enrollment.personId === nextPersonId) {
        return res.status(400).json({ error: 'Kies een andere ouder dan degene die er nu staat' });
      }
      const allowedTeams = isAdminRole(req.person.role)
        ? null
        : await teamIdsForActor(req.person);
      if (allowedTeams && !allowedTeams.has(enrollment.forTeamId)) {
        return res.status(403).json({ error: 'Je mag alleen ouders van je eigen team wijzigen' });
      }
      const nextPerson = await prisma.person.findUnique({
        where: { id: nextPersonId },
        include: { teamMemberships: { where: { active: true } } },
      });
      if (!nextPerson?.active) {
        return res.status(400).json({ error: 'Deze persoon is niet actief' });
      }
      const onTeam =
        nextPerson.teamId === enrollment.forTeamId ||
        (nextPerson.teamMemberships || []).some((m) => m.teamId === enrollment.forTeamId);
      if (!onTeam && !isAdminRole(req.person.role)) {
        return res.status(400).json({ error: 'Deze ouder hoort niet bij dit team' });
      }
      const duplicate = await prisma.enrollment.findUnique({
        where: {
          serviceId_personId: { serviceId: enrollment.serviceId, personId: nextPersonId },
        },
      });
      if (duplicate) {
        return res.status(409).json({ error: 'Die ouder staat al op deze dienst' });
      }
      const updated = await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: {
          personId: nextPersonId,
          source: 'TEAM',
          reason: friendlyEnrollmentReason('TEAM'),
        },
        include: { person: true, service: true, forTeam: true },
      });
      await writeAudit({
        actorId: req.person.id,
        action: 'enrollment.reassign',
        entity: 'Enrollment',
        entityId: enrollment.id,
        detail: `${enrollment.person?.name || 'ouder'} → ${nextPerson.name}`,
      });
      res.json(mapEnrollment(updated));
    } catch (err) {
      next(err);
    }
  }),
);

router.delete(
  '/:id',
  requireAuth(async (req, res, next) => {
    try {
      const enrollment = await prisma.enrollment.findUnique({
        where: { id: Number(req.params.id) },
        include: { service: true },
      });
      if (!enrollment) {
        return res.status(404).json({ error: 'Inschrijving niet gevonden' });
      }
      if (!(await canManageEnrollment(req.person, enrollment.personId))) {
        return res.status(403).json({ error: 'Je mag deze inschrijving niet verwijderen' });
      }
      if (await pendingForEnrollment(enrollment.id)) {
        return res.status(409).json({
          error: 'Deze dienst zit in een openstaand ruilverzoek. Trek dat eerst in.',
        });
      }
      if (enrollment.service?.locked && !isAdminRole(req.person.role)) {
        return res.status(403).json({
          error: 'Dit rooster is officieel. Alleen de barcommissie kan nog wijzigen.',
        });
      }

      // Beheer mag altijd omgooien; vrijwilligers niet na deadline / CLOSED / verplichte fase
      if (!isAdminRole(req.person.role) && req.person.id === enrollment.personId) {
        const round = await prisma.planningRound.findUnique({ where: { id: 1 } });
        const status = round?.status || '';
        if (status === 'CLOSED' || status === 'MANDATORY_OPEN') {
          return res.status(403).json({
            error:
              'De vrijwilligersfase is voorbij. Neem contact op met de barcommissie om te wijzigen.',
          });
        }
        if (
          round?.volunteerDeadline &&
          new Date() > new Date(round.volunteerDeadline)
        ) {
          return res.status(403).json({
            error:
              'De inschrijftermijn is verstreken. Neem contact op met de barcommissie om te wijzigen.',
          });
        }
      }

      if (enrollment.makeup && !enrollment.noShow) {
        await prisma.person.update({
          where: { id: enrollment.personId },
          data: { makeupDue: { increment: 1 } },
        });
      }

      await prisma.enrollment.delete({ where: { id: enrollment.id } });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/:id/noshow',
  requireAuth(async (req, res, next) => {
    try {
      if (!isAdminRole(req.person.role)) {
        return res.status(403).json({ error: 'Alleen de barcommissie kan een no-show registreren' });
      }
      const enrollment = await prisma.enrollment.findUnique({
        where: { id: Number(req.params.id) },
        include: { person: true, service: true },
      });
      if (!enrollment) return res.status(404).json({ error: 'Inschrijving niet gevonden' });
      if (enrollment.noShow) {
        return res.status(400).json({ error: 'No-show staat al geregistreerd' });
      }

      const kind = enrollment.kind === 'TEAM' ? 'TEAM' : 'PERSONAL';
      const personalNoShow =
        kind === 'PERSONAL' && isMandatoryObligation(enrollment.person.obligation);

      const updated = await prisma.$transaction(async (tx) => {
        const enr = await tx.enrollment.update({
          where: { id: enrollment.id },
          data: { noShow: true },
          include: { person: true, service: true },
        });
        if (personalNoShow) {
          await tx.person.update({
            where: { id: enrollment.personId },
            data: { makeupDue: { increment: 1 } },
          });
        }
        return enr;
      });

      await writeAudit({
        actorId: req.person.id,
        action: 'enrollment.noshow',
        entity: 'Enrollment',
        entityId: enrollment.id,
        detail: `${enrollment.person.name} · ${kind}${personalNoShow ? ' · +1 inhaaldienst' : ''}`,
      });

      res.json(mapEnrollment(updated));
    } catch (err) {
      next(err);
    }
  }),
);

router.delete(
  '/:id/noshow',
  requireAuth(async (req, res, next) => {
    try {
      if (!isAdminRole(req.person.role)) {
        return res.status(403).json({ error: 'Geen toegang' });
      }
      const enrollment = await prisma.enrollment.findUnique({
        where: { id: Number(req.params.id) },
        include: { person: true, service: true },
      });
      if (!enrollment) return res.status(404).json({ error: 'Inschrijving niet gevonden' });
      if (!enrollment.noShow) {
        return res.status(400).json({ error: 'Er is geen no-show om te corrigeren' });
      }

      const kind = enrollment.kind === 'TEAM' ? 'TEAM' : 'PERSONAL';
      const personalNoShow =
        kind === 'PERSONAL' && isMandatoryObligation(enrollment.person.obligation);

      const updated = await prisma.$transaction(async (tx) => {
        const enr = await tx.enrollment.update({
          where: { id: enrollment.id },
          data: { noShow: false },
          include: { person: true, service: true },
        });
        if (personalNoShow && (enrollment.person.makeupDue ?? 0) > 0) {
          await tx.person.update({
            where: { id: enrollment.personId },
            data: { makeupDue: { decrement: 1 } },
          });
        }
        return enr;
      });

      await writeAudit({
        actorId: req.person.id,
        action: 'enrollment.noshow_correct',
        entity: 'Enrollment',
        entityId: enrollment.id,
        detail: enrollment.person.name,
      });

      res.json(mapEnrollment(updated));
    } catch (err) {
      next(err);
    }
  }),
);

export default router;
