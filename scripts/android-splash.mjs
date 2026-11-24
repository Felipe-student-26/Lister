// Ajusta el proyecto Android (android/, creado con `npx cap add android`) para que el splash sea rosado con el logo de Lister.
// Es idempotente: se puede ejecutar varias veces. Se ejecuta con `npm run android:splash` (después de `npm run android:assets`).
//  - res/drawable/splash_icon.png: logo blanco para el splash de Android 12+ (viene de resources/splash_icon.png).
//  - colors.xml: color de marca del splash.
//  - styles.xml: en Android 12+ el sistema pinta el splash con su propio tema; aquí se le da el fondo rosado y el logo.
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const res = 'android/app/src/main/res';
if (!existsSync(res)) {
  console.error('No existe android/. Ejecuta primero: npx cap add android');
  process.exit(1);
}

// 0) logo para el splash del sistema (Android 12+)
mkdirSync(`${res}/drawable`, { recursive: true });
copyFileSync('resources/splash_icon.png', `${res}/drawable/splash_icon.png`);

// 1) colors.xml
const colorsPath = `${res}/values/colors.xml`;
let colors = existsSync(colorsPath) ? readFileSync(colorsPath, 'utf8') : '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n';
if (!colors.includes('name="lister_splash"')) {
  colors = colors.replace('</resources>', '    <color name="lister_splash">#E1477A</color>\n</resources>');
  writeFileSync(colorsPath, colors);
  console.log('colors.xml: agregado lister_splash');
}

// 2) styles.xml: el tema de arranque (AppTheme.NoActionBarLaunch)
const stylesPath = `${res}/values/styles.xml`;
let styles = readFileSync(stylesPath, 'utf8');
const items = [
  ['android:windowSplashScreenBackground', '@color/lister_splash'],
  ['windowSplashScreenBackground', '@color/lister_splash'],
  ['windowSplashScreenAnimatedIcon', '@drawable/splash_icon'],
  ['android:navigationBarColor', '@color/lister_splash'],
  ['android:statusBarColor', '@color/lister_splash'],
];
const m = styles.match(/<style name="AppTheme\.NoActionBarLaunch"[^>]*>[\s\S]*?<\/style>/);
if (!m) {
  console.error('No encontré el estilo AppTheme.NoActionBarLaunch en styles.xml; revísalo a mano.');
  process.exit(1);
}
let block = m[0];
for (const [name, value] of items) {
  if (block.includes(`name="${name}"`)) continue;
  block = block.replace('</style>', `    <item name="${name}">${value}</item>\n    </style>`);
}
if (block !== m[0]) {
  writeFileSync(stylesPath, styles.replace(m[0], block));
  console.log('styles.xml: tema de arranque actualizado');
}
console.log('Splash de Android listo.');
