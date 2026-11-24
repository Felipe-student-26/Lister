import { answeredGroups, type AnamnesisAnswers } from '../lib/anamnesis';

/** Respuestas de una anamnesis, por apartado. Solo muestra lo contestado. */
export default function AnamnesisView({ answers }: { answers: AnamnesisAnswers }) {
  const groups = answeredGroups(answers);
  if (groups.length === 0) return <p className="card p-5 text-sm text-brand-600">El paciente envió el formulario sin responder ninguna pregunta.</p>;
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.title} className="card space-y-4 p-5">
          <h3 className="border-b border-brand-200 pb-2 text-base font-extrabold text-brand-800">{g.title}</h3>
          <dl className="space-y-3 text-sm">
            {g.lines.map((l) => (
              <div key={l.label}>
                <dt className="label !mb-0.5 !normal-case !tracking-normal">{l.label}</dt>
                <dd className="whitespace-pre-wrap text-brand-900">{l.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
