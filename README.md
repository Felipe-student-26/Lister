# Lister

App clínica (React + Vite + TypeScript + Tailwind, Zustand, Firebase Auth/Firestore), empaquetada con Electron (PC) y Capacitor (móvil). Funciona en el **plan Spark** de Firebase (sin Cloud Functions; ver "Modelo Spark"). `functions/` se conserva por si algún día se activa Blaze, pero la app no depende de él. Plan de trabajo por partes en `NOTAS.md`.

## Puesta en marcha
```
cp .env.example .env        # completa las claves de Firebase
npm install                 # raíz (usa package-lock.json; `npm ci` también funciona)
npm run dev                 # servidor de desarrollo
```
| Script | Qué hace |
|--------|----------|
| `npm run build` | `tsc --noEmit` + `vite build` (genera `dist/`) |
| `npm test` | Vitest: UI, store, lib y `functions/test/*` (312 pruebas, sin emulador) |
| `npm run test:rules` | Reglas de Firestore (necesita el emulador y Java; se ejecuta aparte de `npm test`) |
| `npm run functions:build` | instala y compila `functions/` |
| `npm run electron:dev` / `electron:build` | PC (Electron). `electron:build` necesita `build/icon.png` |
| `npm run cap:sync` / `cap:android` | móvil (Capacitor) |

> Los imports de CSS (p. ej. las fuentes de `src/lib/fontFaces.ts`) no los detecta `tsc` ni `npm test`: si añades una fuente, agrégala a `package.json` y comprueba con `npm run build`.

## Roles (Parte 1)

`users/{uid} = { role: 'admin' | 'therapist', ownerId, email, ... }`

| Rol | Qué puede |
|-----|-----------|
| `admin` | Administrador de la plataforma. Crea, edita y elimina terapeutas **desde la app** (cliente, plan Spark). **No lee ni escribe datos clínicos** (`clients`, `appointments`, `sessions`, `observations`). |
| `therapist` | Dueña de sus datos (`ownerId` = su propio uid). Crea, edita y **elimina** pacientes y citas. Lee solo lo suyo. |
| (sin documento) | **Sin acceso.** La app muestra "Tu cuenta no tiene acceso". Ya no existe "sin documento = admin". |

- El rol `editor` desapareció. Las reglas exigen además que el `ownerId` de una terapeuta sea su propio uid (un perfil mal migrado no da acceso).
- `users/{uid}` solo lo escribe el admin desde el cliente y con el mínimo permiso (ver "Modelo Spark"): **create** de un documento de terapeuta válido, **delete** de una terapeuta y **ningún update**. El admin solo puede listar perfiles filtrando `role == 'therapist'`.
- Eliminar una terapeuta borra `users/{uid}` y `therapistProfiles/{uid}`. **Los datos clínicos NO se borran automáticamente**: quedan huérfanos en Firestore (con su `ownerId`) hasta que alguien los elimine a propósito. Recrear la cuenta con el mismo correo genera un uid nuevo y no recupera esos datos.

## Modelo Spark (sin Cloud Functions)
El proyecto Firebase está en el plan **Spark** y no se puede activar Blaze, así que las funciones `createTherapist`, `removeTherapist` y `therapistResetLink` ya no se usan: la gestión de terapeutas corre en el cliente (`src/lib/therapistAdmin.ts`, llamado desde `src/pages/Therapists.tsx`).

**Qué hace el cliente (sesión del admin)**
- **Crear** (`createTherapistAccount`): abre una *segunda* instancia de Firebase (`initializeApp(config, 'secondary')`) y crea ahí la cuenta de Authentication con una contraseña temporal aleatoria que nadie ve; así **no se cierra la sesión del admin**. Con el uid nuevo escribe `users/{uid}` (`role: 'therapist'`, `ownerId: uid`, `email`, `createdAt`) y `therapistProfiles/{uid}` en **un solo `writeBatch`**. Si ese lote falla, borra la cuenta recién creada (`deleteUser`) y relanza el error. Después envía el correo para definir contraseña (`sendPasswordResetEmail`) y, pase lo que pase, cierra sesión y elimina la instancia secundaria. Ya no se muestra ningún enlace: la pantalla dice "Se envió un correo a <correo> para que defina su contraseña". Si la cuenta se creó pero el correo no salió, la pantalla lo avisa y se reintenta con "Enviar correo de contraseña".
- **Enviar correo de contraseña** (`sendTherapistPasswordLink`): `sendPasswordResetEmail` con la instancia principal; avisa con un toast.
- **Eliminar** (`removeTherapistAccount`): borra `users/{uid}` y `therapistProfiles/{uid}` en un lote. Sin `users/{uid}` esa cuenta ya no entra a nada ("Tu cuenta no tiene acceso").
- Antes de operar se comprueba en el cliente que el usuario sea admin (`useProfile`); la seguridad real son las reglas.

