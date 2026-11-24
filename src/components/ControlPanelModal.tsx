import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import {
  backgroundCss, BACKGROUND_COLORS, BG_SHAPES, contrastRatio, FONT_SIZES, FONTS, PRESETS, previewColors, RADII, TABLE_COLORS, TEXT_COLORS, themeById,
  type BgShape, type FontId, type FontSize, type Radius, type TokenKey, type Tokens,
} from '../lib/theme';
import { effectiveOf, useTheme } from '../store/theme';
import { Modal } from './ui';

type TabId = 'temas' | 'tipografia' | 'tablas' | 'bordes' | 'fondo';

/** Barra de pestañas del panel. `keys` = ajustes de cada una (para marcarla como "personalizada"). */
const TABS: Array<{ id: TabId; label: string; keys: TokenKey[] }> = [
  { id: 'temas', label: 'Temas', keys: [] },
  { id: 'tipografia', label: 'Tipografía', keys: ['fontFamily', 'fontSize', 'textColor'] },
  { id: 'tablas', label: 'Tablas', keys: ['tableColor'] },
  { id: 'bordes', label: 'Bordes', keys: ['radius'] },
  { id: 'fondo', label: 'Fondo', keys: ['backgroundColor', 'backgroundShape'] },
];

const optionClass = (selected: boolean) =>
  `choice ${selected ? 'choice-on border-brand-500' : 'choice-off border-brand-100'}`;

/** Puntito "personalizado": este ajuste difiere del tema predeterminado. */
function CustomDot({ show }: { show: boolean }) {
  if (!show) return null;
  return <span role="img" aria-label="personalizado" title="Personalizado" className="inline-block h-2 w-2 rounded-full bg-brand-500 ring-2 ring-brand-100" />;
}

function Section({ title, hint, custom, children }: { title: string; hint?: string; custom?: boolean; children: ReactNode }) {
  return (
    <section className="space-y-3 py-5 first:pt-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-extrabold tracking-tight text-brand-800">
          {title}
          <CustomDot show={!!custom} />
        </h3>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-brand-600">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

interface Option<T extends string> {
  value: T;
  label: string;
  content: ReactNode;
}

/** Grupo de opciones excluyentes: radiogroup con tabulación "roving" y flechas / Inicio / Fin. */
function OptionGroup<T extends string>({
  label, value, options, onChange, className, optionClassName,
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  className: string;
  optionClassName?: (selected: boolean) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, (i: number, n: number) => number> = {
      ArrowRight: (i, n) => (i + 1) % n,
      ArrowDown: (i, n) => (i + 1) % n,
      ArrowLeft: (i, n) => (i - 1 + n) % n,
      ArrowUp: (i, n) => (i - 1 + n) % n,
      Home: () => 0,
      End: (_, n) => n - 1,
    };
    const next = keys[e.key];
    if (!next) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const target = options[next(i < 0 ? 0 : i, options.length)];
    onChange(target.value);
    ref.current?.querySelectorAll<HTMLElement>('[role="radio"]')[options.indexOf(target)]?.focus();
  };
  return (
    <div ref={ref} role="radiogroup" aria-label={label} className={className} onKeyDown={move}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.label}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={(optionClassName ?? optionClass)(selected)}
          >
            {o.content}
          </button>
        );
      })}
    </div>
  );
}

/** Muestra de un color: rectángulo achatado (igual que la de los temas). En modo "letra" muestra una "Aa" de ese color sobre blanco. */
function ColorSwatch({ color, kind }: { color: string; kind: 'fill' | 'text' }) {
  return (
    <span
      data-testid="color-swatch"
      className="grid h-7 w-11 shrink-0 place-items-center border border-black/10 shadow-inset text-sm font-extrabold leading-none"
      style={{ borderRadius: 12, backgroundColor: kind === 'fill' ? color : '#ffffff', color: kind === 'text' ? color : undefined }}
    >
      {kind === 'text' ? 'Aa' : null}
    </span>
  );
}

/** Elegir un color de una lista (sin cuadro de hexadecimal): mismas tarjetas que los temas, con check en el elegido. */
function ColorChoices({
  label, value, options, kind, onChange,
}: {
  label: string;
  value: string;
  options: Array<{ name: string; color: string }>;
  kind: 'fill' | 'text';
  onChange: (hex: string) => void;
}) {
  return (
    <OptionGroup<string>
      label={label}
      value={value}
      onChange={onChange}
      className="grid grid-cols-2 gap-2"
      optionClassName={(sel) => `flex items-center gap-2.5 ${optionClass(sel)}`}
      options={options.map((o) => ({
        value: o.color,
        label: o.name,
        content: (
          <>
            <ColorSwatch color={o.color} kind={kind} />
            <span className="min-w-0 flex-1 truncate text-left">{o.name}</span>
            {o.color === value && <Check data-testid="color-check" size={18} strokeWidth={3} className="shrink-0 rounded-full bg-brand-600 p-0.5 text-white" />}
          </>
        ),
      }))}
    />
  );
}

