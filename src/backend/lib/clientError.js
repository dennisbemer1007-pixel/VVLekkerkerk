/**
 * Foutantwoord naar de browser.
 * Geen stacktrace, en in productie geen interne 500-tekst.
 */
export function clientErrorPayload(err, isProd) {
  const status = Number(err?.status || err?.statusCode || 500);
  const safeStatus = status >= 400 && status < 600 ? status : 500;
  let message = typeof err?.message === 'string' ? err.message : 'Internal server error';
  message = message.split('\n')[0].slice(0, 500) || 'Internal server error';
  if (isProd && safeStatus >= 500) message = 'Internal server error';
  return { status: safeStatus, body: { error: message } };
}