**Por qué la cuenta de Authentication queda huérfana al eliminar**
Un cliente no puede borrar la cuenta de otra persona (solo el Admin SDK, es decir, Cloud Functions o la consola). Aceptado: la cuenta sigue en Authentication y **su correo queda ocupado** (crear otra terapeuta con ese correo da "Ese correo ya existe en Firebase Authentication…"). Para liberarlo: Firebase Console → Authentication → Usuarios → buscar el correo → menú ⋮ → **Eliminar cuenta**. No es obligatorio: sin `users/{uid}` no tiene acceso a nada.

**Qué NO borra eliminar:** los datos clínicos (`clients`, `appointments`, `sessions`, `observations`, y las notas personales) ni la cuenta de Authentication. Quedan con su `ownerId` hasta que alguien los elimine a propósito.

**Reglas de `users/{uid}` (`firestore.rules`)**
| Operación | Quién y cuándo |
|-----------|----------------|
| `get` | cada quien su propio documento |
| `list` | solo el admin, filtrando `role == 'therapist'` |
| `create` | solo el admin, con `keys().hasOnly(['role','ownerId','email','createdAt'])`, `role == 'therapist'`, `ownerId == docId` y `email` texto no vacío |
| `update` | nadie (los documentos de admin ya existen, así que tampoco se pueden "recrear" ni degradar) |
| `delete` | solo el admin y solo si el documento es de una terapeuta (no borra a otro admin ni a sí mismo) |

`therapistProfiles` no cambió. Pruebas: `tests/rules/firestore.rules.test.ts` (criterio d) con `npm run test:rules`.

**Passkeys y bloqueo de intentos:** `.env.example` mantiene `VITE_USE_SERVER_LOCK=false`. Con ese valor el inicio de sesión usa el bloqueo local y **no llama a ninguna función**, y los passkeys aparecen como **no disponibles** en Configuración (los passkeys se registran y verifican con Cloud Functions, plan Blaze). La verificación en dos pasos con app autenticadora (TOTP) sí funciona en Spark.

**Despliegue sin funciones**
```
npm run build
firebase deploy --only firestore:rules,hosting
```
`firebase.json` ya no trae el bloque `functions` ni `emulators.functions`, así que `firebase deploy` tampoco intenta desplegarlas ni exige Blaze.

**Restaurar las funciones si algún día se activa Blaze:** vuelve a añadir en `firebase.json`, al lado de `firestore` y `hosting`,
```json
"functions": [
  {
    "source": "functions",
    "codebase": "default",
    "runtime": "nodejs20",
    "ignore": ["node_modules", "test", ".git", "*.log"],
    "predeploy": ["npm --prefix \"$RESOURCE_DIR\" run build"]
  }
],
```
(y, si usas el emulador, `"functions": { "port": 5001 }` dentro de `emulators`), y despliega con `firebase deploy --only functions`. Ojo: eso solo vuelve a publicar las funciones; la app ya no las usa para gestionar terapeutas (habría que reponer las llamadas en `src/lib/team.ts`). Para bloqueo en servidor y passkeys: `VITE_USE_SERVER_LOCK=true` (ver `functions/`).

**Correo de contraseña en español:** Firebase Console → Authentication → **Plantillas** → "Restablecimiento de contraseña" → idioma Español (y, si quieres, edita el texto). Es el correo que recibe la terapeuta al crearla o al pulsar "Enviar correo de contraseña".

### Crear el primer admin (a mano)
1. Firebase Console → Authentication → **Agregar usuario** (correo y contraseña). Copia su **UID**.
2. Firestore → colección `users` → documento con ID = ese UID y campos:
   `role: "admin"`, `ownerId: "<ese UID>"`, `email: "<su correo>"`.
