/**
 * Anamnesis del cliente: esquema del formulario (tomado de ANAMNESIS_PARA_EL_CLIENTE.docx) y utilidades.
 *
 * Flujo: la terapeuta elige un paciente → se crea un documento `anamnesisForms/{token}` en estado "pending" → se le entrega al
 * paciente un enlace (o el HTML descargado) → el paciente lo llena y pulsa "Enviar" → el documento pasa a "completed" con las
 * respuestas, y la pestaña Anamnesia del paciente (en tiempo real) las muestra. El esquema es la única fuente de verdad: lo usan
 * el HTML del formulario (anamnesisHtml.ts) y la vista de respuestas (AnamnesisView.tsx).
 */

export type AnamnesisItem =
  | { kind: 'heading'; label: string }
  | { kind: 'text'; id: string; label: string; input?: 'text' | 'email' | 'date' | 'number' }
  | { kind: 'long'; id: string; label: string; rows?: number }
  | {
      kind: 'choice';
      id: string;
      label: string;
      options: string[];
      /** Campo de texto que acompaña a la opción. `when` = opciones que lo muestran (sin `when`: siempre visible). */
      detail?: { id: string; label: string; when?: string[] };
    }
  | { kind: 'matrix'; id: string; label: string; rows: string[]; cols: string[] };

export interface AnamnesisSection {
  id: string;
  title: string;
  intro?: string;
  items: AnamnesisItem[];
}

export type AnamnesisAnswers = Record<string, string>;

export type AnamnesisStatus = 'pending' | 'completed';

/** anamnesisForms/{token}: el id del documento ES el token secreto del enlace. */
export interface AnamnesisForm {
  id: string;
  ownerId: string;
  clientId: string;
  clientName: string;
  status: AnamnesisStatus;
  answers: AnamnesisAnswers;
  createdAt: number;
  submittedAt?: number;
}

/* ---------- atajos para escribir el esquema ---------- */

const text = (id: string, label: string, input?: 'text' | 'email' | 'date' | 'number'): AnamnesisItem => ({ kind: 'text', id, label, input });
const long = (id: string, label: string, rows = 3): AnamnesisItem => ({ kind: 'long', id, label, rows });
const heading = (label: string): AnamnesisItem => ({ kind: 'heading', label });
const choice = (id: string, label: string, options: string[], detail?: { id: string; label: string; when?: string[] }): AnamnesisItem => ({
  kind: 'choice',
  id,
  label,
  options,
  detail,
});
/** Sí / No, con un campo de texto que aparece al responder "Sí" (o siempre, si `always`). */
const yn = (id: string, label: string, detailLabel?: string, always = false): AnamnesisItem =>
  choice(id, label, ['Sí', 'No'], detailLabel ? { id: `${id}_detalle`, label: detailLabel, when: always ? undefined : ['Sí'] } : undefined);

const FEELINGS = [
  'Rabia', 'Miedo de algo concreto', 'Miedos vagos', 'Culpa', 'Revuelta', 'Miedo de perder el control', 'Tristeza', 'Dolor', 'Orgullo', 'Odio',
  'Egoísmo', 'Ansiedad', 'Intolerancia', 'Sumisión', 'Indecisión', 'Desesperación', 'Desánimo', 'Cobardía', 'Egocentrismo', 'Celos',
  'Frustración', 'Nostalgia', 'Cansancio', 'Impaciencia', 'Angustia', 'Timidez', 'Apatía', 'Resentimiento', 'Soledad', 'Autoritarismo',
];

const POS_NEG = ['Positivos', 'Negativos'];

