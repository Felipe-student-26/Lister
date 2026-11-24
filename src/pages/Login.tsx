import { useState, type FormEvent } from 'react';
import { Fingerprint, Lock, Mail } from 'lucide-react';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import { Field, Modal } from '../components/ui';
import { mfaErrorMessage } from '../lib/mfa';
import ListerLogo from '../components/ListerLogo';
import fondoLogin from '../assets/fondo-login.jpg';

/** Pantalla completa con la acuarela rosa de fondo; la tarjeta flota encima, translúcida. */
const SHELL = 'relative flex h-full items-center justify-center overflow-y-auto bg-cover bg-center p-4';
const CARD =
  'w-full max-w-sm space-y-5 rounded-xl3 border border-white/70 bg-white/80 p-8 shadow-modal ring-1 ring-brand-300/40 backdrop-blur-md animate-pop-in';

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string | undefined;

export default function Login() {
  const { login, resetPassword, mfaPending, mfaMethods, verifyMfa, verifyPasskey, cancelMfa } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [contactOpen, setContactOpen] = useState(false);

  const validate = () => {
    const e: typeof errors = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) e.email = 'Correo no válido';
    if (!password) e.password = 'Ingresa tu contraseña';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setCodeError('Son 6 dígitos');
      return;
    }
    setBusy(true);
    try {
      await verifyMfa(code);
    } catch (err) {
      const m = (err as Error).message;
      setCodeError(m.startsWith('Credenciales') || m.startsWith('Cuenta') || m.startsWith('Demasiados') ? m : mfaErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const usePasskey = async () => {
    setBusy(true);
    setCodeError('');
    try {
      await verifyPasskey();
    } catch (err) {
      setCodeError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const recover = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setErrors({ email: 'Escribe tu correo para recuperar la contraseña' });
      return;
    }
    try {
      await resetPassword(email.trim());
      toast.success('Te enviamos un correo para restablecer la contraseña.');
    } catch {
      toast.error('No se pudo enviar el correo.');
    }
  };

  if (mfaPending) {
    return (
      <div className={SHELL} style={{ backgroundImage: `url(${fondoLogin})` }}>
        <form onSubmit={submitCode} className={CARD} noValidate>
          <div className="text-center">
            <h1 className="text-2xl font-extrabold text-brand-700">Verificación en dos pasos</h1>
            <p className="mt-1 text-sm text-brand-600">
              {mfaMethods.passkey && mfaMethods.totp
                ? 'Usa tu passkey o escribe el código de tu app autenticadora.'
                : mfaMethods.passkey
                  ? 'Confirma con tu passkey (huella, rostro, PIN o llave de seguridad).'
                  : 'Escribe el código de 6 dígitos de tu app autenticadora.'}
            </p>
          </div>
          {mfaMethods.passkey && (
            <button type="button" className="btn-primary w-full" disabled={busy} onClick={usePasskey}>
              <Fingerprint size={18} /> {busy ? 'Esperando tu dispositivo…' : 'Usar passkey'}
            </button>
          )}
          {mfaMethods.passkey && mfaMethods.totp && (
            <p className="text-center text-xs font-semibold text-brand-500">o con la app autenticadora</p>
          )}
          {mfaMethods.totp && (
            <>
              <Field label="Código" error={codeError}>
                <input
                  className={`input text-center text-lg tracking-[0.4em] ${codeError ? 'input-error' : ''}`}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  autoFocus={!mfaMethods.passkey}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, ''));
                    setCodeError('');
                  }}
                />
              </Field>
              <button className={mfaMethods.passkey ? 'btn-soft w-full' : 'btn-primary w-full'} disabled={busy}>
                {busy ? 'Verificando…' : 'Verificar'}
              </button>
            </>
          )}
          {!mfaMethods.totp && codeError && <p className="field-error text-center">{codeError}</p>}
          <button type="button" onClick={cancelMfa} className="w-full text-center text-xs font-semibold text-brand-700 hover:underline">
            Volver
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={SHELL} style={{ backgroundImage: `url(${fondoLogin})` }}>
      <form onSubmit={submit} className={CARD} noValidate>
        <div className="text-center">
          <h1 className="flex justify-center">
            <ListerLogo className="!text-[44pt]" />
          </h1>
          <p className="mt-2 text-sm font-semibold text-brand-700">Agenda y expedientes terapéuticos</p>
          <div className="mx-auto mt-4 h-1 w-12 rounded-full bg-gradient-to-r from-brand-400 to-brand-600" />
        </div>
        <Field label="Correo" error={errors.email}>
          <div className="relative">
            <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-500" />
            <input
              className={`input pl-10 ${errors.email ? 'input-error' : ''}`}
              type="email"
              autoComplete="username"
              placeholder="tucorreo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </Field>
        <Field label="Contraseña" error={errors.password}>
          <div className="relative">
            <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-500" />
            <input
              className={`input pl-10 ${errors.password ? 'input-error' : ''}`}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </Field>
        <button className="btn-primary w-full py-3 text-base" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
        <button type="button" onClick={recover} className="w-full text-center text-xs font-semibold text-brand-700 hover:underline">
          Olvidé mi contraseña
        </button>
        <button type="button" onClick={() => setContactOpen(true)} className="w-full text-center text-xs font-semibold text-brand-600 hover:underline">
          No puedo recuperarla: contactar al administrador
        </button>
      </form>
      <Modal open={contactOpen} title="Contactar al administrador" onClose={() => setContactOpen(false)}>
        <div className="space-y-4 text-sm text-brand-700">
          <p>
            Si no recibes el correo de recuperación o perdiste el acceso a tu segundo factor, la persona administradora puede
            restablecer tu acceso. Verificará tu identidad antes de hacerlo.
          </p>
          {ADMIN_EMAIL ? (
            <a
              className="btn-primary w-full"
              href={`mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent('Lister: ayuda con mi acceso')}&body=${encodeURIComponent(
                `Hola, necesito ayuda para recuperar el acceso a Lister.${email ? `\nMi correo: ${email}` : ''}`,
              )}`}
            >
              Escribir a {ADMIN_EMAIL}
            </a>
          ) : (
            <p className="rounded-2xl bg-clay-400/20 px-4 py-3 text-clay-600">
              Aún no hay un correo de administrador configurado (variable <code>VITE_ADMIN_EMAIL</code>).
            </p>
          )}
          <div className="flex justify-end">
            <button className="btn-soft" onClick={() => setContactOpen(false)}>
              Cerrar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
