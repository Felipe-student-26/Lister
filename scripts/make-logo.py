"""Genera el logo de Lister como SVG con el texto convertido a trazos (no depende de la fuente) y los PNG del splash.
Uso: python3 scripts/make-logo.py   (requiere: pip install fonttools cairosvg; y npm install para la fuente Bubblegum Sans)
"""
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import cairosvg, os

FONT = 'node_modules/@fontsource/bubblegum-sans/files/bubblegum-sans-latin-400-normal.woff'
f = TTFont(FONT)
gs, cmap, upm = f.getGlyphSet(), f.getBestCmap(), f['head'].unitsPerEm
SIZE = 100.0  # 1em = 100 unidades
k = SIZE / upm
x, parts = 0.0, []
for ch in 'Liste':
    g = cmap[ord(ch)]
    pen = SVGPathPen(gs)
    gs[g].draw(TransformPen(pen, (k, 0, 0, -k, x, 0)))  # y hacia abajo, línea base en y=0
    parts.append(pen.getCommands())
    x += f['hmtx'][g][0] * k + 0.01 * SIZE  # letter-spacing .01em
text_path = ' '.join(parts)
# La "r" dibujada a mano (misma geometría que ListerLogo.tsx): caja .56em x .444em, bajada .021em
s = 0.013875 * SIZE
rx, ry = x + 0.03 * SIZE + (0.56 * SIZE - 40 * s) / 2, (0.021 - 0.444) * SIZE
total_w = x + 0.03 * SIZE + 0.56 * SIZE
r_svg = f'''<g transform="translate({rx:.2f} {ry:.2f}) scale({s:.5f})" fill="none" stroke="COLOR" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
<path d="M6 5 V26.5"/><path d="M6 16 C6 9 10 5 17 5 C23 5 27 7.5 27 12 V16"/><path d="M19.5 16.5 H34.5 L27 28 Z" fill="COLOR" stroke-width="3"/></g>'''

def logo_group(main, shadow, dx=1.5, dy=1.5):
    body = lambda c: f'<path d="{text_path}" fill="{c}"/>' + r_svg.replace('COLOR', c)
    return f'<g transform="translate({dx} {dy})">{body(shadow)}</g>{body(main)}'

PAD_X, TOP, BOT = 12, 82, 22  # márgenes del viewBox alrededor del logo
def svg(main, shadow, bg=None):
    w, h = total_w + 2 * PAD_X, TOP + BOT
    rect = f'<rect width="100%" height="100%" fill="{bg}"/>' if bg else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.1f} {h:.1f}">{rect}'
            f'<g transform="translate({PAD_X} {TOP})">{logo_group(main, shadow)}</g></svg>')

os.makedirs('public', exist_ok=True)
open('public/lister-logo-white.svg', 'w').write(svg('#ffffff', '#ca2159'))

# Splash nativo: lienzo cuadrado 2732x2732, fondo rosado, logo blanco centrado (~46 % del ancho; zona segura en todas las pantallas)
N = 2732
w, h = total_w + 2 * PAD_X, TOP + BOT
logo_w = N * 0.46
sc = logo_w / w
splash = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{N}" height="{N}" viewBox="0 0 {N} {N}">'
          f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ee6a97"/><stop offset="1" stop-color="#d6336c"/></linearGradient></defs>'
          f'<rect width="{N}" height="{N}" fill="url(#g)"/>'
          f'<g transform="translate({(N - logo_w) / 2:.1f} {(N - h * sc) / 2:.1f}) scale({sc:.4f})"><g transform="translate({PAD_X} {TOP})">{logo_group("#ffffff", "#ca2159")}</g></g></svg>')
open('/tmp/splash.svg', 'w').write(splash)
for name in ('splash.png', 'splash-dark.png'):
    cairosvg.svg2png(bytestring=splash.encode(), write_to='resources/' + name, output_width=N, output_height=N)
# Android 12+: el sistema pinta el splash con un ícono sobre el color de fondo (lienzo 288dp = 1152 px a xxxhdpi; solo se ve el círculo central de 2/3).
M = 1152
isc = (M * 0.56) / w
icon = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{M}" height="{M}" viewBox="0 0 {M} {M}">'
        f'<g transform="translate({(M - w * isc) / 2:.1f} {(M - h * isc) / 2:.1f}) scale({isc:.4f})"><g transform="translate({PAD_X} {TOP})">{logo_group("#ffffff", "#ca2159")}</g></g></svg>')
cairosvg.svg2png(bytestring=icon.encode(), write_to='resources/splash_icon.png', output_width=M, output_height=M)
# Ícono de la app: el existente (public/icon.svg) en 1024
cairosvg.svg2png(url='public/icon.svg', write_to='resources/icon-only.png', output_width=1024, output_height=1024)
print('ok', round(total_w, 1))