export const ANAMNESIS_SECTIONS: AnamnesisSection[] = [
  {
    id: 'datos',
    title: 'Datos personales',
    items: [
      text('nombre', 'Nombre'),
      text('nacimiento', 'Fecha de nacimiento', 'date'),
      text('estadoCivil', 'Estado civil'),
      text('email', 'E-mail', 'email'),
      text('profesion', 'Profesión'),
      text('empresa', 'Empresa'),
      text('religion', 'Religión'),
      text('escolaridad', 'Escolaridad'),
    ],
  },
  {
    id: 'queja',
    title: 'Queja principal',
    intro: '¿Qué te trajo hasta aquí?',
    items: [long('queja', 'Cuéntanos con tus propias palabras', 7)],
  },
  {
    id: 'fase1',
    title: 'Fase 01 · Vida personal',
    items: [
      long('f1_estado', '¿Es casado(a), soltero(a) o divorciado(a)?', 2),
      long('f1_divorcio', 'Si está divorciado(a), ¿por qué motivo y cómo se siente?'),
      text('f1_hijos', 'Número de hijos', 'number'),
      long('f1_relHijos', '¿Cómo es su relación con sus hijos?'),
      long('f1_pareja', '¿Cómo se siente en su relación con su pareja?'),
      long('f1_casa', '¿Cómo se siente en su casa, dentro del contexto familiar?'),
      long('f1_trabajo', '¿Cómo se siente en su trabajo?'),
      choice('f1_pertFamiliar', '¿Se siente perteneciendo al Contexto Familiar?', ['Sí', 'No'], { id: 'f1_pertFamiliar_porque', label: '¿Por qué?' }),
      choice('f1_pertSocial', '¿Se siente perteneciendo al Contexto Social?', ['Sí', 'No'], { id: 'f1_pertSocial_porque', label: '¿Por qué?' }),
      choice('f1_pertReligioso', '¿Se siente perteneciendo al Contexto Religioso?', ['Sí', 'No'], { id: 'f1_pertReligioso_porque', label: '¿Por qué?' }),
      heading('¿Siente frustración en relación a:'),
      text('f1_frusPadres', '¿Padres?'),
      text('f1_frusHermanos', '¿Hermanos?'),
      text('f1_frusHijos', '¿Hijos?'),
      text('f1_frusProfesion', '¿Profesión?'),
      text('f1_frusColegio', '¿Colegio?'),
      text('f1_frusConyuge', '¿Cónyuge?'),
      text('f1_frusIdentidad', '¿Identidad sexual?'),
      text('f1_frusVidaSexual', '¿Vida sexual?'),
      long('f1_frusPorque', '¿Por qué?', 2),
      heading('Sexualidad'),
      text('f1_sexEdad', '¿Inició su sexualidad a qué edad?'),
      choice('f1_sexPrimera', '¿Cómo fue su primera vez?', ['Traumática', 'Normal', 'Buena', 'Satisfactoria']),
      long('f1_sexProblema', '¿Ha tenido algún problema en relación al sexo?', 2),
      yn('f1_sexRealiza', '¿Actualmente siempre se realiza en las relaciones sexuales?'),
      choice('f1_sexImportancia', 'El sexo para usted es algo:', ['Importante', 'Sin importancia', 'Muy importante']),
      heading('Salud y hábitos'),
      yn('f1_trauma', '¿Algún trauma?', '¿Cuál?'),
      yn('f1_fobia', '¿Alguna fobia?', '¿Cuál?'),
      yn('f1_miedo', '¿Tiene miedo de algo?', '¿De qué?'),
      yn('f1_drogas', '¿Usa drogas?', '¿Cuáles?'),
      yn('f1_dolorCabeza', '¿Dolores de cabeza?', '¿Con qué frecuencia?'),
      yn('f1_insomnio', '¿Insomnio?', '¿Con qué frecuencia?'),
      yn('f1_suicida', '¿Tiene ideas suicidas?', '¿Cuáles?'),
      yn('f1_alcohol', '¿Usa bebidas alcohólicas?', '¿Con qué frecuencia?'),
      yn('f1_fumador', '¿Es fumador(a)?'),
      yn('f1_embarazo', '¿Está embarazada?', '¿Cuántas semanas?'),
      choice('f1_estres', '¿Cuál es su nivel de estrés?', ['Alto', 'Medio', 'Bajo']),
      yn('f1_medicacion', '¿Actualmente está tomando alguna medicación?', '¿Cuál?'),
      yn('f1_trauma2', '¿Algún trauma?', '¿Cuál?'),
      yn('f1_psi', '¿Ha consultado algún tipo de psiquiatra o psicólogo?'),
      yn('f1_psiDiag', 'Si sí, ¿fue diagnosticado(a)?'),
      heading('Su día a día'),
      text('f1_amigos', '¿Cuál es la cantidad de amigos que tiene?'),
      text('f1_pasatiempo', '¿Cuál es su pasatiempo preferido?'),
      long('f1_creencia', '¿Cuál es la principal creencia que las personas poseen en relación a usted que más se repite?', 2),
      yn('f1_feliz', '¿Se considera feliz?', '¿Por qué?', true),
      long('f1_cambiar', 'Si pudiera cambiar algo en usted, en su modo de ser, o actuar, o en su comportamiento actual, ¿qué cambiaría?'),
      long('f1_vida', 'Defina qué es la vida en apenas una frase', 2),
    ],
  },
  {
    id: 'fase2',
    title: 'Fase 02 · Mental',
    items: [
      choice('f2_general', '¿Cuáles son los tipos de pensamientos que suele alimentar en relación a sí mismo(a), de manera general?', POS_NEG, {
        id: 'f2_general_detalle',
        label: '¿Cuáles exactamente?',
      }),
      choice('f2_apariencia', 'En relación a su apariencia física:', POS_NEG, { id: 'f2_apariencia_detalle', label: '¿Cuáles exactamente?' }),
      choice('f2_competencia', 'En relación a su competencia profesional:', POS_NEG, { id: 'f2_competencia_detalle', label: '¿Cuáles exactamente?' }),
      choice('f2_emocional', 'En relación a su vida emocional:', POS_NEG, { id: 'f2_emocional_detalle', label: '¿Cuáles exactamente?' }),
      choice('f2_sexual', 'En relación a su vida sexual:', POS_NEG, { id: 'f2_sexual_detalle', label: '¿Cuáles exactamente?' }),
      choice('f2_pasado', 'En relación a su pasado:', POS_NEG, { id: 'f2_pasado_detalle', label: '¿Cuáles exactamente?' }),
      choice('f2_futuro', 'En relación a su futuro:', POS_NEG, { id: 'f2_futuro_detalle', label: '¿Cuáles exactamente?' }),
      long('f2_vision', '¿Cuál es su visión sobre usted?'),
    ],
  },
  {
    id: 'fase3',
    title: 'Fase 03 · Infancia',
    items: [
      yn('f3_criado', '¿Fue criado por sus padres?'),
      heading('¿Cómo es su relación con sus padres?'),
      long('f3_relPadre', 'Padre', 2),
      long('f3_relMadre', 'Madre', 2),
      yn('f3_agresivos', '¿Sus padres fueron agresivos con usted?', 'Cuéntenos más', true),
      choice('f3_masBravo', '¿Cuál de ellos era el más bravo?', ['El Padre', 'La Madre'], { id: 'f3_masBravo_detalle', label: 'Cuéntenos más' }),
      yn('f3_bebidas', '¿Usaban bebidas o drogas?', 'Cuéntenos más', true),
      choice('f3_relEntrePadres', '¿Cómo describiría la relación entre sus padres?', ['Excelente', 'Muy buena', 'Buena', 'Regular', 'Pésima'], {
        id: 'f3_relEntrePadres_porque',
        label: '¿Por qué?',
      }),
      long('f3_seRepite', '¿Cuáles son los aspectos de esta relación que se asemejan, o se repiten en su vida hoy?'),
      long('f3_noRepetir', '¿Cuáles son las características de esta relación, que usted está determinado(a) a no repetir?'),
      long('f3_noRepetirPorque', '¿Por qué?', 2),
      long('f3_creenciaRelaciones', 'En cuanto a la relación de sus padres responda: ¿Cuál es la creencia que adquirió en relación a las relaciones?'),
      yn('f3_obligado', 'En la infancia, ¿era obligado(a) a hacer algo que le desagradaba?'),
      yn('f3_dolor', '¿Recuerda algo que le dolió mucho en la infancia?'),
      yn('f3_perdidas', '¿Tuvo pérdidas familiares o de amigos en la infancia?'),
      long('f3_tristeza', '¿Qué le hace sentir tristeza al recordar el pasado?', 2),
      long('f3_miedoNino', 'Cuando era niño(a), ¿tenía miedo de qué?', 2),
      choice('f3_luz', '¿Dormía con la luz encendida o apagada?', ['Encendida', 'Apagada']),
      choice('f3_adolescencia', '¿Cómo fue su adolescencia?', ['Mala', 'Buena', 'Óptima']),
      yn('f3_rebeldia', '¿Tuvo fase de rebeldía en la adolescencia?'),
      choice('f3_dificultadPadre', '¿Con cuál de sus padres tenía más dificultad de relación?', ['Padre', 'Madre', 'Ambos']),
      heading('¿Cuál es la filosofía de su familia en relación a…'),
      long('f3_filExito', '…el éxito profesional?', 2),
      long('f3_filDinero', '…el dinero?', 2),
      long('f3_filAmor', '…el amor?', 2),
      long('f3_filSexo', '…el sexo?', 2),
      long('f3_buenoNino', '¿Qué era para usted ser una buena niña(o)? Describa.'),
      long('f3_serAmado', '¿Cómo debería actuar, o ser para ser amado(a)?'),
      choice('f3_hermanos', '¿Posee hermanos?', ['No', 'Sí'], { id: 'f3_hermanos_cuantos', label: '¿Cuántos?', when: ['Sí'] }),
      long('f3_relHermanos', '¿Cómo es su relación con ellos?', 2),
      text('f3_introvertido', '¿Fue un niño(a) introvertido(a) o extrovertido(a)?'),
      long('f3_colegio', '¿Había dificultades de relaciones con los compañeros del colegio? Si sí, cítelos.', 2),
      long('f3_mayoresMiedos', '¿Cuáles eran sus mayores miedos en la infancia?', 2),
      long('f3_hechoMarcante', 'Relate algún hecho marcante en su infancia', 4),
    ],
  },
  {
    id: 'fase4',
    title: 'Fase 04 · Emocional',
    items: [
      long('f4_miedosHoy', '¿Cuáles son sus mayores miedos hoy?', 2),
      long('f4_piensaDeSi', '¿Qué piensa acerca de usted mismo(a)?', 2),
      long('f4_primeraRelacion', '¿Cómo fue su primera relación amorosa?', 2),
      heading('Si evaluara su actuación en la vida, ¿cuál papel le cabría más hoy?'),
      choice('f4_papel', '¿Víctima o responsable?', ['Víctima', 'Responsable']),
      long('f4_gananciaSecundaria', '¿Cuál es la ganancia secundaria?', 2),
      long('f4_situacionesVictima', '¿En cuáles situaciones desempeña el papel de víctima?', 2),
      long('f4_situacionesResponsable', '¿En cuáles situaciones desempeña el papel de responsable?', 2),
      choice('f4_victorioso', '¿Se considera victorioso(a) o derrotado(a)?', ['Victorioso(a)', 'Derrotado(a)']),
      choice('f4_dominante', 'En las relaciones y en la vida, ¿prefiere ser:', ['Dominante', 'Sumiso(a)']),
      long('f4_culpable', '¿Quién debe ser castigado por los problemas que ocurren con usted? O ¿quién es el culpable de sus problemas personales?', 2),
      choice('f4_rabia', '¿Siente rabia o rencor de alguien?', ['No', 'Sí'], { id: 'f4_rabia_quien', label: '¿Quién?', when: ['Sí'] }),
      yn('f4_presionado', '¿Se siente de alguna forma presionado(a) en la actualidad?', '¿De qué manera?'),
      yn('f4_controlador', '¿Se considera una persona controladora?'),
      yn('f4_inferior', '¿Se siente de alguna forma inferior a los otros?', '¿Por qué?'),
      yn('f4_dudaCapacidad', '¿Duda de su propia capacidad?'),
      choice('f4_audaz', '¿Es audaz, corre detrás de sus metas, o es autoprotector(a), prefiriendo ahorrarse los eventuales riesgos?', [
        'Audaz',
        'Autoprotector(a)',
      ]),
      yn('f4_culpa', '¿Existe algo que le hace sentirse culpable?', '¿Qué exactamente?'),
      {
        kind: 'matrix',
        id: 'f4_sentimientos',
        label: '¿Cuáles son los sentimientos más comunes en usted hoy?',
        rows: FEELINGS,
        cols: ['Mucha intensidad', 'Media intensidad', 'Poca intensidad'],
      },
    ],
  },
];

