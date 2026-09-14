# Beveiliging, AVG, OWASP en ISO 27001

De VVL Planning App is **geen ISO 27001-gecertificeerd product**. Dit document legt uit welke maatregelen er wél zijn, gekoppeld aan OWASP Top 10 en ISO 27001-thema’s, en wat de club zelf moet doen.

AVG-keuzes in de app: [FO-KEUZES.md](FO-KEUZES.md) (bewaartermijnen 24 maanden, geen push/WhatsApp).

## AVG (in de app)

| Recht / plicht | Hoe |
|----------------|-----|
| Doelbinding | Alleen kantineplanning |
| Dataminimalisatie | Contact niet in roosters; `publicPerson` lekt geen hashes/tokens; personenlijst niet voor vrijwilligers |
| Inzage / kopie | Voorkeuren → Gegevens downloaden; audit van de export |
| Rectificatie | Barcommissie past personen aan |
| Wissen | Account deactiveren; **Wis contact** wist e-mail/telefoon/foto/inlog; namen in roosters blijven (verplichting/inhaal) |
| Bewaartermijn | Audit 24 maanden; contact inactief 24 maanden (`deactivatedAt`) |
| Informatie | Publieke pagina `/privacy` |
| Beveiliging | Zie OWASP hieronder |
| Verwerker | Hostingpartij (bijv. Render) — verwerkersafspraak is een **clubtaak** |

Geen trackingcookies. Sessie via Authorization Bearer in localStorage (XSS-risico: CSP + geen `dangerouslySetInnerHTML`).

## OWASP Top 10 (2021) — wat we doen

| # | Risico | Maatregel |
|---|--------|-----------|
| A01 | Broken Access Control | Rollen, IDOR-check bij inschrijven, teamco alleen eigen teams, PDF/Excel achter login, personenlijst 403 voor vrijwilligers |
| A02 | Cryptographic Failures | bcrypt-wachtwoorden, SMTP-wachtwoord AES-256-GCM (`MAIL_SECRET`) |
| A03 | Injection | Prisma (geen ruwe SQL met userinput), CSV-parser zonder `eval`, Excel-cellen met `=`/`+`/`-`/`@` krijgen een apostrof |
| A04 | Insecure Design | Rate limits login/reset, generiek reset-bericht, demo-wachtwoorden alleen in demo/dev |
| A05 | Security Misconfiguration | Helmet (CSP in productie, HSTS, no-sniff, geen `X-Powered-By`), CORS beperkt, `Cache-Control: no-store` op `/api` |
| A06 | Vulnerable Components | `npm audit` bij releases; Node ≥ 20. Direct bijgewerkt: multer 2.4, nodemailer 9.1.1, react-router-dom 7.18.3. Overige meldingen zijn vooral transitief (Prisma CLI / Express `qs`). |
| A07 | Identification / Auth | Sessie 30 dagen, verlopen sessies opruimen, wachtwoord min. 8 tekens, bcrypt ook bij onbekend account (timing) |
| A08 | Software integrity | Geen remote script in de app-UI (demo-video mag pdf.js CDN gebruiken, niet de app) |
| A09 | Logging | Auditlog zonder wachtwoorden; herinneringsfouten zonder e-mailadres |
| A10 | SSRF | Geen user-gestuurde fetch-URL’s |

Foto’s: alleen JPG/PNG/WebP, max 3 MB, willekeurige bestandsnaam, **magic-bytes** gecontroleerd.

## ISO 27001 — thema’s (niet de certificering)

| Annex-thema | In de app / club |
|-------------|------------------|
| Toegangsbeheer | Rollen + sessies |
| Cryptografie | bcrypt, MAIL_SECRET |
| Logging | AuditLog, health |
| Backup | `npm run db:backup`, persistente schijf in productie |
| Privacy | `/privacy`, export, retentie |
| Leveranciers | Club sluit overeenkomst met hoster |
| Incidenten | Clubprocedure; app toont geen stacktraces in productie |
| Ontwikkeling | Tests (`npm test`, `test:accept`, `test:security`) |

## Club moet zelf

1. HTTPS (Render doet dat).  
2. Sterk admin-wachtwoord.  
3. `SEED_DEMO=false` in productie.  
4. Verwerkersafspraak hosting + eventueel SMTP.  
5. Geen echte persoonsdata op de Free-demo.

`GET /api/demo-accounts` geeft wachtwoorden **alleen** als `SEED_DEMO=true` of niet-productie. In echte productie is die lijst leeg.
