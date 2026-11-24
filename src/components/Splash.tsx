import { useEffect, useState } from 'react';

const EXIT_MS = 350; // = transición de .boot-splash en index.html

/**
 * Splash / preloader de pantalla completa: fondo rosado de la marca con el logo de Lister en blanco.
 * Los estilos (.boot-splash…) están en index.html para que el mismo diseño se vea antes de que cargue React.
 * `show` = false lo desvanece y luego lo desmonta. `animateIn` = aparece con fundido (PC, al iniciar sesión);
 * en celular no se anima la entrada para que el relevo con el splash incrustado y el nativo sea imperceptible.
 */
export default function Splash({ show, animateIn = false }: { show: boolean; animateIn?: boolean }) {
  const [mounted, setMounted] = useState(show);
  if (show && !mounted) setMounted(true);

  useEffect(() => {
    if (show || !mounted) return;
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [show, mounted]);

  if (!mounted) return null;
  return (
    <div
      className={`boot-splash${show ? (animateIn ? ' boot-splash--in' : '') : ' boot-splash--out'}`}
      role="status"
      aria-live="polite"
      aria-label="Cargando Lister"
      data-testid="splash"
    >
      <img src={`${import.meta.env.BASE_URL}lister-logo-white.svg`} alt="Lister" draggable={false} />
      <div className="boot-bar" aria-hidden="true" />
    </div>
  );
}
