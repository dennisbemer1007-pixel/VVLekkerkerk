import { PitchFigure } from '../toernooi/Pitch.jsx';
import { partsForField } from '../toernooi/engine.js';
import { useTournament } from '../toernooi/storage.js';
import { BracketView, PouleBoards, QrBlock, ScheduleTable, dutchDate, liveUrl } from '../toernooi/views.jsx';

export default function ToernooiPrint() {
  const { view } = useTournament();
  const { state } = view;
  const url = liveUrl();

  return (
    <div className="min-h-screen bg-white text-black">
      <style>{`
        @page { margin: 12mm; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media print {
          .no-print { display: none !important; }
          .sheet { break-after: page; }
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
          <header className="flex items-end justify-between gap-4 bg-black px-4 py-4 text-white">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="" className="h-14 w-14 shrink-0 bg-black object-contain" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-white/80">V.V. Lekkerkerk</p>
                <h1 className="font-heading text-3xl font-black uppercase leading-none">{state.name}</h1>
                <p className="mt-2 font-semibold">
                  {dutchDate(state.date)} · {state.startTime}–{state.endTime}
                </p>
              </div>
            </div>
            <div className="bg-white text-black">
              <QrBlock value={url} size={112} caption="Live" />
            </div>
          </header>
          <h2 className="text-sm font-black uppercase">Velden</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {state.fields.map((field) => {
              const parts = partsForField(field);
              return (
                <div key={field.id}>
                  <h3 className="mb-2 font-black uppercase">{field.name}</h3>
                  <div className={`grid gap-3 ${parts.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {parts.map((part) => (
                      <PitchFigure key={part.id} name={part.name} />
                    ))}
                  </div>
                </div>
              );
            })}
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
