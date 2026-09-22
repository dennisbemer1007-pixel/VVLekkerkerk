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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

export function serializeMailTemplates(input) {
  const resolved = resolveMailTemplates(input);
  for (const key of MAIL_TEMPLATE_KEYS) {
    if (resolved[key].subject.length > 200) {
      throw new Error('Onderwerp is te lang (maximaal 200 tekens)');
    }
    if (resolved[key].body.length > 4000) {
      throw new Error('Mailtekst is te lang (maximaal 4000 tekens)');
    }
  }
  return JSON.stringify(resolved);
}

export function renderMail(template, vars = {}) {
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
  let html = escapeHtml(text).replace(/\n/g, '<br>');
  if (link) {
    html = html.replace(escapeHtml(link), `<a href="${escapeHtml(link)}">${escapeHtml(link)}</a>`);
  }
  return { subject, text, html: `<div>${html}</div>` };
}

export function dienstLabel(type) {
  return type === 'KITCHEN' ? 'keukendienst' : 'bardienst';
}

export function formatDutyDate(date) {
  return new Date(date).toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}
