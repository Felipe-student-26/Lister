import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { LockStore, LockState } from './lock';

const app = getApps().length ? getApp() : initializeApp();

export const adminAuth = () => getAuth(app);
export const adminDb = () => getFirestore(app);

/** Almacén de bloqueo en Firestore: colección loginAttempts, solo Admin SDK (las reglas la niegan al cliente). */
export function firestoreLockStore(db: Firestore = adminDb()): LockStore {
  return {
    update: (key, fn) =>
      db.runTransaction(async (tx) => {
        const ref = db.collection('loginAttempts').doc(key);
        const snap = await tx.get(ref);
        const d = snap.data();
        const cur: LockState = { attempts: Number(d?.attempts ?? 0), lockedUntil: Number(d?.lockedUntil ?? 0) };
        const { next, result } = fn(cur);
        if (next) {
          if (next.attempts === 0 && next.lockedUntil === 0) {
            if (snap.exists) tx.delete(ref);
          } else {
            tx.set(ref, { attempts: next.attempts, lockedUntil: next.lockedUntil, updatedAt: Date.now() });
          }
        }
        return result;
      }),
  };
}
