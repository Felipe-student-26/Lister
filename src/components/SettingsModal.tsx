import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, Fingerprint, KeyRound, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import QRCode from 'qrcode';
import type { TotpSecret } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import { ConfirmModal, Field, Modal } from './ui';
import { passwordIssues } from '../lib/validation';
import { finishTotpEnrollment, listFactors, mfaErrorMessage, removeFactor, startTotpEnrollment } from '../lib/mfa';
import { listPasskeys, passkeyAvailability, passkeyErrorMessage, registerPasskey, removePasskey, type PasskeyInfo } from '../lib/passkey';

type View = 'home' | 'totp' | 'passkey';

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [view, setView] = useState<View>('home');
  const [rev, setRev] = useState(0); // fuerza releer los factores inscritos
  useEffect(() => {
    if (open) setView('home');
  }, [open]);

  return (
    <Modal open={open} title="Configuración" onClose={onClose}>
      {view === 'home' ? (
        <Home rev={rev} onTotp={() => setView('totp')} onPasskey={() => setView('passkey')} onChanged={() => setRev((r) => r + 1)} />
      ) : view === 'passkey' ? (
        <PasskeyWizard
          onBack={() => setView('home')}
          onDone={() => {
            setRev((r) => r + 1);
            setView('home');
          }}
        />
      ) : (
        <TotpWizard
          onBack={() => setView('home')}
          onDone={() => {
            setRev((r) => r + 1);
            setView('home');
          }}
        />
      )}
    </Modal>
  );
}