/** Barra de pestañas (tablist con flechas / Inicio / Fin). */
function TabBar({ tab, onChange, customTabs }: { tab: TabId; onChange: (t: TabId) => void; customTabs: Set<TabId> }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = { ArrowRight: (i + 1) % TABS.length, ArrowLeft: (i - 1 + TABS.length) % TABS.length, Home: 0, End: TABS.length - 1 }[e.key as string];
    if (next === undefined) return;
    e.preventDefault();
    onChange(TABS[next].id);
    ref.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  };
  return (
    <div ref={ref} role="tablist" aria-label="Secciones del panel de control" className="scrollbar-none mb-3 flex gap-1 overflow-x-auto rounded-2xl bg-brand-50 p-1 ring-1 ring-inset ring-brand-100" onKeyDown={move}>
      {TABS.map((t) => {
        const selected = t.id === tab;
        return (
          <button
            key={t.id}
            id={`cp-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`cp-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={`flex flex-1 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${
              selected ? 'bg-white text-brand-800 shadow-softer ring-1 ring-brand-100' : 'text-brand-600 hover:bg-white/60 hover:text-brand-800'
            }`}
          >
            {t.label}
            <CustomDot show={customTabs.has(t.id)} />
          </button>
        );
      })}
    </div>
  );
}

/** Muestra del tema: rectángulo ancho de esquinas muy suaves con 3 franjas apiladas (letra, tablas, fondo). */
function PresetSwatch({ theme }: { theme: Tokens }) {
  const { texto, tablas, fondo } = previewColors(theme);
  return (
    <span data-testid="preset-swatch" className="flex h-7 w-11 shrink-0 flex-col overflow-hidden border border-black/10 shadow-inset" style={{ borderRadius: 12 }}>
      {[texto, tablas, fondo].map((c, i) => (
        <span key={i} data-testid="swatch-stripe" className="flex-1" style={{ backgroundColor: c }} />
      ))}
    </span>
  );
}

