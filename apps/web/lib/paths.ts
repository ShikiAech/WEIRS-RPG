export const base = import.meta.env.BASE_URL;
export const asset = (path: string) => base + path.replace(/^\//, '');
export const legacyUrl = (path: string) => path.replace(/^\/WEIRS-RPG\//, base);
export const legacyHtml = (html: string) =>
  html.replace(/(href|src)="\/WEIRS-RPG\//g, `$1="${base}`);
export const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
