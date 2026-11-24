/** Lógica pura de la migración de roles (la usa functions/scripts/migrate-roles.ts y se prueba en functions/test). */
export interface AuthUserLite {
  uid: string;
  email?: string;
}
export interface UserDocLite {
  role?: unknown;
  ownerId?: unknown;
  email?: unknown;
}

export type MigrationAction =
  | { uid: string; action: 'create'; doc: { role: 'therapist'; ownerId: string; email: string }; note: string }
  | { uid: string; action: 'convert'; doc: { role: 'therapist'; ownerId: string; email: string }; note: string }
  | { uid: string; action: 'skip'; note: string };

/** Sin al menos un admin la plataforma quedaría sin quien cree terapeutas: el script se niega a aplicar. */
export function hasAdmin(docs: Map<string, UserDocLite>): boolean {
  for (const d of docs.values()) if (d.role === 'admin') return true;
  return false;
}

export function planMigration(authUsers: AuthUserLite[], docs: Map<string, UserDocLite>): MigrationAction[] {
  return authUsers.map((u): MigrationAction => {
    const d = docs.get(u.uid);
    const email = u.email ?? (typeof d?.email === 'string' ? d.email : '');
    if (!d) {
      return {
        uid: u.uid,
        action: 'create',
        doc: { role: 'therapist', ownerId: u.uid, email },
        note: 'sin documento: antes era admin de sus propios datos; pasa a terapeuta y conserva sus datos (ownerId = su uid)',
      };
    }
    if (d.role === 'editor') {
      return {
        uid: u.uid,
        action: 'convert',
        doc: { role: 'therapist', ownerId: u.uid, email },
        note: `editor${typeof d.ownerId === 'string' && d.ownerId !== u.uid ? ` de ${d.ownerId}` : ''}: pasa a terapeuta con su propio ownerId; deja de ver los datos de la terapeuta anterior`,
      };
    }
    if (d.role === 'admin') return { uid: u.uid, action: 'skip', note: 'admin de la plataforma: sin cambios' };
    if (d.role === 'therapist') {
      return d.ownerId === u.uid
        ? { uid: u.uid, action: 'skip', note: 'ya es terapeuta con ownerId propio' }
        : { uid: u.uid, action: 'skip', note: `terapeuta con ownerId distinto (${String(d.ownerId)}): revisar a mano` };
    }
    return { uid: u.uid, action: 'skip', note: `rol desconocido (${String(d.role)}): revisar a mano` };
  });
}
