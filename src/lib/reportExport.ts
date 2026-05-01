import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  ClientStats,
  DailyRevenuePoint,
  HourBreakdown,
  ModalityBreakdown,
  ReportsKPIs,
  ReportsRange,
  WeekdayBreakdown,
  BlockBreakdown,
} from './reports';

// ============================================================
// Export de reportes a Excel y PDF.
// ============================================================
//   * Excel (xlsx): un workbook con varias hojas estructuradas.
//     Pensado para que el admin lo abra en Excel/Sheets y siga
//     trabajando los números.
//   * PDF (jsPDF + autoTable): documento listo para imprimir o
//     compartir, con header, KPIs y tablas. NO incluye los charts
//     como imagen (sería fragil); en su lugar incluye los datos
//     que los charts representan, que es lo que importa.
// ============================================================

export interface ReportExportPayload {
  clubName: string;
  range: ReportsRange;
  kpis: ReportsKPIs;
  dailyRevenue: DailyRevenuePoint[];
  modalityBreakdown: ModalityBreakdown[];
  weekdayBreakdown: WeekdayBreakdown[];
  hourBreakdown: HourBreakdown[];
  topClients: ClientStats[];
  blockBreakdown: BlockBreakdown[];
}

const formatRangeLabel = (range: ReportsRange) => {
  const start = new Date(`${range.startDate}T12:00:00`);
  const end = new Date(`${range.endDate}T12:00:00`);
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  return `${fmt(start)} – ${fmt(end)}`;
};

const fileSafe = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-_]/g, '_');

const formatRD = (n: number) => `RD$ ${(n ?? 0).toLocaleString('es-DO')}`;

// ── EXCEL ──────────────────────────────────────────────────

