import { DISPENSE_FROM, accountOf, hhmm, monYr, placeOf, productById, productName, type Bill } from './data';
import { saveBlob } from './download';

/*
 * The bill as a downloadable A4 PDF, written by hand so the console needs no
 * PDF library. It uses the two built-in Helvetica faces, so every string is
 * reduced to plain ASCII first ("Rs." for the rupee sign).
 */

// Advance widths per 1000 em for characters 32–126 (Adobe core-font metrics).
const W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

const ascii = (s: string) =>
  s
    .replace(/₹/g, 'Rs. ')
    .replace(/[·•]/g, '-')
    .replace(/[–—−]/g, '-')
    .replace(/×/g, 'x')
    .replace(/≤/g, '<=')
    .replace(/[^\x20-\x7e]/g, '');

const width = (s: string, size: number, bold = false) =>
  [...s].reduce((n, c) => n + ((bold ? W_BOLD : W_REG)[c.charCodeAt(0) - 32] ?? 556), 0) * (size / 1000);

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const money = (n: number) => 'Rs. ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
const BRAND = hex('#1b4d8f');
const INK = hex('#15161c');
const MUTED = hex('#5b6273');
const LINE = hex('#dde3ea');
const TINT = hex('#f3f6fa');
const OK = hex('#137547');
const OK_SOFT = hex('#e3f3ea');

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 44; // page margin

