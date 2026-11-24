# NOTAS — plan por partes

| # | Parte | Estado |
|---|-------|--------|
| 1 | Roles: administrador y terapeuta (backend) | **hecha** (build y pruebas verificados después; reglas sin ejecutar) |
| 2 | Administrador: crear y eliminar terapeutas (/terapeutas, therapistProfiles) | **hecha** (pruebas de reglas sin ejecutar: `npm run test:rules` en tu máquina) |
| 3 | Terapeuta: crear, editar y eliminar pacientes (cascada con writeBatch) | **hecha** |
| 4 | Header con inicial y página "Perfil" | **hecha** |
| 5 | Sidebar: hamburguesa en PC, mini-sidebar, cerrado en celular | **hecha** |
| 6 | Temas A: motor de temas (tokens) | **hecha** |
| 7 | Temas B: interfaz del Panel de control | **hecha** |
| 8 | Agenda: modo calendario mensual | **hecha** |
| 9 | Revisión final | **hecha** (pendiente solo lo que requiere tu máquina: `test:rules`, sesión real, `build/icon.png`) |
| 10 | Spark: gestión de terapeutas en el cliente (sin Cloud Functions) | **hecha** (pendiente: `test:rules` y una pasada con sesión real de admin) |
| 11 | Historial del paciente: botón para imprimir en PDF (títulos bubble rosados, logo con flecha) | **hecha** (pendiente: probar en tu equipo/Electron y en el celular) |

## Parte 10 — Spark: terapeutas sin Cloud Functions
- **Por qué:** el proyecto está en plan Spark y no se puede activar Blaze; las funciones `createTherapist`, `removeTherapist` y `therapistResetLink` no se pueden desplegar. La gestión pasó al cliente; `functions/` se conserva sin cambios.
- **Hecho:** `src/lib/therapistAdmin.ts` (`createTherapistAccount`, `removeTherapistAccount`, `sendTherapistPasswordLink`, `therapistErrorMessage`) con su prueba (19 casos: cuenta + lote + correo, reversión con `deleteUser`, instancia secundaria cerrada y eliminada siempre, `email-already-in-use` en español, eliminar borra `users` y `therapistProfiles`, nadie que no sea admin opera, y ningún archivo de `src/` usa ya las funciones de equipo). `Therapists.tsx` y su prueba actualizados ("Se envió un correo a …", "Enviar correo de contraseña" con toast, aviso de cuenta huérfana al eliminar). `firestore.rules` (`users`: create válido y delete de terapeuta solo admin, update nadie) y `tests/rules/firestore.rules.test.ts` (criterio d). `firebase.json` sin `functions`. `passkey.ts`: `passkeyAvailability()` devuelve "no disponible" cuando `VITE_USE_SERVER_LOCK` no es `true`, así Configuración nunca llama a `passkeyList`.
- **Verificado:** `tsc`, `npm run build` y `npm test` (312 pruebas). Con `VITE_USE_SERVER_LOCK=false` no se llama a ninguna función: el login usa el bloqueo local y los passkeys están ocultos/desactivados.
- **Pendiente:** `npm run test:rules` (el emulador de Firestore no se descarga en este entorno; hay Java 21): córrelo en tu máquina. Revisión manual con sesión real: crear una terapeuta (la sesión del admin no debe cerrarse; deben aparecer `users/{uid}` y `therapistProfiles/{uid}` y llegar el correo), eliminarla (ambos documentos desaparecen y esa cuenta ve "Tu cuenta no tiene acceso"). No se probó contra Firebase real.
- **Prueba que falla en tu copia:** `src/pages/Login.test.tsx` ("abre y cierra el modal contactar al administrador") espera `VITE_ADMIN_EMAIL` vacío, pero tu `.env` lo tiene lleno, así que falla ahí (con `VITE_ADMIN_EMAIL= npm test` pasa). No es de esta parte y no se tocó.
- **Decisiones:** (1) si la cuenta se crea pero el correo no sale, no se revierte: se avisa y se reintenta con "Enviar correo de contraseña" (`emailSent: false`). (2) La instancia secundaria usa `getAuth` con la persistencia por defecto, como se pidió; el `signOut` del final borra esa sesión. (3) Se quitó también `emulators.functions` de `firebase.json`. (4) El correo se guarda en minúsculas (como hace Authentication). (5) La cuenta de Authentication huérfana y los datos clínicos se documentan en README ("Modelo Spark"), no se borran.