export function exportToExcel(payload: ReportExportPayload) {
  const wb = XLSX.utils.book_new();

  // Hoja 1 — Resumen
  const summaryRows = [
    ['Reporte RealPlay'],
    ['Club', payload.clubName],
    ['Periodo', formatRangeLabel(payload.range)],
    [],
    ['Métrica', 'Valor'],
    ['Ingresos confirmados (RD$)', payload.kpis.totalRevenue],
    ['Ticket promedio (RD$)', Math.round(payload.kpis.averageTicket)],
    ['Reservas confirmadas', payload.kpis.confirmedBookings],
    ['Reservas pendientes', payload.kpis.pendingBookings],
    ['Reservas canceladas', payload.kpis.cancelledBookings],
    ['Reservas totales en rango', payload.kpis.totalBookings],
    ['Tasa de ocupación', `${(payload.kpis.occupancyRate * 100).toFixed(1)}%`],
    ['Tasa de cancelación', `${(payload.kpis.cancellationRate * 100).toFixed(1)}%`],
    ['Clientes únicos', payload.kpis.uniqueClients],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 38 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');

  // Hoja 2 — Ingresos por día
  const wsRevenue = XLSX.utils.json_to_sheet(
    payload.dailyRevenue.map((d) => ({
      Fecha: d.date,
      Etiqueta: d.label,
      'Reservas confirmadas': d.bookings,
      'Ingresos (RD$)': d.revenue,
    })),
  );
  wsRevenue['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsRevenue, 'Ingresos por día');

  // Hoja 3 — Por modalidad
  const wsModality = XLSX.utils.json_to_sheet(
    payload.modalityBreakdown.map((m) => ({
      Modalidad: m.type,
      Reservas: m.bookings,
      Horas: Number(m.hours.toFixed(2)),
      'Ingresos (RD$)': m.revenue,
    })),
  );
  wsModality['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsModality, 'Por modalidad');

  // Hoja 4 — Por día de la semana
  const wsWeekday = XLSX.utils.json_to_sheet(
    payload.weekdayBreakdown.map((w) => ({
      Día: w.label,
      Reservas: w.bookings,
      'Ingresos (RD$)': w.revenue,
    })),
  );
  wsWeekday['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsWeekday, 'Por día semana');

  // Hoja 5 — Por hora
  const wsHour = XLSX.utils.json_to_sheet(
    payload.hourBreakdown.map((h) => ({
      Hora: h.label,
      Reservas: h.bookings,
    })),
  );
  wsHour['!cols'] = [{ wch: 8 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsHour, 'Por hora');

  // Hoja 6 — Top clientes
  const wsClients = XLSX.utils.json_to_sheet(
    payload.topClients.map((c, idx) => ({
      '#': idx + 1,
      Cliente: c.fullName,
      Email: c.email,
      Reservas: c.bookings,
      'Total gastado (RD$)': c.spent,
    })),
  );
  wsClients['!cols'] = [{ wch: 4 }, { wch: 28 }, { wch: 32 }, { wch: 12 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsClients, 'Top clientes');

  // Hoja 7 — Bloqueos
  const wsBlocks = XLSX.utils.json_to_sheet(
    payload.blockBreakdown.map((b) => ({
      Tipo: b.label,
      Cantidad: b.count,
      Horas: Number(b.hours.toFixed(2)),
    })),
  );
  wsBlocks['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsBlocks, 'Bloqueos');

  const filename = `reporte_${fileSafe(payload.clubName)}_${payload.range.startDate}_a_${payload.range.endDate}.xlsx`;
  XLSX.writeFile(wb, filename);
}

// ── PDF ────────────────────────────────────────────────────

const PDF_PRIMARY_COLOR: [number, number, number] = [22, 163, 74]; // emerald-600
const PDF_TEXT_COLOR: [number, number, number] = [17, 24, 39]; // gray-900
const PDF_MUTED_COLOR: [number, number, number] = [107, 114, 128]; // gray-500

export function exportToPDF(payload: ReportExportPayload) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  // ── Header
  doc.setFillColor(...PDF_PRIMARY_COLOR);
  doc.rect(0, 0, pageWidth, 60, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('RealPlay — Reporte', margin, 36);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(formatRangeLabel(payload.range), pageWidth - margin, 36, { align: 'right' });

  y = 90;

  // Club
  doc.setTextColor(...PDF_TEXT_COLOR);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(payload.clubName, margin, y);
  y += 18;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF_MUTED_COLOR);
  doc.text('Resumen ejecutivo del periodo seleccionado.', margin, y);
  y += 24;

  // ── KPIs como tabla compacta de 2 columnas
  doc.setTextColor(...PDF_TEXT_COLOR);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Indicadores principales', margin, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [['Métrica', 'Valor']],
    body: [
      ['Ingresos confirmados', formatRD(payload.kpis.totalRevenue)],
      ['Ticket promedio', formatRD(Math.round(payload.kpis.averageTicket))],
      ['Reservas confirmadas', payload.kpis.confirmedBookings.toLocaleString('es-DO')],
      ['Reservas pendientes', payload.kpis.pendingBookings.toLocaleString('es-DO')],
      ['Reservas canceladas', payload.kpis.cancelledBookings.toLocaleString('es-DO')],
      ['Tasa de ocupación', `${(payload.kpis.occupancyRate * 100).toFixed(1)}%`],
      ['Tasa de cancelación', `${(payload.kpis.cancellationRate * 100).toFixed(1)}%`],
      ['Clientes únicos', payload.kpis.uniqueClients.toLocaleString('es-DO')],
    ],
    theme: 'striped',
    headStyles: { fillColor: PDF_PRIMARY_COLOR, textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 6 },
    columnStyles: { 0: { fontStyle: 'normal' }, 1: { fontStyle: 'bold' } },
    margin: { left: margin, right: margin },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;

  // ── Por modalidad
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Reservas e ingresos por modalidad', margin, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [['Modalidad', 'Reservas', 'Horas', 'Ingresos']],
    body: payload.modalityBreakdown.map((m) => [
      m.type,
      m.bookings.toLocaleString('es-DO'),
      m.hours.toFixed(1),
      formatRD(m.revenue),
    ]),
    theme: 'striped',
    headStyles: { fillColor: PDF_PRIMARY_COLOR, textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 6 },
    margin: { left: margin, right: margin },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;

  // ── Por día de la semana
  if (y > doc.internal.pageSize.getHeight() - 200) {
    doc.addPage();
    y = margin;
  }
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Reservas por día de la semana', margin, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [['Día', 'Reservas', 'Ingresos']],
    body: payload.weekdayBreakdown.map((w) => [
      w.label,
      w.bookings.toLocaleString('es-DO'),
      formatRD(w.revenue),
    ]),
    theme: 'striped',
    headStyles: { fillColor: PDF_PRIMARY_COLOR, textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 6 },
    margin: { left: margin, right: margin },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;

  // ── Top clientes
  if (y > doc.internal.pageSize.getHeight() - 200) {
    doc.addPage();
    y = margin;
  }
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Top 10 clientes', margin, y);
  y += 8;

  if (payload.topClients.length === 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...PDF_MUTED_COLOR);
    doc.text('Sin datos en el rango.', margin, y + 10);
    y += 20;
  } else {
    autoTable(doc, {
      startY: y,
      head: [['#', 'Cliente', 'Email', 'Reservas', 'Total gastado']],
      body: payload.topClients.map((c, idx) => [
        String(idx + 1),
        c.fullName,
        c.email,
        c.bookings.toLocaleString('es-DO'),
        formatRD(c.spent),
      ]),
      theme: 'striped',
      headStyles: { fillColor: PDF_PRIMARY_COLOR, textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 5 },
      columnStyles: { 0: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      margin: { left: margin, right: margin },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  }

  // ── Footer en cada página
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...PDF_MUTED_COLOR);
    doc.setFont('helvetica', 'normal');
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.text(
      `Generado ${new Date().toLocaleString('es-DO')}`,
      margin,
      pageHeight - 20,
    );
    doc.text(
      `Página ${i} de ${pageCount}`,
      pageWidth - margin,
      pageHeight - 20,
      { align: 'right' },
    );
  }

  const filename = `reporte_${fileSafe(payload.clubName)}_${payload.range.startDate}_a_${payload.range.endDate}.pdf`;
  doc.save(filename);
}
