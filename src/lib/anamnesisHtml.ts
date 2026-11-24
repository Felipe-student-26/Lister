import { ANAMNESIS_SECTIONS } from './anamnesis';

/**
 * HTML autocontenido del formulario de anamnesis (sin dependencias ni servidor): sirve igual como página del enlace público
 * (src/pages/PublicAnamnesis.tsx) y como archivo .html descargado. Al pulsar "Enviar" escribe en Firestore por su API REST,
 * sin sesión, en el documento anamnesisForms/{token}: las reglas (firestore.rules) solo dejan pasar de "pending" a "completed"
 * y solo los campos answers, status y submittedAt, una única vez.
 *
 * El script es JavaScript plano dentro de String.raw: no debe llevar comillas invertidas ni `${…}`.
 */
export interface AnamnesisHtmlConfig {
  token: string;
  projectId: string;
  apiKey: string;
  clientName: string;
  /** Vista previa de la terapeuta: no consulta ni envía nada. */
  preview?: boolean;
}

/** JSON seguro para incrustar dentro de <script type="application/json">. */
const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

const CSS = `
:root{--ink:#2a2030;--muted:#6b5f70;--line:#e6dde1;--accent:#8c1c48;--accent-2:#a7285c;--soft:#f7ebf0;--bg:#f4f1f2;--card:#fff}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.hero{background:linear-gradient(135deg,#6e1237,#a7285c);color:#fff;padding:40px 20px 56px}
.wrap{max-width:780px;margin:0 auto;padding:0 16px}
.hero .wrap{padding:0}
.eyebrow{font-size:12px;letter-spacing:.16em;text-transform:uppercase;opacity:.85;font-weight:600}
h1{font-family:Georgia,"Times New Roman",serif;font-size:clamp(30px,6vw,42px);line-height:1.15;margin:8px 0 10px;font-weight:700}
.hero p{margin:0;max-width:60ch;opacity:.95}
.for{display:inline-block;margin-top:16px;padding:6px 14px;border:1px solid rgba(255,255,255,.45);border-radius:999px;font-size:14px}
.bar{position:sticky;top:0;z-index:5;background:rgba(244,241,242,.92);backdrop-filter:blur(6px);border-bottom:1px solid var(--line)}
.bar .wrap{display:flex;align-items:center;gap:12px;padding-top:10px;padding-bottom:10px}
.track{flex:1;height:6px;border-radius:99px;background:#e9dfe4;overflow:hidden}
.fill{height:100%;width:0;background:linear-gradient(90deg,var(--accent),var(--accent-2));transition:width .25s}
#pct{font-size:13px;font-weight:700;color:var(--accent);min-width:42px;text-align:right}
main{margin-top:-28px;padding-bottom:48px}
.note{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:12px;padding:14px 18px;margin:0 0 18px;font-size:14.5px;color:var(--muted);box-shadow:0 1px 2px rgba(0,0,0,.04)}
.sec{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:26px 24px;margin:0 0 18px;box-shadow:0 1px 2px rgba(0,0,0,.04),0 10px 28px -18px rgba(60,20,40,.28)}
.sec>h2{font-family:Georgia,"Times New Roman",serif;font-size:22px;margin:0 0 4px;color:var(--accent);font-weight:700}
.sec>.intro{margin:0 0 4px;font-weight:600}
.sec>.rule{height:2px;width:44px;background:var(--accent-2);border-radius:2px;margin:10px 0 20px}
h3{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:26px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.field{margin:0 0 18px;scroll-margin-top:84px}
.q{display:block;font-weight:600;margin:0 0 6px}
input[type=text],input[type=email],input[type=date],input[type=number],textarea{width:100%;font:inherit;color:var(--ink);background:#fcfafb;border:1px solid #d9ced3;border-radius:10px;padding:10px 12px;transition:border-color .15s,box-shadow .15s}
textarea{resize:vertical;min-height:84px}
input:focus,textarea:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(140,28,72,.14);background:#fff}
.opts{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.opt{position:relative}
.opt input{position:absolute;opacity:0;inset:0;width:100%;height:100%;margin:0;cursor:pointer}
.opt label{display:inline-block;padding:8px 16px;border:1px solid #d9ced3;border-radius:999px;background:#fcfafb;font-size:15px;cursor:pointer;transition:all .15s}
.opt:hover label{border-color:var(--accent)}
.opt input:checked+label{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
.opt input:focus-visible+label{box-shadow:0 0 0 3px rgba(140,28,72,.25)}
.clear{background:none;border:0;color:var(--muted);font:inherit;font-size:13px;text-decoration:underline;cursor:pointer;padding:4px 6px}
.detail{margin-top:10px;padding-left:14px;border-left:3px solid var(--soft)}
.detail label{display:block;font-size:14px;color:var(--muted);margin-bottom:4px}
.detail[hidden]{display:none}
.mwrap{overflow-x:auto;margin:0 -6px}
table.matrix{border-collapse:collapse;width:100%;min-width:480px;font-size:14.5px}
.matrix th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);text-align:center;padding:8px 6px;border-bottom:2px solid var(--line)}
.matrix th:first-child{text-align:left}
.matrix td{padding:7px 6px;border-bottom:1px solid var(--line);text-align:center}
.matrix td:first-child{text-align:left;font-weight:600}
.matrix input[type=radio]{width:19px;height:19px;accent-color:var(--accent);cursor:pointer}
.matrix .x{background:none;border:0;color:#a89aa1;cursor:pointer;font-size:16px;line-height:1}
.submit{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px;text-align:center;box-shadow:0 10px 28px -18px rgba(60,20,40,.28)}
.submit p{margin:0 0 14px;color:var(--muted);font-size:14.5px}
button.send{font:inherit;font-weight:700;font-size:17px;color:#fff;background:linear-gradient(180deg,var(--accent-2),var(--accent));border:0;border-radius:12px;padding:14px 34px;cursor:pointer;box-shadow:0 8px 20px -10px rgba(140,28,72,.8);transition:transform .1s,opacity .15s}
button.send:hover{filter:brightness(1.05)}
button.send:active{transform:scale(.98)}
button.send:disabled{opacity:.55;cursor:not-allowed;box-shadow:none}
.err{color:#b32d1f;font-weight:600;margin:12px 0 0;font-size:14.5px}
.state{max-width:560px;margin:12vh auto;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:36px 28px;text-align:center;box-shadow:0 10px 28px -18px rgba(60,20,40,.28)}
.state h1{color:var(--accent);font-size:28px;margin-top:0}
.state p{color:var(--muted)}
.badge{display:inline-block;margin-bottom:10px;padding:4px 12px;border-radius:99px;background:var(--soft);color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
@media(max-width:520px){.sec{padding:20px 16px}.hero{padding:30px 16px 48px}}
@media print{.bar,.submit,.clear,.matrix .x{display:none}body{background:#fff}.sec{box-shadow:none;break-inside:avoid-page}}
`;

