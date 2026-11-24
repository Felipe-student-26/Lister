// Declaración mínima de jsdom para los tests (no se instala @types/jsdom: solo se usa JSDOM, runScripts, url y beforeParse).
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: { runScripts?: 'dangerously' | 'outside-only'; url?: string; beforeParse?: (window: Window & typeof globalThis) => void });
    window: Window & typeof globalThis;
  }
}