## Parte 11 — Historial en PDF
- **Hecho:** botón "Imprimir PDF" en la pestaña Historial (`ClientDetail.tsx`), `ClientHistoryPrint` (documento A4, solo visible al imprimir) y `ListerLogo` ("Liste" + r cuya punta de adelante termina en flecha hacia abajo, como una n a medio hacer). Nueva dependencia `@fontsource/bubblegum-sans` (importada en `fontFaces.ts`; `npm install`). Pruebas: `ClientHistoryPrint.test.tsx` (10) y 3 nuevas en `ClientDetail.test.tsx` (botón, montaje + `window.print` + nombre del archivo, y limpieza con `afterprint`).
- **Verificado:** `tsc`, `npm run build`, `npm test` (325 con `VITE_ADMIN_EMAIL=` vacío). Además se generó un PDF real con Chromium (3 páginas de ejemplo, incluida una nota larga que cruza de página) y se revisó a ojo: franja rosa y pie repetidos en cada página, títulos bubble, texto Arial, tarjeta del paciente, resumen y línea de tiempo.
- **Fuente:** el contenido del PDF va en Arial. En el equipo donde se generó la revisión (Linux) Arial no está instalado y Chromium usó Liberation Sans, que tiene las mismas medidas; en Windows/Mac se usa Arial real.
- **Pendiente:** no se probó en Electron real ni en el celular. En Capacitor/Android `window.print()` normalmente no abre nada (ver README).
- **Decisiones:** (1) El logo nuevo solo está en el PDF; no se cambió el "Lister" del Sidebar ni del Login. (2) El historial impreso no incluye observaciones sueltas. (3) Orden igual al de la pantalla (más reciente primero). (4) Se usa `window.print()` (sin librería de PDF): el PDF lo genera el navegador con "Guardar como PDF".

## Corrección de la entrega (después de la Parte 8)
Al abrir el proyecto desde cero (`npm install`) se encontró y corrigió lo siguiente:
- **`npm run build` fallaba**: `src/lib/fontFaces.ts` importa `@fontsource/dancing-script` (fuente manuscrita del calendario) y no estaba en `package.json`. `tsc` y `npm test` no lo detectaban (los imports de CSS no se tipan y Vitest no los resuelve). Añadida la dependencia.
- **`package-lock.json` desactualizado**: `npm ci` fallaba (faltaba `@fontsource/poppins` y ahora `dancing-script`). Regenerado; `npm ci` pasa en la raíz y en `functions/`.
- `@testing-library/dom` (peer obligatorio de `@testing-library/react` 16) ahora está declarado en `devDependencies`; antes entraba solo por casualidad del instalador.
- `functions/package.json`: `tsx` (lo usa `npm run migrate:roles`) ahora es `devDependency` en vez de bajarse con `npx` en cada uso. `functions/package-lock.json` regenerado.
- NOTAS.md decía que la Parte 8 estaba pendiente, pero `CalendarView.tsx`, su prueba y la integración en `Agenda.tsx` ya existían: actualizado.
- README.md no documentaba la Parte 8 ni el comando de arranque: actualizado.
- Estado verificado: `tsc` limpio, `vite build` OK, `functions` compila, **279 pruebas pasaban** al corregir la entrega (hoy 287 con el cancelar del calendario).
- Sigue sin existir `build/icon.png` (lo pide `electron-builder` en `package.json` → `build.win.icon`): `npm run electron:build` fallará hasta que lo añadas (tu copia recortada no lo trae).

