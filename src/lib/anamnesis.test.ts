import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  allAnswerIds, ANAMNESIS_SECTIONS, answeredGroups, cleanAnswers, downloadName, formLink, newToken, publicBaseUrl, publicFormToken, whatsappMessage,
  whatsappNumber, whatsappUrl,
} from './anamnesis';
import { buildAnamnesisHtml } from './anamnesisHtml';

describe('esquema', () => {
  it('cubre las 5 partes del documento y ningún id se repite', () => {
    expect(ANAMNESIS_SECTIONS.map((s) => s.id)).toEqual(['datos', 'queja', 'fase1', 'fase2', 'fase3', 'fase4']);
    const ids = allAnswerIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('nombre');
    expect(ids).toContain('f4_sentimientos_29'); // 30 sentimientos
    expect(ids).not.toContain('f4_sentimientos_30');
  });

  it('cleanAnswers descarta claves ajenas y valores que no son texto', () => {
    expect(cleanAnswers({ nombre: '  Ana  ', hackeo: 'x', queja: 5, f1_hijos: '' })).toEqual({ nombre: 'Ana' });
    expect(cleanAnswers(null)).toEqual({});
  });

  it('answeredGroups muestra solo lo contestado, con el detalle junto a la opción', () => {
    const groups = answeredGroups({ nombre: 'Ana', f1_trauma: 'Sí', f1_trauma_detalle: 'Accidente', f4_sentimientos_0: 'Mucha intensidad', f4_sentimientos_6: 'Poca intensidad' });
    expect(groups.map((g) => g.title)).toEqual(['Datos personales', 'Fase 01 · Vida personal', 'Fase 04 · Emocional']);
    expect(groups[1].lines).toEqual([{ label: '¿Algún trauma?', value: 'Sí · ¿Cuál? Accidente' }]);
    expect(groups[2].lines[0].value).toBe('Rabia: Mucha intensidad\nTristeza: Poca intensidad');
    expect(answeredGroups({})).toEqual([]);
  });
});

