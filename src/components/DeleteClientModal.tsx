import { useData } from '../store/data';
import { toast } from '../store/toast';
import { clientImpact } from '../lib/validation';
import type { Client } from '../lib/types';
import { ConfirmModal } from './ui';

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Texto de confirmación: qué se borra (cascada), con aviso de citas futuras y de reservas semanales. */
export function deleteMessage(name: string, i: ReturnType<typeof clientImpact>): string {
  const parts = [n(i.appointments, 'cita', 'citas'), n(i.sessions, 'consulta', 'consultas'), n(i.observations, 'observación', 'observaciones')];
  let msg = `Se eliminará a ${name} junto con todo su expediente: ${parts.join(', ')}.`;
  if (i.future > 0) msg += ` ⚠ Tiene ${n(i.future, 'cita futura programada', 'citas futuras programadas')}: también se borrará${i.future === 1 ? '' : 'n'}.`;
  if (i.series > 0) msg += ` Se borran todas las citas de sus reservas semanales (${i.series}).`;
  return `${msg} Esta acción no se puede deshacer.`;
}

/** Confirmación y borrado en cascada de un paciente. `onDeleted` se llama solo si el borrado salió bien. */
export default function DeleteClientModal({ client, onClose, onDeleted }: { client: Pick<Client, 'id' | 'fullName'> | null; onClose: () => void; onDeleted?: () => void }) {
  const { appointments, sessions, observations, deleteClient } = useData();
  const impact = client ? clientImpact(client.id, { appointments, sessions, observations }) : null;
  return (
    <ConfirmModal
      open={client !== null}
      title="Eliminar paciente"
      message={client && impact ? deleteMessage(client.fullName, impact) : ''}
      onClose={onClose}
      onConfirm={async () => {
        try {
          await deleteClient(client!.id);
          toast.info('Paciente eliminado');
          onDeleted?.();
        } catch {
          toast.error('No se pudo eliminar al paciente. Inténtalo de nuevo.');
        }
      }}
    />
  );
}
