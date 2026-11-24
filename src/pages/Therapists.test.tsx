// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const m = vi.hoisted(() => ({
  rows: [] as unknown[],
  watchError: false,
  createTherapistAccount: vi.fn(),
  removeTherapistAccount: vi.fn(),
  sendTherapistPasswordLink: vi.fn(),
  saveTherapistProfile: vi.fn(),
}));
vi.mock('../lib/team', () => ({
  watchTherapists: (onData: (r: unknown[]) => void, onError: () => void) => {
    if (m.watchError) onError();
    else onData(m.rows);
    return () => undefined;
  },
  saveTherapistProfile: m.saveTherapistProfile,
}));
vi.mock('../lib/therapistAdmin', () => ({
  createTherapistAccount: m.createTherapistAccount,
  removeTherapistAccount: m.removeTherapistAccount,
  sendTherapistPasswordLink: m.sendTherapistPasswordLink,
  therapistErrorMessage: (e: unknown, f: string) => (e as Error)?.message || f,
}));

import Therapists from './Therapists';
import { useToast } from '../store/toast';
import { emptyTherapistProfile } from '../lib/validation';

const th = (uid: string, over: Record<string, unknown> = {}) => ({ ...emptyTherapistProfile(), uid, hasProfile: true, fullName: `Terapeuta ${uid}`, email: `${uid}@correo.com`, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  m.watchError = false;
  m.rows = [th('ana', { fullName: 'Ana Pérez', phone: '3001112233', specialty: 'Psicología' }), th('luz', { fullName: 'Luz Gómez' })];
  m.createTherapistAccount.mockResolvedValue({ uid: 'n1', email: 'nueva@correo.com', emailSent: true });
  m.removeTherapistAccount.mockResolvedValue(undefined);
  m.saveTherapistProfile.mockResolvedValue(undefined);
  m.sendTherapistPasswordLink.mockResolvedValue(undefined);
  useToast.setState({ toasts: [] });
});

const toasts = () => useToast.getState().toasts.map((t) => t.message);
const fillCreate = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /Crear terapeuta/ }));
  return screen.getByRole('dialog', { name: 'Crear terapeuta' });
};

describe('Therapists: tabla', () => {
  it('muestra nombre, correo y teléfono, y las tres acciones por fila', () => {
    render(<Therapists />);
    const row = screen.getByText('Ana Pérez').closest('tr') as HTMLElement;
    expect(within(row).getAllByText('ana@correo.com').length).toBeGreaterThan(0); // PC: columna; celular: bajo el nombre
    expect(within(row).getByText('3001112233')).toBeTruthy();
    expect(within(row).getByRole('button', { name: /Ver o editar/ })).toBeTruthy();
    expect(within(row).getByRole('button', { name: /Enviar correo de contraseña/ })).toBeTruthy();
    expect(within(row).getByRole('button', { name: /Eliminar a Ana Pérez/ })).toBeTruthy();
  });

  it('filtra por texto y cambia el orden', async () => {
    const user = userEvent.setup();
    render(<Therapists />);
    const names = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(names()[0]).toContain('Ana Pérez');
    await user.click(screen.getByRole('button', { name: 'Cambiar orden' }));
    expect(names()[0]).toContain('Luz Gómez');
    await user.type(screen.getByLabelText('Buscar terapeutas'), '3001112');
    expect(names()).toHaveLength(1); // por teléfono
    await user.clear(screen.getByLabelText('Buscar terapeutas'));
    await user.type(screen.getByLabelText('Buscar terapeutas'), 'luz@');
    expect(names()).toHaveLength(1);
    await user.type(screen.getByLabelText('Buscar terapeutas'), 'zzz');
    expect(screen.getByText(/Sin resultados/)).toBeTruthy();
  });

  it('pagina de 8 en 8', async () => {
    m.rows = Array.from({ length: 11 }, (_, i) => th(`t${String(i).padStart(2, '0')}`, { fullName: `Terapeuta ${String(i).padStart(2, '0')}` }));
    const user = userEvent.setup();
    render(<Therapists />);
    expect(screen.getAllByRole('row')).toHaveLength(1 + 8);
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getAllByRole('row')).toHaveLength(1 + 3);
    expect(screen.getByText('2 / 2')).toBeTruthy();
  });

  it('estado vacío y error de carga', () => {
    m.rows = [];
    const { unmount } = render(<Therapists />);
    expect(screen.getByText('Aún no hay terapeutas')).toBeTruthy();
    unmount();
    m.watchError = true;
    render(<Therapists />);
    expect(screen.getByText('No se pudieron cargar las terapeutas.')).toBeTruthy();
  });
});