/** Id de la respuesta de la fila `index` de una matriz. */
export const matrixKey = (matrixId: string, index: number) => `${matrixId}_${index}`;

/** Todos los ids de respuesta que el esquema puede producir (para validar y contar). */
export function allAnswerIds(sections: AnamnesisSection[] = ANAMNESIS_SECTIONS): string[] {
  const ids: string[] = [];
  for (const s of sections) {
    for (const it of s.items) {
      if (it.kind === 'heading') continue;
      if (it.kind === 'matrix') it.rows.forEach((_, i) => ids.push(matrixKey(it.id, i)));
      else {
        ids.push(it.id);
        if (it.kind === 'choice' && it.detail) ids.push(it.detail.id);
      }
    }
  }
  return ids;
}

/** Deja solo textos de respuestas conocidas (el cliente no puede colar claves ajenas) y recorta su largo. */
export function cleanAnswers(raw: unknown): AnamnesisAnswers {
  const known = new Set(allAnswerIds());
  const out: AnamnesisAnswers = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (known.has(k) && typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 4000);
    }
  }
  return out;
}

export interface AnswerLine {
  label: string;
  value: string;
}
export interface AnswerGroup {
  title: string;
  lines: AnswerLine[];
}

/** Respuestas contestadas, agrupadas por apartado, para mostrarlas en la pestaña Anamnesia. */
export function answeredGroups(answers: AnamnesisAnswers, sections: AnamnesisSection[] = ANAMNESIS_SECTIONS): AnswerGroup[] {
  const groups: AnswerGroup[] = [];
  for (const s of sections) {
    const lines: AnswerLine[] = [];
    for (const it of s.items) {
      if (it.kind === 'heading') continue;
      if (it.kind === 'matrix') {
        const marked = it.rows
          .map((row, i) => ({ row, value: answers[matrixKey(it.id, i)] }))
          .filter((r) => r.value)
          .map((r) => `${r.row}: ${r.value}`);
        if (marked.length) lines.push({ label: it.label, value: marked.join('\n') });
        continue;
      }
      const main = (answers[it.id] ?? '').trim();
      const extra = it.kind === 'choice' && it.detail ? (answers[it.detail.id] ?? '').trim() : '';
      if (!main && !extra) continue;
      const value = it.kind === 'choice' && it.detail && extra ? `${main || '—'} · ${it.detail.label} ${extra}` : main || extra;
      lines.push({ label: it.label, value });
    }
    if (lines.length) groups.push({ title: s.title, lines });
  }
  return groups;
}

