/**
 * Migración de roles de UN SOLO USO (modelo antiguo → administrador/terapeuta).
 *
 *   - usuarios SIN users/{uid}  → { role: 'therapist', ownerId: uid, email }   (conservan sus datos)
 *   - usuarios con role 'editor' → { role: 'therapist', ownerId: uid, email }   (dejan de ver los datos de la terapeuta anterior)
 *   - admin / terapeutas ya migradas → sin cambios
 *
 * Antes crea a mano el primer admin (ver README): el script se niega a aplicar si no existe ningún admin, porque
 * si no, tu propia cuenta de administración (sin documento) se convertiría en terapeuta.
 *
 * Uso (desde functions/, con credenciales de Admin SDK: `gcloud auth application-default login`
 * o GOOGLE_APPLICATION_CREDENTIALS apuntando a una clave de servicio del proyecto):
 *   npx tsx scripts/migrate-roles.ts            # simulacro: solo muestra qué haría
 *   npx tsx scripts/migrate-roles.ts --apply    # escribe los cambios
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { hasAdmin, planMigration, type AuthUserLite, type UserDocLite } from '../src/migrateLogic';

async function main() {
  const apply = process.argv.includes('--apply');
  initializeApp();
  const auth = getAuth();
  const db = getFirestore();

  const authUsers: AuthUserLite[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) authUsers.push({ uid: u.uid, email: u.email });
    pageToken = page.pageToken;
  } while (pageToken);

  const docs = new Map<string, UserDocLite>();
  for (const snap of await db.collection('users').get()) docs.set(snap.id, snap.data() as UserDocLite);

  if (!hasAdmin(docs)) {
    console.error('No hay ningún usuario con role "admin" en users/. Crea el primero a mano (README) y vuelve a ejecutar.');
    process.exit(1);
  }

  const plan = planMigration(authUsers, docs);
  for (const p of plan) console.log(`${p.action.toUpperCase().padEnd(7)} ${p.uid}  ${p.note}`);
  const writes = plan.filter((p) => p.action !== 'skip');
  console.log(`\n${writes.length} cambio(s) de ${plan.length} usuario(s).`);

  if (!apply) {
    console.log('Simulacro: no se escribió nada. Añade --apply para aplicar.');
    return;
  }
  for (const p of writes) {
    if (p.action === 'skip') continue;
    await db.collection('users').doc(p.uid).set({ ...p.doc, migratedAt: Date.now() }, { merge: false });
  }
  console.log('Migración aplicada.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
