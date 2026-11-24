// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('firebase/firestore', () => ({ doc: vi.fn(), onSnapshot: vi.fn(() => () => undefined) }));
vi.mock('../lib/firebase', () => ({ db: {} }));

import Profile from './Profile';
import { useTherapistProfile } from '../store/therapistProfile';
import { emptyTherapistProfile } from '../lib/validation';

const full = {
  ...emptyTherapistProfile(),
  fullName: 'Ana Pérez', email: 'ana@correo.com', idNumber: '1053000111', phone: '3001112233', specialty: 'Psicología clínica',
  licenseNumber: 'TP-4567', officeAddress: 'Cra 23 # 45-67', city: 'Manizales', yearsExperience: '8', bio: 'Trabajo con adultos y adolescentes.',
};

beforeEach(() => vi.stubEnv('VITE_ADMIN_EMAIL', 'admin@lister.co'));
afterEach(() => vi.unstubAllEnvs());

describe('Perfil de la terapeuta', () => {
  it('muestra los datos en tarjetas de solo lectura (sin campos editables)', () => {
    useTherapistProfile.setState({ ready: true, profile: full, error: false });
    render(<Profile />);
    for (const [title, values] of [
      ['Datos personales', ['Ana Pérez', '1053000111', '3001112233']],
      ['Datos profesionales', ['Psicología clínica', 'TP-4567', '8']],
      ['Consultorio', ['Cra 23 # 45-67', 'Manizales']],
      ['Descripción', ['Trabajo con adultos y adolescentes.']],
    ] as const) {
      const card = screen.getByRole('region', { name: title });
      for (const v of values) expect(within(card).getByText(v)).toBeTruthy();
    }
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('los campos sin dato muestran "—"', () => {
    useTherapistProfile.setState({ ready: true, profile: { ...full, phone: '', bio: '' }, error: false });
    render(<Profile />);
    expect(within(screen.getByRole('region', { name: 'Descripción' })).getByText('—')).toBeTruthy();
  });

  it('indica que se contacte al administrador, con enlace mailto', () => {
    useTherapistProfile.setState({ ready: true, profile: full, error: false });
    render(<Profile />);
    expect(screen.getByText(/Para cambiar estos datos, contacta al administrador/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'admin@lister.co' }).getAttribute('href')).toBe('mailto:admin@lister.co');
  });

  it('sin VITE_ADMIN_EMAIL el aviso queda sin enlace', () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', '');
    useTherapistProfile.setState({ ready: true, profile: full, error: false });
    render(<Profile />);
    expect(screen.getByText(/contacta al administrador/)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('estado vacío si no hay datos (cuenta sin perfil)', () => {
    useTherapistProfile.setState({ ready: true, profile: null, error: false });
    render(<Profile />);
    expect(screen.getByText('Aún no hay datos en tu perfil')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Datos personales' })).toBeNull();
    expect(screen.getByText(/contacta al administrador/)).toBeTruthy();
  });

  it('mientras carga no muestra ni datos ni estado vacío; con error avisa', () => {
    useTherapistProfile.setState({ ready: false, profile: null, error: false });
    const { unmount } = render(<Profile />);
    expect(screen.queryByText('Aún no hay datos en tu perfil')).toBeNull();
    unmount();
    useTherapistProfile.setState({ ready: true, profile: null, error: true });
    render(<Profile />);
    expect(screen.getByText(/No se pudo cargar tu perfil/)).toBeTruthy();
  });
});
