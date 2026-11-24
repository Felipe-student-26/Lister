import { useCallback, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './store/auth';
import { useData } from './store/data';
import { useIdleLogout } from './lib/useIdleLogout';
import { useActivityTracker } from './lib/useActivityTracker';
import { useMetrics } from './store/metrics';
import { useProfile } from './store/profile';
import { useTherapistProfile } from './store/therapistProfile';
import { useNotes } from './store/notes';
import { useAnamnesis } from './store/anamnesis';
import { publicFormToken } from './lib/anamnesis';
import { firebaseConfigured } from './lib/firebase';
import { isDesktop, keepSession } from './lib/platform';
import { useSplash } from './lib/useSplash';
import { Skeleton, Toasts } from './components/ui';
import Layout from './components/Layout';
import Splash from './components/Splash';
import Login from './pages/Login';
import Agenda from './pages/Agenda';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Metrics from './pages/Metrics';
import Profile from './pages/Profile';
import PersonalNotes from './pages/PersonalNotes';
import Therapists from './pages/Therapists';
import Anamnesis from './pages/Anamnesis';
import PublicAnamnesis from './pages/PublicAnamnesis';
import AdminProfile from './pages/AdminProfile';

function AppShell() {
  const { user, ready, init, logout } = useAuth();
  const { start, stop } = useData();

  useEffect(() => init(), [init]);

  const { ready: profileReady, role, ownerId: dataOwner, load: loadProfile, reset: resetProfile } = useProfile();

  // 1) perfil (rol + propietaria de los datos)  2) datos de esa propietaria
  useEffect(() => {
    if (user) loadProfile(user.uid);
    else resetProfile();
  }, [user, loadProfile, resetProfile]);

  // Perfil profesional (solo lectura) de la terapeuta: para la inicial del header y la página Perfil.
  useEffect(() => {
    if (user && profileReady && role === 'therapist') useTherapistProfile.getState().load(user.uid);
    else useTherapistProfile.getState().reset();
    return () => useTherapistProfile.getState().reset();
  }, [user, profileReady, role]);

  useEffect(() => {
    if (user && profileReady && dataOwner) start(dataOwner);
    else stop();
  }, [user, profileReady, dataOwner, start, stop]);

  // Notas personales (mural y libro): solo de la terapeuta, igual que sus datos.
  useEffect(() => {
    if (user && profileReady && role === 'therapist' && dataOwner) useNotes.getState().start(dataOwner);
    else useNotes.getState().stop();
    return () => useNotes.getState().stop();
  }, [user, profileReady, role, dataOwner]);

  // Anamnesis: formularios enviados a los pacientes y sus respuestas (tiempo real). Solo de la terapeuta.
  useEffect(() => {
    if (user && profileReady && role === 'therapist' && dataOwner) useAnamnesis.getState().start(dataOwner);
    else useAnamnesis.getState().stop();
    return () => useAnamnesis.getState().stop();
  }, [user, profileReady, role, dataOwner]);

  useEffect(() => {
    if (!user) return;
    void useMetrics.getState().start(user.uid);
    return () => useMetrics.getState().stop();
  }, [user]);
  useActivityTracker(Boolean(user));

  const onIdle = useCallback(() => {
    logout();
  }, [logout]);
  // En celular la sesión es permanente (sin cierre por inactividad); en PC se cierra tras 30 min sin actividad.
  useIdleLogout(Boolean(user) && !keepSession, onIdle, 30);

  if (!firebaseConfigured) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="card max-w-md space-y-2 p-8 text-sm text-brand-700">
          <h1 className="text-xl font-extrabold text-brand-800">Falta configurar Firebase</h1>
          <p>
            Copia <code>.env.example</code> a <code>.env</code> y completa las variables de tu proyecto de Firebase.
            Luego reinicia <code>npm run dev</code> o vuelve a generar la app (<code>npm run electron:build</code> / <code>npm run cap:android</code>): las variables se incrustan al compilar.
          </p>
        </div>
      </div>
    );
  }

  if (!ready || (user && !profileReady)) {
    return (
      <div className="p-6">
        <Skeleton className="mx-auto h-64 max-w-sm" />
      </div>
    );
  }

  // Sin documento users/{uid} (o rol desconocido) = sin acceso.
  if (user && role === null) {
    return (
      <>
        <div className="flex h-full items-center justify-center p-6">
          <div className="card max-w-md space-y-3 p-8 text-sm text-brand-700">
            <h1 className="text-xl font-extrabold text-brand-800">Tu cuenta no tiene acceso</h1>
            <p>Todavía no se te asignó un rol. Contacta al administrador de la plataforma.</p>
            <button className="btn-soft" onClick={() => logout()}>
              Cerrar sesión
            </button>
          </div>
        </div>
        <Toasts />
      </>
    );
  }

  return (
    <>
      {/* HashRouter: compatible con Electron (file://) y Capacitor */}
      <HashRouter>
        {user ? (
          <Routes>
            <Route element={<Layout />}>
              {role === 'admin' ? (
                // El administrador de la plataforma solo gestiona terapeutas y ve su propio Perfil: no ve Agenda, Pacientes ni Métricas.
                <>
                  <Route path="terapeutas" element={<Therapists />} />
                  <Route path="perfil" element={<AdminProfile />} />
                  <Route path="*" element={<Navigate to="/terapeutas" replace />} />
                </>
              ) : (
                // Para la terapeuta /terapeutas no existe: cae en "*" y vuelve a "/".
                <>
                  <Route index element={<Agenda />} />
                  <Route path="clientes" element={<Clients />} />
                  <Route path="clientes/:id" element={<ClientDetail />} />
                  <Route path="metricas" element={<Metrics />} />
                  <Route path="anamnesia" element={<Anamnesis />} />
                  <Route path="notas" element={<PersonalNotes />} />
                  <Route path="perfil" element={<Profile />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </>
              )}
            </Route>
          </Routes>
        ) : (
          <Login />
        )}
      </HashRouter>
      <Toasts />
    </>
  );
}

/** Splash (celular, al abrir la app) / preloader (PC, al iniciar sesión) encima de la app. */
function SplashGate() {
  const { ready, user } = useAuth();
  const { ready: profileReady } = useProfile();
  const show = useSplash({ desktop: isDesktop, ready, hasUser: Boolean(user), profileReady });
  return <Splash show={show} animateIn={isDesktop} />;
}

export default function App() {
  // Enlace público del formulario (#/formulario/<token>): lo abre el paciente sin sesión, así que no se carga la app.
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const formToken = publicFormToken(hash);
  if (formToken) return <PublicAnamnesis token={formToken} />;

  return (
    <>
      <AppShell />
      <SplashGate />
    </>
  );
}
