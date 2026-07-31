export function passwordResetLink(token, baseUrl) {
  const base = (baseUrl || process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}/wachtwoord/${token}`;
}

export function resetExpiry() {
  const d = new Date();
  d.setHours(d.getHours() + 24);
  return d;
}