## Parte 8 — qué quedó pendiente
- Verificado: pruebas (`CalendarView.test.tsx` 7, `Agenda.test.tsx` incl. alternar vista y "Ver este día") y en Chromium real a 1280px y 390px: título manuscrito (Dancing Script carga), cabecera DOM–SÁB, 5–6 filas, días de otros meses atenuados, día actual resaltado, citas ordenadas con "+N más", celular solo con contador, **sin scroll horizontal**, modal del día (hora + paciente + estado, icono de repetición solo en citas con `seriesId`, cierra con Esc).
- **Cancelar desde el modal del día (añadido después):** PC: botón "Cancelar cita" a la derecha de la fila solo con el mouse encima (CSS `group-hover`, también con foco de teclado); celular: aparece al mantener presionada la cita 0,5 s y se oculta al tocar fuera. Solo en citas `programada`. Reutiliza el flujo de cancelación de `Agenda.tsx` (confirmación; en series "Solo esta cita" / "Esta y las siguientes"): `CalendarView` recibe `onCancelAppointment` y `cancelPending`, y no escribe en Firestore. Verificado en Chromium real: hover con mouse y pulsación larga con toques reales (CDP); sin scroll horizontal. Pruebas: 5 en `CalendarView.test.tsx` y 3 en `Agenda.test.tsx` (flujo real, serie y Esc). Limitación: el hover no se puede probar en jsdom (es CSS), por eso la prueba comprueba las clases y la verificación real se hizo en el navegador.
- La última vista se guarda en `localStorage['lister.agendaView']` (`'day'` | `'month'`).
- El calendario usa solo colores `brand-*` y el radio del tema, así que respeta el Panel de control. La mancha de acuarela es CSS (blur), sin imágenes.
- Dancing Script solo se usa en el título del calendario; no es una opción del selector de tipografía.

## Parte 9 — qué falta
- Hecho: `tsc`, `vite build`, `functions` (`tsc`), `npm test`; búsqueda de restos del modelo antiguo (solo quedan los justificados: script de migración que convierte `editor`, migración de la clave `lister.pin` en `Layout.tsx`, y pruebas que comprueban que `editor` ya no tiene permisos); revisión visual de Panel de control (Cielo + color de letra) y calendario a ancho de PC y de celular.
- **Pendiente:** `npm run test:rules` (el emulador de Firestore no se puede descargar en este entorno; hay Java 21): ejecútalo en tu máquina. Revisión manual con sesión real de admin y de terapeuta (crear/eliminar terapeuta y paciente) y de los 6 temas en pantalla completa (el contraste de los 6 sí está cubierto por `theme.test.ts`). Falta la lista final "qué encontré y arreglé" en el README.

## Parte 7 — qué quedó pendiente
- Verificado: `tsc`, `npm run build`, `npm test` (242 pruebas entonces, 23 en `ControlPanelModal.test.tsx`; hoy son 279 en total). En pantalla (Chromium, 1280px): orden de secciones, scroll interno con título y pie fijos, tema Cielo + color de letra + bordes cuadrados al instante, teclado.
- Motor de temas sin cambios (ningún bug lo bloqueó). `ui.tsx` (`Modal`) recibió la propiedad opcional `footer`; `Layout.test.tsx` solo cambió el nombre esperado del grupo ("Temas predeterminados").
- Decisión: "Color de tablas" son dos selectores (encabezado y filas), porque el motor tiene los dos tokens. No hay control de "Color principal" (no estaba en la lista de la Parte 7; el token existe en el motor).
- Decisión: "Restablecer personalizaciones" conserva el tema elegido; no hay botón para volver a Rosa clásico (se elige en la cuadrícula).
- Detalle visual: en el tema Rosa clásico, las franjas de header y fondo de la muestra son casi iguales (blanco y gris muy claro), como en la app; la muestra lleva un borde fino para que se note.
- Las miniaturas de Ondas y Puntos muestran un fragmento del patrón real (misma escala que el fondo).
- No probado en un equipo con Electron real (solo Chromium); el selector de color nativo se simula en las pruebas.

