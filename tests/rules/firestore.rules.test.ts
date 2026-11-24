/**
 * Reglas de Firestore contra el emulador. Se ejecuta con `npm run test:rules` (no forma parte de `npm test`).
 * Requiere firebase-tools (devDependency) y Java para el emulador.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-lister',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
  });
});
afterAll(async () => env?.cleanup());

const CLINICAL = ['clients', 'appointments', 'sessions', 'observations'] as const;
const PERSONAL = ['notes', 'bookPages'] as const; // notas personales (mural y libro)

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // adm y adm2: administradores de la plataforma. ther1 y ther2: terapeutas (dueñas de sus datos).
    // mal: terapeuta con perfil mal migrado (ownerId ajeno). nada: usuaria autenticada sin documento.
    await setDoc(doc(db, 'users/adm'), { role: 'admin', ownerId: 'adm', email: 'adm@x.co' });
    await setDoc(doc(db, 'users/adm2'), { role: 'admin', ownerId: 'adm2', email: 'adm2@x.co' });
    await setDoc(doc(db, 'users/ther1'), { role: 'therapist', ownerId: 'ther1', email: 't1@x.co' });
    await setDoc(doc(db, 'users/ther2'), { role: 'therapist', ownerId: 'ther2', email: 't2@x.co' });
    await setDoc(doc(db, 'users/mal'), { role: 'therapist', ownerId: 'ther1', email: 'mal@x.co' });
    for (const col of CLINICAL) {
      await setDoc(doc(db, `${col}/${col}-1`), { ownerId: 'ther1', text: 'de ther1' });
      await setDoc(doc(db, `${col}/${col}-2`), { ownerId: 'ther2', text: 'de ther2' });
    }
    for (const col of PERSONAL) {
      await setDoc(doc(db, `${col}/${col}-1`), { ownerId: 'ther1', text: 'de ther1' });
      await setDoc(doc(db, `${col}/${col}-2`), { ownerId: 'ther2', text: 'de ther2' });
    }
    await setDoc(doc(db, 'therapistProfiles/ther1'), { fullName: 'Ana Pérez', email: 't1@x.co', phone: '300', specialty: 'Psicología' });
    await setDoc(doc(db, 'therapistProfiles/ther2'), { fullName: 'Luz Gómez', email: 't2@x.co' });
    await setDoc(doc(db, 'loginAttempts/abc'), { attempts: 3, lockedUntil: 0 });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe('(c) la terapeuta es dueña de sus datos y puede eliminarlos', () => {
  it('lee, crea, edita y ELIMINA pacientes, citas, sesiones y observaciones propias', async () => {
    const db = as('ther1');
    for (const col of CLINICAL) {
      await assertSucceeds(getDoc(doc(db, `${col}/${col}-1`)));
      await assertSucceeds(addDoc(collection(db, col), { ownerId: 'ther1', text: 'nuevo' }));
      await assertSucceeds(updateDoc(doc(db, `${col}/${col}-1`), { text: 'editado' }));
      await assertSucceeds(deleteDoc(doc(db, `${col}/${col}-1`)));
    }
  });

  it('puede listar solo lo suyo (consulta por ownerId propio)', async () => {
    await assertSucceeds(getDocs(query(collection(as('ther1'), 'clients'), where('ownerId', '==', 'ther1'))));
  });

  it('no puede crear datos a nombre de otra ni cambiar la propietaria de un documento', async () => {
    const db = as('ther1');
    await assertFails(addDoc(collection(db, 'clients'), { ownerId: 'ther2', fullName: 'Intruso' }));
    await assertFails(updateDoc(doc(db, 'clients/clients-1'), { ownerId: 'ther2' }));
  });
});

describe('(a) una terapeuta no accede a los datos de otra', () => {
  it('no lee, edita ni elimina datos ajenos, en ninguna colección clínica', async () => {
    const db = as('ther2');
    for (const col of CLINICAL) {
      await assertFails(getDoc(doc(db, `${col}/${col}-1`)));
      await assertFails(updateDoc(doc(db, `${col}/${col}-1`), { text: 'x' }));
      await assertFails(deleteDoc(doc(db, `${col}/${col}-1`)));
      await assertFails(getDocs(query(collection(db, col), where('ownerId', '==', 'ther1'))));
    }
    await assertSucceeds(getDocs(query(collection(db, 'clients'), where('ownerId', '==', 'ther2'))));
  });

  it('un perfil mal migrado (ownerId ajeno) no da acceso ni a los datos ajenos ni a los propios', async () => {
    const db = as('mal');
    await assertFails(getDoc(doc(db, 'clients/clients-1')));
    await assertFails(addDoc(collection(db, 'clients'), { ownerId: 'mal', fullName: 'x' }));
    await assertFails(addDoc(collection(db, 'clients'), { ownerId: 'ther1', fullName: 'x' }));
  });

  it('sin sesión no se lee nada', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'clients/clients-1')));
  });
});

describe('(b) el administrador de la plataforma NO accede a datos clínicos', () => {
  it('no lee, lista, crea, edita ni elimina nada clínico', async () => {
    const db = as('adm');
    for (const col of CLINICAL) {
      await assertFails(getDoc(doc(db, `${col}/${col}-1`)));
      await assertFails(getDocs(query(collection(db, col), where('ownerId', '==', 'ther1'))));
      await assertFails(getDocs(query(collection(db, col), where('ownerId', '==', 'adm'))));
      await assertFails(addDoc(collection(db, col), { ownerId: 'adm', text: 'x' }));
      await assertFails(addDoc(collection(db, col), { ownerId: 'ther1', text: 'x' }));
      await assertFails(updateDoc(doc(db, `${col}/${col}-1`), { text: 'x' }));
      await assertFails(deleteDoc(doc(db, `${col}/${col}-1`)));
    }
  });
});

describe('sin documento = sin acceso', () => {
  it('una usuaria autenticada sin users/{uid} no lee ni escribe datos clínicos (ni los suyos)', async () => {
    const db = as('nada');
    await assertFails(getDoc(doc(db, 'clients/clients-1')));
    await assertFails(addDoc(collection(db, 'clients'), { ownerId: 'nada', fullName: 'x' }));
    await assertFails(getDocs(query(collection(db, 'clients'), where('ownerId', '==', 'nada'))));
  });
});

describe('(d) users: solo el admin crea terapeutas válidas y las borra; nadie edita', () => {
  const validTherapist = (uid: string, extra: Record<string, unknown> = {}) => ({ role: 'therapist', ownerId: uid, email: `${uid}@x.co`, createdAt: 1, ...extra });

  it('el admin crea un documento de terapeuta válido (con o sin createdAt)', async () => {
    const db = as('adm');
    await assertSucceeds(setDoc(doc(db, 'users/nueva'), validTherapist('nueva')));
    await assertSucceeds(setDoc(doc(db, 'users/nueva2'), { role: 'therapist', ownerId: 'nueva2', email: 'n2@x.co' }));
  });

  it('el admin crea users y therapistProfiles en un mismo lote (como hace la app) y la nueva terapeuta entra a sus datos', async () => {
    const db = as('adm');
    const batch = writeBatch(db);
    batch.set(doc(db, 'users/nueva'), validTherapist('nueva'));
    batch.set(doc(db, 'therapistProfiles/nueva'), { fullName: 'Nueva Terapeuta', email: 'nueva@x.co', phone: '', createdAt: 1, updatedAt: 1 });
    await assertSucceeds(batch.commit());
    await assertSucceeds(addDoc(collection(as('nueva'), 'clients'), { ownerId: 'nueva', fullName: 'Paciente' }));
  });

  it('el admin NO puede crear un admin, ni un doc con ownerId ajeno, ni campos extra, ni emails vacíos o sin tipo', async () => {
    const db = as('adm');
    await assertFails(setDoc(doc(db, 'users/nuevo-admin'), { role: 'admin', ownerId: 'nuevo-admin', email: 'a@x.co' }));
    await assertFails(setDoc(doc(db, 'users/nueva'), validTherapist('nueva', { ownerId: 'ther1' })));
    await assertFails(setDoc(doc(db, 'users/nueva'), validTherapist('nueva', { ownerId: 'adm' })));
    await assertFails(setDoc(doc(db, 'users/nueva'), validTherapist('nueva', { isAdmin: true })));
    await assertFails(setDoc(doc(db, 'users/nueva'), validTherapist('nueva', { extra: 'x' })));
    await assertFails(setDoc(doc(db, 'users/nueva'), validTherapist('nueva', { email: '' })));
    await assertFails(setDoc(doc(db, 'users/nueva'), validTherapist('nueva', { email: 123 })));
    await assertFails(setDoc(doc(db, 'users/nueva'), { role: 'therapist', ownerId: 'nueva' })); // sin correo
    await assertFails(setDoc(doc(db, 'users/nueva'), { role: 'therapist', email: 'n@x.co' })); // sin ownerId
    await assertFails(setDoc(doc(db, 'users/nueva'), validTherapist('nueva', { role: 'editor' })));
    await assertFails(setDoc(doc(db, 'users/nueva'), validTherapist('nueva', { createdAt: 'ayer' })));
  });

  it('no se puede "recrear" ni degradar un documento existente (los de admin y terapeutas ya existen)', async () => {
    const db = as('adm');
    await assertFails(setDoc(doc(db, 'users/adm'), validTherapist('adm'))); // degradarse
    await assertFails(setDoc(doc(db, 'users/adm2'), validTherapist('adm2'))); // degradar a otro admin
    await assertFails(setDoc(doc(db, 'users/ther1'), validTherapist('ther1', { email: 'otro@x.co' }))); // sobrescribir una terapeuta
  });

  it('nadie edita users: ni el admin, ni la terapeuta sobre sí misma ni sobre otra', async () => {
    for (const uid of ['adm', 'ther1']) {
      const db = as(uid);
      await assertFails(updateDoc(doc(db, 'users/ther1'), { email: 'otro@x.co' }));
      await assertFails(updateDoc(doc(db, 'users/ther1'), { role: 'admin' }));
      await assertFails(updateDoc(doc(db, 'users/ther1'), { ownerId: 'ther2' }));
      await assertFails(updateDoc(doc(db, 'users/ther2'), { email: 'otro@x.co' }));
      await assertFails(updateDoc(doc(db, 'users/adm'), { role: 'therapist' }));
      await assertFails(updateDoc(doc(db, 'users/adm2'), { email: 'otro@x.co' }));
    }
    await assertFails(updateDoc(doc(as('nada'), 'users/ther1'), { role: 'admin' }));
  });

  it('una terapeuta, quien no tiene perfil y quien no inició sesión no pueden escribir users', async () => {
    for (const db of [as('ther1'), as('mal'), as('nada'), env.unauthenticatedContext().firestore()]) {
      await assertFails(setDoc(doc(db, 'users/ther1'), { role: 'admin', ownerId: 'ther1', email: 'x@x.co' }));
      await assertFails(setDoc(doc(db, 'users/nada'), { role: 'admin', ownerId: 'nada', email: 'x@x.co' }));
      await assertFails(setDoc(doc(db, 'users/nuevo'), validTherapist('nuevo')));
      await assertFails(deleteDoc(doc(db, 'users/ther2')));
      await assertFails(deleteDoc(doc(db, 'users/adm')));
    }
  });

  it('el admin borra a una terapeuta (users y therapistProfiles en un lote) y esa cuenta pierde el acceso', async () => {
    const admin = as('adm');
    await assertSucceeds(getDoc(doc(as('ther2'), 'clients/clients-2'))); // antes entraba
    const batch = writeBatch(admin);
    batch.delete(doc(admin, 'users/ther2'));
    batch.delete(doc(admin, 'therapistProfiles/ther2'));
    await assertSucceeds(batch.commit());
    await assertFails(getDoc(doc(as('ther2'), 'clients/clients-2'))); // "Tu cuenta no tiene acceso"
    await assertFails(addDoc(collection(as('ther2'), 'clients'), { ownerId: 'ther2', fullName: 'x' }));
    expect((await assertSucceeds(getDoc(doc(as('ther2'), 'users/ther2')))).exists()).toBe(false); // lee el suyo, pero ya no existe
  });

  it('el admin NO borra a otro admin ni a sí mismo', async () => {
    const db = as('adm');
    await assertFails(deleteDoc(doc(db, 'users/adm2')));
    await assertFails(deleteDoc(doc(db, 'users/adm')));
  });
});

describe('lectura de perfiles', () => {
  it('cada quien lee el suyo y no el ajeno', async () => {
    await assertSucceeds(getDoc(doc(as('ther1'), 'users/ther1')));
    await assertSucceeds(getDoc(doc(as('adm'), 'users/adm')));
    await assertFails(getDoc(doc(as('ther1'), 'users/ther2')));
  });

  it('el admin lista las terapeutas (filtrando por role); la terapeuta y quien no tiene perfil no', async () => {
    const list = (uid: string) => getDocs(query(collection(as(uid), 'users'), where('role', '==', 'therapist')));
    await assertSucceeds(list('adm'));
    await assertFails(list('ther1'));
    await assertFails(list('nada'));
    // sin el filtro por role, ni el admin puede listar todos los perfiles (incluido el de otros admins)
    await assertFails(getDocs(collection(as('adm'), 'users')));
  });
});

describe('therapistProfiles: perfil profesional de la terapeuta', () => {
  it('el admin lee y lista cualquier perfil', async () => {
    await assertSucceeds(getDoc(doc(as('adm'), 'therapistProfiles/ther1')));
    await assertSucceeds(getDoc(doc(as('adm'), 'therapistProfiles/ther2')));
    await assertSucceeds(getDocs(collection(as('adm'), 'therapistProfiles')));
  });

  it('el admin crea, edita (campos opcionales vacíos) y borra cualquier perfil', async () => {
    const db = as('adm');
    await assertSucceeds(setDoc(doc(db, 'therapistProfiles/nueva'), { fullName: 'Nueva Terapeuta', email: 'n@x.co', phone: '' }));
    await assertSucceeds(updateDoc(doc(db, 'therapistProfiles/ther1'), { phone: '', specialty: '', bio: '' }));
    await assertSucceeds(updateDoc(doc(db, 'therapistProfiles/ther2'), { city: 'Manizales', updatedAt: 1 }));
    await assertSucceeds(deleteDoc(doc(db, 'therapistProfiles/ther2')));
  });

  it('nombre y correo no pueden quedar vacíos ni borrarse; no se aceptan campos desconocidos', async () => {
    const db = as('adm');
    await assertFails(updateDoc(doc(db, 'therapistProfiles/ther1'), { fullName: '' }));
    await assertFails(updateDoc(doc(db, 'therapistProfiles/ther1'), { email: '' }));
    await assertFails(setDoc(doc(db, 'therapistProfiles/ther1'), { email: 't1@x.co' })); // sin nombre
    await assertFails(setDoc(doc(db, 'therapistProfiles/ther1'), { fullName: 'Ana' })); // sin correo
    await assertFails(updateDoc(doc(db, 'therapistProfiles/ther1'), { role: 'admin' }));
    await assertFails(updateDoc(doc(db, 'therapistProfiles/ther1'), { phone: 123 }));
  });

  it('la terapeuta lee SOLO el suyo y NO puede escribir ni el suyo ni el ajeno', async () => {
    const db = as('ther1');
    await assertSucceeds(getDoc(doc(db, 'therapistProfiles/ther1')));
    await assertFails(getDoc(doc(db, 'therapistProfiles/ther2')));
    await assertFails(getDocs(collection(db, 'therapistProfiles')));
    await assertFails(updateDoc(doc(db, 'therapistProfiles/ther1'), { phone: '999' }));
    await assertFails(setDoc(doc(db, 'therapistProfiles/ther1'), { fullName: 'Otra', email: 't1@x.co' }));
    await assertFails(deleteDoc(doc(db, 'therapistProfiles/ther1')));
    await assertFails(updateDoc(doc(db, 'therapistProfiles/ther2'), { phone: '999' }));
  });

  it('quien no tiene perfil o rol y quien no inició sesión no leen ni escriben perfiles', async () => {
    for (const db of [as('nada'), as('mal'), env.unauthenticatedContext().firestore()]) {
      await assertFails(getDoc(doc(db, 'therapistProfiles/ther1')));
      await assertFails(setDoc(doc(db, 'therapistProfiles/x'), { fullName: 'Xxx', email: 'x@x.co' }));
    }
  });
});

describe('colecciones solo para Admin SDK', () => {
  it('loginAttempts es inaccesible para cualquier cliente', async () => {
    for (const db of [as('adm'), as('ther1'), env.unauthenticatedContext().firestore()]) {
      await assertFails(getDoc(doc(db, 'loginAttempts/abc')));
      await assertFails(setDoc(doc(db, 'loginAttempts/abc'), { attempts: 0, lockedUntil: 0 }));
      await assertFails(deleteDoc(doc(db, 'loginAttempts/abc')));
    }
  });

  it('passkeys y passkeyChallenges también', async () => {
    const db = as('adm');
    await assertFails(getDoc(doc(db, 'passkeys/adm/credentials/x')));
    await assertFails(setDoc(doc(db, 'passkeys/adm/credentials/x'), { publicKey: 'k' }));
    await assertFails(getDoc(doc(db, 'passkeyChallenges/reg_adm')));
    await assertFails(setDoc(doc(db, 'passkeyChallenges/reg_adm'), { challenge: 'c' }));
  });
});

describe('notas personales (mural y libro): solo la terapeuta dueña', () => {
  it('lee, crea, edita y elimina las suyas', async () => {
    const db = as('ther1');
    for (const col of PERSONAL) {
      await assertSucceeds(getDoc(doc(db, `${col}/${col}-1`)));
      await assertSucceeds(addDoc(collection(db, col), { ownerId: 'ther1', text: 'nueva' }));
      await assertSucceeds(updateDoc(doc(db, `${col}/${col}-1`), { text: 'editada' }));
      await assertSucceeds(deleteDoc(doc(db, `${col}/${col}-1`)));
      await assertSucceeds(getDocs(query(collection(db, col), where('ownerId', '==', 'ther1'))));
    }
  });

  it('otra terapeuta no las lee, no las edita, no las elimina ni crea a nombre ajeno', async () => {
    const db = as('ther2');
    for (const col of PERSONAL) {
      await assertFails(getDoc(doc(db, `${col}/${col}-1`)));
      await assertFails(updateDoc(doc(db, `${col}/${col}-1`), { text: 'x' }));
      await assertFails(deleteDoc(doc(db, `${col}/${col}-1`)));
      await assertFails(addDoc(collection(db, col), { ownerId: 'ther1', text: 'x' }));
    }
  });

  it('el administrador de la plataforma y quien no tiene perfil no las ven', async () => {
    for (const uid of ['adm', 'nada', 'mal']) {
      for (const col of PERSONAL) await assertFails(getDoc(doc(as(uid), `${col}/${col}-1`)));
    }
  });
});
