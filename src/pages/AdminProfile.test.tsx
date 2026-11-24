// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

const st = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }));
vi.mock('../store/auth', () => ({ useAuth: (sel: (s: { user: unknown }) => unknown) => sel({ user: st.user }) }));

import AdminProfile, { formatAuthDate } from './AdminProfile';

beforeEach(() => {
  st.user = {
    uid: 'adm123',
    email: 'admin@lister.co',
    displayName: 'Felipe Suárez',
    emailVerified: true,
    metadata: { creationTime: 'Mon, 02 Mar 2026 15:00:00 GMT', lastSignInTime: 'Sat, 14 Nov 2026 20:00:00 GMT' },
  };
});

describe('Perfil del administrador', () => {
  it('muestra los datos de su cuenta de Firebase y su rol, solo lectura', () => {
    render(<AdminProfile />);
    const cuenta = within(screen.getByRole('region', { name: 'Cuenta' }));
    expect(cuenta.getByText('Felipe Suárez')).toBeTruthy();
    expect(cuenta.getByText('admin@lister.co')).toBeTruthy();
    expect(cuenta.getByText('adm123')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Rol' })).getByText('Administrador de la plataforma')).toBeTruthy();
    expect(screen.getByText('Sí')).toBeTruthy();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('sin nombre en Firebase muestra una raya, y no se rompe sin fechas', () => {
    st.user = { uid: 'a', email: 'admin@lister.co', displayName: null, emailVerified: false, metadata: {} };
    render(<AdminProfile />);
    expect(within(screen.getByRole('region', { name: 'Cuenta' })).getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByText('No')).toBeTruthy();
  });

  it('formatAuthDate: fecha válida en español, vacío si no hay o es inválida', () => {
    expect(formatAuthDate('Sat, 14 Nov 2026 20:00:00 GMT')).toMatch(/noviembre/);
    expect(formatAuthDate(undefined)).toBe('');
    expect(formatAuthDate('basura')).toBe('');
  });
});