class Page {
  ops: string[] = [];
  text(s: string, x: number, y: number, size = 10, o: { bold?: boolean; color?: RGB; align?: 'left' | 'right' | 'center' } = {}) {
    const t = ascii(s);
    const w = width(t, size, o.bold);
    const at = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
    const [r, g, b] = o.color ?? INK;
    this.ops.push(`BT ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg /${o.bold ? 'F2' : 'F1'} ${size} Tf ${at.toFixed(2)} ${y.toFixed(2)} Td (${esc(t)}) Tj ET`);
  }
  rect(x: number, y: number, w: number, h: number, fill: RGB) {
    this.ops.push(`${fill.map((v) => v.toFixed(3)).join(' ')} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }
  line(x1: number, y1: number, x2: number, y2: number, color: RGB = LINE, w = 0.8) {
    this.ops.push(`${color.map((v) => v.toFixed(3)).join(' ')} RG ${w} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }
}

/** Cuts a string to fit a column, with an ellipsis. */
const fit = (s: string, max: number, size: number, bold = false) => {
  let t = ascii(s);
  if (width(t, size, bold) <= max) return t;
  while (t.length > 1 && width(t + '...', size, bold) > max) t = t.slice(0, -1);
  return t + '...';
};

export function billPdf(bill: Bill): Blob {
  const p = bill.patient;
  const paid = bill.status === 'Paid';
  const date = bill.at.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const pages: Page[] = [];
  let pg = new Page();
  pages.push(pg);

  // ---- header band ----
  pg.rect(0, PAGE_H - 96, PAGE_W, 96, BRAND);
  pg.text('SHRI HEALTH Hospital Pharmacy', M, PAGE_H - 46, 18, { bold: true, color: [1, 1, 1] });
  pg.text(`${DISPENSE_FROM} - Pharmacy bill (tax invoice)`, M, PAGE_H - 66, 10, { color: [0.85, 0.9, 0.97] });
  pg.text('BILL', PAGE_W - M, PAGE_H - 46, 18, { bold: true, color: [1, 1, 1], align: 'right' });
  pg.text(bill.no, PAGE_W - M, PAGE_H - 66, 10, { color: [0.85, 0.9, 0.97], align: 'right' });

  // ---- bill facts ----
  let y = PAGE_H - 128;
  const facts: [string, string][] = [
    ['Bill no.', bill.no],
    ['Date', `${date}, ${hhmm(bill.at)}`],
    ['Transaction ID', bill.txnId],
    paid ? ['Payment', bill.payment] : ['Charged to', accountOf(p)],
  ];
  const colW = (PAGE_W - 2 * M) / facts.length;
  facts.forEach(([k, v], i) => {
    pg.text(k.toUpperCase(), M + i * colW, y, 7.5, { bold: true, color: MUTED });
    pg.text(fit(v, colW - 8, 10, true), M + i * colW, y - 15, 10, { bold: true });
  });

  // ---- parties ----
  y -= 40;
  pg.rect(M, y - 70, PAGE_W - 2 * M, 70, TINT);
  const half = (PAGE_W - 2 * M) / 2;
  pg.text('PATIENT', M + 14, y - 18, 7.5, { bold: true, color: MUTED });
  pg.text(fit(p.name, half - 28, 12, true), M + 14, y - 34, 12, { bold: true });
  pg.text(`${p.mrn}${p.age ? ` - ${p.age} ${p.sex ?? ''}` : ''} - ${p.encounter}`, M + 14, y - 50, 9.5, { color: MUTED });
  if (p.mobile) pg.text(`Mobile ${p.mobile}`, M + 14, y - 63, 9.5, { color: MUTED });
  pg.text('PRESCRIPTION', M + half + 14, y - 18, 7.5, { bold: true, color: MUTED });
  pg.text(bill.rxId, M + half + 14, y - 34, 12, { bold: true });
  pg.text(`Prescriber: ${bill.doctor}`, M + half + 14, y - 50, 9.5, { color: MUTED });
  pg.text(p.ipNo ? `${p.ipNo} - ${placeOf(p)}` : placeOf(p), M + half + 14, y - 63, 9.5, { color: MUTED });

  // ---- lines ----
  y -= 100;
  const R = PAGE_W - M;
  const cols = { no: M + 4, med: M + 24, batch: M + 220, exp: M + 282, qty: R - 160, mrp: R - 112, gst: R - 62, amt: R - 4 };
  const head = () => {
    pg.rect(M, y - 8, PAGE_W - 2 * M, 24, TINT);
    const o = { bold: true, color: MUTED } as const;
    pg.text('#', cols.no, y, 8, o);
    pg.text('MEDICINE', cols.med, y, 8, o);
    pg.text('BATCH', cols.batch, y, 8, o);
    pg.text('EXPIRY', cols.exp, y, 8, o);
    pg.text('QTY', cols.qty, y, 8, { ...o, align: 'right' });
    pg.text('MRP', cols.mrp, y, 8, { ...o, align: 'right' });
    pg.text('GST', cols.gst, y, 8, { ...o, align: 'right' });
    pg.text('AMOUNT', cols.amt, y, 8, { ...o, align: 'right' });
    y -= 30;
  };
  head();
  bill.lines.forEach((l, i) => {
    if (y < 190) {
      pg = new Page();
      pages.push(pg);
      y = PAGE_H - M - 10;
      head();
    }
    const pr = productById(l.productId);
    pg.text(String(i + 1), cols.no, y, 9.5, { color: MUTED });
    pg.text(fit(`${productName(pr)} ${pr.form}`, cols.batch - cols.med - 10, 9.5, true), cols.med, y, 9.5, { bold: true });
    pg.text(`${pr.unit}${pr.schedule === 'H1' ? ' - Schedule H1' : ''}`, cols.med, y - 12, 8, { color: MUTED });
    pg.text(l.batchNo, cols.batch, y, 9.5);
    pg.text(monYr(l.expiry), cols.exp, y, 9.5);
    pg.text(String(l.qty), cols.qty, y, 9.5, { align: 'right' });
    pg.text(l.mrp.toFixed(2), cols.mrp, y, 9.5, { align: 'right' });
    pg.text(`${l.gst}%`, cols.gst, y, 9.5, { align: 'right' });
    pg.text(l.amount.toFixed(2), cols.amt, y, 9.5, { align: 'right', bold: true });
    pg.line(M, y - 20, R, y - 20);
    y -= 34;
  });

  // ---- totals ----
  const rates = [...new Set(bill.lines.map((l) => l.gst))].sort((a, z) => a - z);
  const taxable = bill.lines.reduce((n, l) => n + l.taxable, 0);
  const tx = R - 200;
  y -= 4;
  pg.text('Taxable value', tx, y, 9.5, { color: MUTED });
  pg.text(money(taxable), R - 4, y, 9.5, { align: 'right' });
  for (const r of rates) {
    const tax = bill.lines.filter((l) => l.gst === r).reduce((n, l) => n + l.tax, 0);
    y -= 16;
    pg.text(`CGST ${r / 2}% + SGST ${r / 2}%`, tx, y, 9.5, { color: MUTED });
    pg.text(`${money(tax / 2)} + ${money(tax / 2)}`, R - 4, y, 9.5, { align: 'right' });
  }
  y -= 14;
  pg.line(tx, y, R, y, INK, 1);
  y -= 20;
  pg.text('Net amount', tx, y, 12, { bold: true });
  pg.text(money(bill.total), R - 4, y, 12, { bold: true, align: 'right' });

  // ---- payment status ----
  y -= 40;
  pg.rect(M, y - 14, PAGE_W - 2 * M, 38, OK_SOFT);
  pg.text(paid ? 'PAYMENT SUCCESSFUL' : 'CHARGED TO HOSPITAL ACCOUNT', M + 14, y + 6, 10, { bold: true, color: OK });
  pg.text(
    paid ? `Paid by ${bill.payment} - ${bill.txnId}` : `${accountOf(p)} - settled on the final hospital bill - ${bill.txnId}`,
    M + 14,
    y - 7,
    9,
    { color: INK }
  );
  pg.text(money(bill.total), R - 14, y - 1, 12, { bold: true, color: OK, align: 'right' });

  // ---- footer on every page ----
  pages.forEach((page, i) => {
    page.line(M, 64, R, 64);
    page.text(`Dispensed by ${bill.by}${bill.issuedTo ? ` - issued to ${bill.issuedTo.name}` : ''}. MRP inclusive of GST. Computer-generated bill; no signature required.`, M, 48, 8, { color: MUTED });
    page.text(`Page ${i + 1} of ${pages.length}`, R, 48, 8, { color: MUTED, align: 'right' });
  });

  return new Blob([assemble(pages)], { type: 'application/pdf' });
}

/** Writes the page content streams into a PDF file with a valid xref table. */
function assemble(pages: Page[]): string {
  const objs: string[] = [];
  const add = (body: string) => objs.push(body); // object number = index + 1
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(''); // pages, filled in below
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids: number[] = [];
  for (const pg of pages) {
    const stream = pg.ops.join('\n');
    add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const content = objs.length;
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${content} 0 R >>`);
    kids.push(objs.length);
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets = objs.map((body, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return out;
}

export function downloadBill(bill: Bill) {
  saveBlob(billPdf(bill), `${bill.no}.pdf`);
}
