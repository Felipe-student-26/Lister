// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ControlPanelModal from './ControlPanelModal';
import { useTheme } from '../store/theme';
import { applyTheme, BACKGROUND_COLORS, contrastRatio, hexToRgb, PRESETS, previewColors, shades, TABLE_COLORS, TEXT_COLORS, themeById, THEME_KEY } from '../lib/theme';

const saved = () => JSON.parse(localStorage.getItem(THEME_KEY) ?? 'null') as { presetId: string; overrides: Record<string, unknown> } | null;
const cssVar = (name: string) => document.documentElement.style.getPropertyValue(name);
const group = (name: string) => screen.getByRole('radiogroup', { name });
const radio = (groupName: string, name: string) => within(group(groupName)).getByRole('radio', { name });
const rgb = (hex: string) => `rgb(${hexToRgb(hex).join(', ')})`;
/** Pestañas: "Tipografía" puede anunciarse como "Tipografía personalizado" (el puntito es parte de su nombre). */
const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(`^${name}`) });
const goTo = async (name: string) => userEvent.setup().click(tab(name));
/** El título de una sección personalizada anuncia "personalizado" (el puntito es parte de su nombre accesible). */
const heading = (title: string) => screen.getByRole('heading', { name: new RegExp(`^${title}`) });
const open = () => render(<ControlPanelModal open onClose={() => undefined} />);
/** Elegir un color de una lista: clic en su tarjeta. */
const pick = (groupName: string, colorName: string) => fireEvent.click(radio(groupName, colorName));

beforeEach(() => {
  localStorage.clear();
  useTheme.setState({ presetId: 'rosa', themeId: 'rosa', overrides: {} });
  applyTheme('rosa');
});

