import { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, FilePlus2, Trash2 } from 'lucide-react';
import { useNotes } from '../store/notes';
import { useTherapistProfile } from '../store/therapistProfile';
import { toast } from '../store/toast';
import type { BookPage } from '../lib/types';
import { ConfirmModal } from './ui';

const SCRIPT_FONT = { fontFamily: '"Dancing Script", cursive' } as const;
export const MAX_TITLE = 80;
export const MAX_BODY = 20000;
export const COVER = 'cover';
/** Espera tras la última tecla antes de guardar (las páginas se guardan solas). */
const SAVE_DELAY = 700;

export const pageLabel = (p: BookPage, index: number) => `${index + 1} · ${p.title.trim() || 'Sin título'}`;

/** Hoja del libro: título arriba y texto libre abajo. Se guarda sola; al cambiar de página se guarda lo pendiente. */
function PageEditor({ page }: { page: BookPage }) {
  const updatePage = useNotes((s) => s.updatePage);
  const [title, setTitle] = useState(page.title);
  const [body, setBody] = useState(page.body);
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  // Lo último que se escribió y lo último que se guardó, para no depender de renders (también se usa al desmontar).
  const latest = useRef({ title: page.title, body: page.body });
  const saved = useRef({ title: page.title, body: page.body });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const { title: t, body: b } = latest.current;
    if (t === saved.current.title && b === saved.current.body) return;
    saved.current = { title: t, body: b };
    setStatus('saving');
    try {
      await updatePage(page.id, { title: t, body: b });
      setStatus('saved');
    } catch {
      saved.current = { title: page.title, body: page.body }; // se reintenta con el próximo cambio
      setStatus('error');
      toast.error('No se pudo guardar la página.');
    }
  };

  const change = (next: { title?: string; body?: string }) => {
    latest.current = { ...latest.current, ...next };
    setStatus('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY);
  };

  // Al salir de la página (cambio de página, de modo o de ruta) se guarda lo pendiente.
  useEffect(
    () => () => {
      void flush();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="flex min-h-[26rem] flex-1 flex-col gap-3 px-5 pb-3 pt-5 sm:px-8">
      <input
        aria-label="Título de la página"
        className="w-full border-b-2 border-brand-200 bg-transparent pb-2 text-2xl font-extrabold text-brand-800 outline-none placeholder:text-brand-300 focus:border-brand-500"
        placeholder="Título"
        maxLength={MAX_TITLE}
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          change({ title: e.target.value });
        }}
        onBlur={() => void flush()}
      />
      <textarea
        aria-label="Contenido de la página"
        className="min-h-[18rem] w-full flex-1 resize-none bg-transparent text-sm leading-8 text-brand-900 outline-none placeholder:text-brand-300"
        style={{ backgroundImage: 'repeating-linear-gradient(transparent, transparent calc(2rem - 1px), rgb(var(--brand-100)) calc(2rem - 1px), rgb(var(--brand-100)) 2rem)' }}
        placeholder="Escribe aquí lo que quieras…"
        maxLength={MAX_BODY}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          change({ body: e.target.value });
        }}
        onBlur={() => void flush()}
      />
      <p className="text-right text-xs text-brand-400" aria-live="polite">
        {status === 'saving' ? 'Guardando…' : status === 'error' ? 'Sin guardar' : 'Guardado'}
      </p>
    </div>
  );
}

/** Libro de notas: portada y hojas con título y texto. Abajo a la derecha, un select para ir a cualquier página. */
export default function NotesBook() {
  const { pages, addPage, deletePage } = useNotes();
  const name = useTherapistProfile((s) => s.profile?.fullName);
  const [current, setCurrent] = useState<string>(COVER);
  const [removing, setRemoving] = useState<BookPage | null>(null);

  const index = pages.findIndex((p) => p.id === current);
  const page = index >= 0 ? pages[index] : null;
  // Si la página abierta desaparece (se eliminó desde otro dispositivo), se vuelve a la portada.
  useEffect(() => {
    if (current !== COVER && index < 0) setCurrent(COVER);
  }, [current, index]);

  const newPage = async () => {
    try {
      setCurrent(await addPage());
    } catch {
      toast.error('No se pudo crear la página.');
    }
  };

  const open = async () => {
    if (pages.length > 0) setCurrent(pages[0].id);
    else await newPage();
  };

  if (!page) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-5 rounded-xl3 bg-brand-700 px-8 py-14 text-center text-white shadow-soft ring-4 ring-brand-900/20" aria-label="Portada del libro">
        <BookOpen size={36} className="opacity-80" />
        <h2 className="text-5xl leading-tight" style={SCRIPT_FONT}>
          Mis notas
        </h2>
        <div className="h-px w-24 bg-white/40" />
        <p className="text-sm opacity-90">{name ? `de ${name}` : 'Libro personal'}</p>
        <p className="text-xs opacity-75">{pages.length === 0 ? 'Aún sin páginas' : `${pages.length} ${pages.length === 1 ? 'página' : 'páginas'}`}</p>
        <button type="button" className="btn bg-white text-brand-800 hover:bg-brand-50" onClick={open}>
          {pages.length === 0 ? 'Escribir la primera página' : 'Abrir libro'}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col overflow-hidden rounded-xl3 border-l-8 border-brand-700 bg-white shadow-soft">
      <PageEditor key={page.id} page={page} />

      <div className="flex flex-wrap items-center gap-2 border-t border-brand-100 bg-brand-50 px-4 py-3">
        <button type="button" className="btn-soft !p-2" aria-label="Página anterior" onClick={() => setCurrent(index === 0 ? COVER : pages[index - 1].id)}>
          <ChevronLeft size={18} />
        </button>
        <button type="button" className="btn-soft !p-2" aria-label="Página siguiente" disabled={index === pages.length - 1} onClick={() => setCurrent(pages[index + 1].id)}>
          <ChevronRight size={18} />
        </button>
        <button type="button" className="btn-soft !px-3 !py-2" onClick={newPage}>
          <FilePlus2 size={16} /> <span className="hidden sm:inline">Nueva página</span>
        </button>
        <button type="button" className="btn-soft !p-2 text-clay-600" aria-label="Eliminar página" onClick={() => setRemoving(page)}>
          <Trash2 size={16} />
        </button>
        <div className="flex-1" />
        <select
          aria-label="Ir a la página"
          className="input !w-auto max-w-[14rem] !py-1.5 text-xs"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        >
          <option value={COVER}>Portada</option>
          {pages.map((p, i) => (
            <option key={p.id} value={p.id}>
              {pageLabel(p, i)}
            </option>
          ))}
        </select>
      </div>

      <ConfirmModal
        open={removing !== null}
        title="Eliminar página"
        message={`Se eliminará la página «${removing?.title.trim() || 'Sin título'}» y su contenido. ¿Continuar?`}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          const target = removing!;
          const i = pages.findIndex((p) => p.id === target.id);
          try {
            // Primero se sale de la página (se guarda lo pendiente) y luego se elimina.
            setCurrent(pages[i + 1]?.id ?? pages[i - 1]?.id ?? COVER);
            await deletePage(target.id);
          } catch {
            toast.error('No se pudo eliminar la página.');
          }
        }}
      />
    </div>
  );
}