3. Ese usuario ya puede crear terapeutas desde `/terapeutas`. (No hay forma de crear un admin desde la app: las reglas lo impiden a propósito.)

### Migrar usuarios existentes (un solo uso)
`functions/scripts/migrate-roles.ts` (usa Admin SDK; necesita credenciales: `gcloud auth application-default login` o `GOOGLE_APPLICATION_CREDENTIALS`):
- usuarios **sin** `users/{uid}` → `{ role: 'therapist', ownerId: uid, email }` (conservan sus datos);
- usuarios con rol `editor` → `therapist` con su propio `ownerId` (**dejan de ver los datos de la terapeuta anterior**: aparecerán con un espacio vacío);
- `admin` y terapeutas ya migradas no cambian; los casos raros se listan para revisar a mano.

```
cd functions
npm run migrate:roles                 # simulacro: solo muestra qué haría
npm run migrate:roles -- --apply      # escribe los cambios
```
**Crea primero el admin**: el script se niega a aplicar si no existe ningún `role: "admin"` (si no, tu cuenta de administración, que no tiene documento, se convertiría en terapeuta).

## Cambios por parte
- Parte 1: roles `admin`/`therapist` en `src/lib/types.ts`, `src/store/profile.ts` (`useCan`: `canDelete` para terapeuta, `canManageTherapists` para admin), `firestore.rules`, `functions/src/{teamLogic,team,migrateLogic}.ts`, `functions/scripts/migrate-roles.ts`; funciones renombradas; pantalla mínima "sin acceso" en `App.tsx`; pruebas de reglas (`tests/rules/`), `functions/test/team.test.ts` y pruebas de UI ajustadas.
- Parte 2: página `/terapeutas` (`src/pages/Therapists.tsx`, solo `admin`; la terapeuta es redirigida a `/`; el admin solo ve el menú "Terapeutas" y cualquier otra ruta lo lleva a `/terapeutas`). Reemplaza a `TeamSection` (eliminado, ya no hay "Equipo" en Configuración).
- Parte 2: tabla con búsqueda, orden y paginación; modal "Crear terapeuta" con validación inline (`validateTherapistProfile` en `src/lib/validation.ts`); acciones Ver/editar, Nuevo enlace de contraseña y Eliminar (con `ConfirmModal`).
- Parte 2 (reemplazada por la Parte 10): `createTherapist` recibía todos los campos del perfil y escribía `users/{uid}` + `therapistProfiles/{uid}` en un solo lote; ahora lo hace `createTherapistAccount` en el cliente.
- Parte 2: `firestore.rules`: `therapistProfiles/{uid}` — el admin lee, lista y escribe cualquiera (nombre y correo obligatorios, solo campos conocidos); la terapeuta solo LEE el suyo.

- Parte 3: `Clients.tsx` — botón "Nuevo paciente" y, por fila, Editar y Eliminar; `ClientDetail.tsx` — botones Editar y Eliminar paciente en el encabezado (visibles en todas las pestañas).
- Parte 3: nuevos `components/ClientFormModal.tsx` (alta y edición, validación inline, queda abierto si falla el guardado) y `components/DeleteClientModal.tsx` (confirmación que dice qué se borra).
- Parte 3: `store/data.ts` — `deleteClient` borra en cascada con `writeBatch`; `lib/validation.ts` — `clientImpact` (cuenta lo que se borra).
- Parte 3: sin restos de "el editor no puede eliminar" en la UI: se quitó `canDelete` de `ClientDetail` y `Metrics` (esas pantallas solo existen para la terapeuta). `store/data.ts` mantiene la comprobación de rol como segunda barrera; la real son las reglas.
- Parte 3: métricas: `deleteClient`, `addClient` y `updateClient` pasan por `tracked`; abrir Editar/Eliminar registra `abrir_editar` / `abrir_eliminar` (como el existente `abrir_nuevo`).