describe('enlace, token y WhatsApp', () => {
  it('newToken: 32 hex, distinto cada vez, y publicFormToken lo reconoce', () => {
    const a = newToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newToken()).not.toBe(a);
    expect(publicFormToken(`#/formulario/${a}`)).toBe(a);
    expect(publicFormToken('#/clientes')).toBeNull();
    expect(publicFormToken('#/formulario/corto')).toBeNull();
    expect(publicFormToken('')).toBeNull();
  });

  it('publicBaseUrl usa VITE_PUBLIC_URL o <proyecto>.web.app', () => {
    expect(publicBaseUrl({ VITE_PUBLIC_URL: 'https://lister.app/', VITE_FIREBASE_PROJECT_ID: 'x' })).toBe('https://lister.app');
    expect(publicBaseUrl({ VITE_FIREBASE_PROJECT_ID: 'mi-proy' })).toBe('https://mi-proy.web.app');
    expect(formLink('abc', 'https://x.web.app')).toBe('https://x.web.app/#/formulario/abc');
  });

  it('whatsappNumber: 10 dígitos = Colombia (+57); con prefijo se respeta', () => {
    expect(whatsappNumber('300 123 4567')).toBe('573001234567');
    expect(whatsappNumber('+57 300 123 4567')).toBe('573001234567');
    expect(whatsappNumber('')).toBe('');
  });

  it('whatsappUrl lleva el mensaje codificado; sin teléfono deja elegir contacto', () => {
    const msg = whatsappMessage('Ana María Pérez', 'https://x.web.app/#/formulario/abc');
    expect(msg).toContain('Hola Ana,');
    const url = whatsappUrl('3001234567', msg);
    expect(url.startsWith('https://wa.me/573001234567?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toBe(msg);
    expect(whatsappUrl('', msg).startsWith('https://wa.me/?text=')).toBe(true);
  });

  it('downloadName: sin tildes ni símbolos', () => {
    expect(downloadName('Ana María Pérez')).toBe('anamnesis-ana-maria-perez.html');
    expect(downloadName('???')).toBe('anamnesis-paciente.html');
  });
});

describe('HTML del formulario', () => {
  const cfg = { token: 'a'.repeat(32), projectId: 'demo-lister', apiKey: 'KEY', clientName: 'Ana' };
  const open = (opts: Partial<typeof cfg> & { preview?: boolean } = {}, fetchImpl?: (url: string, init?: RequestInit) => Promise<unknown>) => {
    const fetchMock = vi.fn(fetchImpl ?? (async () => ({ ok: true, status: 200 })));
    const dom = new JSDOM(buildAnamnesisHtml({ ...cfg, ...opts }), {
      runScripts: 'dangerously',
      url: 'https://lister.test/',
      beforeParse(window) {
        (window as unknown as { fetch: unknown }).fetch = fetchMock;
        window.scrollTo = () => undefined;
        window.HTMLElement.prototype.scrollIntoView = () => undefined;
      },
    });
    return { dom, doc: dom.window.document, fetchMock };
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('un nombre malicioso no inyecta HTML ni cierra el script', () => {
    const html = buildAnamnesisHtml({ ...cfg, clientName: '</script><img src=x onerror=alert(1)>' });
    expect(html).not.toContain('</script><img');
    const { doc } = open({ clientName: '</script><img src=x onerror=alert(1)>' });
    expect(doc.querySelector('img')).toBeNull();
    expect(doc.querySelector('.for')?.textContent).toContain('</script>');
  });

  it('dibuja todas las secciones y los 30 sentimientos, con el nombre ya puesto', () => {
    const { doc } = open();
    expect(doc.querySelectorAll('section.sec')).toHaveLength(6);
    expect(doc.querySelectorAll('table.matrix tbody tr')).toHaveLength(30);
    expect((doc.getElementById('f_nombre') as HTMLInputElement).value).toBe('Ana');
  });

  it('los campos de detalle aparecen solo con la opción que corresponde', () => {
    const { doc } = open();
    const box = doc.getElementById('f_f1_trauma_detalle')!.parentElement as HTMLElement;
    expect(box.hidden).toBe(true);
    (doc.getElementById('f_f1_trauma_0') as HTMLInputElement).click(); // Sí
    expect(box.hidden).toBe(false);
    (doc.getElementById('f_f1_trauma_1') as HTMLInputElement).click(); // No
    expect(box.hidden).toBe(true);
  });

  it('enviar: PATCH a Firestore solo de answers/status/submittedAt, sin detalles ocultos, y muestra el agradecimiento', async () => {
    const { doc, fetchMock } = open();
    await tick(); // consulta inicial del enlace
    (doc.getElementById('f_f1_trauma_0') as HTMLInputElement).click(); // Sí
    const det = doc.getElementById('f_f1_trauma_detalle') as HTMLInputElement;
    det.value = 'Accidente';
    det.dispatchEvent(new doc.defaultView!.Event('input'));
    (doc.getElementById('f_f1_trauma_1') as HTMLInputElement).click(); // No → el detalle queda oculto
    (doc.getElementById('f_f1_fobia_0') as HTMLInputElement).click(); // Sí, sin detalle
    (doc.querySelector('input[name="f_f4_sentimientos_0"]') as HTMLInputElement).click(); // Rabia: Mucha intensidad
    (doc.querySelector('button.send') as HTMLButtonElement).click();
    await tick();

    const call = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')!;
    const url = call[0] as string;
    expect(url).toContain(`/projects/demo-lister/databases/(default)/documents/anamnesisForms/${cfg.token}?`);
    expect(url).toContain('currentDocument.exists=true');
    expect(url).toContain('updateMask.fieldPaths=answers&updateMask.fieldPaths=status&updateMask.fieldPaths=submittedAt');
    expect(url).toContain('key=KEY');
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(Object.keys(body.fields).sort()).toEqual(['answers', 'status', 'submittedAt']);
    expect(body.fields.status.stringValue).toBe('completed');
    expect(body.fields.submittedAt.integerValue).toMatch(/^\d+$/);
    expect(body.fields.answers.mapValue.fields).toEqual({
      nombre: { stringValue: 'Ana' },
      f1_trauma: { stringValue: 'No' },
      f1_fobia: { stringValue: 'Sí' },
      f4_sentimientos_0: { stringValue: 'Mucha intensidad' },
    });
    expect(doc.querySelector('.state h1')?.textContent).toContain('Gracias');
  });

  it('sin nombre no envía nada', async () => {
    const { doc, fetchMock } = open({ clientName: '' });
    await tick();
    (doc.querySelector('button.send') as HTMLButtonElement).click();
    await tick();
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')).toBe(false);
    expect(doc.querySelector('.err')?.textContent).toContain('nombre');
  });

  it('si el servidor rechaza el envío, avisa y deja reintentar', async () => {
    const { doc } = open({}, async (_url, init) => ((init as RequestInit | undefined)?.method === 'PATCH' ? { ok: false, status: 403 } : { ok: true, status: 200 }));
    await tick();
    const btn = doc.querySelector('button.send') as HTMLButtonElement;
    btn.click();
    await tick();
    expect(btn.disabled).toBe(false);
    expect(doc.querySelector('.err')?.textContent).toContain('ya se haya enviado');
  });

  it('un enlace ya usado (403 al consultar) muestra "formulario cerrado"', async () => {
    const { doc } = open({}, async () => ({ ok: false, status: 403 }));
    await tick();
    expect(doc.querySelector('.state h1')?.textContent).toContain('ya no está disponible');
  });

  it('vista previa: no consulta ni envía', async () => {
    const { doc, fetchMock } = open({ preview: true });
    await tick();
    expect(fetchMock).not.toHaveBeenCalled();
    expect((doc.querySelector('button.send') as HTMLButtonElement).disabled).toBe(true);
  });
});
