import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireRole } from '../lib/auth.js';
import { ADMIN_ROLES } from '../lib/roles.js';
import { writeAudit } from '../lib/audit.js';
import { generateServicesFromRules } from '../lib/serviceGeneration.js';
import { CONDITION_TYPE_IDS } from '../lib/defaultServiceRules.js';

const router = Router();
const admin = (...args) => requireRole(...ADMIN_ROLES)(...args);

function parseRuleBody(body) {
  const weekday = body.weekday === '' || body.weekday == null ? null : Number(body.weekday);
  const required = Math.max(1, Number(body.required) || 1);
  const conditionType = CONDITION_TYPE_IDS.includes(body.conditionType)
    ? body.conditionType
    : 'ALWAYS';
  return {
    name: String(body.name || '').trim(),
    weekday: Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : null,
    startTime: String(body.startTime || '').trim(),
    endTime: String(body.endTime || '').trim(),
    type: body.type === 'KITCHEN' ? 'KITCHEN' : 'BAR',
    required,
    slot: body.slot?.trim() || null,
    conditionType,
    conditionTeamId: body.conditionTeamId ? Number(body.conditionTeamId) : null,
    conditionTeamName: body.conditionTeamName?.trim() || null,
    conditionActivityType: body.conditionActivityType?.trim() || null,
    kickoffAfter: body.kickoffAfter?.trim() || null,
    teamDuty: Boolean(body.teamDuty),
    teamDutySlotRole: body.teamDutySlotRole?.trim() || null,
    active: body.active !== false,
    validFrom: body.validFrom ? new Date(body.validFrom) : null,
    validTo: body.validTo ? new Date(body.validTo) : null,
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
  };
}

function validateRule(data) {
  if (!data.name) return 'Naam is verplicht';
  if (!data.startTime || !data.endTime) return 'Begin- en eindtijd zijn verplicht';
  return null;
}

router.get(
  '/',
  admin(async (_req, res, next) => {
    try {
      const rules = await prisma.serviceRule.findMany({
        include: { conditionTeam: true },
        orderBy: [{ sortOrder: 'asc' }, { weekday: 'asc' }, { startTime: 'asc' }],
      });
      res.json(rules);
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/',
  admin(async (req, res, next) => {
    try {
      const data = parseRuleBody(req.body);
      const error = validateRule(data);
      if (error) return res.status(400).json({ error });
      const rule = await prisma.serviceRule.create({ data });
      await writeAudit({
        actorId: req.person.id,
        action: 'service_rule.create',
        entity: 'ServiceRule',
        entityId: rule.id,
        detail: rule.name,
      });
      res.status(201).json(rule);
    } catch (err) {
      next(err);
    }
  }),
);

router.put(
  '/:id',
  admin(async (req, res, next) => {
    try {
      const data = parseRuleBody(req.body);
      const error = validateRule(data);
      if (error) return res.status(400).json({ error });
      const rule = await prisma.serviceRule.update({
        where: { id: Number(req.params.id) },
        data,
      });
      await writeAudit({
        actorId: req.person.id,
        action: 'service_rule.update',
        entity: 'ServiceRule',
        entityId: rule.id,
        detail: `${rule.name} (geldig vanaf ${rule.validFrom || 'nu'})`,
      });
      res.json(rule);
    } catch (err) {
      next(err);
    }
  }),
);

router.delete(
  '/:id',
  admin(async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      await prisma.service.updateMany({ where: { sourceRuleId: id }, data: { sourceRuleId: null } });
      await prisma.serviceRule.delete({ where: { id } });
      await writeAudit({
        actorId: req.person.id,
        action: 'service_rule.delete',
        entity: 'ServiceRule',
        entityId: id,
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/apply',
  admin(async (req, res, next) => {
    try {
      const result = await generateServicesFromRules(req.body ?? {});
      await writeAudit({
        actorId: req.person.id,
        action: 'service_rule.apply',
        entity: 'PlanningRound',
        entityId: 1,
        detail: `+${result.created} ~${result.updated} −${result.removed}`,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }),
);

export default router;