- Parte 4: `components/ProfileMenu.tsx` — el botón del header es solo el círculo con la inicial (nombre de la terapeuta; si no hay, correo); sin correo ni chevron. Correo completo, nombre y rol quedan dentro del desplegable.
- Parte 4: menú con **Perfil** (icono User, encima de Configuración, lleva a `/perfil`, solo terapeuta), Configuración, Panel de control (solo si el padre pasa `onControlPanel`: solo PC) y Cerrar sesión.
- Parte 4: `components/Layout.tsx` — el header usa el mismo `ProfileMenu` en PC y celular (se quitó el engrane de celular; Panel de control sigue solo en PC).
- Parte 4: `pages/Profile.tsx` (`/perfil`, solo terapeuta) — tarjetas de solo lectura con nombre, documento, teléfono, especialidad, registro profesional, años de experiencia, consultorio, ciudad y descripción; estado vacío si no hay documento; aviso "Para cambiar estos datos, contacta al administrador" con `mailto:` a `VITE_ADMIN_EMAIL` (sin enlace si la variable está vacía).
- Parte 4: `store/therapistProfile.ts` — escucha `therapistProfiles/{uid}` (solo lectura) y la carga `App.tsx` solo para `role === 'therapist'`.

- Parte 5: `components/Layout.tsx` — en PC (ancho `md`, 768px o más) el pin/unpin se reemplaza por un botón hamburguesa en el header. La barra lateral está abierta por defecto (iconos + texto, `w-60`); al cerrarla queda un mini-sidebar de 64px solo con iconos y tooltip (`title`), con el enlace activo resaltado y transición suave de ancho.
- Parte 5: estado en `localStorage` clave `lister.sidebar` (`'open'` | `'mini'`). La clave antigua `lister.pin` se migra una vez (`'0'` → mini, otro valor → abierta) y se borra.
- Parte 5: en celular no hay sidebar ni mini-sidebar: empieza siempre cerrado (no se guarda) y la hamburguesa abre el drawer sobre fondo oscuro; se cierra al elegir una opción o al tocar fuera. "Cerrar sesión" sigue en el pie del drawer. El menú por rol no cambió (admin: Terapeutas; terapeuta: Agenda, Pacientes, Métricas).
- Parte 5: nuevo `lib/useMediaQuery.ts` (decide PC/celular por ancho de ventana, no por plataforma). Corrección: el drawer antiguo no se cerraba al tocar el fondo oscuro (el clic caía en el fondo y no en el contenedor); ahora el fondo cierra el drawer.
- Parte 5: se eliminó `components/TeamSection.tsx` (resto de la Parte 2, sin uso y no compilaba) y se cambió `.at(-1)` en `store/data.test.ts` (la librería de TS es ES2020); ambos bloqueaban `npm run build`.
- Revisión 1–5: `src/App.test.tsx` (ruteo por rol) y corrección del menú del perfil tapado por el contenido (`Layout.tsx`: header `relative z-20`).
- Parte 6: motor de temas por tokens (`src/lib/theme.ts`, `src/store/theme.ts`; sin cambios en la interfaz del Panel de control). Ver la sección "Sistema de temas".
- Parte 6: `index.css` y `tailwind.config.js` leen las variables; `Layout.tsx` (header, sidebar y drawer) y `Therapists.tsx` (encabezado y filas de la tabla) usan los colores del tema. Fuentes locales con `@fontsource` (`src/lib/fontFaces.ts`, nuevas dependencias en `package.json`).
- Parte 6: en celular también se aplica el tema guardado en el dispositivo o el predeterminado (antes siempre el rosa). Sigue sin haber interfaz para cambiarlo en celular.
- Parte 6: **Menta** baja su saturación (38 → 28) para que su texto de acento llegue a 4.5:1 de contraste; es el único predeterminado que cambia de aspecto respecto de los temas antiguos (Rosa clásico queda idéntico: se comparó pixel a pixel).
- Parte 7: `components/ControlPanelModal.tsx` rediseñado (solo PC). De arriba abajo: Temas predeterminados (muestra squircle de 44×28 px con 3 franjas apiladas: letra, header y fondo, a la izquierda del nombre; el elegido con borde y check), Color de letra (selector + paleta rápida), Tamaño de letra, Tipografía (cada nombre en su fuente), Color de tablas (encabezado y filas), Color de header, Color de sidebar, Forma de bordes (vista previa de una esquina) y Forma de fondo (miniaturas).
- Parte 7: todo se aplica al instante y se guarda; un punto "personalizado" marca los controles que difieren del tema (y cada color tiene "Volver al del tema"); el pie tiene "Restablecer personalizaciones" (`resetOverrides`, conserva el tema elegido) y "Listo".
- Parte 7: accesibilidad: cada grupo es un `radiogroup` con nombre, tabulación por grupo y flechas / Inicio / Fin para elegir; avisa si el color de letra tiene poco contraste (< 4.5:1) con el fondo.
- Parte 7: `components/ui.tsx` — `Modal` admite la propiedad opcional `footer`: con ella el título y el pie quedan fijos y solo el cuerpo hace scroll (sin ella, los demás modales no cambian).

