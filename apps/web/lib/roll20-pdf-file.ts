import {
  parseRoll20Pdf,
  type PdfPage,
  type PdfText,
  type Roll20PdfImport,
} from '../../../packages/sheets/roll20-pdf';

export const MAX_ROLL20_PDF_BYTES = 10 * 1024 * 1024;
export function checkPdfPageSize(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 1800 ||
    height > 1800 ||
    width * height > 1_500_000
  )
    throw Error(
      'O PDF possui páginas grandes demais ou dimensões inválidas. Exporte a ficha em tamanho A4 ou Carta.',
    );
}
type PdfFile = Pick<File, 'size' | 'arrayBuffer'>;
function aborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Leitura cancelada.', 'AbortError');
}

/** PDF.js and its worker are loaded only when the player chooses a PDF. */
export async function readRoll20Pdf(
  file: PdfFile,
  options: { signal?: AbortSignal; onProgress?: (page: number, total: number) => void } = {},
): Promise<Roll20PdfImport> {
  if (file.size > MAX_ROLL20_PDF_BYTES) throw Error('Escolha um PDF de até 10 MiB.');
  if (!file.size) throw Error('O arquivo PDF está vazio.');
  aborted(options.signal);
  const data = new Uint8Array(await file.arrayBuffer());
  if (data.length > MAX_ROLL20_PDF_BYTES) throw Error('Escolha um PDF de até 10 MiB.');
  if (!new TextDecoder().decode(data.subarray(0, 1024)).includes('%PDF-'))
    throw Error('O arquivo não é um PDF válido. Escolha o PDF exportado pelo Roll20.');
  aborted(options.signal);
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  aborted(options.signal);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data, useSystemFonts: true });
  const cancel = () => {
    void task.destroy();
  };
  options.signal?.addEventListener('abort', cancel, { once: true });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 30)
      throw Error(
        'O PDF tem mais de 30 páginas. Exporte somente as seções da ficha do personagem.',
      );
    const pages: PdfPage[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      aborted(options.signal);
      options.onProgress?.(n, pdf.numPages);
      const page = await pdf.getPage(n),
        viewport = page.getViewport({ scale: 1 });
      checkPdfPageSize(viewport.width, viewport.height);
      const content = await page.getTextContent();
      const items: PdfText[] = content.items.flatMap((i) => {
        if (!('str' in i) || !i.str.trim()) return [];
        // Baseline-to-top uses the embedded font's ascent, rather than the entire em square.
        const style = content.styles[i.fontName];
        // Chrome's Roll20 print export can omit FontBBox: PDF.js then reports NaN metrics.
        const ascent = Number.isFinite(style?.ascent)
          ? style.ascent
          : Number.isFinite(style?.descent)
            ? 1 + style.descent
            : 1;
        const transform = pdfjs.Util.transform(viewport.transform, i.transform);
        return [
          {
            text: i.str,
            x: transform[4],
            y: transform[5] - i.height * ascent,
            width: i.width,
            height: i.height,
          },
        ];
      });
      const scale = 2,
        renderViewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(renderViewport.width);
      canvas.height = Math.ceil(renderViewport.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw Error('O navegador não conseguiu ler as marcações do PDF.');
      await page.render({ canvas, canvasContext: ctx, viewport: renderViewport, annotationMode: 0 })
        .promise;
      aborted(options.signal);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height),
        width = canvas.width;
      const ink = (x: number, y: number, threshold = 140) => {
        const px = Math.round(x * scale),
          py = Math.round(y * scale);
        if (px < 0 || py < 0 || px >= pixels.width || py >= pixels.height) return false;
        const index = (py * width + px) * 4;
        return (
          (pixels.data[index] + pixels.data[index + 1] + pixels.data[index + 2]) / 3 < threshold
        );
      };
      const inkAt = (x: number, y: number) => {
        let count = 0;
        for (const dx of [-0.4, 0, 0.4])
          for (const dy of [-0.4, 0, 0.4]) if (ink(x + dx, y + dy)) count++;
        return count >= 5;
      };
      const ringAt = (x: number, y: number) => {
        // Circled component letters have ink outside the glyph; plain header letters do not.
        let count = 0;
        for (let a = 0; a < 8; a++) {
          const angle = (a * Math.PI) / 4;
          if (
            [3.8, 4.3, 4.8].some((r) => ink(x + Math.cos(angle) * r, y + Math.sin(angle) * r, 180))
          )
            count++;
        }
        return count >= 6;
      };
      const rules: NonNullable<PdfPage['rules']> = [];
      for (const [left, right] of [
        [14, 598],
        [25, 301],
        [307, 588],
      ]) {
        let last = -10;
        for (let yy = 20; yy < viewport.height - 8; yy += 0.5) {
          let hits = 0,
            total = 0;
          for (
            let xx = (left * viewport.width) / 612;
            xx < (right * viewport.width) / 612;
            xx += 3
          ) {
            total++;
            if (ink(xx, yy, 245)) hits++;
          }
          if (hits / total >= 0.88 && yy - last > 2) {
            rules.push({
              x0: (left * viewport.width) / 612,
              x1: (right * viewport.width) / 612,
              y: yy,
            });
            last = yy;
          }
        }
      }
      pages.push({ width: viewport.width, height: viewport.height, items, rules, inkAt, ringAt });
      canvas.width = canvas.height = 0;
      page.cleanup();
    }
    aborted(options.signal);
    return parseRoll20Pdf(pages);
  } catch (error) {
    aborted(options.signal);
    if (error instanceof Error && error.name === 'PasswordException')
      throw Error('O PDF está protegido por senha. Exporte uma cópia sem senha pelo Roll20.');
    if (error instanceof Error && /InvalidPDF|MissingPDF|UnknownError/.test(error.name))
      throw Error('Não foi possível ler este PDF. Exporte novamente a ficha pelo Roll20.');
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', cancel);
    await task.destroy();
  }
}
