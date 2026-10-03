import { useParams } from 'react-router-dom';
import { PitchFigure } from '../toernooi/Pitch.jsx';
import { useTournament } from '../toernooi/storage.js';
import { BracketView, PouleBoards, QrBlock, ScheduleTable, dutchDate, liveUrl } from '../toernooi/views.jsx';

export default function ToernooiPrint() {
  const { id } = useParams();
  const { view, ready, error, publicToken } = useTournament(id);
  if (!ready) return <p className="p-6 text-sm">Laden…</p>;
  if (!view) return <p className="p-6 text-sm font-semibold">{error || 'Niet gevonden'}</p>;
  return <PrintSheet view={view} url={liveUrl(publicToken)} />;
}

function PrintSheet({ view, url }) {
  const { state } = view;

  return (
    <div className="min-h-screen bg-white text-black">
      <style>{`
        @page { margin: 12mm; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media print {
          .no-print { display: none !important; }
          .sheet { break-after: page; }
          .velden-grid { display: block; }
          .veld-blok {
            break-inside: avoid;
            page-break-inside: avoid;
            margin-bottom: 1.5rem;
          }
          .veld-blok h3 { break-after: avoid; page-break-after: avoid; }
        }
      `}</style>
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 bg-black px-4 py-3 text-white">
        <span className="text-sm font-bold uppercase">Afdruk</span>
        <button type="button" className="vvl-btn-outline-light text-xs" onClick={() => window.print()}>
          PDF
        </button>
      </div>

      <article className="mx-auto max-w-4xl space-y-8 px-4 py-6">
        <section className="sheet space-y-6">
          <header className="flex flex-col gap-3 bg-black px-4 py-4 text-white sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <img src="/logo.png" alt="" className="h-12 w-12 shrink-0 bg-black object-contain sm:h-14 sm:w-14" />
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-white/80">V.V. Lekkerkerk</p>
                <h1 className="break-words font-heading text-2xl font-black uppercase leading-tight sm:text-3xl sm:leading-none">{state.name}</h1>
                <p className="mt-2 font-semibold">
                  {dutchDate(state.date)} · {state.startTime}–{state.endTime}
                </p>
              </div>
            </div>
            <div className="shrink-0 self-start bg-white text-black sm:self-auto">
              <QrBlock value={url} size={96} caption="Live" />
            </div>
          </header>
          <h2 className="text-sm font-black uppercase">Velden</h2>
          <div className="velden-grid grid gap-8 sm:grid-cols-2">
            {state.fields.map((field) => (
              <div key={field.id} className="veld-blok">
                <h3 className="mb-2 font-black uppercase">{field.name}</h3>
                <PitchFigure field={field} />
              </div>
            ))}
          </div>
        </section>

        {state.fields.map((field) => {
          const parts = view.parts.filter((part) => part.fieldId === field.id);
          if (!parts.length) return null;
          return (
            <section key={field.id} className="sheet space-y-2">
              <h2 className="text-sm font-black uppercase">{field.name}</h2>
              <ScheduleTable view={{ ...view, parts }} showReferee />
            </section>
          );
        })}

        <section className="space-y-4">
          <h2 className="text-sm font-black uppercase">Poules</h2>
          <PouleBoards poules={view.poules} />
          <BracketView matches={view.matches} />
        </section>
      </article>
    </div>
  );
}
