import { Link } from 'react-router-dom';

import { PageTitle } from '../components/PageHelp.jsx';
import { PAGE_HELP } from '../utils/pageHelp.js';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-vvl-muted px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="text-center">
          <img src="/logo.png" alt="V.V. Lekkerkerk" className="vvl-logo mx-auto mb-4 h-20 w-20 object-contain" />
          <PageTitle className="justify-center" {...PAGE_HELP.privacy}>
            Privacy
          </PageTitle>
          <p className="mt-2 text-sm text-gray-700">VVL Planning App — V.V. Lekkerkerk</p>
        </header>

        <article className="vvl-card space-y-3 text-sm text-gray-800">
          <p>
            <strong>Verwerkingsverantwoordelijke:</strong> het bestuur van V.V. Lekkerkerk. De app
            plant bar- en keukendiensten (gerechtvaardigd belang / uitvoering van de
            vrijwilligersafspraak).
          </p>
          <p>
            <strong>Welke gegevens:</strong> naam, persoonsnummer, optioneel e-mail en telefoon,
            foto, team, rol, verplichting, voorkeuren, inschrijvingen, ruilverzoeken, no-shows en
            auditlogs. Inloggen gaat via e-mail en wachtwoord (sessietoken in je browser, geen
            trackingcookies).
          </p>
          <p>
            <strong>Bewaartermijnen:</strong> auditlogs 24 maanden. Contact, foto en inlog van
            gedeactiveerde accounts 24 maanden, daarna wissen. Roosterhistorie (wie stond wanneer)
            blijft, zodat verplichting en inhaal kloppen.
          </p>
          <p>
            <strong>Wie ziet wat:</strong> de clubbrede personenlijst (inclusief contact) is alleen
            voor barcommissie en admin. Teamcoördinatoren zien namen van hun teams. Vrijwilligers
            zien namen op het rooster van diensten waarop ze kijken, niet iemands e-mail of
            telefoon.
          </p>
          <p>
            <strong>Jouw rechten:</strong> inzage en kopie via Voorkeuren → Gegevens downloaden.
            Rectificatie via de barcommissie. Wissen van contact: barcommissie deactiveert het
            account en kan contact meteen wissen; namen in oude roosters blijven. Bezwaar of
            klacht: bestuur V.V. Lekkerkerk of de Autoriteit Persoonsgegevens.
          </p>
          <p>
            Geen verkoop van gegevens. Geen push of WhatsApp. E-mail alleen als de club SMTP
            aansluit (uitnodiging, herinnering 1 dag van tevoren, wachtwoordreset).
          </p>
          <p>
            Hosting: productie op een persistente server (Render Starter of gelijkwaardig), niet
            op een gratis demo die data wist bij slaapstand.
          </p>
        </article>

        <p className="text-center">
          <Link to="/login" className="vvl-btn-outline inline-flex text-xs">
            Naar inloggen
          </Link>
        </p>
      </div>
    </div>
  );
}