describe('Therapists: crear', () => {
  it('valida inline nombre y correo y no llama al servidor', async () => {
    const user = userEvent.setup();
    render(<Therapists />);
    const dlg = await fillCreate(user);
    await user.click(within(dlg).getByRole('button', { name: 'Crear terapeuta' }));
    expect(within(dlg).getByText('Escribe el nombre completo')).toBeTruthy();
    expect(within(dlg).getByText('Escribe el correo')).toBeTruthy();
    await user.type(within(dlg).getByLabelText('Correo *'), 'no-es-correo');
    await user.type(within(dlg).getByLabelText('Nombre completo *'), 'Nueva Terapeuta');
    await user.type(within(dlg).getByLabelText('Años de experiencia'), '-3');
    await user.click(within(dlg).getByRole('button', { name: 'Crear terapeuta' }));
    expect(within(dlg).getByText('Correo no válido')).toBeTruthy();
    expect(within(dlg).getByText('Escribe un número entre 0 y 99')).toBeTruthy();
    expect(m.createTherapistAccount).not.toHaveBeenCalled();
  });

  it('crea con los datos del perfil y muestra "Se envió un correo a ..." (ya no hay enlace)', async () => {
    const user = userEvent.setup();
    render(<Therapists />);
    const dlg = await fillCreate(user);
    await user.type(within(dlg).getByLabelText('Nombre completo *'), '  Nueva Terapeuta ');
    await user.type(within(dlg).getByLabelText('Correo *'), 'nueva@correo.com');
    await user.type(within(dlg).getByLabelText('Teléfono'), '3001234567');
    await user.type(within(dlg).getByLabelText('Especialidad'), 'Clínica');
    await user.type(within(dlg).getByLabelText('Años de experiencia'), '5');
    await user.click(within(dlg).getByRole('button', { name: 'Crear terapeuta' }));
    await waitFor(() => expect(m.createTherapistAccount).toHaveBeenCalledTimes(1));
    expect(m.createTherapistAccount.mock.calls[0][0]).toMatchObject({
      email: 'nueva@correo.com',
      profile: { fullName: 'Nueva Terapeuta', email: 'nueva@correo.com', phone: '3001234567', specialty: 'Clínica', yearsExperience: '5', bio: '' },
    });
    const done = await screen.findByRole('dialog', { name: 'Terapeuta creada' });
    expect(done.textContent).toContain('Se envió un correo a nueva@correo.com para que defina su contraseña.');
    expect(within(done).queryByText(/https?:/)).toBeNull(); // ya no se muestra ningún enlace
    expect(screen.queryByRole('dialog', { name: 'Crear terapeuta' })).toBeNull();
    expect(toasts()).toContain('Terapeuta creada');
    await userEvent.setup().click(within(done).getByRole('button', { name: 'Listo' }));
    expect(screen.queryByRole('dialog', { name: 'Terapeuta creada' })).toBeNull();
  });

  it('si la cuenta se creó pero el correo no salió, lo avisa y explica cómo reintentar', async () => {
    m.createTherapistAccount.mockResolvedValue({ uid: 'n1', email: 'nueva@correo.com', emailSent: false });
    const user = userEvent.setup();
    render(<Therapists />);
    const dlg = await fillCreate(user);
    await user.type(within(dlg).getByLabelText('Nombre completo *'), 'Nueva Terapeuta');
    await user.type(within(dlg).getByLabelText('Correo *'), 'nueva@correo.com');
    await user.click(within(dlg).getByRole('button', { name: 'Crear terapeuta' }));
    const done = await screen.findByRole('dialog', { name: 'Terapeuta creada' });
    expect(done.textContent).toContain('no se pudo enviar el correo');
    expect(done.textContent).toContain('Enviar correo de contraseña');
    expect(done.textContent).not.toContain('Se envió un correo');
  });

  it('si el servidor falla (p. ej. correo repetido) muestra el error y conserva lo escrito', async () => {
    m.createTherapistAccount.mockRejectedValue(new Error('Ese correo ya existe en Firebase Authentication. Si era de una terapeuta eliminada, bórralo a mano en la consola (Authentication).'));
    const user = userEvent.setup();
    render(<Therapists />);
    const dlg = await fillCreate(user);
    await user.type(within(dlg).getByLabelText('Nombre completo *'), 'Nueva Terapeuta');
    await user.type(within(dlg).getByLabelText('Correo *'), 'ana@correo.com');
    await user.click(within(dlg).getByRole('button', { name: 'Crear terapeuta' }));
    expect((await within(dlg).findByRole('alert')).textContent).toMatch(/Ese correo ya existe en Firebase Authentication/);
    expect(screen.queryByRole('dialog', { name: 'Terapeuta creada' })).toBeNull();
    expect((within(dlg).getByLabelText('Nombre completo *') as HTMLInputElement).value).toBe('Nueva Terapeuta');
  });
});

