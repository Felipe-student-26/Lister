/**
 * Reglas de Firestore de anamnesisForms (formulario que llena el paciente SIN sesión con un enlace secreto).
 * Se ejecuta con `npm run test:rules` (necesita el emulador y Java).
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-lister',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
  });
});
afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/adm'), { role: 'admin', ownerId: 'adm', email: 'adm@x.co' });
    await setDoc(doc(db, 'users/ther1'), { role: 'therapist', ownerId: 'ther1', email: 't1@x.co' });
    await setDoc(doc(db, 'users/ther2'), { role: 'therapist', ownerId: 'ther2', email: 't2@x.co' });
    const base = { ownerId: 'ther1', clientId: 'c1', clientName: 'Ana', createdAt: 1 };
    await setDoc(doc(db, 'anamnesisForms/pend'), { ...base, status: 'pending', answers: {} });
    await setDoc(doc(db, 'anamnesisForms/done'), { ...base, status: 'completed', answers: { nombre: 'Ana' }, submittedAt: 2 });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const submit = { status: 'completed', answers: { nombre: 'Ana', queja: 'Estrés' }, submittedAt: 1700000000000 };

describe('anamnesisForms: la terapeuta dueña', () => {
  it('crea formularios pendientes y vacíos a su nombre; lee los suyos, también los respondidos', async () => {
    const db = as('ther1');
    await assertSucceeds(setDoc(doc(db, 'anamnesisForms/nuevo'), { ownerId: 'ther1', clientId: 'c2', clientName: 'Luz', status: 'pending', answers: {}, createdAt: 3 }));
    await assertSucceeds(getDoc(doc(db, 'anamnesisForms/done')));
    await assertSucceeds(deleteDoc(doc(db, 'anamnesisForms/pend')));
  });

  it('no crea a nombre de otra, ni ya "completed", ni con respuestas inventadas', async () => {
    const db = as('ther1');
    const ok = { ownerId: 'ther1', clientId: 'c2', clientName: 'Luz', status: 'pending', answers: {}, createdAt: 3 };
    await assertFails(setDoc(doc(db, 'anamnesisForms/x1'), { ...ok, ownerId: 'ther2' }));
    await assertFails(setDoc(doc(db, 'anamnesisForms/x2'), { ...ok, status: 'completed' }));
    await assertFails(setDoc(doc(db, 'anamnesisForms/x3'), { ...ok, answers: { nombre: 'falso' } }));
  });

  it('otra terapeuta y el administrador de la plataforma no leen ni borran los formularios ajenos', async () => {
    for (const uid of ['ther2', 'adm']) {
      await assertFails(getDoc(doc(as(uid), 'anamnesisForms/done')));
      await assertFails(deleteDoc(doc(as(uid), 'anamnesisForms/pend')));
    }
  });
});

describe('anamnesisForms: el paciente con el enlace (sin sesión)', () => {
  it('lee el formulario pendiente, pero no uno ya respondido, y no puede listar', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'anamnesisForms/pend')));
    await assertFails(getDoc(doc(anon(), 'anamnesisForms/done')));
    await assertFails(getDoc(doc(anon(), 'anamnesisForms/no-existe')));
    await assertFails(getDocs(collection(anon(), 'anamnesisForms')));
  });

  it('envía las respuestas una sola vez: pending → completed', async () => {
    await assertSucceeds(updateDoc(doc(anon(), 'anamnesisForms/pend'), submit));
    await assertFails(updateDoc(doc(anon(), 'anamnesisForms/pend'), { ...submit, answers: { nombre: 'otro' } })); // ya no se puede reescribir
    await assertFails(getDoc(doc(anon(), 'anamnesisForms/pend'))); // y ya no se lee
  });

  it('solo toca answers, status y submittedAt', async () => {
    const d = doc(anon(), 'anamnesisForms/pend');
    await assertFails(updateDoc(d, { ...submit, ownerId: 'ther2' }));
    await assertFails(updateDoc(d, { ...submit, clientId: 'c9' }));
    await assertFails(updateDoc(d, { ...submit, clientName: 'Otro' }));
    await assertFails(updateDoc(d, { answers: { nombre: 'Ana' } })); // sin cerrarlo
    await assertFails(updateDoc(d, { ...submit, status: 'pending' }));
    await assertFails(updateDoc(d, { ...submit, answers: 'no-es-mapa' }));
    await assertFails(updateDoc(d, { ...submit, submittedAt: 'hoy' }));
  });

  it('no crea, no borra y no modifica uno ya respondido', async () => {
    await assertFails(setDoc(doc(anon(), 'anamnesisForms/mio'), { ownerId: 'ther1', clientId: 'c1', clientName: 'X', status: 'pending', answers: {}, createdAt: 1 }));
    await assertFails(deleteDoc(doc(anon(), 'anamnesisForms/pend')));
    await assertFails(updateDoc(doc(anon(), 'anamnesisForms/done'), submit));
  });
});
