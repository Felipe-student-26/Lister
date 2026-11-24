// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProfileMenu, { initialOf } from './ProfileMenu';

type Props = Partial<React.ComponentProps<typeof ProfileMenu>>;
const setup = (props: Props = {}) => {
  const h = { onSettings: vi.fn(), onControlPanel: vi.fn(), onLogout: vi.fn() };
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<ProfileMenu name="Ana Pérez" email="ana@correo.com" role="therapist" {...h} {...props} />} />
        <Route path="/perfil" element={<p>Página de perfil</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return h;
};
const trigger = () => screen.getByRole('button', { name: 'Menú del perfil' });
const labels = () => screen.getAllByRole('menuitem').map((b) => b.textContent?.trim());

describe('menú del perfil: el botón', () => {
  it('muestra SOLO el círculo con la inicial del nombre (sin correo ni chevron)', () => {
    setup();
    expect(trigger().textContent).toBe('A');
    expect(trigger().querySelector('svg')).toBeNull(); // sin chevron
    expect(screen.queryByText('ana@correo.com')).toBeNull(); // el correo solo aparece dentro del menú
    expect(screen.queryByText('Terapeuta')).toBeNull();
  });

  it('si no hay nombre usa la primera letra del correo (en mayúscula)', () => {
    setup({ name: undefined, email: 'carlos@correo.com' });
    expect(trigger().textContent).toBe('C');
  });

  it('initialOf: nombre con espacios, nombre vacío y sin datos', () => {
    expect(initialOf('  luz mora', 'x@x.co')).toBe('L');
    expect(initialOf('   ', 'beto@x.co')).toBe('B');
    expect(initialOf(undefined, '')).toBe('?');
  });
});

describe('menú del perfil: el desplegable', () => {
  it('está cerrado al inicio; al abrirlo muestra nombre, correo completo y rol', async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.queryByRole('menu')).toBeNull();
    await user.click(trigger());
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Ana Pérez')).toBeTruthy();
    expect(screen.getByText('ana@correo.com')).toBeTruthy();
    expect(screen.getByText('Terapeuta')).toBeTruthy();
  });

  it('PC (terapeuta): Perfil, Configuración, Panel de control y Cerrar sesión, con Perfil encima de Configuración', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(trigger());
    expect(labels()).toEqual(['Perfil', 'Configuración', 'Panel de control', 'Cerrar sesión']);
  });

  it('"Perfil" lleva a /perfil y cierra el menú', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(trigger());
    const perfil = screen.getByRole('menuitem', { name: 'Perfil' });
    expect(perfil.getAttribute('href')).toBe('/perfil');
    await user.click(perfil);
    expect(await screen.findByText('Página de perfil')).toBeTruthy();
  });

  it('celular: sin onControlPanel no aparece el Panel de control, pero sí Perfil, Configuración y Cerrar sesión', async () => {
    const user = userEvent.setup();
    setup({ onControlPanel: undefined });
    await user.click(trigger());
    expect(labels()).toEqual(['Perfil', 'Configuración', 'Cerrar sesión']);
  });

  it('el administrador de la plataforma también tiene Perfil (el de su cuenta de Firebase)', async () => {
    const user = userEvent.setup();
    setup({ role: 'admin', name: undefined });
    await user.click(trigger());
    expect(labels()).toEqual(['Perfil', 'Configuración', 'Panel de control', 'Cerrar sesión']);
    expect(screen.getByText('Administrador')).toBeTruthy();
  });

  it('las acciones llaman a su función y cierran el menú', async () => {
    const user = userEvent.setup();
    const h = setup();
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: 'Panel de control' }));
    expect(h.onControlPanel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: 'Configuración' }));
    expect(h.onSettings).toHaveBeenCalledTimes(1);
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }));
    expect(h.onLogout).toHaveBeenCalledTimes(1);
  });

  it('se cierra con Escape y al hacer clic fuera', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(trigger());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    await user.click(trigger());
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
