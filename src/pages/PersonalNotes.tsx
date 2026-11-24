import { useEffect, useState } from 'react';
import { BookOpen, StickyNote } from 'lucide-react';
import { useNotes } from '../store/notes';
import { metrics } from '../store/metrics';
import { Skeleton } from '../components/ui';
import NotesMural from '../components/NotesMural';
import NotesBook from '../components/NotesBook';

const MODE_KEY = 'lister.notesMode'; // 'mural' | 'book'
type Mode = 'mural' | 'book';

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'book' ? 'book' : 'mural';
  } catch {
    return 'mural';
  }
}

/** Notas personales de la terapeuta: un mural de papelitos y, con el interruptor de arriba, un libro con portada y hojas. */
export default function PersonalNotes() {
  const loading = useNotes((s) => s.loading);
  const [mode, setModeState] = useState<Mode>(readMode);
  const book = mode === 'book';

  useEffect(() => {
    metrics.page('otros', book ? 'ver_libro' : 'ver_mural'); // las notas personales cuentan dentro de «Otros»
  }, [book]);

  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* sin almacenamiento: el modo solo dura esta sesión */
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-brand-800">Notas personales</h1>
        <div className="flex items-center gap-3 text-sm font-bold text-brand-700">
          <span className={`flex items-center gap-1.5 ${book ? 'opacity-50' : ''}`}>
            <StickyNote size={16} /> Mural
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={book}
            aria-label="Mostrar el libro"
            onClick={() => setMode(book ? 'mural' : 'book')}
            className={`relative h-7 w-12 rounded-full transition ${book ? 'bg-brand-600' : 'bg-brand-200'}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-softer transition-all ${book ? 'left-6' : 'left-1'}`} />
          </button>
          <span className={`flex items-center gap-1.5 ${book ? '' : 'opacity-50'}`}>
            <BookOpen size={16} /> Libro
          </span>
        </div>
      </div>

      {loading ? <Skeleton className="h-64" /> : book ? <NotesBook /> : <NotesMural />}
    </div>
  );
}
