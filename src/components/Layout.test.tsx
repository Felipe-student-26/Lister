// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// `isDesktop` se lee al renderizar: el getter permite probar PC y celular en el mismo archivo.
const platform = vi.hoisted(() => ({ desktop: true, wide: true, role: 'admin' as 'admin' | 'therapist', name: '' }));
vi.mock('../lib/platform', () => ({
  get isDesktop() {
    return platform.desktop;
  },
  keepSession: false,
}));
vi.mock('../store/auth', () => ({ useAuth: () => ({ user: { email: 'ana@correo.com' }, logout: () => undefined }) }));
vi.mock('../lib/useOnline', () => ({ useOnline: () => true }));
vi.mock('../store/metrics', () => ({ metrics: { route: () => undefined }, useMetrics: (sel: (s: { ready: boolean }) => unknown) => sel({ ready: false }) }));
vi.mock('../store/profile', () => ({ useCan: () => ({ role: platform.role }) }));
vi.mock('../store/therapistProfile', () => ({ useTherapistProfile: (sel: (s: { profile: { fullName: string } | null }) => unknown) => sel({ profile: platform.name ? { fullName: platform.name } : null }) }));
vi.mock('./SettingsModal', () => ({ default: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Configuración" /> : null) }));

import Layout from './Layout';

const renderLayout = () =>
  render(
    <MemoryRouter>
      <Layout />
    </MemoryRouter>,
  );

// jsdom no trae matchMedia: se simula el ancho (PC = md y mayor, celular = menor).
beforeEach(() => {
  localStorage.clear();
  platform.role = 'admin';
  platform.name = '';
  platform.desktop = true;
  platform.wide = true;
  window.matchMedia = ((query: string) => ({
    matches: platform.wide,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

describe('Layout: menú por rol', () => {
  const labels = () => screen.getAllByRole('link').map((a) => a.textContent);
  it('el administrador solo ve Terapeutas', () => {
    platform.role = 'admin';
    renderLayout();
    expect(labels()).toEqual(['Terapeutas']);
  });
  it('la terapeuta ve Agenda, Pacientes, Anamnesia, Notas personales y Métricas (en ese orden), y no Terapeutas', () => {
    platform.role = 'therapist';
    renderLayout();
    expect(labels()).toEqual(['Agenda', 'Pacientes', 'Anamnesia', 'Notas personales', 'Métricas']);
  });
});

describe('Layout: Panel de control solo en PC', () => {
  it('PC: el perfil del header abre el menú y "Panel de control" abre el modal de temas', async () => {
    platform.desktop = true;
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByRole('button', { name: 'Menú del perfil' }));
    await user.click(screen.getByRole('menuitem', { name: 'Panel de control' }));
    expect(screen.getByRole('dialog', { name: 'Panel de control' })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Temas predeterminados' })).toBeTruthy();
  });

  it('PC: Configuración también está en el menú del perfil', async () => {
    platform.desktop = true;
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByRole('button', { name: 'Menú del perfil' }));
    await user.click(screen.getByRole('menuitem', { name: 'Configuración' }));
    expect(screen.getByRole('dialog', { name: 'Configuración' })).toBeTruthy();
  });

  it('celular: el header también tiene el círculo con la inicial; el menú trae Perfil, Configuración y Cerrar sesión, sin Panel de control', async () => {
    platform.desktop = false;
    platform.wide = false;
    platform.role = 'therapist';
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByRole('button', { name: 'Menú del perfil' }));
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent?.trim())).toEqual(['Perfil', 'Configuración', 'Cerrar sesión']);
    expect(screen.queryByText('Panel de control')).toBeNull();
    await user.click(screen.getByRole('menuitem', { name: 'Configuración' }));
    expect(screen.getByRole('dialog', { name: 'Configuración' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Panel de control' })).toBeNull();
  });

  it('el círculo muestra la inicial del nombre de la terapeuta; sin perfil, la del correo', () => {
    platform.role = 'therapist';
    platform.name = 'Beatriz Gómez';
    const { unmount } = renderLayout();
    expect(screen.getByRole('button', { name: 'Menú del perfil' }).textContent).toBe('B');
    unmount();
    platform.name = '';
    renderLayout();
    expect(screen.getByRole('button', { name: 'Menú del perfil' }).textContent).toBe('A'); // ana@correo.com
  });
});

describe('Layout: barra lateral en PC', () => {
  const sidebar = () => screen.getByRole('complementary');
  const linkTexts = () => screen.getAllByRole('link').map((a) => a.textContent);

  it('está abierta por defecto: iconos y texto', () => {
    platform.role = 'therapist';
    renderLayout();
    expect(linkTexts()).toEqual(['Agenda', 'Pacientes', 'Anamnesia', 'Notas personales', 'Métricas']);
    expect(screen.getByText('Lister')).toBeTruthy();
    expect(sidebar().className).toContain('w-60');
    expect(screen.getByRole('button', { name: 'Contraer barra lateral' })).toBeTruthy();
  });

  it('al cerrarla no desaparece: queda el mini-sidebar solo con iconos, con tooltip, y se guarda', async () => {
    platform.role = 'therapist';
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByRole('button', { name: 'Contraer barra lateral' }));
    expect(sidebar().className).toContain('w-16');
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['', '', '', '', '']); // sin texto
    expect(links.map((a) => a.getAttribute('title'))).toEqual(['Agenda', 'Pacientes', 'Anamnesia', 'Notas personales', 'Métricas']);
    expect(links.every((a) => a.querySelector('svg'))).toBe(true);
    expect(links[0].className).toContain('bg-brand-600'); // el activo (Agenda, ruta /) sigue resaltado
    expect(links[1].className).not.toContain('bg-brand-600');
    expect(localStorage.getItem('lister.sidebar')).toBe('mini');
  });

  it('abierto → mini → abierto', async () => {
    platform.role = 'therapist';
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByRole('button', { name: 'Contraer barra lateral' }));
    await user.click(screen.getByRole('button', { name: 'Expandir barra lateral' }));
    expect(sidebar().className).toContain('w-60');
    expect(linkTexts()).toEqual(['Agenda', 'Pacientes', 'Anamnesia', 'Notas personales', 'Métricas']);
    expect(localStorage.getItem('lister.sidebar')).toBe('open');
  });

  it('recuerda el estado guardado al volver a abrir la app', () => {
    localStorage.setItem('lister.sidebar', 'mini');
    renderLayout();
    expect(sidebar().className).toContain('w-16');
  });

  it('migra la clave antigua lister.pin: "0" (oculta) pasa a mini y la clave vieja se borra', () => {
    localStorage.setItem('lister.pin', '0');
    renderLayout();
    expect(sidebar().className).toContain('w-16');
    expect(localStorage.getItem('lister.pin')).toBeNull();
    expect(localStorage.getItem('lister.sidebar')).toBe('mini');
  });

  it('lister.pin = "1" (fija) pasa a abierta', () => {
    localStorage.setItem('lister.pin', '1');
    renderLayout();
    expect(sidebar().className).toContain('w-60');
    expect(localStorage.getItem('lister.pin')).toBeNull();
  });

  it('el administrador en mini-sidebar ve solo el icono de Terapeutas', async () => {
    platform.role = 'admin';
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByRole('button', { name: 'Contraer barra lateral' }));
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('title'))).toEqual(['Terapeutas']);
  });
});

describe('Layout: barra lateral en celular', () => {
  beforeEach(() => {
    platform.wide = false;
    platform.role = 'therapist';
  });

  it('empieza totalmente cerrada: sin sidebar, sin mini-sidebar ni iconos laterales', () => {
    renderLayout();
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryAllByRole('link')).toEqual([]);
    expect(screen.queryByRole('dialog', { name: 'Menú de navegación' })).toBeNull();
  });

  it('la hamburguesa abre el drawer con fondo oscuro, los enlaces y Cerrar sesión', async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }));
    expect(screen.getByRole('dialog', { name: 'Menú de navegación' })).toBeTruthy();
    expect(screen.getByTestId('drawer-backdrop').className).toContain('bg-brand-900/40');
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Agenda', 'Pacientes', 'Anamnesia', 'Notas personales', 'Métricas']);
    expect(screen.getByRole('button', { name: /Cerrar sesión/ })).toBeTruthy();
  });

  it('al elegir una opción el drawer se cierra', async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }));
    await user.click(screen.getByRole('link', { name: 'Pacientes' }));
    expect(screen.queryByRole('dialog', { name: 'Menú de navegación' })).toBeNull();
  });

  it('al tocar fuera (el fondo oscuro) el drawer se cierra', async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }));
    await user.click(screen.getByTestId('drawer-backdrop'));
    expect(screen.queryByRole('dialog', { name: 'Menú de navegación' })).toBeNull();
  });

  it('el estado no se guarda: abrir no escribe en localStorage y un mini guardado en PC no afecta', async () => {
    localStorage.setItem('lister.sidebar', 'mini');
    const user = userEvent.setup();
    const { unmount } = renderLayout();
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }));
    expect(localStorage.getItem('lister.sidebar')).toBe('mini'); // sin cambios
    unmount();
    renderLayout(); // reabrir la app: otra vez cerrado
    expect(screen.queryAllByRole('link')).toEqual([]);
    expect(screen.queryByRole('dialog', { name: 'Menú de navegación' })).toBeNull();
  });
});
