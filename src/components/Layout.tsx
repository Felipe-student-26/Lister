import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, CalendarDays, ClipboardList, LogOut, Menu, NotebookPen, UserCog, Users, Wifi, WifiOff, X } from 'lucide-react';
import { useAuth } from '../store/auth';
import { useOnline } from '../lib/useOnline';
import { useMediaQuery } from '../lib/useMediaQuery';
import { metrics, useMetrics } from '../store/metrics';
import SettingsModal from './SettingsModal';
import ControlPanelModal from './ControlPanelModal';
import ProfileMenu from './ProfileMenu';
import { isDesktop } from '../lib/platform';
import { useCan } from '../store/profile';
import { useTherapistProfile } from '../store/therapistProfile';

const therapistLinks = [
  { to: '/', label: 'Agenda', icon: CalendarDays },
  { to: '/clientes', label: 'Pacientes', icon: Users },
  { to: '/anamnesia', label: 'Anamnesia', icon: ClipboardList },
  { to: '/notas', label: 'Notas personales', icon: NotebookPen },
  { to: '/metricas', label: 'Métricas', icon: BarChart3 },
];
// El administrador de la plataforma solo gestiona terapeutas (no ve datos clínicos).
const adminLinks = [{ to: '/terapeutas', label: 'Terapeutas', icon: UserCog }];

/** PC = ancho `md` de Tailwind (768px) o más. */
const WIDE_QUERY = '(min-width: 768px)';

const SIDEBAR_KEY = 'lister.sidebar'; // 'open' | 'mini' (solo PC)
const OLD_PIN_KEY = 'lister.pin'; // antigua: '0' = oculta, otro valor = fija

/** Lee el estado guardado de la barra lateral; migra la clave antigua `lister.pin` (oculta → mini). */
export function readSidebarMini(): boolean {
  try {
    const saved = localStorage.getItem(SIDEBAR_KEY);
    if (saved === 'open' || saved === 'mini') return saved === 'mini';
    const old = localStorage.getItem(OLD_PIN_KEY);
    if (old !== null) {
      localStorage.removeItem(OLD_PIN_KEY);
      const mini = old === '0';
      localStorage.setItem(SIDEBAR_KEY, mini ? 'mini' : 'open');
      return mini;
    }
  } catch {
    /* sin almacenamiento: por defecto abierta */
  }
  return false;
}

interface NavProps {
  links: typeof therapistLinks;
  /** true = solo iconos (con tooltip). */
  mini?: boolean;
  onNavigate?: () => void;
}

function Nav({ links, mini = false, onNavigate }: NavProps) {
  return (
    <nav className="flex flex-col gap-1">
      {links.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onNavigate}
          title={mini ? label : undefined}
          aria-label={mini ? label : undefined}
          className={({ isActive }) =>
            `flex items-center rounded-2xl text-sm font-bold transition ${
              mini ? 'mx-auto h-11 w-11 justify-center' : 'gap-3 px-3.5 py-2.5'
            } ${isActive ? 'bg-brand-600 text-white shadow-brand' : 'text-brand-700 hover:translate-x-0.5 hover:bg-white/60'}`
          }
        >
          <Icon size={18} className="shrink-0" />
          {!mini && <span className="whitespace-nowrap">{label}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const online = useOnline();
  const { role } = useCan();
  const fullName = useTherapistProfile((s) => s.profile?.fullName);
  const links = role === 'admin' ? adminLinks : therapistLinks;
  const wide = useMediaQuery(WIDE_QUERY); // PC (md+) o celular
  const [mini, setMini] = useState(readSidebarMini); // PC: abierta (iconos + texto) o mini (solo iconos)
  const [drawerOpen, setDrawerOpen] = useState(false); // celular: no se guarda, siempre empieza cerrado
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false); // Panel de control (solo PC)

  // Cambio de ruta = un acceso al módulo (se espera a que el data lake esté listo)
  const { pathname } = useLocation();
  const metricsReady = useMetrics((s) => s.ready);
  useEffect(() => {
    if (metricsReady) metrics.route(pathname);
  }, [pathname, metricsReady]);

  // Si la ventana pasa a ancho de PC con el drawer abierto, se cierra (el estado del celular no se arrastra).
  useEffect(() => {
    if (wide) setDrawerOpen(false);
  }, [wide]);

  const toggleSidebar = () => {
    const next = !mini;
    setMini(next);
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? 'mini' : 'open');
    } catch {
      /* ignore */
    }
  };

  const menuLabel = wide ? (mini ? 'Expandir barra lateral' : 'Contraer barra lateral') : 'Abrir menú';

  return (
    <div className="flex h-full">
      {/* Sidebar de PC: abierta (w-60) o mini (w-16, solo iconos). En celular no existe: ni mini ni iconos laterales. */}
      {wide && (
        <aside
          className={`flex shrink-0 flex-col justify-between overflow-hidden border-r border-brand-300 bg-sidebar py-5 shadow-[inset_-1px_0_0_rgb(255_255_255/0.6)] transition-[width] duration-200 ease-in-out ${
            mini ? 'w-16 px-2' : 'w-60 px-4'
          }`}
        >
          <div>
            <div className={`mb-8 text-2xl font-extrabold tracking-tight text-brand-700 ${mini ? 'text-center' : 'px-2'}`} title={mini ? 'Lister' : undefined}>
              {mini ? 'L' : 'Lister'}
            </div>
            <Nav links={links} mini={mini} />
          </div>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-20 flex items-center gap-3 border-b border-brand-300 bg-header/95 px-4 py-3 shadow-softer backdrop-blur-md backdrop-saturate-150">
          <button
            className="rounded-xl p-2 text-brand-700 transition hover:bg-white/60 active:scale-95"
            onClick={wide ? toggleSidebar : () => setDrawerOpen(true)}
            aria-label={menuLabel}
            aria-expanded={wide ? !mini : drawerOpen}
          >
            <Menu size={20} />
          </button>
          <div className="flex-1" />
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
              online ? 'bg-white/70 text-brand-800' : 'bg-clay-400/30 text-clay-600'
            }`}
          >
            {online ? <Wifi size={14} /> : <WifiOff size={14} />}
            {online ? 'En línea' : 'Sin conexión'}
          </span>
          <ProfileMenu
            name={fullName ?? user?.displayName ?? undefined}
            email={user?.email ?? ''}
            role={role}
            onSettings={() => setSettingsOpen(true)}
            // El Panel de control es solo de PC: en celular el menú no lo ofrece.
            onControlPanel={isDesktop ? () => setPanelOpen(true) : undefined}
            onLogout={logout}
          />
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {isDesktop && <ControlPanelModal open={panelOpen} onClose={() => setPanelOpen(false)} />}

      {/* Drawer de celular: sobre fondo oscuro; se cierra al elegir una opción o al tocar fuera */}
      {!wide && drawerOpen && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Menú de navegación">
          <div data-testid="drawer-backdrop" className="absolute inset-0 animate-fade-in bg-brand-900/40 backdrop-blur-sm" onMouseDown={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col justify-between bg-sidebar p-4 shadow-modal">
            <div>
              <div className="mb-6 flex items-center justify-between px-2">
                <span className="text-2xl font-extrabold tracking-tight text-brand-700">Lister</span>
                <button onClick={() => setDrawerOpen(false)} aria-label="Cerrar menú">
                  <X size={20} />
                </button>
              </div>
              <Nav links={links} onNavigate={() => setDrawerOpen(false)} />
            </div>
            <button onClick={logout} className="btn-soft w-full">
              <LogOut size={16} /> Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
