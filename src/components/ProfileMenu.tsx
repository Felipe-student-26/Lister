import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, LogOut, Settings, User } from 'lucide-react';
import type { Role } from '../store/profile';

/** Inicial del círculo: primera letra del nombre de la terapeuta; si no hay nombre, la del correo. */
export function initialOf(name: string | undefined, email: string): string {
  return (name?.trim().charAt(0) || email.trim().charAt(0) || '?').toUpperCase();
}

/**
 * Menú del perfil (arriba a la derecha, PC y celular). El botón es solo el círculo con la inicial; el correo y el rol van dentro.
 * Perfil (terapeuta y administrador) · Configuración · Panel de control (solo si se pasa `onControlPanel`: solo PC) · Cerrar sesión.
 */
export default function ProfileMenu({
  name,
  email,
  role,
  onSettings,
  onControlPanel,
  onLogout,
}: {
  name?: string;
  email: string;
  role: Role | null;
  onSettings: () => void;
  onControlPanel?: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const item = 'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold text-brand-800 hover:bg-brand-50';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menú del perfil"
        onClick={() => setOpen((o) => !o)}
        className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 transition hover:bg-brand-200"
      >
        {initialOf(name, email)}
      </button>

      {open && (
        <div role="menu" aria-label="Perfil" className="absolute right-0 z-30 mt-2 w-60 rounded-2xl border border-brand-100 bg-white p-1.5 shadow-soft">
          <div className="px-3 py-2">
            {name?.trim() && <p className="truncate text-sm font-bold text-brand-800">{name.trim()}</p>}
            <p className={`truncate ${name?.trim() ? 'text-xs text-brand-600' : 'text-sm font-bold text-brand-800'}`}>{email}</p>
            <p className="text-xs text-brand-500">{role === 'therapist' ? 'Terapeuta' : role === 'admin' ? 'Administrador' : 'Sin acceso'}</p>
          </div>
          <div className="my-1 h-px bg-brand-100" />
          {(role === 'therapist' || role === 'admin') && (
            <Link role="menuitem" to="/perfil" className={item} onClick={() => setOpen(false)}>
              <User size={16} /> Perfil
            </Link>
          )}
          <button role="menuitem" className={item} onClick={choose(onSettings)}>
            <Settings size={16} /> Configuración
          </button>
          {onControlPanel && (
            <button role="menuitem" className={item} onClick={choose(onControlPanel)}>
              <LayoutDashboard size={16} /> Panel de control
            </button>
          )}
          <div className="my-1 h-px bg-brand-100" />
          <button role="menuitem" className={`${item} text-clay-600 hover:bg-red-50`} onClick={choose(onLogout)}>
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
