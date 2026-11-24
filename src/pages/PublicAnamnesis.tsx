import { useMemo } from 'react';
import { buildAnamnesisHtml } from '../lib/anamnesisHtml';
import { firebaseConfigured } from '../lib/firebase';

/**
 * Página pública del formulario (enlace #/formulario/<token>). No pide sesión ni carga la app: muestra el mismo HTML autocontenido
 * que se descarga, en un iframe a pantalla completa. El nombre del paciente y el estado del enlace los consulta el propio
 * formulario a Firestore (REST, sin sesión).
 */
export default function PublicAnamnesis({ token }: { token: string }) {
  const html = useMemo(
    () =>
      buildAnamnesisHtml({
        token,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
        clientName: '',
      }),
    [token],
  );

  if (!firebaseConfigured) {
    return <p className="p-6 text-sm text-brand-700">Este formulario no está disponible: falta configurar Firebase en la aplicación.</p>;
  }
  return <iframe title="Formulario de anamnesis" srcDoc={html} className="fixed inset-0 h-full w-full border-0 bg-white" />;
}
