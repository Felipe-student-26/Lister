import { useEffect, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useToast } from '../store/toast';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-gradient-to-r from-brand-50 via-brand-100 to-brand-50 ${className}`} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl2 border-2 border-dashed border-brand-200 bg-white/60 px-6 py-14 text-center">
      <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 p-4 text-brand-600 ring-1 ring-brand-100">{icon}</div>
      <p className="font-bold text-brand-800">{title}</p>
      <p className="max-w-sm text-sm text-brand-600">{hint}</p>
      {action}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  nav,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Barra de pestañas fija bajo el título (solo con `footer`). */
  nav?: ReactNode;
  /** Pie fijo: con él, el título y el pie quedan quietos y solo el cuerpo hace scroll. */
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const header = (
    <div className={`flex items-center justify-between ${footer ? 'shrink-0 px-6 pb-4 pt-6' : 'mb-5'}`}>
      <h2 className="text-lg font-extrabold tracking-tight text-brand-800">{title}</h2>
      <button onClick={onClose} className="rounded-full p-2 text-brand-500 transition hover:bg-brand-100 hover:text-brand-700" aria-label="Cerrar">
        <X size={18} />
      </button>
    </div>
  );
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in bg-brand-900/30 p-0 backdrop-blur-[6px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[92vh] w-full max-w-lg animate-pop-in rounded-t-xl3 border border-brand-100/70 bg-white shadow-modal sm:rounded-xl3 ${
          footer ? 'flex flex-col overflow-hidden' : 'overflow-y-auto p-6'
        }`}
      >
        {header}
        {footer ? (
          <>
            {nav && <div className="shrink-0 border-b border-brand-100 px-6">{nav}</div>}
            <div data-testid="modal-body" className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
              {children}
            </div>
            <div className="shrink-0 border-t border-brand-100 bg-cream-50/80 px-6 py-4">{footer}</div>
          </>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Eliminar',
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="mb-5 flex gap-3 text-sm text-brand-700">
        <AlertTriangle className="shrink-0 text-clay-500" size={20} />
        <p>{message}</p>
      </div>
      <div className="flex justify-end gap-2">
        <button className="btn-soft" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="btn-danger"
          onClick={async () => {
            await onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function Toasts() {
  const { toasts, dismiss } = useToast();
  const icon = { success: CheckCircle2, error: XCircle, info: Info };
  const tone = {
    success: 'bg-brand-600 text-white',
    error: 'bg-clay-500 text-white',
    info: 'bg-brand-800 text-white',
  };
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => {
        const Icon = icon[t.kind];
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-md items-center gap-3 animate-pop-in rounded-2xl px-4 py-3 text-sm font-semibold shadow-modal ring-1 ring-black/5 ${tone[t.kind]}`}
          >
            <Icon size={18} />
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Cerrar aviso">
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