const SCRIPT = String.raw`
(function () {
  var CFG = JSON.parse(document.getElementById('cfg').textContent);
  var SECTIONS = JSON.parse(document.getElementById('schema').textContent);
  var KEY = 'anamnesis.' + CFG.token;
  var answers = {};
  try { var saved = localStorage.getItem(KEY); if (saved) answers = JSON.parse(saved) || {}; } catch (e) {}
  if (CFG.clientName && !answers.nombre) answers.nombre = CFG.clientName;

  var app = document.getElementById('app');
  var checks = [];
  var pct = null, fill = null;

  function h(tag, props) {
    var node = document.createElement(tag);
    props = props || {};
    for (var k in props) {
      if (k === 'class') node.className = props[k];
      else if (k === 'text') node.textContent = props[k];
      else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), props[k]);
      else node.setAttribute(k, props[k]);
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function progress() {
    var done = 0;
    for (var i = 0; i < checks.length; i++) if (checks[i]()) done++;
    var p = checks.length ? Math.round((done / checks.length) * 100) : 0;
    if (fill) fill.style.width = p + '%';
    if (pct) pct.textContent = p + '%';
  }
  function set(id, value) {
    answers[id] = value;
    try { localStorage.setItem(KEY, JSON.stringify(answers)); } catch (e) {}
    progress();
  }
  function has(id) { return !!(answers[id] && String(answers[id]).trim()); }

  function renderText(it) {
    var id = 'f_' + it.id;
    checks.push(function () { return has(it.id); });
    var input = h('input', { type: it.input || 'text', id: id, autocomplete: 'off' });
    if (it.input === 'number') input.setAttribute('inputmode', 'numeric');
    input.value = answers[it.id] || '';
    input.addEventListener('input', function () { set(it.id, input.value); });
    return h('div', { class: 'field' }, h('label', { class: 'q', for: id, text: it.label }), input);
  }

  function renderLong(it) {
    var id = 'f_' + it.id;
    checks.push(function () { return has(it.id); });
    var area = h('textarea', { id: id, rows: String(it.rows || 3) });
    area.value = answers[it.id] || '';
    area.addEventListener('input', function () { set(it.id, area.value); });
    return h('div', { class: 'field' }, h('label', { class: 'q', for: id, text: it.label }), area);
  }

  function renderChoice(it) {
    checks.push(function () { return has(it.id); });
    var radios = [];
    var group = h('div', { class: 'opts', role: 'radiogroup', 'aria-label': it.label });
    var box = null;
    function refresh() {
      if (!box) return;
      var show = !it.detail.when || it.detail.when.indexOf(answers[it.id]) >= 0;
      box.hidden = !show;
    }
    it.options.forEach(function (opt, i) {
      var rid = 'f_' + it.id + '_' + i;
      var radio = h('input', { type: 'radio', name: 'f_' + it.id, id: rid });
      radio.checked = answers[it.id] === opt;
      radio.addEventListener('change', function () { set(it.id, opt); refresh(); });
      radios.push(radio);
      group.appendChild(h('span', { class: 'opt' }, radio, h('label', { for: rid, text: opt })));
    });
    group.appendChild(h('button', {
      type: 'button', class: 'clear', text: 'Borrar',
      onclick: function () { radios.forEach(function (r) { r.checked = false; }); set(it.id, ''); refresh(); }
    }));
    var wrap = h('div', { class: 'field' }, h('span', { class: 'q', text: it.label }), group);
    if (it.detail) {
      var did = 'f_' + it.detail.id;
      var input = h('input', { type: 'text', id: did, autocomplete: 'off' });
      input.value = answers[it.detail.id] || '';
      input.addEventListener('input', function () { set(it.detail.id, input.value); });
      box = h('div', { class: 'detail' }, h('label', { for: did, text: it.detail.label }), input);
      wrap.appendChild(box);
      refresh();
    }
    return wrap;
  }

  function renderMatrix(it) {
    function key(i) { return it.id + '_' + i; }
    checks.push(function () { for (var i = 0; i < it.rows.length; i++) if (has(key(i))) return true; return false; });
    var head = h('tr', null, h('th', { text: 'Sentimiento' }));
    it.cols.forEach(function (c) { head.appendChild(h('th', { text: c })); });
    head.appendChild(h('th', { text: '' }));
    var table = h('table', { class: 'matrix' }, h('thead', null, head));
    var body = h('tbody');
    it.rows.forEach(function (row, i) {
      var radios = [];
      var tr = h('tr', null, h('td', { text: row }));
      it.cols.forEach(function (col) {
        var r = h('input', { type: 'radio', name: 'f_' + key(i), 'aria-label': row + ': ' + col });
        r.checked = answers[key(i)] === col;
        r.addEventListener('change', function () { set(key(i), col); });
        radios.push(r);
        tr.appendChild(h('td', null, r));
      });
      tr.appendChild(h('td', null, h('button', {
        type: 'button', class: 'x', title: 'Quitar', 'aria-label': 'Quitar ' + row, text: '×',
        onclick: function () { radios.forEach(function (r) { r.checked = false; }); set(key(i), ''); }
      })));
      body.appendChild(tr);
    });
    table.appendChild(body);
    return h('div', { class: 'field' }, h('span', { class: 'q', text: it.label }), h('div', { class: 'mwrap' }, table));
  }

  function visibleAnswers() {
    var out = {};
    function put(k, v) { if (v && String(v).trim()) out[k] = String(v).trim().slice(0, 4000); }
    SECTIONS.forEach(function (s) {
      s.items.forEach(function (it) {
        if (it.kind === 'heading') return;
        if (it.kind === 'matrix') { it.rows.forEach(function (_, i) { put(it.id + '_' + i, answers[it.id + '_' + i]); }); return; }
        put(it.id, answers[it.id]);
        if (it.kind === 'choice' && it.detail && (!it.detail.when || it.detail.when.indexOf(answers[it.id]) >= 0)) put(it.detail.id, answers[it.detail.id]);
      });
    });
    return out;
  }

  var DOC = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(CFG.projectId) + '/databases/(default)/documents/anamnesisForms/' + encodeURIComponent(CFG.token);

  function stateScreen(badge, title, message) {
    app.innerHTML = '';
    app.appendChild(h('div', { class: 'state' }, h('span', { class: 'badge', text: badge }), h('h1', { text: title }), h('p', { text: message })));
  }

  function send(button, errBox) {
    var vis = visibleAnswers();
    errBox.textContent = '';
    if (!vis.nombre) {
      errBox.textContent = 'Escribe tu nombre en los datos personales antes de enviar.';
      var n = document.getElementById('f_nombre');
      if (n) { n.scrollIntoView({ behavior: 'smooth', block: 'center' }); n.focus(); }
      return;
    }
    var fields = {};
    for (var k in vis) fields[k] = { stringValue: vis[k] };
    var body = { fields: {
      answers: { mapValue: { fields: fields } },
      status: { stringValue: 'completed' },
      submittedAt: { integerValue: String(Date.now()) }
    } };
    var url = DOC + '?currentDocument.exists=true&updateMask.fieldPaths=answers&updateMask.fieldPaths=status&updateMask.fieldPaths=submittedAt&key=' + encodeURIComponent(CFG.apiKey);
    button.disabled = true;
    button.textContent = 'Enviando…';
    fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (res) {
        if (res.ok) {
          try { localStorage.removeItem(KEY); } catch (e) {}
          window.scrollTo(0, 0);
          stateScreen('Enviado', 'Gracias, recibimos tus respuestas', 'Tu terapeuta ya puede verlas. Puedes cerrar esta ventana. Si estás en peligro inmediato, llama al número de emergencias de tu país (123 en Colombia).');
        } else {
          button.disabled = false;
          button.textContent = 'Enviar formulario';
          errBox.textContent = 'No se pudo enviar. Es posible que este formulario ya se haya enviado o que el enlace ya no sea válido; avisa a tu terapeuta.';
        }
      })
      .catch(function () {
        button.disabled = false;
        button.textContent = 'Enviar formulario';
        errBox.textContent = 'No hay conexión con el servidor. Tus respuestas siguen guardadas en este dispositivo: revisa tu internet y vuelve a pulsar «Enviar».';
      });
  }

  function build() {
    fill = h('div', { class: 'fill' });
    pct = h('span', { id: 'pct', text: '0%' });
    var hero = h('header', { class: 'hero' }, h('div', { class: 'wrap' },
      h('div', { class: 'eyebrow', text: 'Formulario confidencial' }),
      h('h1', { text: 'Anamnesis' }),
      h('p', { text: 'Este formulario nos ayuda a conocerte antes de la primera sesión. Responde con calma y sinceridad; si alguna pregunta no quieres contestarla, déjala en blanco.' }),
      CFG.clientName ? h('span', { class: 'for', text: 'Para: ' + CFG.clientName }) : null
    ));
    var bar = h('div', { class: 'bar' }, h('div', { class: 'wrap' }, h('div', { class: 'track' }, fill), pct));
    var main = h('main', { class: 'wrap' });
    main.appendChild(h('div', { class: 'note', text: 'Tu información es confidencial: solo la verá tu terapeuta. Lo que escribes se guarda automáticamente en este dispositivo mientras avanzas, así puedes continuar después.' }));
    SECTIONS.forEach(function (s) {
      var sec = h('section', { class: 'sec' }, h('h2', { text: s.title }));
      if (s.intro) sec.appendChild(h('p', { class: 'intro', text: s.intro }));
      sec.appendChild(h('div', { class: 'rule' }));
      s.items.forEach(function (it) {
        if (it.kind === 'heading') sec.appendChild(h('h3', { text: it.label }));
        else if (it.kind === 'text') sec.appendChild(renderText(it));
        else if (it.kind === 'long') sec.appendChild(renderLong(it));
        else if (it.kind === 'choice') sec.appendChild(renderChoice(it));
        else if (it.kind === 'matrix') sec.appendChild(renderMatrix(it));
      });
      main.appendChild(sec);
    });
    var err = h('p', { class: 'err', role: 'alert' });
    var btn = h('button', { type: 'button', class: 'send', text: CFG.preview ? 'Enviar formulario (desactivado en la vista previa)' : 'Enviar formulario' });
    if (CFG.preview) btn.disabled = true;
    else btn.addEventListener('click', function () { send(btn, err); });
    main.appendChild(h('div', { class: 'submit' },
      h('p', { text: CFG.preview ? 'Así lo verá tu paciente. Aquí no se envía nada.' : 'Revisa tus respuestas y, cuando estés lista o listo, envíalas.' }),
      btn, err));
    app.innerHTML = '';
    app.appendChild(hero);
    app.appendChild(bar);
    app.appendChild(main);
    progress();
  }

  build();

  if (!CFG.preview && typeof fetch === 'function') {
    fetch(DOC + '?key=' + encodeURIComponent(CFG.apiKey))
      .then(function (res) {
        if (res.status === 403 || res.status === 404) {
          stateScreen('Formulario cerrado', 'Este enlace ya no está disponible', 'Es posible que el formulario ya se haya enviado o que tu terapeuta haya creado uno nuevo. Si necesitas llenarlo de nuevo, pídele otro enlace.');
        }
      })
      .catch(function () { /* sin conexión: el formulario se puede llenar igual */ });
  }
})();
`;

export function buildAnamnesisHtml(cfg: AnamnesisHtmlConfig): string {
  const config = { token: cfg.token, projectId: cfg.projectId, apiKey: cfg.apiKey, clientName: cfg.clientName, preview: Boolean(cfg.preview) };
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Anamnesis</title>
<style>${CSS}</style>
</head>
<body>
<div id="app"></div>
<noscript><p style="padding:24px">Este formulario necesita JavaScript activado.</p></noscript>
<script type="application/json" id="cfg">${safeJson(config)}</script>
<script type="application/json" id="schema">${safeJson(ANAMNESIS_SECTIONS)}</script>
<script>${SCRIPT}</script>
</body>
</html>`;
}
