// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Outlet } from 'react-router-dom';

// Estado simulado de los stores que App lee (se cambia en cada prueba).
const st = vi.hoisted(() => ({
  user: { uid: 'u1', email: 'a@b.co' } as { uid: string; email: string } | null,
  role: 'therapist' as 'admin' | 'therapist' | null,
}));

vi.mock('./lib/firebase', () => ({ firebaseConfigured: true }));
vi.mock('./lib/platform', () => ({ keepSession: true, isDesktop: false }));
vi.mock('./lib/useIdleLogout', () => ({ useIdleLogout: () => undefined }));
vi.mock('./lib/useActivityTracker', () => ({ useActivityTracker: () => undefined }));
vi.mock('./store/auth', () => ({ useAuth: () => ({ user: st.user, ready: true, init: () => undefined, logout: () => undefined }) }));
vi.mock('./store/data', () => ({ useData: () => ({ start: () => undefined, stop: () => undefined }) }));
vi.mock('./store/profile', () => ({
  useProfile: () => ({ ready: true, role: st.role, ownerId: st.role === 'therapist' ? 'u1' : null, load: () => undefined, reset: () => undefined }),
}));
vi.mock('./store/therapistProfile', () => ({ useTherapistProfile: { getState: () => ({ load: () => undefined, reset: () => undefined }) } }));
vi.mock('./store/metrics', () => ({ useMetrics: { getState: () => ({ start: async () => undefined, stop: () => undefined }) } }));
vi.mock('./components/ui', () => ({ Skeleton: () => null, Toasts: () => null }));
vi.mock('./components/Layout', () => ({ default: () => <Outlet /> }));
vi.mock('./pages/Login', () => ({ default: () => <div>pantalla-login</div> }));
vi.mock('./pages/Agenda', () => ({ default: () => <div>pantalla-agenda</div> }));
vi.mock('./pages/Clients', () => ({ default: () => <div>pantalla-pacientes</div> }));
vi.mock('./pages/ClientDetail', () => ({ default: () => <div>pantalla-paciente</div> }));
vi.mock('./pages/Metrics', () => ({ default: () => <div>pantalla-metricas</div> }));
vi.mock('./pages/Profile', () => ({ default: () => <div>pantalla-perfil</div> }));
vi.mock('./pages/PersonalNotes', () => ({ default: () => <div>pantalla-notas</div> }));
vi.mock('./store/notes', () => ({ useNotes: { getState: () => ({ start: () => undefined, stop: () => undefined }) } }));
vi.mock('./store/anamnesis', () => ({ useAnamnesis: { getState: () => ({ start: () => undefined, stop: () => undefined }) } }));
vi.mock('./pages/Anamnesis', () => ({ default: () => <div>pantalla-anamnesia</div> }));
vi.mock('./pages/PublicAnamnesis', () => ({ default: ({ token }: { token: string }) => <div>formulario-publico-{token}</div> }));
vi.mock('./pages/AdminProfile', () => ({ default: () => <div>pantalla-perfil-admin</div> }));
vi.mock('./pages/Therapists', () => ({ default: () => <div>pantalla-terapeutas</div> }));

import App from './App';

const at = (hash: string) => {
  window.location.hash = hash;
  return render(<App />);
};

beforeEach(() => {
  st.user = { uid: 'u1', email: 'a@b.co' };
  st.role = 'therapist';
  window.location.hash = '';
});

describe('App: rutas por rol', () => {
  it('administrador: / y cualquier otra ruta lo llevan a Terapeutas (no ve datos clínicos)', () => {
    st.role = 'admin';
    for (const hash of ['#/', '#/clientes', '#/metricas', '#/notas']) {
      const { unmount } = at(hash);
      expect(screen.getByText('pantalla-terapeutas')).toBeTruthy();
      expect(screen.queryByText('pantalla-agenda')).toBeNull();
      unmount();
    }
  });

  it('administrador: /perfil muestra su propio perfil (no el de terapeuta)', () => {
    st.role = 'admin';
    at('#/perfil');
    expect(screen.getByText('pantalla-perfil-admin')).toBeTruthy();
    expect(screen.queryByText('pantalla-perfil')).toBeNull();
  });

  it('terapeuta: Agenda, Pacientes, Anamnesia, Métricas, Notas y Perfil existen', () => {
    const cases: Array<[string, string]> = [
      ['#/', 'pantalla-agenda'],
      ['#/clientes', 'pantalla-pacientes'],
      ['#/clientes/abc', 'pantalla-paciente'],
      ['#/anamnesia', 'pantalla-anamnesia'],
      ['#/metricas', 'pantalla-metricas'],
      ['#/notas', 'pantalla-notas'],
      ['#/perfil', 'pantalla-perfil'],
    ];
    for (const [hash, text] of cases) {
      const { unmount } = at(hash);
      expect(screen.getByText(text)).toBeTruthy();
      unmount();
    }
  });

  it('administrador: /anamnesia no existe (no ve datos clínicos)', () => {
    st.role = 'admin';
    at('#/anamnesia');
    expect(screen.queryByText('pantalla-anamnesia')).toBeNull();
    expect(screen.getByText('pantalla-terapeutas')).toBeTruthy();
  });

  it('enlace público del formulario: se abre SIN sesión (ni login) y sin cargar la app', () => {
    st.user = null;
    st.role = null;
    const token = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
    at(`#/formulario/${token}`);
    expect(screen.getByText(`formulario-publico-${token}`)).toBeTruthy();
    expect(screen.queryByText('pantalla-login')).toBeNull();
  });

  it('terapeuta: /terapeutas no existe y la devuelve a la Agenda', () => {
    at('#/terapeutas');
    expect(screen.getByText('pantalla-agenda')).toBeTruthy();
    expect(screen.queryByText('pantalla-terapeutas')).toBeNull();
  });

  it('sin documento de rol: \"Tu cuenta no tiene acceso\"', () => {
    st.role = null;
    at('#/');
    expect(screen.getByText('Tu cuenta no tiene acceso')).toBeTruthy();
    expect(screen.queryByText('pantalla-agenda')).toBeNull();
  });

  it('sin sesión: Login', () => {
    st.user = null;
    st.role = null;
    at('#/clientes');
    expect(screen.getByText('pantalla-login')).toBeTruthy();
  });
});