describe('Therapists: eliminar', () => {
  it('pide confirmación (y avisa de los datos clínicos); cancelar no elimina', async () => {
    const user = userEvent.setup();
    render(<Therapists />);
    await user.click(screen.getByRole('button', { name: 'Eliminar a Ana Pérez' }));
    const dlg = screen.getByRole('dialog', { name: 'Eliminar terapeuta' });
    expect(within(dlg).getByText(/NO se borran automáticamente/)).toBeTruthy();
    expect(within(dlg).getByText(/bórrala a mano en la consola \(Authentication\)/)).toBeTruthy();
    expect(within(dlg).getByText(/Ana Pérez/)).toBeTruthy();
    await user.click(within(dlg).getByRole('button', { name: 'Cancelar' }));
    expect(m.removeTherapistAccount).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Eliminar terapeuta' })).toBeNull();
  });

  it('al confirmar llama a removeTherapistAccount con el uid y avisa', async () => {
    const user = userEvent.setup();
    render(<Therapists />);
    await user.click(screen.getByRole('button', { name: 'Eliminar a Ana Pérez' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Eliminar terapeuta' })).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(m.removeTherapistAccount).toHaveBeenCalledWith('ana'));
    expect(toasts()).toContain('Terapeuta eliminada');
  });

  it('si falla, avisa con el mensaje del error', async () => {
    m.removeTherapistAccount.mockRejectedValue(new Error('No tienes permiso para hacer esto.'));
    const user = userEvent.setup();
    render(<Therapists />);
    await user.click(screen.getByRole('button', { name: 'Eliminar a Luz Gómez' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Eliminar terapeuta' })).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(toasts()).toContain('No tienes permiso para hacer esto.'));
  });
});

describe('Therapists: ver/editar y correo de contraseña', () => {
  it('abre el perfil con los datos, permite vaciar campos opcionales y guarda', async () => {
    const user = userEvent.setup();
    render(<Therapists />);
    await user.click(screen.getByRole('button', { name: 'Ver o editar a Ana Pérez' }));
    const dlg = screen.getByRole('dialog', { name: 'Perfil de la terapeuta' });
    expect((within(dlg).getByLabelText('Nombre completo *') as HTMLInputElement).value).toBe('Ana Pérez');
    expect((within(dlg).getByLabelText('Correo *') as HTMLInputElement).readOnly).toBe(true);
    await user.clear(within(dlg).getByLabelText('Teléfono'));
    await user.clear(within(dlg).getByLabelText('Especialidad'));
    await user.click(within(dlg).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(m.saveTherapistProfile).toHaveBeenCalledTimes(1));
    expect(m.saveTherapistProfile.mock.calls[0][0]).toBe('ana');
    expect(m.saveTherapistProfile.mock.calls[0][1]).toMatchObject({ fullName: 'Ana Pérez', phone: '', specialty: '' });
    expect(toasts()).toContain('Perfil actualizado');
  });

  it('el nombre no puede quedar vacío', async () => {
    const user = userEvent.setup();
    render(<Therapists />);
    await user.click(screen.getByRole('button', { name: 'Ver o editar a Ana Pérez' }));
    const dlg = screen.getByRole('dialog', { name: 'Perfil de la terapeuta' });
    await user.clear(within(dlg).getByLabelText('Nombre completo *'));
    await user.click(within(dlg).getByRole('button', { name: 'Guardar' }));
    expect(within(dlg).getByText('Escribe el nombre completo')).toBeTruthy();
    expect(m.saveTherapistProfile).not.toHaveBeenCalled();
  });

  it('"Enviar correo de contraseña" envía el correo y avisa con un toast (sin modal ni enlace)', async () => {
    const user = userEvent.setup();
    render(<Therapists />);
    await user.click(screen.getByRole('button', { name: 'Enviar correo de contraseña a Luz Gómez' }));
    await waitFor(() => expect(m.sendTherapistPasswordLink).toHaveBeenCalledWith('luz@correo.com'));
    await waitFor(() => expect(toasts()).toContain('Correo de contraseña enviado a luz@correo.com'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('si no se puede enviar el correo, avisa con el error', async () => {
    m.sendTherapistPasswordLink.mockRejectedValue(new Error('Sin conexión. Revisa tu internet e inténtalo de nuevo.'));
    const user = userEvent.setup();
    render(<Therapists />);
    await user.click(screen.getByRole('button', { name: 'Enviar correo de contraseña a Luz Gómez' }));
    await waitFor(() => expect(toasts()).toContain('Sin conexión. Revisa tu internet e inténtalo de nuevo.'));
  });
});
