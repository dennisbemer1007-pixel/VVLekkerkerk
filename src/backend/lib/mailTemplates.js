import {
  ctaLabelForTemplateKey,
  exampleMailVars,
  publicLogoUrl,
  wrapBrandedEmail,
} from './mailLayout.js';
import { resolvePublicAppUrl } from './appUrl.js';

export const MAIL_TEMPLATE_KEYS = ['invite', 'scheduled', 'reminder', 'planningReady'];

export const DEFAULT_MAIL_TEMPLATES = {
  invite: {
    subject: 'Uitnodiging VVL Planning App',
    body: `Hoi {naam},

Je bent uitgenodigd voor de VVL Planning App van V.V. Lekkerkerk.

Maak je account aan via deze link (14 dagen geldig):
{link}

Groet,
V.V. Lekkerkerk`,
  },
  scheduled: {
    subject: 'Bevestiging dienst {datum}',
    body: `Hoi {naam},

Je staat ingepland voor de {dienst} op {datum}, {tijd}.

Bekijk de planning: {link}

Groet,
V.V. Lekkerkerk`,
  },
  reminder: {
    subject: 'Herinnering dienst {datum}',
    body: `Hoi {naam},

Over twee dagen sta je op de {dienst}: {datum}, {tijd}.

Bekijk de planning: {link}

Groet,
V.V. Lekkerkerk`,
  },
  planningReady: {
    subject: 'De planning is klaar',
    body: `Hoi {naam},

De bardienstplanning is klaar en officieel vastgezet.

Bekijk het rooster: {link}

Groet,
V.V. Lekkerkerk`,
  },
};

const PLACEHOLDER = /\{(naam|datum|tijd|dienst|link)\}/g;

export function resolveMailTemplates(raw) {
  let stored = {};
  if (raw && typeof raw === 'object') stored = raw;
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      stored = JSON.parse(raw);
    } catch {
      stored = {};
    }
  }
  const out = {};
  for (const key of MAIL_TEMPLATE_KEYS) {
    const base = DEFAULT_MAIL_TEMPLATES[key];
    const custom = stored?.[key] && typeof stored[key] === 'object' ? stored[key] : {};
    const subject = String(custom.subject || '').trim() || base.subject;
    const body = String(custom.body || '').trim() || base.body;
    out[key] = { subject, body };
  }
  return out;
}

function storedObject(raw) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

/** Eigen teksten van de barcommissie. Systeemteksten blijven apart staan. */
export function customMailTemplates(raw) {
  const list = Array.isArray(storedObject(raw).custom) ? storedObject(raw).custom : [];
  return list
    .map((item, index) => ({
      id: String(item?.id || `eigen-${index + 1}`).slice(0, 40),
      name: String(item?.name || '').trim().slice(0, 80),
      subject: String(item?.subject || '').trim(),
      body: String(item?.body || ''),
    }))
    .filter((item) => item.name && item.subject && item.body);
}

export function serializeMailTemplates(input) {
  const resolved = resolveMailTemplates(input);
  const custom = customMailTemplates(input);
  const check = (subject, body) => {
    if (subject.length > 200) throw new Error('Onderwerp is te lang (maximaal 200 tekens)');
    if (body.length > 4000) throw new Error('Mailtekst is te lang (maximaal 4000 tekens)');
  };
  for (const key of MAIL_TEMPLATE_KEYS) check(resolved[key].subject, resolved[key].body);
  for (const item of custom) check(item.subject, item.body);
  return JSON.stringify({ ...resolved, custom });
}

/** audience: volunteers | team | shift */
export function filterMailAudience(people, { audience, teamId, serviceId } = {}) {
  const withMail = (people || []).filter((person) => person && person.active !== false && String(person.email || '').includes('@'));
  if (audience === 'team') {
    return withMail.filter((person) => Number(person.teamId) === Number(teamId));
  }
  if (audience === 'shift') {
    return withMail.filter((person) => (person.serviceIds || []).map(Number).includes(Number(serviceId)));
  }
  if (audience === 'volunteers') {
    return withMail.filter((person) => person.role === 'Vrijwilliger' || person.role === 'Teamcoördinator');
  }
  return [];
}

/**
 * Vult placeholders en wikkelt de tekst in de VV Lekkerkerk HTML-layout.
 * @param {{ subject?: string, body?: string }} template
 * @param {Record<string, string>} vars
 * @param {{ templateKey?: string, ctaLabel?: string, logoSrc?: string }} [options]
 */
export function renderMail(template, vars = {}, options = {}) {
  const dict = {
    naam: vars.naam || '',
    datum: vars.datum || '',
    tijd: vars.tijd || '',
    dienst: vars.dienst || '',
    link: vars.link || '',
  };
  const fill = (input) => String(input || '').replace(PLACEHOLDER, (_, key) => dict[key]);
  const subject = fill(template.subject).replace(/[\r\n]/g, ' ').trim();
  const text = fill(template.body);
  const link = dict.link;
  const ctaLabel =
    options.ctaLabel ||
    (options.templateKey ? ctaLabelForTemplateKey(options.templateKey) : '') ||
    (link ? 'Open de app' : '');
  const branded = wrapBrandedEmail({
    text,
    ctaLabel,
    ctaUrl: link,
    logoSrc: options.logoSrc,
  });
  return { subject, text: branded.text, html: branded.html };
}

export function dienstLabel(type) {
  return type === 'KITCHEN' ? 'keukendienst' : 'bardienst';
}

/**
 * Voorbeeld/preview van een systeem- of eigen tekst in de branding-layout.
 * logoSrc is een publieke URL (voor iframe-preview); verzenden gebruikt CID.
 */
export function previewMailTemplate({
  key,
  templateId,
  subject,
  body,
  templatesRaw,
  vars,
  logoBaseUrl,
} = {}) {
  const resolved = resolveMailTemplates(templatesRaw);
  const custom = customMailTemplates(templatesRaw);
  let templateKey = key || '';
  let template = null;

  if (templateId) {
    const found = custom.find((item) => item.id === String(templateId));
    if (!found) throw Object.assign(new Error('Onbekende eigen e-mailtekst'), { status: 400 });
    template = { subject: found.subject, body: found.body };
    templateKey = 'custom';
  } else if (MAIL_TEMPLATE_KEYS.includes(String(key))) {
    template = resolved[key];
    templateKey = key;
  } else if (subject != null || body != null) {
    template = {
      subject: String(subject || 'Voorbeeld'),
      body: String(body || ''),
    };
    templateKey = key || 'custom';
  } else {
    throw Object.assign(new Error('Kies een e-mailtekst'), { status: 400 });
  }

  // Concepttekst uit het formulier (nog niet opgeslagen) heeft voorrang
  if (subject != null && String(subject).trim()) template = { ...template, subject: String(subject) };
  if (body != null && String(body).trim()) template = { ...template, body: String(body) };

  let base = logoBaseUrl || '';
  if (!base) {
    try {
      base = resolvePublicAppUrl();
    } catch {
      base = '';
    }
  }
  const sampleVars = exampleMailVars(vars);
  const rendered = renderMail(template, sampleVars, {
    templateKey,
    logoSrc: publicLogoUrl(base),
  });
  return {
    ...rendered,
    templateKey,
    ctaLabel: ctaLabelForTemplateKey(templateKey),
    vars: sampleVars,
  };
}

export function formatDutyDate(date) {
  return new Date(date).toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}