describe('Panel de control: estructura', () => {
  it('es un diálogo con una barra de pestañas arriba: Temas, Tipografía, Tablas, Bordes y Fondo', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Panel de control' })).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Temas', 'Tipografía', 'Tablas', 'Bordes', 'Fondo']);
    expect(tab('Temas').getAttribute('aria-selected')).toBe('true'); // abre en Temas
    expect(screen.getByRole('tablist').getAttribute('aria-label')).toBeTruthy();
  });

  it('la barra de pestañas, el título y el pie quedan fijos: solo el cuerpo hace scroll', () => {
    open();
    const body = screen.getByTestId('modal-body');
    expect(body.className).toContain('overflow-y-auto');
    expect(body.contains(screen.getByRole('heading', { level: 2 }))).toBe(false);
    expect(body.contains(screen.getByRole('tablist'))).toBe(false);
    expect(body.contains(screen.getByRole('button', { name: 'Listo' }))).toBe(false);
    expect(body.contains(screen.getByRole('button', { name: 'Restablecer personalizaciones' }))).toBe(false);
    expect(body.contains(screen.getByRole('tabpanel'))).toBe(true);
    expect(screen.getByRole('dialog').className).toContain('overflow-hidden');
  });

  it('cada pestaña muestra solo sus secciones, en el orden pedido', async () => {
    open();
    const headings = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings()).toEqual(['Temas predeterminados']);
    await goTo('Tipografía');
    expect(headings()).toEqual(['Tipo de letra', 'Tamaño de letra', 'Color de letra']);
    await goTo('Tablas');
    expect(headings()).toEqual(['Color de tablas']);
    await goTo('Bordes');
    expect(headings()).toEqual(['Forma de bordes']);
    await goTo('Fondo');
    expect(headings()).toEqual(['Color de fondo', 'Forma de fondo']);
  });

  it('el panel visible está enlazado con su pestaña (tabpanel ↔ tab)', async () => {
    open();
    await goTo('Tablas');
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(tab('Tablas').id);
    expect(tab('Tablas').getAttribute('aria-controls')).toBe(panel.id);
    expect(tab('Tablas').getAttribute('aria-selected')).toBe('true');
    expect(tab('Temas').getAttribute('aria-selected')).toBe('false');
  });

  it('no queda ningún selector de color hexadecimal en todo el panel', async () => {
    open();
    for (const name of ['Temas', 'Tipografía', 'Tablas', 'Bordes', 'Fondo']) {
      await goTo(name);
      expect(document.querySelector('input[type="color"]'), name).toBeNull();
      expect(document.querySelector('input'), name).toBeNull();
    }
  });

  it('\"Listo\" cierra el panel', async () => {
    const onClose = vi.fn();
    render(<ControlPanelModal open onClose={onClose} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Listo' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Panel de control: temas predeterminados', () => {
  it('lista los 6 temas, con Rosa clásico marcado (borde y check)', () => {
    open();
    expect(within(group('Temas predeterminados')).getAllByRole('radio')).toHaveLength(6);
    const rosa = radio('Temas predeterminados', 'Rosa clásico');
    expect(rosa.getAttribute('aria-checked')).toBe('true');
    expect(rosa.className).toContain('border-brand-500');
    expect(within(rosa).getByTestId('preset-check')).toBeTruthy();
    const lila = radio('Temas predeterminados', 'Lila suave');
    expect(lila.getAttribute('aria-checked')).toBe('false');
    expect(within(lila).queryByTestId('preset-check')).toBeNull();
  });

  it('la muestra va a la izquierda del nombre, achatada, con 3 franjas apiladas: letra, tablas y fondo', () => {
    open();
    for (const t of PRESETS) {
      const btn = radio('Temas predeterminados', t.name);
      const swatch = within(btn).getByTestId('preset-swatch');
      expect(btn.firstElementChild).toBe(swatch); // antes del nombre
      expect(swatch.className).toContain('flex-col'); // una sobre otra
      expect(swatch.className).toContain('w-11'); // 44 px de ancho
      expect(swatch.className).toContain('h-7'); // 28 px de alto
      const stripes = within(swatch).getAllByTestId('swatch-stripe');
      expect(stripes).toHaveLength(3);
      const { texto, tablas, fondo } = previewColors(t);
      expect(stripes.map((s) => (s as HTMLElement).style.backgroundColor)).toEqual([rgb(texto), rgb(tablas), rgb(fondo)]);
    }
  });

  it('al elegir un tema se aplica al instante y se guarda en este equipo', async () => {
    open();
    await userEvent.setup().click(radio('Temas predeterminados', 'Lila suave'));
    expect(radio('Temas predeterminados', 'Lila suave').getAttribute('aria-checked')).toBe('true');
    expect(cssVar('--brand-500')).toBe(shades(themeById('lila'))[500]);
    expect(saved()).toEqual({ v: 1, presetId: 'lila', overrides: {} });
  });

  it('elegir otro tema borra las personalizaciones', async () => {
    open();
    await goTo('Tipografía');
    pick('Color de letra', 'Azul noche');
    expect(useTheme.getState().overrides).toEqual({ textColor: '#1e3a5f' });
    await goTo('Temas');
    await userEvent.setup().click(radio('Temas predeterminados', 'Menta'));
    expect(useTheme.getState().overrides).toEqual({});
    expect(cssVar('--ink-900')).toBe('');
  });
});

describe('Panel de control: personalizar', () => {
  it('cambiar solo el color de letra conserva todo lo demás del tema', async () => {
    open();
    await userEvent.setup().click(radio('Temas predeterminados', 'Cielo'));
    await goTo('Tipografía');
    pick('Color de letra', 'Azul noche');
    const cielo = themeById('cielo');
    expect(useTheme.getState().presetId).toBe('cielo');
    expect(useTheme.getState().overrides).toEqual({ textColor: '#1e3a5f' });
    expect(cssVar('--ink-900')).toBe('30 58 95');
    expect(cssVar('--font-sans')).toContain('Poppins'); // tipografía del tema intacta
    expect(cssVar('--app-bg')).toBe(hexToRgb(cielo.backgroundColor).join(' '));
    expect(cssVar('--header')).toBe(hexToRgb(cielo.tableColor).join(' '));
    expect(cssVar('--brand-500')).toBe(shades(cielo)[500]);
    expect(saved()).toEqual({ v: 1, presetId: 'cielo', overrides: { textColor: '#1e3a5f' } });
  });

  it('el puntito \"personalizado\" aparece solo en la pestaña y la sección que difieren del tema', async () => {
    open();
    expect(screen.queryAllByRole('img', { name: 'personalizado' })).toHaveLength(0);
    await goTo('Tipografía');
    pick('Color de letra', 'Azul noche');
    const dotsIn = (title: string) => within(heading(title)).queryAllByRole('img', { name: 'personalizado' }).length;
    expect(dotsIn('Color de letra')).toBe(1);
    expect(dotsIn('Tamaño de letra')).toBe(0);
    expect(dotsIn('Tipo de letra')).toBe(0);
    expect(screen.getByRole('heading', { name: 'Color de letra personalizado' })).toBeTruthy(); // lo anuncia el lector de pantalla
    // la pestaña también avisa, aunque estés en otra
    await goTo('Fondo');
    expect(within(tab('Tipografía')).getAllByRole('img', { name: 'personalizado' })).toHaveLength(1);
    for (const other of ['Temas', 'Tablas', 'Bordes', 'Fondo']) expect(within(tab(other)).queryAllByRole('img', { name: 'personalizado' }), other).toHaveLength(0);
  });

  describe('color de letra', () => {
    it('se elige de una lista de tarjetas (sin hexadecimal): \"Del tema\" + la paleta, con check en el elegido', async () => {
      open();
      await goTo('Tipografía');
      const radios = within(group('Color de letra')).getAllByRole('radio');
      expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['Del tema', ...TEXT_COLORS.filter((c) => c.color !== themeById('rosa').textColor).map((c) => c.name)]); // el del tema no se repite (en Rosa es el Vino)
      expect(radio('Color de letra', 'Del tema').getAttribute('aria-checked')).toBe('true');
      expect(within(radio('Color de letra', 'Del tema')).getByTestId('color-check')).toBeTruthy();
      expect(within(radio('Color de letra', 'Carbón')).queryByTestId('color-check')).toBeNull();
      // cada tarjeta lleva su muestra con una \"Aa\" del color
      const sw = within(radio('Color de letra', 'Café')).getByTestId('color-swatch');
      expect(sw.style.color).toBe(rgb('#4a2c17'));
      expect(sw.textContent).toBe('Aa');
    });

    it('elegir uno cambia la letra y \"Del tema\" lo devuelve', async () => {
      open();
      await goTo('Tipografía');
      pick('Color de letra', 'Azul noche');
      expect(useTheme.getState().overrides.textColor).toBe('#1e3a5f');
      expect(radio('Color de letra', 'Azul noche').getAttribute('aria-checked')).toBe('true');
      pick('Color de letra', 'Del tema');
      expect(useTheme.getState().overrides).toEqual({});
      expect(cssVar('--ink-900')).toBe('');
    });

    it('avisa si el color de letra tiene poco contraste con el fondo', async () => {
      open();
      await goTo('Tipografía');
      expect(screen.queryByRole('status')).toBeNull();
      act(() => useTheme.getState().setOverride('textColor', '#f0f0f0'));
      expect(contrastRatio('#f0f0f0', themeById('rosa').backgroundColor)).toBeLessThan(4.5);
      expect(screen.getByRole('status').textContent).toContain('Poco contraste');
    });
  });

  it('tamaño de letra: Pequeño / Normal / Grande', async () => {
    const user = userEvent.setup();
    open();
    await goTo('Tipografía');
    expect(within(group('Tamaño de letra')).getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual(['Pequeño', 'Normal', 'Grande']);
    expect(radio('Tamaño de letra', 'Normal').getAttribute('aria-checked')).toBe('true');
    await user.click(radio('Tamaño de letra', 'Grande'));
    expect(cssVar('--font-size')).toBe('112.5%');
    await user.click(radio('Tamaño de letra', 'Pequeño'));
    expect(cssVar('--font-size')).toBe('87.5%');
  });

  it('tipo de letra: 6 fuentes, cada nombre escrito con su propia fuente', async () => {
    open();
    await goTo('Tipografía');
    const radios = within(group('Tipo de letra')).getAllByRole('radio');
    expect(radios).toHaveLength(6);
    for (const [id, name] of [['nunito', 'Nunito'], ['inter', 'Inter'], ['lora', 'Lora'], ['poppins', 'Poppins'], ['playfair', 'Playfair Display']]) {
      const label = within(group('Tipo de letra')).getByTestId(`font-${id}`);
      expect(label.textContent).toBe(name);
      expect(label.style.fontFamily).toContain(name);
    }
    await userEvent.setup().click(radio('Tipo de letra', 'Lora'));
    expect(cssVar('--font-sans')).toContain('Lora');
  });

  describe('tablas', () => {
    it('una sola lista de colores (con muestra y check), sin selectores sueltos de header, sidebar ni filas', async () => {
      open();
      await goTo('Tablas');
      expect(screen.getAllByRole('radiogroup').map((g) => g.getAttribute('aria-label'))).toEqual(['Color de tablas']);
      expect(within(group('Color de tablas')).getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual(TABLE_COLORS.map((c) => c.name));
      expect(radio('Color de tablas', 'Rosa').getAttribute('aria-checked')).toBe('true'); // Rosa clásico
      expect(within(radio('Color de tablas', 'Rosa')).getByTestId('color-check')).toBeTruthy();
      expect(within(radio('Color de tablas', 'Menta')).getByTestId('color-swatch').style.backgroundColor).toBe(rgb('#bfe6d3'));
      expect(screen.queryByRole('heading', { name: /header|sidebar/i })).toBeNull();
    });

    it('al elegir un color cambian a la vez el header, el sidebar y el encabezado de las tablas', async () => {
      open();
      await goTo('Tablas');
      pick('Color de tablas', 'Menta');
      expect(cssVar('--header')).toBe('191 230 211');
      expect(cssVar('--sidebar')).toBe('191 230 211');
      expect(cssVar('--thead')).toBe('191 230 211');
      expect(cssVar('--trow')).toBe('255 255 255');
      expect(useTheme.getState().overrides).toEqual({ tableColor: '#bfe6d3' });
      expect(saved()).toEqual({ v: 1, presetId: 'rosa', overrides: { tableColor: '#bfe6d3' } });
    });

    it('la vista previa muestra el mismo color en los tres y se actualiza', async () => {
      open();
      await goTo('Tablas');
      const colors = () => ['preview-header', 'preview-sidebar', 'preview-thead'].map((id) => screen.getByTestId(id).style.backgroundColor);
      expect(colors()).toEqual([rgb('#f8c9da'), rgb('#f8c9da'), rgb('#f8c9da')]);
      pick('Color de tablas', 'Lila');
      expect(colors()).toEqual([rgb('#d9c6ef'), rgb('#d9c6ef'), rgb('#d9c6ef')]);
    });

    it('volver al color del tema quita la personalización', async () => {
      open();
      await goTo('Tablas');
      pick('Color de tablas', 'Blanco');
      expect(cssVar('--header')).toBe('255 255 255');
      expect(within(heading('Color de tablas')).getAllByRole('img', { name: 'personalizado' })).toHaveLength(1);
      pick('Color de tablas', 'Rosa');
      expect(useTheme.getState().overrides).toEqual({});
    });

    it('cada tema trae su color de tablas elegido en la lista', async () => {
      open();
      for (const p of PRESETS) {
        act(() => useTheme.getState().setPreset(p.id));
        await goTo('Tablas');
        const checked = within(group('Color de tablas')).getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true');
        expect(checked, p.id).toHaveLength(1);
        expect(within(checked[0]).getByTestId('color-swatch').style.backgroundColor, p.id).toBe(rgb(p.tableColor));
      }
    });
  });

  it('forma de bordes: 4 opciones con vista previa de una esquina', async () => {
    open();
    await goTo('Bordes');
    const radios = within(group('Forma de bordes')).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['Cuadrado', 'Suave', 'Redondo', 'Muy redondo']);
    const corners = ['square', 'soft', 'round', 'pill'].map((k) => within(group('Forma de bordes')).getByTestId(`corner-${k}`).style.borderTopLeftRadius);
    expect(corners).toEqual(['0.125rem', '0.6rem', '1rem', '1.5rem']);
    expect(radio('Forma de bordes', 'Redondo').getAttribute('aria-checked')).toBe('true');
    await userEvent.setup().click(radio('Forma de bordes', 'Cuadrado'));
    expect(cssVar('--radius')).toBe('0.125rem');
  });

  describe('color de fondo', () => {
    it('una lista de colores con muestra y check, sin hexadecimal; Rosa clásico trae Gris suave', async () => {
      open();
      await goTo('Fondo');
      expect(within(group('Color de fondo')).getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual(BACKGROUND_COLORS.map((c) => c.name));
      expect(radio('Color de fondo', 'Gris suave').getAttribute('aria-checked')).toBe('true');
      expect(within(radio('Color de fondo', 'Gris suave')).getByTestId('color-check')).toBeTruthy();
    });

    it('al elegir uno cambia el fondo al instante, se guarda y conserva el resto del tema', async () => {
      open();
      await goTo('Fondo');
      pick('Color de fondo', 'Crema');
      expect(cssVar('--app-bg')).toBe('252 250 242');
      expect(useTheme.getState().overrides).toEqual({ backgroundColor: '#fcfaf2' });
      expect(saved()).toEqual({ v: 1, presetId: 'rosa', overrides: { backgroundColor: '#fcfaf2' } });
      expect(cssVar('--header')).toBe('248 201 218'); // Tablas no cambia
      expect(within(heading('Color de fondo')).getAllByRole('img', { name: 'personalizado' })).toHaveLength(1);
      expect(within(tab('Fondo')).getAllByRole('img', { name: 'personalizado' })).toHaveLength(1);
    });

    it('las miniaturas de la forma de fondo usan el color elegido', async () => {
      open();
      await goTo('Fondo');
      pick('Color de fondo', 'Menta');
      expect(within(group('Forma de fondo')).getByTestId('shape-plain').style.backgroundColor).toBe(rgb('#f5f9f7'));
    });

    it('cada tema trae su color de fondo elegido en la lista', async () => {
      open();
      for (const p of PRESETS) {
        act(() => useTheme.getState().setPreset(p.id));
        await goTo('Fondo');
        const checked = within(group('Color de fondo')).getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true');
        expect(checked, p.id).toHaveLength(1);
        expect(within(checked[0]).getByTestId('color-swatch').style.backgroundColor, p.id).toBe(rgb(p.backgroundColor));
      }
    });
  });

  it('forma de fondo: 5 opciones con miniatura', async () => {
    open();
    await goTo('Fondo');
    const radios = within(group('Forma de fondo')).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['Liso', 'Degradado', 'Puntos', 'Ondas', 'Acuarela']);
    for (const k of ['plain', 'gradient', 'dots', 'waves', 'watercolor']) expect(within(group('Forma de fondo')).getByTestId(`shape-${k}`)).toBeTruthy();
    expect(within(group('Forma de fondo')).getByTestId('shape-plain').style.backgroundImage).toBe('none');
    expect(within(group('Forma de fondo')).getByTestId('shape-gradient').style.backgroundImage).toContain('linear-gradient');
    await userEvent.setup().click(radio('Forma de fondo', 'Puntos'));
    expect(cssVar('--bg-image')).toContain('radial-gradient');
    expect(cssVar('--bg-size')).toBe('22px 22px');
  });
});

describe('Panel de control: restablecer', () => {
  it('"Restablecer personalizaciones" está deshabilitado sin cambios y deja el tema elegido', async () => {
    const user = userEvent.setup();
    open();
    const reset = screen.getByRole('button', { name: 'Restablecer personalizaciones' }) as HTMLButtonElement;
    expect(reset.disabled).toBe(true);
    await user.click(radio('Temas predeterminados', 'Durazno'));
    expect(reset.disabled).toBe(true); // elegir tema no es personalizar
    await user.click(tab('Tipografía'));
    pick('Color de letra', 'Azul noche');
    await user.click(radio('Tamaño de letra', 'Grande'));
    expect(reset.disabled).toBe(false);
    await user.click(reset);
    expect(useTheme.getState().presetId).toBe('durazno');
    expect(useTheme.getState().overrides).toEqual({});
    expect(cssVar('--ink-900')).toBe('');
    expect(cssVar('--font-size')).toBe('100%');
    expect(saved()).toEqual({ v: 1, presetId: 'durazno', overrides: {} });
    expect(screen.queryAllByRole('img', { name: 'personalizado' })).toHaveLength(0);
    expect(reset.disabled).toBe(true);
  });
});

describe('Panel de control: accesibilidad', () => {
  it('cada grupo es un radiogroup con nombre y exactamente una opción en el orden de tabulación', async () => {
    open();
    for (const name of ['Temas', 'Tipografía', 'Tablas', 'Bordes', 'Fondo']) {
      await goTo(name);
      for (const g of screen.getAllByRole('radiogroup')) {
        expect(g.getAttribute('aria-label'), name).toBeTruthy();
        const radios = within(g).getAllByRole('radio');
        expect(radios.filter((r) => r.getAttribute('aria-checked') === 'true'), `${name}: ${g.getAttribute('aria-label')}`).toHaveLength(1);
        expect(radios.filter((r) => r.tabIndex === 0), `${name}: ${g.getAttribute('aria-label')}`).toHaveLength(1);
        expect(radios.find((r) => r.tabIndex === 0)!.getAttribute('aria-checked')).toBe('true');
      }
    }
  });

  it('las flechas, Inicio y Fin mueven la selección (y el foco) dentro del grupo', async () => {
    const user = userEvent.setup();
    open();
    await user.click(tab('Tipografía'));
    radio('Tamaño de letra', 'Normal').focus();
    await user.keyboard('{ArrowRight}');
    expect(radio('Tamaño de letra', 'Grande').getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(radio('Tamaño de letra', 'Grande'));
    await user.keyboard('{ArrowRight}'); // da la vuelta
    expect(radio('Tamaño de letra', 'Pequeño').getAttribute('aria-checked')).toBe('true');
    await user.keyboard('{ArrowLeft}');
    expect(radio('Tamaño de letra', 'Grande').getAttribute('aria-checked')).toBe('true');
    await user.keyboard('{Home}');
    expect(radio('Tamaño de letra', 'Pequeño').getAttribute('aria-checked')).toBe('true');
    await user.keyboard('{End}');
    expect(radio('Tamaño de letra', 'Grande').getAttribute('aria-checked')).toBe('true');
    expect(cssVar('--font-size')).toBe('112.5%');
  });

  it('con teclado también se eligen los temas y los colores de tablas', async () => {
    const user = userEvent.setup();
    open();
    radio('Temas predeterminados', 'Rosa clásico').focus();
    await user.keyboard('{ArrowDown}');
    expect(useTheme.getState().presetId).toBe('acuarela');
    await user.click(tab('Tablas'));
    radio('Color de tablas', 'Cielo').focus();
    await user.keyboard('{ArrowRight}');
    expect(useTheme.getState().overrides.tableColor).toBe('#d9c6ef'); // Lila, la siguiente de la lista
  });

  it('las pestañas: solo la activa entra en el orden de tabulación y las flechas / Inicio / Fin las cambian', async () => {
    const user = userEvent.setup();
    open();
    expect(screen.getAllByRole('tab').filter((t) => t.tabIndex === 0)).toHaveLength(1);
    expect(tab('Temas').tabIndex).toBe(0);
    tab('Temas').focus();
    await user.keyboard('{ArrowRight}');
    expect(tab('Tipografía').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('Tipografía'));
    await user.keyboard('{End}');
    expect(tab('Fondo').getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{ArrowRight}'); // da la vuelta
    expect(tab('Temas').getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{ArrowLeft}');
    expect(tab('Fondo').getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{Home}');
    expect(tab('Temas').getAttribute('aria-selected')).toBe('true');
  });
});
