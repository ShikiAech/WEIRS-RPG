// Small, fictional printed sheet. No user PDF, account data or full rules text is checked in.
export function syntheticRoll20Pdf(width = 612, height = 792) {
  const labels: [string, number, number][] = [
    ['Viajante', 36, 23],
    ['NAME', 36, 41],
    ['Soldado', 27, 52],
    ['BACKGROUND', 27, 65],
    ['Barbaro 4', 149, 52],
    ['CLASS', 149, 65],
    ['Oni', 27, 84],
    ['SPECIES', 27, 97],
    ['Berserker', 149, 84],
    ['SUBCLASS', 149, 97],
    ['HIT POINTS', 407, 31],
    ['ARMOR CLASS', 343, 33],
    ['15', 349, 49],
    ['29', 403, 70],
    ['CURRENT', 398, 89],
    ['31', 445, 74],
    ['MAX', 444, 89],
    ['4D12', 488, 78],
    ['PROFICIENCY BONUS', 27, 142],
    ['+2', 60, 175],
    ['INITIATIVE', 273, 143],
    ['+2', 281, 159],
    ['SPEED', 369, 143],
    ['--', 373, 159],
    ['SIZE', 462, 143],
    ['Medium', 449, 160],
    ['PASSIVE PERCEPTION', 526, 143],
    ['12', 551, 159],
    ['INTELLIGENCE', 156, 142],
    ['-1', 162, 170],
    ['8', 197, 176],
    ['-1 Saving Throw', 150, 219],
    ['STRENGTH', 46, 225],
    ['+4', 42, 253],
    ['18', 78, 259],
    ['+6 Saving Throw', 31, 307],
    ['+6 Athletics', 31, 324],
    ['DEXTERITY', 46, 343],
    ['+2', 42, 371],
    ['14', 78, 377],
    ['+2 Saving Throw', 31, 425],
    ['WISDOM', 156, 303],
    ['+0', 162, 331],
    ['10', 197, 337],
    ['+0 Saving Throw', 150, 385],
    ['+2 Perception', 150, 436],
    ['CONSTITUTION', 27, 477],
    ['+3', 42, 505],
    ['16', 78, 511],
    ['+5 Saving Throw', 31, 559],
    ['CHARISMA', 156, 464],
    ['-1', 162, 492],
    ['8', 197, 498],
    ['-1 Saving Throw', 150, 546],
  ];
  const stream = labels
    .map(
      ([s, x, y]) =>
        `BT /F1 8 Tf 1 0 0 1 ${x} ${792 - y - 8} Tm (${s.replace(/[()\\]/g, '\\$&')}) Tj ET`,
    )
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>`,
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let source = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(source));
    source += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(source);
  source += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((x) => String(x).padStart(10, '0') + ' 00000 n ')
    .join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(source);
}