/** Vista previa de "Tablas": el mismo color en header, sidebar y encabezado de tabla. */
function TablesPreview({ color }: { color: string }) {
  const line = 'border-black/5';
  return (
    <div data-testid="tables-preview" aria-hidden="true" className="overflow-hidden rounded-xl2 border border-brand-100 bg-white shadow-soft text-[10px] font-semibold uppercase tracking-wide text-brand-600">
      <div data-testid="preview-header" className={`flex h-8 items-center border-b px-3 ${line}`} style={{ backgroundColor: color }}>Header</div>
      <div className="flex h-28 bg-white">
        <div data-testid="preview-sidebar" className={`flex w-20 shrink-0 items-start border-r p-3 ${line}`} style={{ backgroundColor: color }}>Sidebar</div>
        <div className="flex-1">
          <div data-testid="preview-thead" className={`flex h-7 items-center border-b px-3 ${line}`} style={{ backgroundColor: color }}>Encabezado</div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex h-7 items-center gap-2 border-b border-black/5 px-3">
              <span className="h-1.5 w-16 rounded-full bg-brand-100" />
              <span className="h-1.5 w-8 rounded-full bg-brand-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** "Panel de control" (solo PC). Todo se aplica al instante y se guarda en este equipo. */
export default function ControlPanelModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { presetId, overrides, setPreset, setOverride, resetOverrides } = useTheme();
  const [tab, setTab] = useState<TabId>('temas');
  const eff = effectiveOf({ presetId, overrides });
  const base = themeById(presetId);
  const custom = (...keys: TokenKey[]) => keys.some((k) => k in overrides);
  const set = <K extends TokenKey>(key: K) => (value: Tokens[K]) => setOverride(key, value);
  const hasCustom = Object.keys(overrides).length > 0;
  const customTabs = new Set(TABS.filter((t) => custom(...t.keys)).map((t) => t.id));

  const textOptions = [{ name: 'Del tema', color: base.textColor }, ...TEXT_COLORS.filter((q) => q.color !== base.textColor)];
  const lowContrast = contrastRatio(eff.textColor, eff.backgroundColor) < 4.5;

  return (
    <Modal
      open={open}
      title="Panel de control"
      onClose={onClose}
      nav={<TabBar tab={tab} onChange={setTab} customTabs={customTabs} />}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" className="btn-soft" disabled={!hasCustom} onClick={resetOverrides}>
            Restablecer personalizaciones
          </button>
          <button type="button" className="btn-primary px-6" onClick={onClose}>
            Listo
          </button>
        </div>
      }
    >
      <div role="tabpanel" id={`cp-panel-${tab}`} aria-labelledby={`cp-tab-${tab}`} className="divide-y divide-brand-100/80">
        {tab === 'temas' && (
          <Section title="Temas predeterminados" hint="Elige un punto de partida; después puedes ajustar lo que quieras. Se guarda en este equipo.">
            <OptionGroup<string>
              label="Temas predeterminados"
              value={presetId}
              onChange={setPreset}
              className="grid grid-cols-2 gap-2"
              optionClassName={(sel) => `flex items-center gap-2.5 ${optionClass(sel)}`}
              options={PRESETS.map((t) => ({
                value: t.id,
                label: t.name,
                content: (
                  <>
                    <PresetSwatch theme={t} />
                    <span className="min-w-0 flex-1 truncate text-left">{t.name}</span>
                    {t.id === presetId && <Check data-testid="preset-check" size={18} strokeWidth={3} className="shrink-0 rounded-full bg-brand-600 p-0.5 text-white" />}
                  </>
                ),
              }))}
            />
          </Section>
        )}

        {tab === 'tipografia' && (
          <>
            <Section title="Tipo de letra" custom={custom('fontFamily')}>
              <OptionGroup<FontId>
                label="Tipo de letra"
                value={eff.fontFamily}
                onChange={set('fontFamily')}
                className="grid grid-cols-2 gap-2"
                options={(Object.keys(FONTS) as FontId[]).map((k) => ({
                  value: k,
                  label: FONTS[k].label,
                  content: (
                    <span data-testid={`font-${k}`} className="block text-left text-base" style={{ fontFamily: FONTS[k].stack }}>
                      {FONTS[k].label}
                    </span>
                  ),
                }))}
              />
            </Section>

            <Section title="Tamaño de letra" custom={custom('fontSize')}>
              <OptionGroup<FontSize>
                label="Tamaño de letra"
                value={eff.fontSize}
                onChange={set('fontSize')}
                className="grid grid-cols-3 gap-2"
                options={(Object.keys(FONT_SIZES) as FontSize[]).map((k) => ({
                  value: k,
                  label: FONT_SIZES[k].label,
                  content: (
                    <span className="flex items-baseline justify-center gap-2">
                      <span style={{ fontSize: { small: 12, normal: 15, large: 19 }[k] }} aria-hidden>Aa</span>
                      <span>{FONT_SIZES[k].label}</span>
                    </span>
                  ),
                }))}
              />
            </Section>

            <Section title="Color de letra" custom={custom('textColor')}>
              <ColorChoices label="Color de letra" kind="text" value={eff.textColor} options={textOptions} onChange={set('textColor')} />
              {lowContrast && (
                <p role="status" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-clay-600 ring-1 ring-inset ring-clay-400/30">
                  Poco contraste con el fondo: el texto puede costar leerse.
                </p>
              )}
            </Section>
          </>
        )}

        {tab === 'tablas' && (
          <Section title="Color de tablas" hint="Un solo color para el header, el sidebar y el encabezado de las tablas: cambian los tres a la vez." custom={custom('tableColor')}>
            <ColorChoices label="Color de tablas" kind="fill" value={eff.tableColor} options={TABLE_COLORS} onChange={set('tableColor')} />
            <TablesPreview color={eff.tableColor} />
          </Section>
        )}

        {tab === 'bordes' && (
          <Section title="Forma de bordes" custom={custom('radius')}>
            <OptionGroup<Radius>
              label="Forma de bordes"
              value={eff.radius}
              onChange={set('radius')}
              className="grid grid-cols-4 gap-2"
              optionClassName={(sel) => `flex flex-col items-center gap-1.5 px-1 text-xs ${optionClass(sel)}`}
              options={(Object.keys(RADII) as Radius[]).map((k) => ({
                value: k,
                label: RADII[k].label,
                content: (
                  <>
                    <span
                      data-testid={`corner-${k}`}
                      className="block h-10 w-10 border-l-[3px] border-t-[3px] border-brand-500 bg-gradient-to-br from-brand-100 to-brand-50"
                      style={{ borderTopLeftRadius: RADII[k].rem }}
                    />
                    <span>{RADII[k].label}</span>
                  </>
                ),
              }))}
            />
          </Section>
        )}

        {tab === 'fondo' && (
          <>
          <Section title="Color de fondo" hint="El color que queda detrás de las tarjetas y las tablas." custom={custom('backgroundColor')}>
            <ColorChoices label="Color de fondo" kind="fill" value={eff.backgroundColor} options={BACKGROUND_COLORS} onChange={set('backgroundColor')} />
          </Section>
          <Section title="Forma de fondo" custom={custom('backgroundShape')}>
            <OptionGroup<BgShape>
              label="Forma de fondo"
              value={eff.backgroundShape}
              onChange={set('backgroundShape')}
              className="grid grid-cols-5 gap-2"
              optionClassName={(sel) => `flex flex-col items-center gap-1.5 px-1 text-xs ${optionClass(sel)}`}
              options={(Object.keys(BG_SHAPES) as BgShape[]).map((k) => {
                const bg = backgroundCss({ ...eff, backgroundShape: k });
                return {
                  value: k,
                  label: BG_SHAPES[k],
                  content: (
                    <>
                      <span
                        data-testid={`shape-${k}`}
                        className="block h-12 w-full rounded-xl border border-brand-100 shadow-inset"
                        style={{ backgroundColor: eff.backgroundColor, backgroundImage: bg.image, backgroundSize: bg.size }}
                      />
                      <span>{BG_SHAPES[k]}</span>
                    </>
                  ),
                };
              })}
            />
          </Section>
          </>
        )}
      </div>
    </Modal>
  );
}