function Home({
  rev,
  onTotp,
  onPasskey,
  onChanged,
}: {
  rev: number;
  onTotp: () => void;
  onPasskey: () => void;
  onChanged: () => void;
}) {
  const user = auth.currentUser;
  const factors = user ? listFactors(user) : [];
  void rev;
  const [removing, setRemoving] = useState(false);
  const availability = passkeyAvailability();
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [removingPasskey, setRemovingPasskey] = useState<PasskeyInfo | null>(null);

  useEffect(() => {
    if (!availability.available) return;
    let alive = true;
    listPasskeys()
      .then((rows) => alive && setPasskeys(rows))
      .catch(() => alive && setPasskeys([]));
    return () => {
      alive = false;
    };
  }, [rev, availability.available]);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-extrabold text-brand-800">
          <ShieldCheck size={16} /> Verificación en dos pasos
        </h3>

        <div className="flex items-center gap-3 rounded-2xl bg-brand-50 p-4">
          <Smartphone className="shrink-0 text-brand-600" size={20} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-brand-800">App autenticadora (TOTP)</p>
            <p className="text-xs text-brand-600">{factors.length ? 'Activada' : 'Sin activar'}</p>
          </div>
          {factors.length ? (
            <button className="btn-soft !px-3 !py-2 text-clay-600" onClick={() => setRemoving(true)}>
              Quitar
            </button>
          ) : (
            <button className="btn-primary !px-3 !py-2" onClick={onTotp}>
              Activar
            </button>
          )}
        </div>

        <div className={`space-y-3 rounded-2xl bg-brand-50 p-4 ${availability.available ? '' : 'opacity-70'}`}>
          <div className="flex items-center gap-3">
            <Fingerprint className="shrink-0 text-brand-600" size={20} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-brand-800">Passkey (WebAuthn)</p>
              <p className="text-xs text-brand-600">
                {availability.available
                  ? passkeys.length
                    ? `${passkeys.length} registrado${passkeys.length === 1 ? '' : 's'}`
                    : 'Sin activar'
                  : availability.reason}
              </p>
            </div>
            <button className="btn-primary !px-3 !py-2" onClick={onPasskey} disabled={!availability.available}>
              {passkeys.length ? 'Agregar' : 'Activar'}
            </button>
          </div>
          {passkeys.length > 0 && (
            <ul className="space-y-1.5">
              {passkeys.map((p) => (
                <li key={p.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs text-brand-700">
                  <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                  <span className="text-brand-500">{new Date(p.createdAt).toLocaleDateString('es')}</span>
                  <button className="text-brand-400 hover:text-clay-600" aria-label={`Quitar passkey ${p.name}`} onClick={() => setRemovingPasskey(p)}>
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <PasswordSection />

      <ConfirmModal
        open={removingPasskey !== null}
        title="Quitar passkey"
        message={`Se eliminará el passkey "${removingPasskey?.name ?? ''}". ¿Continuar?`}
        confirmLabel="Quitar"
        onClose={() => setRemovingPasskey(null)}
        onConfirm={async () => {
          try {
            await removePasskey(removingPasskey!.id);
            toast.info('Passkey eliminado');
            onChanged();
          } catch (err) {
            toast.error(passkeyErrorMessage(err));
          }
        }}
      />

      <ConfirmModal
        open={removing}
        title="Quitar verificación en dos pasos"
        message="Tu cuenta quedará protegida solo por la contraseña. ¿Continuar?"
        confirmLabel="Quitar"
        onClose={() => setRemoving(false)}
        onConfirm={async () => {
          try {
            await removeFactor(user!, factors[0]);
            toast.info('Verificación en dos pasos desactivada');
            onChanged();
          } catch (err) {
            toast.error(mfaErrorMessage(err));
          }
        }}
      />
    </div>
  );
}

function PasswordSection() {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');

  const issues = passwordIssues(next);
  const errors = {
    current: touched && !current ? 'Ingresa tu contraseña actual' : '',
    next: touched && next && next === current ? 'La nueva contraseña debe ser distinta' : '',
    again: touched && again !== next ? 'Las contraseñas no coinciden' : '',
  };
  const valid = current && next && issues.length === 0 && next !== current && again === next;

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setTouched(true);
    if (!valid) return;
    setBusy(true);
    setServerError('');
    try {
      await changePassword(current, next);
      toast.success('Contraseña actualizada');
      setCurrent('');
      setNext('');
      setAgain('');
      setTouched(false);
    } catch (err) {
      setServerError(mfaErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <h3 className="flex items-center gap-2 text-sm font-extrabold text-brand-800">
        <KeyRound size={16} /> Cambiar contraseña
      </h3>
      <Field label="Contraseña actual" error={errors.current}>
        <input className={`input ${errors.current ? 'input-error' : ''}`} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label="Nueva contraseña" error={errors.next}>
        <input className={`input ${errors.next ? 'input-error' : ''}`} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      {next && (
        <ul className="space-y-1 text-xs">
          {['Mínimo 10 caracteres', 'Una minúscula', 'Una mayúscula', 'Un número', 'Un símbolo'].map((rule) => {
            const ok = !issues.includes(rule);
            return (
              <li key={rule} className={`flex items-center gap-1.5 ${ok ? 'text-brand-600' : 'text-clay-600'}`}>
                <Check size={12} className={ok ? '' : 'opacity-30'} /> {rule}
              </li>
            );
          })}
        </ul>
      )}
      <Field label="Repite la nueva contraseña" error={errors.again}>
        <input className={`input ${errors.again ? 'input-error' : ''}`} type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
      </Field>
      {serverError && <p className="field-error">{serverError}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'Guardando…' : 'Actualizar contraseña'}
      </button>
    </form>
  );
}

const STEPS = ['Contraseña', 'Escanear', 'Verificar'];

function TotpWizard({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { reauth } = useAuth();
  const [step, setStep] = useState(0);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [enroll, setEnroll] = useState<{ secret: TotpSecret; key: string; qr: string } | null>(null);

  const confirmPassword = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!password) return setError('Ingresa tu contraseña');
    setBusy(true);
    setError('');
    try {
      await reauth(password);
      const { secret, uri, key } = await startTotpEnrollment(auth.currentUser!);
      setEnroll({ secret, key, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) });
      setStep(1);
    } catch (err) {
      setError(mfaErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError('Son 6 dígitos');
    setBusy(true);
    setError('');
    try {
      await finishTotpEnrollment(auth.currentUser!, enroll!.secret, code);
      toast.success('Verificación en dos pasos activada');
      onDone();
    } catch (err) {
      setError(mfaErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <button className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline" onClick={onBack}>
        <ArrowLeft size={14} /> Volver
      </button>
      <ol className="flex items-center gap-2 text-xs font-bold">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex-1 rounded-full px-3 py-1.5 text-center ${i === step ? 'bg-brand-600 text-white' : i < step ? 'bg-brand-200 text-brand-800' : 'bg-brand-100 text-brand-500'}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <form onSubmit={confirmPassword} className="space-y-3" noValidate>
          <p className="text-sm text-brand-700">Confirma tu contraseña para activar la verificación en dos pasos.</p>
          <Field label="Contraseña" error={error}>
            <input className={`input ${error ? 'input-error' : ''}`} type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} />
          </Field>
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Comprobando…' : 'Continuar'}</button>
        </form>
      )}

      {step === 1 && enroll && (
        <div className="space-y-3 text-center">
          <p className="text-sm text-brand-700">Escanea este código con Google Authenticator, Authy o similar.</p>
          <img src={enroll.qr} alt="Código QR para la app autenticadora" className="mx-auto rounded-2xl border border-brand-200" width={220} height={220} />
          <p className="text-xs text-brand-600">
            ¿No puedes escanear? Clave manual:
            <code className="mt-1 block break-all rounded-xl bg-brand-50 px-3 py-2 text-brand-800">{enroll.key}</code>
          </p>
          <button className="btn-primary w-full" onClick={() => setStep(2)}>Ya lo escaneé</button>
        </div>
      )}

      {step === 2 && (
        <form onSubmit={verify} className="space-y-3" noValidate>
          <p className="text-sm text-brand-700">Escribe el código de 6 dígitos que muestra la app.</p>
          <Field label="Código" error={error}>
            <input className={`input text-center text-lg tracking-[0.4em] ${error ? 'input-error' : ''}`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError(''); }} />
          </Field>
          <div className="flex gap-2">
            <button type="button" className="btn-soft" onClick={() => setStep(1)}>Atrás</button>
            <button className="btn-primary flex-1" disabled={busy}>{busy ? 'Verificando…' : 'Activar'}</button>
          </div>
        </form>
      )}
    </div>
  );
}

const PASSKEY_STEPS = ['Contraseña', 'Nombre', 'Registrar'];

function PasskeyWizard({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const availability = passkeyAvailability();

  const next = (ev: FormEvent) => {
    ev.preventDefault();
    if (step === 0) {
      if (!password) return setError('Ingresa tu contraseña');
      setError('');
      setStep(1);
    } else {
      if (name.trim().length < 2) return setError('Ponle un nombre (ej. "Mi celular")');
      setError('');
      setStep(2);
    }
  };

  const register = async () => {
    setBusy(true);
    setError('');
    try {
      await registerPasskey(password, name.trim());
      toast.success('Passkey activado');
      onDone();
    } catch (err) {
      setError(passkeyErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <button className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline" onClick={onBack}>
        <ArrowLeft size={14} /> Volver
      </button>
      <ol className="flex items-center gap-2 text-xs font-bold">
        {PASSKEY_STEPS.map((s, i) => (
          <li key={s} className={`flex-1 rounded-full px-3 py-1.5 text-center ${i === step ? 'bg-brand-600 text-white' : i < step ? 'bg-brand-200 text-brand-800' : 'bg-brand-100 text-brand-500'}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {!availability.available && <p className="rounded-2xl bg-clay-400/20 px-4 py-3 text-sm text-clay-600">{availability.reason}</p>}

      {step === 0 && (
        <form onSubmit={next} className="space-y-3" noValidate>
          <p className="text-sm text-brand-700">Confirma tu contraseña para registrar un passkey. El servidor la verifica.</p>
          <Field label="Contraseña" error={error}>
            <input className={`input ${error ? 'input-error' : ''}`} type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} />
          </Field>
          <button className="btn-primary w-full" disabled={!availability.available}>Continuar</button>
        </form>
      )}

      {step === 1 && (
        <form onSubmit={next} className="space-y-3" noValidate>
          <p className="text-sm text-brand-700">Un nombre te ayuda a reconocer este dispositivo después.</p>
          <Field label="Nombre del dispositivo" error={error}>
            <input className={`input ${error ? 'input-error' : ''}`} autoFocus maxLength={60} value={name} onChange={(e) => { setName(e.target.value); setError(''); }} />
          </Field>
          <div className="flex gap-2">
            <button type="button" className="btn-soft" onClick={() => setStep(0)}>Atrás</button>
            <button className="btn-primary flex-1">Continuar</button>
          </div>
        </form>
      )}

      {step === 2 && (
        <div className="space-y-3 text-center">
          <p className="text-sm text-brand-700">
            Tu dispositivo te pedirá huella, rostro, PIN o llave de seguridad para crear el passkey.
          </p>
          {error && <p className="field-error">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-soft" onClick={() => setStep(1)}>Atrás</button>
            <button className="btn-primary flex-1" disabled={busy || !availability.available} onClick={register}>
              {busy ? 'Esperando tu dispositivo…' : 'Crear passkey'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