## Parte 6 — qué quedó pendiente
- Verificado: `tsc`, `npm run build`, `npm test` (223 pruebas). En pantalla (Chromium, datos simulados): Rosa clásico es idéntico pixel a pixel al aspecto anterior (PC y celular); los otros 5 predeterminados, color de letra, radio cuadrado y letra grande se ven bien.
- El Panel de control NO se tocó. Su prueba (`ControlPanelModal.test.tsx`) solo cambió en nombres ("Rosa clásico", "Lila suave") y en el formato guardado (JSON); la Parte 7 lo reemplaza.
- Decisión: Menta pasa de saturación 38 a 28 para cumplir 4.5:1 en el texto de acento. Sigue por debajo de 4.5:1 la letra blanca de los botones en Menta (3.5), Durazno (3.8) y Cielo (4.2): ya era así en los temas antiguos; no es un fallo nuevo. Mínimo exigido en pruebas: 3:1.
- Las fuentes añaden ~19 archivos woff2 latinos (~450 KB) al precaché de la PWA; el navegador solo usa la del tema activo.
- Decisión: el color de letra personalizado afecta `text-brand-600…900` (casi todo el texto); `text-brand-50…500` (iconos, placeholders) siguen la paleta.
- Las tarjetas y modales siguen blancos (no hay token de tarjeta); sí cambian su radio y la paleta.
- Dependencias nuevas: `@fontsource/{nunito,inter,lora,poppins,playfair-display}` (`npm install`).

## Revisión de pendientes de las partes 1–5 (hecha después de la Parte 5)
- `npm run build`, `npm test` (196 pruebas) y `functions` (`tsc`) compilan y pasan. Las pruebas de `functions/test/*` corren dentro de `npm test`.
- Nueva `src/App.test.tsx`: ruteo por rol (admin solo `/terapeutas`; terapeuta Agenda/Pacientes/Métricas/Perfil y `/terapeutas` la devuelve a `/`; sin rol = "Tu cuenta no tiene acceso"; sin sesión = Login). Cierra el pendiente de la Parte 2.
- Revisión visual con Chromium (PC 1280px y celular 390px, con datos simulados): sidebar abierto/mini, drawer, filas de Pacientes (Parte 3), círculo con inicial, menú y página Perfil (Parte 4). Sin scroll horizontal. Error encontrado y corregido: el buscador de Pacientes tapaba el menú del perfil ("Perfil" quedaba oculto); `Layout.tsx` → header con `relative z-20`.
- **Sigue pendiente `npm run test:rules`**: el emulador de Firestore se descarga de `storage.googleapis.com`, bloqueado en este entorno (hay Java 21). Hay que correrlo en tu máquina.
- Sigue pendiente por decisión de producto (no por error): correo editable del terapeuta (requiere una función `updateTherapistEmail`) (la página de perfil del administrador ya existe, ver abajo).
- No verificado en pantalla: la tabla de Terapeutas del administrador (necesita Firestore real).

## Parte 5 — qué quedó pendiente
- Verificado: `tsc`, `npm run build`, `npm test` (191 pruebas, 18 en `Layout.test.tsx`). Sin ver en pantalla: el aspecto del mini-sidebar y la transición de ancho se revisan en la Parte 9 con el servidor de desarrollo, a ancho de PC y de celular.
- Decisión: PC/celular se decide por ancho (`md` = 768px), no por `isDesktop`; así una ventana angosta de escritorio usa el drawer. El Panel de control sigue ligado a `isDesktop` (sin cambios).
- Al pasar de celular a PC (girar/redimensionar) con el drawer abierto, se cierra.
- Se arregló además el cierre del drawer al tocar fuera (antes no funcionaba).
- Se borró `TeamSection.tsx` (sobrante de la Parte 2, rompía `tsc`) y se ajustó un `.at(-1)` en `data.test.ts`.
- `functions:build` y `test:rules` no se corrieron (esta parte no toca funciones ni reglas). Sin commit: la carpeta no es un repositorio git.