- Parte 10 (Spark): gestión de terapeutas en el cliente. Nuevo `src/lib/therapistAdmin.ts` (+ prueba); `src/lib/team.ts` ya no llama a funciones; `src/pages/Therapists.tsx` crea (segunda instancia de Firebase + lote + correo), envía el correo de contraseña y elimina; `firestore.rules` permite a `users` solo create válido / delete de terapeuta por el admin; `src/lib/passkey.ts` marca los passkeys como no disponibles sin servidor; `firebase.json` sin bloque `functions`. Ver "Modelo Spark".
- Parte 11 (imprimir historial): botón **Imprimir PDF** en la pestaña Historial de `pages/ClientDetail.tsx` (solo si hay consultas). Abre la impresión del sistema; se elige "Guardar como PDF". Documento en `components/ClientHistoryPrint.tsx` + `.css` y logo en `components/ListerLogo.tsx` + `.css`. Ver "Historial en PDF".
- Parte 8: `components/CalendarView.tsx` y `pages/Agenda.tsx` — botón con icono de calendario (arriba a la derecha) que alterna **Vista de día** / **Vista de calendario**; la última vista se guarda en `localStorage['lister.agendaView']`. Ver la sección "Agenda: calendario mensual".
- Parte 8: `lib/calendar.ts` (`monthGrid`, `shiftMonth`, `longDate`, `MONTHS_ES`, `WEEKDAYS_ES`) con su prueba; nueva dependencia `@fontsource/dancing-script` (título manuscrito del mes, `src/lib/fontFaces.ts`).
- Revisión de entrega: `package.json` y `package-lock.json` corregidos (faltaban `@fontsource/dancing-script` y la entrada de `poppins` en el lock; `@testing-library/dom` y `tsx` ahora declarados).

### Eliminar un paciente: decisión de diseño
Por defecto se borra **en cascada**: el paciente, **todas** sus citas (programadas, realizadas y canceladas, incluidas las de reservas semanales con `seriesId`), sus consultas (`sessions`) y sus observaciones. Motivo: son datos clínicos de una persona; dejarlos huérfanos (sin paciente al que mostrarlos) incumple lo que la terapeuta espera al "eliminar" y deja información sensible en la base.
- Todo va en **un solo `writeBatch`** (atómico: o se borra todo o nada). El paciente va al final del lote.
- Límite de Firestore: 500 operaciones por lote. Solo si un paciente supera esa cifra se divide en varios lotes (dependientes primero, paciente en el último, así un fallo deja al paciente visible para reintentar); en ese caso extremo ya no es atómico.
- La confirmación muestra cuántas citas, consultas y observaciones se borran, avisa si hay **citas futuras programadas** y cuántas pertenecen a reservas semanales. No se puede deshacer.
- Una cita individual de una serie sigue cancelándose desde la Agenda con "Solo esta cita / Esta y las siguientes" (`cancelSeriesFrom`, sin cambios).

