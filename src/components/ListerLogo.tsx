import './ListerLogo.css';

/**
 * Logo de Lister. La "r" final se dibuja a mano (SVG): palo y arco como una r, pero la punta de adelante del arco baja y termina
 * en una flecha apuntando hacia abajo, como si la r se fuera a convertir en una "n" ("listen"). El resto es texto en la fuente
 * bubble (Bubblegum Sans).
 */
export default function ListerLogo({ className = '' }: { className?: string }) {
  return (
    <span className={`lister-logo ${className}`} role="img" aria-label="Lister">
      <span aria-hidden="true">Liste</span>
      <svg className="lister-logo-r" viewBox="0 0 40 32" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round">
        {/* palo de la r: llega hasta la línea base */}
        <path d="M6 5 V26.5" />
        {/* arco; su punta de adelante baja como la pata de una n */}
        <path d="M6 16 C6 9 10 5 17 5 C23 5 27 7.5 27 12 V16" />
        {/* punta de flecha hacia abajo (triángulo relleno) */}
        <path d="M19.5 16.5 H34.5 L27 28 Z" fill="currentColor" strokeWidth="3" />
      </svg>
    </span>
  );
}