## Parte 4 — qué quedó pendiente
- Verificado: `tsc`, `npm run build`, `npm test` (179 pruebas). Sin ver en pantalla: el aspecto del círculo y del desplegable (también en celular) se revisa en la Parte 9 con el servidor de desarrollo.
- (Reemplazado después) Antes el administrador no tenía Perfil; ahora sí, ver "Perfil del administrador".
- Cambio de comportamiento: en celular desaparece el engrane suelto de Configuración; ahora se llega por el menú del círculo.
- La inicial usa el nombre del perfil profesional (`fullName`). Cuentas migradas sin perfil usan la inicial del correo hasta que el admin las complete.
- Sin commit: la carpeta no es un repositorio git.

## Parte 3 — qué quedó pendiente
- Verificado: `tsc`, `npm run build`, `npm test` (160 pruebas), funciones compilan. Nada pendiente de la parte, salvo que el `npm run test:rules` sigue sin poder correrse aquí (ver Parte 2); la Parte 3 no cambia reglas.
- Extra fuera de la lista: `pages/Metrics.tsx` y su test (quitado `canDelete`, misma lógica "editor no puede borrar"); `src/test/firestoreMock.ts` (mock de `writeBatch`).
- Pendiente de ver en la Parte 9 con el servidor de desarrollo: que las filas de Pacientes (nombre + Editar + Eliminar) se vean bien en celular.
- Con muchas operaciones sin conexión, `batch.commit()` de Firestore no falla: queda en cola hasta volver la red (igual que el resto de escrituras de la app).
- Sin commit: la carpeta no es un repositorio git.

## Parte 2 — qué quedó pendiente
- **`npm run test:rules` NO se pudo ejecutar**: el emulador de Firestore no se descarga en este entorno (red bloqueada). Las pruebas nuevas de `therapistProfiles` están escritas en `tests/rules/firestore.rules.test.ts`; ejecútalas en tu máquina (`npm run test:rules`) y avísame si alguna falla.
- Sí corrieron: `tsc --noEmit`, `npm run build`, `npm test` (139 pruebas), `functions` compila y sus pruebas pasan.
- Tu tar no traía `package.json` raíz: usé uno provisional solo para verificar y **no lo incluyo en la entrega**. Si falta `@testing-library/dom` en el tuyo, instálalo (es peer de `@testing-library/react` 16).
- Decisión: el correo es de solo lectura en "Ver/editar" (es el de login). Si quieres poder cambiarlo, hace falta una función `updateTherapistEmail` (Parte aparte).
- Sin pantalla de prueba del ruteo en `App.tsx` (se verifica en la Parte 9 con el servidor de desarrollo).
- No se hizo commit: la carpeta no es un repositorio git.

## Parte 1 — qué quedó pendiente
- **No se ejecutó** `npm run build`, `npm test` ni `npm run test:rules`: el entorno no tenía red ni `node_modules`. Ejecútalos al empezar la Parte 2 y corrige lo que salga.
- Sí se ejecutó (runner mínimo con `tsx`): las pruebas de `functions/test/*` (36 aserciones: bloqueo, rpID, rol de admin, migración) y el typecheck estricto de `teamLogic.ts`, `migrateLogic.ts` y `lock.ts`.
- No se hizo commit: la carpeta no es un repositorio git.
- (Resuelto en la Parte 2) Interfaz transitoria `TeamSection` → reemplazada por `/terapeutas`; el admin ya solo ve Terapeutas.
- Pantalla mínima nueva en `App.tsx`: "Tu cuenta no tiene acceso" (sin documento `users/{uid}` o rol desconocido), porque sin ella una cuenta sin rol quedaba con la app cargando para siempre.

## Perfil del administrador (añadido después de la Parte 9)
- `src/pages/AdminProfile.tsx` en `/perfil` solo para `admin`: lee su cuenta de Firebase Auth (nombre, correo, UID, rol, creación, último acceso, correo verificado), solo lectura. No usa `therapistProfiles`. "Perfil" aparece en el menú del círculo (no en el sidebar, igual que en la terapeuta); la inicial usa `displayName`, si no el correo.
- Verificado: `npm run build` y `npm test` (291). No visto en pantalla.