/* ---------- enlace, token y WhatsApp ---------- */

/** Token secreto de 128 bits (hex). Es el id del documento: quien tiene el enlace puede llenar ese formulario una vez. */
export function newToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Ruta pública del formulario: #/formulario/<token>. Devuelve el token o null. */
export function publicFormToken(hash: string): string | null {
  const m = /^#\/formulario\/([A-Za-z0-9_-]{16,64})\/?$/.exec(hash);
  return m ? m[1] : null;
}

/** URL pública de la app: VITE_PUBLIC_URL, o el dominio por defecto de Firebase Hosting (<proyecto>.web.app). */
export function publicBaseUrl(env: Record<string, string | undefined> = import.meta.env): string {
  const custom = env.VITE_PUBLIC_URL?.trim();
  if (custom) return custom.replace(/\/+$/, '');
  return `https://${env.VITE_FIREBASE_PROJECT_ID ?? 'tu-proyecto'}.web.app`;
}

export const formLink = (token: string, base = publicBaseUrl()) => `${base}/#/formulario/${token}`;

/** Solo dígitos; un número de 10 dígitos se toma como colombiano (+57). */
export function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `57${digits}` : digits;
}

export function whatsappMessage(clientName: string, link: string): string {
  const first = clientName.trim().split(/\s+/)[0] || '';
  return `Hola${first ? ` ${first}` : ''}, te comparto el formulario de anamnesis para nuestra primera sesión. Puedes llenarlo desde tu celular o computador y al final presionar «Enviar»: ${link}`;
}

/** Enlace wa.me con el mensaje listo. Sin teléfono guardado, WhatsApp deja elegir el contacto. */
export function whatsappUrl(phone: string, message: string): string {
  const number = whatsappNumber(phone);
  return `https://wa.me/${number.length >= 8 ? number : ''}?text=${encodeURIComponent(message)}`;
}

/** Nombre de archivo seguro para la descarga. */
export function downloadName(clientName: string): string {
  const slug = clientName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `anamnesis-${slug || 'paciente'}.html`;
}
