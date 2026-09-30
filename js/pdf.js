// Makes a simple PDF report and downloads or shares it.
// jsPDF is only loaded when someone taps Download or Share.
const JSPDF = 'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js';

function loadJsPdf() {
  if (window.jspdf) return Promise.resolve(window.jspdf.jsPDF);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = JSPDF; s.onload = () => res(window.jspdf.jsPDF); s.onerror = rej;
    document.head.appendChild(s);
  });
}

// PDF's built-in font only knows plain characters, so swap fancy ones.
const plain = s => String(s).replace(/[–—]/g, '-').replace(/[’‘]/g, "'").replace(/…/g, '...').replace(/[^\x20-\x7E\xA0-\xFF]/g, '');

// title, sub: strings. sections: [{ heading, cols: [..], rows: [[..]], right: [colIndex..] }]
export async function makePdf({ title, sub, sections }) {
  const jsPDF = await loadJsPdf();
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 16;
  let y = 22;
  const page = () => { if (y > 280) { pdf.addPage(); y = 20; } };
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(18); pdf.text(plain(title), M, y); y += 7;
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(110);
  pdf.text(plain(sub), M, y); y += 10; pdf.setTextColor(0);

  for (const s of sections) {
    page();
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.text(plain(s.heading), M, y); y += 6;
    const n = s.cols.length, first = 70, rest = (W - 2 * M - first) / (n - 1);
    const x = i => M + (i === 0 ? 0 : first + rest * i);
    const cell = (row, bold) => {
      pdf.setFont('helvetica', bold ? 'bold' : 'normal');
      row.forEach((c, i) => {
        const txt = plain(c);
        if (s.right?.includes(i)) pdf.text(txt, x(i), y, { align: 'right' });
        else pdf.text(pdf.splitTextToSize(txt, i === 0 ? first - 4 : rest - 2)[0], i === 0 ? M : x(i) - rest + 2, y);
      });
    };
    pdf.setFontSize(9); pdf.setTextColor(110); cell(s.cols, true); pdf.setTextColor(0);
    y += 2; pdf.setDrawColor(210); pdf.line(M, y, W - M, y); y += 5;
    pdf.setFontSize(10);
    if (!s.rows.length) { pdf.setTextColor(110); pdf.text('Nothing here.', M, y); pdf.setTextColor(0); y += 6; }
    for (const r of s.rows) { page(); cell(r); y += 6; }
    y += 6;
  }
  pdf.setFontSize(8); pdf.setTextColor(150);
  pdf.text('Made ' + new Date().toLocaleString('en-AU'), M, 290);
  return pdf.output('blob');
}

// Share (phones: WhatsApp, email, Files...) and fall back to a download.
export async function shareOrDownload(blob, fileName, text, share) {
  const file = new File([blob], fileName, { type: 'application/pdf' });
  if (share && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: fileName.replace('.pdf', '') }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  if (share && navigator.share && text) {
    try { await navigator.share({ title: fileName.replace('.pdf', ''), text }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}