## Historial en PDF (Parte 11)
- **Cómo funciona:** al pulsar "Imprimir PDF" se monta `ClientHistoryPrint` en `<body>` (fuera de `#root`), se esperan las fuentes y se llama a `window.print()`. En pantalla ese documento está oculto (`display: none`); al imprimir, la app se oculta y solo queda la hoja. En el diálogo se elige **Guardar como PDF**. El nombre sugerido del archivo es `Historial - <paciente>` (se usa el título de la página y se restaura al terminar, con el evento `afterprint`).
- **Contenido:** logo, "Historial del paciente", datos del paciente y de la profesional (si su perfil está cargado), resumen (cantidad, primera y última consulta, mejor/igual/peor) y cada consulta con sus campos (los vacíos no se imprimen). Mismo orden que la pantalla (la más reciente primero). No incluye las observaciones sueltas ni las citas sin consulta registrada.
- **Estilo:** títulos en letra **bubble rosada** (`@fontsource/bubblegum-sans`, importada en `src/lib/fontFaces.ts`, no es opción del selector de tipografía); el contenido en **Arial** (fuente del sistema; si no existe se usa Liberation Sans/Helvetica), más sobrio, con detalles rosados (franja superior, ondita, tarjetas, línea de tiempo con puntos, etiquetas). Colores y fuentes fijos: no cambian con el tema del Panel de control.
- **Hoja:** A4 con `@page { margin: 0 }`; la franja rosa y el pie son `position: fixed` (se repiten en cada página) y el espacio de arriba/abajo lo dan el `thead`/`tfoot` de una tabla de marco. Los colores de fondo se fuerzan con `print-color-adjust: exact` (no hace falta marcar "Gráficos de fondo").
- **Logo:** "Liste" en la fuente bubble + una "r" dibujada en SVG (palo y arco) cuya punta de adelante baja y termina en una flecha hacia abajo, como si la r se fuera a convertir en una "n" ("listen"). Por ahora solo se usa en este documento; en la app (Sidebar, Login) sigue el texto "Lister".
- **Limitaciones:** necesita impresión del navegador: funciona en la web y en Electron. En la app móvil (Capacitor/WebView de Android) `window.print()` normalmente no hace nada; el botón se vuelve a habilitar a los 5 s. Para PDF directo en el celular habría que generar el archivo (p. ej. con una librería de PDF) y compartirlo: no está hecho.

## Agenda: calendario mensual (Parte 8)
- Rejilla de 7 columnas (domingo a sábado) con 5 o 6 filas; los días de otros meses van atenuados y el día actual resaltado. Controles: flechas ‹ ›, selectores de mes y de año (actual −5 a +5) y botón "Hoy" (aparece al salir del mes actual). Título "Mes de año" en Dancing Script sobre fondo `brand-50` con una mancha de acuarela decorativa en CSS.
- Cada celda muestra hasta 2 citas no canceladas (hora + paciente) y "+N más"; en celular solo un contador. Las citas se agrupan por fecha una sola vez con `useMemo`.
- Al tocar un día se abre un modal con la fecha completa y las citas ordenadas por hora (hora, paciente, estado), estado vacío si no hay, y el botón "Ver este día" (lleva a la vista de día). Se cierra con Esc, clic fuera o "Cerrar". Las citas de una reserva semanal (`seriesId`) llevan un icono de repetición.
- **Cancelar desde el modal del día:** en PC, al pasar el mouse sobre una cita aparece a la derecha de su fila el botón "Cancelar cita" (se oculta al quitar el mouse; también aparece con el foco del teclado). En celular, al **mantener presionada** la cita (0,5 s) aparece el botón a un lado; se oculta al tocar fuera de la fila. Solo las citas `programada` lo tienen. El botón no escribe nada: avisa a `Agenda.tsx` (`onCancelAppointment`), que abre el **mismo flujo de la vista de día** (confirmación; en citas de serie "Solo esta cita" / "Esta y las siguientes" con `cancelSeriesFrom`). Con la confirmación abierta, Esc cierra solo la confirmación (`cancelPending`). No se tocó `hasConflict`, `isDateBookable` ni `bookWeekly`.
- Usa solo variables del tema (`brand-*`, radio), así respeta el Panel de control.

## Perfil de la terapeuta (`therapistProfiles/{uid}`)
Documento separado de `users/{uid}`; lo llena y edita el administrador. Todos los campos son texto:
`fullName*`, `email*`, `phone`, `idNumber` (documento), `birthDate` (YYYY-MM-DD), `specialty`, `licenseNumber` (tarjeta/registro), `officeAddress`, `city`, `yearsExperience`, `bio`, más `createdAt`/`updatedAt`.
- "Borrar un campo" = dejarlo vacío (`''`). Nombre y correo no pueden quedar vacíos (cliente y reglas).
- En "Ver/editar" el **correo es de solo lectura**: es el de inicio de sesión (Auth) y cambiarlo exige borrar y recrear la cuenta de Authentication (el cliente no puede cambiar el correo de otra persona).
- Las cuentas migradas (Parte 1) no tienen perfil: aparecen con el correo y "Sin nombre"; al guardar desde "Ver/editar" se crea el documento.

