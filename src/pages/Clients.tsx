import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownAZ, ArrowUpAZ, ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { useData } from '../store/data';
import { toast } from '../store/toast';
import { metrics } from '../store/metrics';
import { EmptyState, Skeleton } from '../components/ui';
import ClientFormModal from '../components/ClientFormModal';
import DeleteClientModal from '../components/DeleteClientModal';
import type { Client } from '../lib/types';

const PAGE_SIZE = 8;

export default function Clients() {
  const { clients, loading, addClient, updateClient } = useData();
  const [q, setQ] = useState('');
  const [asc, setAsc] = useState(true);
  const [page, setPage] = useState(0);
  const [form, setForm] = useState<{ client: Client | null } | null>(null); // null = cerrado; client null = nuevo
  const [deleting, setDeleting] = useState<Client | null>(null);
  const openNew = () => {
    metrics.page('pacientes', 'abrir_nuevo');
    setForm({ client: null });
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return clients
      .filter((c) => !term || c.fullName.toLowerCase().includes(term) || c.email.toLowerCase().includes(term))
      .sort((a, b) => (asc ? 1 : -1) * a.fullName.localeCompare(b.fullName));
  }, [clients, q, asc]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const rows = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-brand-800">Pacientes</h1>
        <button className="btn-primary" onClick={openNew}>
          <Plus size={16} /> Nuevo paciente
        </button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-400" />
          <input
            className="input !pl-10"
            placeholder="Buscar por nombre o correo"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <button className="btn-soft" onClick={() => setAsc(!asc)} aria-label="Cambiar orden">
          {asc ? <ArrowDownAZ size={18} /> : <ArrowUpAZ size={18} />}
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <EmptyState
          icon={<Users size={28} />}
          title="Todavía no hay pacientes"
          hint="Registra tu primer paciente para empezar a reservar citas y guardar su expediente."
          action={
            <button className="btn-primary" onClick={openNew}>
              Registrar paciente
            </button>
          }
        />
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-brand-500">Sin resultados para “{q}”.</p>
      ) : (
        <>
          <ul className="space-y-3">
            {rows.map((c) => (
              <li key={c.id} className="card flex items-center gap-2 p-4 transition hover:shadow-softer">
                <Link to={`/clientes/${c.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 font-extrabold text-brand-700">
                    {c.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-brand-800">{c.fullName}</p>
                    <p className="truncate text-xs text-brand-500">{c.phone || c.email || 'Sin contacto'}</p>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-brand-400" />
                </Link>
                <button
                  className="btn-soft !p-2"
                  title="Editar"
                  aria-label={`Editar a ${c.fullName}`}
                  onClick={() => {
                    metrics.page('pacientes', 'abrir_editar');
                    setForm({ client: c });
                  }}
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="btn-soft !p-2 text-clay-600"
                  title="Eliminar"
                  aria-label={`Eliminar a ${c.fullName}`}
                  onClick={() => {
                    metrics.page('pacientes', 'abrir_eliminar');
                    setDeleting(c);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button className="btn-soft !p-2" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Página anterior">
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm font-semibold text-brand-600">
                {current + 1} / {pages}
              </span>
              <button className="btn-soft !p-2" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Página siguiente">
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </>
      )}

      <ClientFormModal
        open={form !== null}
        client={form?.client}
        onClose={() => setForm(null)}
        onSave={async (data) => {
          const editing = form?.client;
          try {
            if (editing) {
              await updateClient(editing.id, data);
              toast.success('Paciente actualizado');
            } else {
              await addClient(data);
              toast.success('Paciente registrado');
            }
            setForm(null);
          } catch (err) {
            toast.error(editing ? 'No se pudieron guardar los cambios. Inténtalo de nuevo.' : 'No se pudo registrar al paciente. Inténtalo de nuevo.');
            throw err; // el modal queda abierto con lo escrito
          }
        }}
      />

      <DeleteClientModal client={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}
