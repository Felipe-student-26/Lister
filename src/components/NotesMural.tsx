import { useState } from 'react';
import { Plus, StickyNote, Trash2 } from 'lucide-react';
import { useNotes } from '../store/notes';
import { toast } from '../store/toast';
import { NOTE_COLORS, type NoteColor, type PersonalNote } from '../lib/types';
import { ConfirmModal, EmptyState } from './ui';

export const MAX_NOTE = 1000;

/** Pasteles fijos (como papelitos de colores): no cambian con el tema, pero el texto siempre es oscuro y legible. */
const PAPER: Record<NoteColor, { card: string; dot: string }> = {
  amarillo: { card: 'bg-yellow-100 border-yellow-200', dot: 'bg-yellow-300' },
  rosa: { card: 'bg-pink-100 border-pink-200', dot: 'bg-pink-300' },
  azul: { card: 'bg-sky-100 border-sky-200', dot: 'bg-sky-300' },
  verde: { card: 'bg-green-100 border-green-200', dot: 'bg-green-300' },
  lila: { card: 'bg-purple-100 border-purple-200', dot: 'bg-purple-300' },
};
/** Giros leves y repetidos para que parezca pegado a mano sin que el texto se vea torcido. */
const TILT = ['rotate-[-1deg]', 'rotate-[0.8deg]', 'rotate-[-0.5deg]', 'rotate-[1deg]'];

function ColorDots({ value, onChange, label }: { value: NoteColor; onChange: (c: NoteColor) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1.5">
      {NOTE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          title={c}
          onClick={() => onChange(c)}
          className={`h-5 w-5 rounded-full border border-black/10 ${PAPER[c].dot} ${value === c ? 'ring-2 ring-stone-700 ring-offset-1' : ''}`}
        />
      ))}
    </div>
  );
}

function Sticky({ note, index, onDelete }: { note: PersonalNote; index: number; onDelete: () => void }) {
  const updateNote = useNotes((s) => s.updateNote);
  const [text, setText] = useState(note.text);

  const save = async () => {
    const clean = text.trim();
    if (!clean) {
      setText(note.text); // una nota no puede quedar vacía: se vuelve al texto guardado
      return;
    }
    if (clean === note.text) return;
    try {
      await updateNote(note.id, { text: clean });
    } catch {
      toast.error('No se pudo guardar la nota.');
    }
  };

  return (
    <li className={`flex flex-col gap-2 rounded-xl border p-3 text-stone-800 shadow-soft transition-transform hover:rotate-0 ${PAPER[note.color].card} ${TILT[index % TILT.length]}`}>
      <textarea
        aria-label="Texto de la nota"
        className="min-h-[7rem] w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-stone-500"
        maxLength={MAX_NOTE}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
      />
      <div className="flex items-center justify-between gap-2">
        <ColorDots
          label="Color de la nota"
          value={note.color}
          onChange={(c) => updateNote(note.id, { color: c }).catch(() => toast.error('No se pudo cambiar el color.'))}
        />
        <button type="button" className="rounded-full p-1.5 text-stone-600 hover:bg-black/10" aria-label="Eliminar nota" onClick={onDelete}>
          <Trash2 size={15} />
        </button>
      </div>
    </li>
  );
}

/** Mural de notas: papelitos de colores que se escriben, se editan en el sitio y se eliminan. */
export default function NotesMural() {
  const { notes, addNote, deleteNote } = useNotes();
  const [text, setText] = useState('');
  const [color, setColor] = useState<NoteColor>('amarillo');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<PersonalNote | null>(null);

  const paste = async () => {
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      await addNote(clean, color);
      setText('');
    } catch {
      toast.error('No se pudo guardar la nota.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="card space-y-3 p-4">
        <textarea
          aria-label="Nueva nota"
          className="input min-h-[5rem] resize-none"
          placeholder="Escribe algo que quieras recordar…"
          maxLength={MAX_NOTE}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ColorDots label="Color de la nueva nota" value={color} onChange={setColor} />
          <button type="button" className="btn-primary" disabled={!text.trim() || busy} onClick={paste}>
            <Plus size={16} /> Pegar nota
          </button>
        </div>
      </div>

      {notes.length === 0 ? (
        <EmptyState icon={<StickyNote size={28} />} title="Tu mural está vacío" hint="Escribe una nota arriba y se pegará aquí. Solo tú puedes verla." />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((n, i) => (
            <Sticky key={n.id} note={n} index={i} onDelete={() => setRemoving(n)} />
          ))}
        </ul>
      )}

      <ConfirmModal
        open={removing !== null}
        title="Eliminar nota"
        message="La nota se eliminará del mural. ¿Continuar?"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          try {
            await deleteNote(removing!.id);
          } catch {
            toast.error('No se pudo eliminar la nota.');
          }
        }}
      />
    </div>
  );
}