## Sistema de temas (Parte 6)
Tema efectivo = `{ ...predeterminado, ...personalizaciones }`. Estado guardado: `{ presetId, overrides }`.

| Token | Valores | Variable CSS |
|-------|---------|--------------|
| Color principal | tono (0–360) + saturación (0–100) → paleta `brand-50…900` | `--brand-*` |
| Color de letra | `#rrggbb` | `--ink-600…900` (solo si se personaliza; si no, el texto sigue `brand-*`) |
| Tamaño de letra | `small` 87.5% · `normal` 100% · `large` 112.5% | `--font-size` (en `<html>`; todo escala en rem) |
| Tipografía | `system` · Nunito · Inter · Lora · Poppins · Playfair Display | `--font-sans` (Dancing Script solo se usa en el título del calendario, no es opción del selector) |
| Header · Sidebar · Fondo | `#rrggbb` | `--header` · `--sidebar` · `--app-bg` |
| Tablas | encabezado y filas, `#rrggbb` | `--thead` · `--trow` |
| Forma de bordes | `square` 0.125rem · `soft` 0.6rem · `round` 1rem (actual) · `pill` 1.5rem | `--radius` (`rounded-2xl`; `xl`×0.75, `xl2`×1.25, `xl3`×1.75; `rounded-full` no cambia) |
| Forma de fondo | `plain` · `gradient` · `dots` · `waves` · `watercolor` (CSS/SVG inline) | `--bg-image` · `--bg-size` |

- Predeterminados (`PRESETS`): Rosa clásico (aspecto actual y por defecto), Acuarela, Lila suave, Menta, Cielo, Durazno; cada uno define todos los tokens.
- Store (`useTheme`): `setPreset(id)` (borra las personalizaciones), `setOverride(key, value)` (conserva el resto; un valor igual al del predeterminado no cuenta como personalización), `resetOverrides()`, `resetAll()`. Los nombres `themeId`/`setTheme`/`reset` siguen como alias para el Panel actual.
- Persistencia: `localStorage['lister.theme']` = `{"v":1,"presetId":"…","overrides":{…}}`, aplicada antes del primer render (`initTheme`). Migra el formato antiguo (solo un id; `fucsia` pasa a Rosa clásico con su matiz).
- `previewColors(theme)` → `{ texto, header, fondo }` para las muestras de la Parte 7; `contrastRatio(a, b)` (WCAG).
- Cómo añadir un token: `Tokens` + `normalizeValue` + `themeVars` en `lib/theme.ts`, valor por defecto en `:root` de `index.css` (lo comprueba `theme.test.ts`) y, si hace falta, `tailwind.config.js`.

## Revisión final (Parte 9)
**Pruebas** (`npm test`, 287 en 27 archivos; Vitest junto a cada archivo): `functions/test/{login,rp,team}`, `src/App`, `components/{CalendarView,ControlPanelModal,Layout,ProfileMenu,SettingsModal}`, `lib/{calendar,metrics,platform,theme,validation}`, `pages/{Agenda,ClientDetail,Clients,Login,Metrics,PersonalNotes,Profile,Therapists}`, `store/{data,metrics,notes,theme,therapistProfile}`. Reglas de Firestore: `tests/rules/firestore.rules.test.ts` con `npm run test:rules` (necesita Java y descargar el emulador de Firestore).

**Qué se encontró y se arregló**
- `npm run build` fallaba por `@fontsource/dancing-script` sin declarar en `package.json` (Vitest y `tsc` no lo detectan). Añadida.
- `package-lock.json` desactualizado (`npm ci` fallaba): regenerado en la raíz y en `functions/`. `@testing-library/dom` y `tsx` declarados como devDependencies.
- `TeamSection.tsx` quedó sin uso y rompía `tsc`: eliminado. El buscador de Pacientes tapaba el menú del perfil: `z-20` en el header.
- Restos del modelo antiguo (`editor`, `createEditor`, `TeamSection`, `lister.pin`, "sin documento = admin"): solo quedan los justificados (script de migración, migración de la clave `lister.pin` y pruebas que comprueban que `editor` ya no tiene permisos).
- Pendiente en tu máquina: `npm run test:rules`, `build/icon.png` para `electron:build` y una pasada manual con sesión real de admin y de terapeuta.

