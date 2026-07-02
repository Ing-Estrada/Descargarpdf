/**
 * Genera un PDF mínimo pero VÁLIDO (una página, texto) con tabla xref correcta,
 * para usarlo como muestra en el banco de pruebas. Sin dependencias.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Cuerpos de los objetos (ASCII puro: length === bytes).
const content = 'BT /F1 20 Tf 40 90 Td (Hola PDF Grabber) Tj ET';
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 160] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
];

let pdf = '%PDF-1.4\n';
const offsets = [];
objects.forEach((body, i) => {
  offsets[i] = pdf.length;
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});

const xrefOffset = pdf.length;
const count = objects.length + 1; // +1 por el objeto libre 0
pdf += `xref\n0 ${count}\n`;
pdf += '0000000000 65535 f \n';
for (const off of offsets) {
  pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

const out = fileURLToPath(new URL('./sample.pdf', import.meta.url));
await writeFile(out, pdf, 'latin1');
console.log(`[sample] sample.pdf generado (${pdf.length} bytes)`);