## Perfil del administrador
`/perfil` (solo `admin`, `src/pages/AdminProfile.tsx`): muestra los datos de su cuenta de Firebase Authentication (nombre, correo, UID, rol, fecha de creación, último acceso, correo verificado), solo lectura. Nombre y correo se cambian en la consola de Firebase; la contraseña, desde Configuración. Se abre desde el menú del círculo del header.

## Splash (Android) y preloader (PC)

Rosado de la marca con el logo de Lister en blanco.

- **Celular, al abrir la app:** splash nativo de Android → splash web idéntico (`index.html`, antes de que cargue React) → `src/components/Splash.tsx` hasta que haya sesión y perfil (mínimo 1,5 s, tope 8 s).
- **PC, al iniciar sesión:** `Splash` a pantalla completa desde que entra el usuario hasta que carga su perfil (mínimo 1,5 s). Al abrir la app en PC se ve directo el login.
- La lógica está en `src/lib/useSplash.ts` (con tests); los estilos `.boot-splash` en `index.html`.

Generar/actualizar el splash de Android (requiere `npm install`; los PNG de `resources/` ya vienen hechos):

```bash
npx cap add android        # solo la primera vez
npm run android:assets     # resources/*.png → android/app/src/main/res (splash por densidad, claro/oscuro)
npm run android:splash     # color, tema de arranque y logo de Android 12+ (idempotente)
npm run cap:android        # build web + cap sync android
```

Si cambia el logo o la fuente: `npm run logo` (regenera `public/lister-logo-white.svg` y los PNG de `resources/`; requiere `pip install fonttools cairosvg`) y repetir los pasos anteriores.

## Panel de control con pestañas

`components/ControlPanelModal.tsx` (solo PC) tiene una barra de pestañas fija arriba (el título, las pestañas y el pie no se mueven; solo hace scroll el cuerpo):

- **Temas:** temas predeterminados.
- **Tipografía:** tipo de letra, tamaño de letra y color de letra.
- **Tablas:** un solo color que rige a la vez el **header**, el **sidebar** y el **encabezado de las tablas** (las filas siempre son blancas). Incluye una vista previa de los tres.
- **Bordes:** forma de bordes.
- **Fondo:** color de fondo (lista de colores muy claros) y forma de fondo.

Los colores (letra y tablas) se eligen de una lista de tarjetas con muestra y check, igual que los temas; ya no hay selector hexadecimal. Las pestañas con ajustes personalizados muestran el puntito.

Cambios en el motor (`src/lib/theme.ts`): los tokens `headerColor`, `sidebarColor`, `tableHeaderColor` y `tableRowColor` se reemplazan por `tableColor`; las listas `TABLE_COLORS`, `BACKGROUND_COLORS` y `TEXT_COLORS` son las opciones. Cada tema predeterminado trae su color de tablas (Rosa clásico = `#fdf2f6`, antes el header y el sidebar eran blancos). Las personalizaciones guardadas con el modelo anterior (header, sidebar, tablas) se descartan solas al cargar. `components/ui.tsx`: `Modal` acepta `nav` (barra fija bajo el título).

## Anamnesia (formulario del paciente)

- **Anamnesia** (menú lateral, debajo de Pacientes): eliges un paciente y se genera su formulario (basado en `ANAMNESIS_PARA_EL_CLIENTE.docx`). Botones: **Descargar HTML**, **Enviar por WhatsApp** y **Copiar enlace**.
- El enlace es `https://<proyecto>.web.app/#/formulario/<token>` (cambia el dominio con `VITE_PUBLIC_URL`). El token es secreto y de un solo uso; el paciente no necesita cuenta.
- Al pulsar **Enviar** en el formulario, las respuestas se guardan en `anamnesisForms/{token}` y aparecen solas en la pestaña **Anamnesia** de la ficha del paciente.
- Reglas: `firestore.rules` (bloque `anamnesisForms`). Hay que desplegarlas: `firebase deploy --only firestore:rules,hosting`. Pruebas: `tests/rules/anamnesis.rules.test.ts` (`npm run test:rules`).
- El esquema de preguntas vive en `src/lib/anamnesis.ts`; el HTML se genera en `src/lib/anamnesisHtml.ts`.
