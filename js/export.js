/*
 * export.js
 * Excel (.xlsx) and PDF export of the loans the customer list is showing.
 * Both files are built in the browser with no extra libraries:
 * the .xlsx is a small zip of SpreadsheetML parts, the PDF is written by hand.
 */
(function () {
  const enc = new TextEncoder();
  const Q = String.fromCharCode(34), NL = String.fromCharCode(10), BS = String.fromCharCode(92);
  let downloads = null;
  claude.use('downloads').then((d) => { downloads = d; document.querySelectorAll('.gl-export').forEach((b) => { b.hidden = !d; }); });
  const showMsg = (key) => {
    document.querySelectorAll('[data-msg]').forEach((m) => { m.hidden = m.dataset.msg !== key; });
    clearTimeout(showMsg.t); showMsg.t = setTimeout(() => document.querySelectorAll('[data-msg]').forEach((m) => { m.hidden = true; }), 5000);
  };
  const slug = (s) => String(s).toLowerCase().split(' ').filter(Boolean).join('-');
  const fileName = (ext) => { const p = dash.params(); return ['gold-loan-risk', p.tier ? slug(p.tier) : 'all-zones', p.branch ? slug(p.branch) : '', p.rm ? slug(p.rm) : '', 'rate-' + GL.rate()].filter(Boolean).join('_') + '.' + ext; };
  const filterText = () => {
    const p = dash.params(); const bits = ['Gold Rs/g: 24K ' + GL.int(GL.rate()) + ', 22K ' + GL.int(GL.rateFor(22)) + ', 18K ' + GL.int(GL.rateFor(18)) + (GL.KARATS.some((k) => GL.overridden(k)) ? ' (own karat rates used)' : '')];
    bits.push(p.tier ? GL.tierOf(p.tier).label : 'All zones');
    bits.push(p.branch || 'All branches');
    if (p.rm) bits.push('RM ' + p.rm);
    bits.push('Loan months: ' + (p.from ? GL.monthLabel(p.from) : 'earliest') + ' to ' + (p.to ? GL.monthLabel(p.to) : 'latest'));
    if (GL.state.q.trim()) bits.push('Search: ' + GL.state.q.trim());
    return bits.join(' | ');
  };
  const stamp = () => { const d = new Date(); const z = (n) => String(n).padStart(2, '0'); return z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()); };
  async function save(ext, data) {
    try { await downloads.save({ filename: fileName(ext), data }); showMsg('saved'); }
    catch (e) { showMsg(e && e.code === 'declined' ? 'declined' : 'error'); }
  }

  /* ---------- Minimal zip (store method) for the .xlsx ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u) => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const parts = [], central = []; let offset = 0;
    files.forEach((f) => {
      const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    });
    const csize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    const all = parts.concat(central, [new Uint8Array(end.buffer)]);
    const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0)); let o = 0; all.forEach((p) => { out.set(p, o); o += p.length; });
    return out;
  }

  /* ---------- Excel ---------- */
  const xe = (s) => String(s == null ? '' : s).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split(Q).join('&quot;');
  const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const XML = "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>";
  const NS = "xmlns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'";
  function sheetXml(rows, widths, opts) {
    let s = XML + '<worksheet ' + NS + '>';
    if (opts.freeze) s += "<sheetViews><sheetView workbookViewId='0'><pane ySplit='1' topLeftCell='A2' activePane='bottomLeft' state='frozen'/></sheetView></sheetViews>";
    s += '<cols>' + widths.map((w, i) => "<col min='" + (i + 1) + "' max='" + (i + 1) + "' width='" + w + "' customWidth='1'" + (opts.colStyle && opts.colStyle[i] ? " style='" + opts.colStyle[i] + "'" : '') + '/>').join('') + '</cols><sheetData>';
    rows.forEach((r, ri) => {
      s += "<row r='" + (ri + 1) + "'>";
      r.forEach((c, ci) => {
        if (!c || c.v == null || c.v === '') return;
        const ref = colName(ci) + (ri + 1), st = " s='" + (c.s || 0) + "'";
        if (typeof c.v === 'number' && isFinite(c.v)) s += "<c r='" + ref + "'" + st + '><v>' + c.v + '</v></c>';
        else s += "<c r='" + ref + "'" + st + " t='inlineStr'><is><t>" + xe(c.v) + '</t></is></c>';
      });
      s += '</row>';
    });
    s += '</sheetData>';
    if (opts.filter && rows.length > 1) s += "<autoFilter ref='A1:" + colName(widths.length - 1) + rows.length + "'/>";
    return s + '</worksheet>';
  }
  const STYLES = XML + '<styleSheet ' + NS + "><numFmts count='1'><numFmt numFmtId='164' formatCode='0.0'/></numFmts>" +
    "<fonts count='3'><font><sz val='11'/><name val='Calibri'/></font><font><b/><sz val='11'/><name val='Calibri'/></font><font><b/><sz val='14'/><name val='Calibri'/></font></fonts>" +
    "<fills count='6'><fill><patternFill patternType='none'/></fill><fill><patternFill patternType='gray125'/></fill>" +
    "<fill><patternFill patternType='solid'><fgColor rgb='FFE7E6E6'/></patternFill></fill><fill><patternFill patternType='solid'><fgColor rgb='FFF8CBAD'/></patternFill></fill>" +
    "<fill><patternFill patternType='solid'><fgColor rgb='FFFFE699'/></patternFill></fill><fill><patternFill patternType='solid'><fgColor rgb='FFC6E0B4'/></patternFill></fill></fills>" +
    "<borders count='1'><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count='1'><xf numFmtId='0' fontId='0' fillId='0' borderId='0'/></cellStyleXfs>" +
    "<cellXfs count='12'><xf numFmtId='0' fontId='0' fillId='0' borderId='0' xfId='0'/>" +
    "<xf numFmtId='0' fontId='1' fillId='2' borderId='0' xfId='0' applyFont='1' applyFill='1'/>" +
    "<xf numFmtId='3' fontId='0' fillId='0' borderId='0' xfId='0' applyNumberFormat='1'/>" +
    "<xf numFmtId='164' fontId='0' fillId='0' borderId='0' xfId='0' applyNumberFormat='1'/>" +
    "<xf numFmtId='2' fontId='0' fillId='0' borderId='0' xfId='0' applyNumberFormat='1'/>" +
    "<xf numFmtId='0' fontId='2' fillId='0' borderId='0' xfId='0' applyFont='1'/>" +
    "<xf numFmtId='0' fontId='0' fillId='3' borderId='0' xfId='0' applyFill='1'/><xf numFmtId='0' fontId='0' fillId='4' borderId='0' xfId='0' applyFill='1'/><xf numFmtId='0' fontId='0' fillId='5' borderId='0' xfId='0' applyFill='1'/>" +
    "<xf numFmtId='49' fontId='0' fillId='0' borderId='0' xfId='0' applyNumberFormat='1'/><xf numFmtId='0' fontId='1' fillId='4' borderId='0' xfId='0' applyFont='1' applyFill='1'/>" +
    "<xf numFmtId='0' fontId='0' fillId='0' borderId='0' xfId='0' applyAlignment='1'><alignment wrapText='1' vertical='top'/></xf></cellXfs>" +
    "<cellStyles count='1'><cellStyle name='Normal' xfId='0' builtinId='0'/></cellStyles></styleSheet>";
  const ZONE_STYLE = { RED: 6, AMBER: 7, GREEN: 8 };

  function buildXlsx(rows) {
    const rate = GL.rate();
    const head = ['Loan account', 'Customer', 'Branch', 'RM', 'Loan month', 'Karat', 'Pure gold (g)', 'Amount lent (Rs)', 'POS (Rs)', 'Interest (Rs)', 'Owed now (Rs)', '24K rate at loan (Rs/g)', 'Gold value at loan (Rs)', '24K rate today (Rs/g)', 'Gold value today (Rs)', 'Price change %', 'LTV at loan %', 'LTV today %', 'Top-up to 75% LTV (Rs)', 'Zone', 'Underwater', 'Repayable at maturity (Rs)', 'RBI cap %', 'LTV on maturity amount %', 'Over RBI cap', 'To pay to reach cap (Rs)', 'Maturity month', 'Main ornament', 'Ornaments', 'ROI %', 'Interest as on', 'Interest days', 'Principal (Rs)'];
    const data = [head.map((h) => ({ v: h, s: 1 }))].concat(rows.map((r) => [
      { v: String(r.loan) }, { v: r.customer }, { v: r.branch }, { v: r.rm }, { v: GL.monthLabel(r.month) }, { v: String(r.karat).split('/').join(', ') },
      { v: r.gold24_g, s: 4 }, { v: r.disbursed, s: 2 }, { v: r.pos, s: 2 }, { v: r.interest === null ? '' : r.interest, s: 2 }, { v: r.outstanding, s: 2 }, { v: r.rate24_at_loan, s: 2 }, { v: r.value_at_loan, s: 2 }, { v: rate, s: 2 }, { v: r.value_today, s: 2 },
      { v: r.price_change_pct, s: 3 }, { v: r.ltv_at_loan_pct, s: 3 }, { v: r.ltv_today_pct, s: 3 }, { v: r.topup_75, s: 2 },
      { v: GL.tierOf(r.tier).short, s: ZONE_STYLE[r.tier] || 0 }, { v: r.underwater },
      { v: r.matamt, s: 2 }, { v: r.cap_pct, s: 3 }, { v: r.rbi_ltv_pct, s: 3 }, { v: r.rbi_breach }, { v: r.reduce_to_cap, s: 2 }, { v: GL.monthLabel(r.maturity) }, { v: r.orn_main }, { v: r.orn_text }, { v: r.roi || '', s: 3 }, { v: r.asof }, { v: r.int_days, s: 2 }, { v: r.principal, s: 2 }
    ]));
    const widths = [20, 22, 15, 11, 11, 10, 12, 15, 13, 13, 14, 14, 16, 14, 16, 12, 12, 12, 16, 9, 11, 16, 9, 14, 11, 15, 12, 18, 40, 7, 12, 10, 14];
    const k = (() => { const d = dash.data('kpis'); return d.status === 'ok' && d.data ? d.data[0] : null; })();
    const sum = [[{ v: (window.GL_BRAND ? GL_BRAND.name : ''), s: 5 }], [{ v: 'Gold loan price risk', s: 5 }], [{ v: 'Exported' }, { v: stamp() }], [{ v: 'Filters' }, { v: filterText() }], [{ v: 'Amount owed' }, { v: dash.params().intmode === 'pos' ? 'POS as in report or upload' : 'Principal + interest due as on ' + (dash.params().asof || GL.todayISO()) + (dash.params().intmode === 'simple' ? ' (simple interest at ROI, 365-day year)' : ' (daily interest at ROI/365, capitalised at every month end)') }], [{ v: 'Note' }, { v: (GL_CONFIG.masked ? 'Customer names and loan numbers are masked. ' : '') + ((window.GLDATA && GLDATA.info.events.length) ? 'Includes uploaded updates.' : 'Built-in data.') }], [], [{ v: 'Measure', s: 1 }, { v: 'Value', s: 1 }]];
    if (k) [
      ['Loans shown', k.loans, 2], ['Amount lent (Rs Cr)', k.lent_cr, 4], ['Amount owed now (Rs Cr)', k.outstanding_cr, 4], ['Gold value at loan (Rs Cr)', k.value_at_loan_cr, 4],
      ['Gold value today (Rs Cr)', k.value_today_cr, 4], ['Average 24K rate at loan (Rs/g)', k.rate_at_loan, 2], ['24K rate today (Rs/g)', rate, 2], ['LTV at loan %', k.ltv_at_loan_pct, 3], ['LTV today %', k.ltv_today_pct, 3],
      ['Red-zone loans (selected months, branch, RM)', k.red, 2], ['Amber-zone loans (selected months, branch, RM)', k.amber, 2], ['Underwater loans', k.underwater, 2], ['Top-up to bring LTV to 75% (Rs Cr)', k.topup_cr, 4]
    ].forEach(([l, v, s]) => sum.push([{ v: l }, { v, s }]));
    /* One row per loan per karat: each karat valued at its own rate. */
    const kw = [['Loan account', 'Customer', 'Branch', 'Karat', 'Net weight (g)', 'Pure gold (g)', 'Rate at loan (Rs/g)', 'Value at loan (Rs)', 'Rate today (Rs/g)', 'Value today (Rs)', 'Change %', 'Loan owed now (Rs)', 'Loan gold value today (Rs)', 'Loan LTV today %'].map((h) => ({ v: h, s: 1 }))];
    rows.forEach((r) => (r.items || []).forEach((it, i) => kw.push([
      { v: String(r.loan) }, { v: r.customer }, { v: r.branch }, { v: it.k + 'K' }, { v: +it.g.toFixed(3), s: 4 }, { v: +it.pure.toFixed(3), s: 4 },
      { v: Math.round(it.rate_then), s: 2 }, { v: Math.round(it.value_then), s: 2 }, { v: Math.round(it.rate_now), s: 2 }, { v: Math.round(it.value_now), s: 2 },
      { v: it.value_then > 0 ? +((it.value_now / it.value_then - 1) * 100).toFixed(1) : '', s: 3 },
      { v: i === 0 ? r.outstanding : '', s: 2 }, { v: i === 0 ? r.value_today : '', s: 2 }, { v: i === 0 ? r.ltv_today_pct : '', s: 3 }
    ])));
    const ow = [['Loan account', 'Customer', 'Branch', 'Main ornament', 'Ornament', 'Ornament group', 'Karat', 'Net weight (g)', 'Value at loan (Rs)', 'Value today (Rs)', 'Share of loan %', 'Owed against this piece (Rs)'].map((h) => ({ v: h, s: 1 }))];
    rows.forEach((r) => (r.pieces || []).forEach((p) => ow.push([{ v: String(r.loan) }, { v: r.customer }, { v: r.branch }, { v: r.orn_main }, { v: p.type }, { v: p.group }, { v: p.k + 'K' },
      { v: +p.g.toFixed(3), s: 4 }, { v: Math.round(p.then), s: 2 }, { v: Math.round(p.now), s: 2 }, { v: +(p.share * 100).toFixed(1), s: 3 }, { v: Math.round(r.outstanding * p.share), s: 2 }])));
    return workbook([
      { name: 'Loans', rows: data, widths, freeze: true, filter: true },
      { name: 'Ornaments', rows: ow, widths: [20, 22, 15, 18, 20, 18, 7, 12, 15, 15, 11, 17], freeze: true, filter: true },
      { name: 'Karat-wise', rows: kw, widths: [20, 22, 15, 7, 12, 12, 14, 15, 14, 15, 10, 15, 17, 12], freeze: true, filter: true },
      { name: 'Summary', rows: sum, widths: [46, 90] }
    ]);
  }

  /* Any workbook: sheets = [{ name, rows: [[{v, s}]], widths, freeze, filter, colStyle }]. Styles: 1 header, 2 number, 9 text, 10 required header, 11 wrapped. */
  function workbook(sheets) {
    const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const files = [
      { name: '[Content_Types].xml', data: XML + "<Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'><Default Extension='rels' ContentType='application/vnd.openxmlformats-package.relationships+xml'/><Default Extension='xml' ContentType='application/xml'/><Override PartName='/xl/workbook.xml' ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'/><Override PartName='/xl/styles.xml' ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml'/>" +
        sheets.map((x, i) => "<Override PartName='/xl/worksheets/sheet" + (i + 1) + ".xml' ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'/>").join('') + '</Types>' },
      { name: '_rels/.rels', data: XML + "<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'><Relationship Id='rId1' Type='" + R + "/officeDocument' Target='xl/workbook.xml'/></Relationships>" },
      { name: 'xl/workbook.xml', data: XML + '<workbook ' + NS + " xmlns:r='" + R + "'><sheets>" + sheets.map((x, i) => "<sheet name='" + xe(x.name) + "' sheetId='" + (i + 1) + "' r:id='rId" + (i + 1) + "'/>").join('') + '</sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: XML + "<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'>" + sheets.map((x, i) => "<Relationship Id='rId" + (i + 1) + "' Type='" + R + "/worksheet' Target='worksheets/sheet" + (i + 1) + ".xml'/>").join('') + "<Relationship Id='rId" + (sheets.length + 1) + "' Type='" + R + "/styles' Target='styles.xml'/></Relationships>" },
      { name: 'xl/styles.xml', data: STYLES }
    ];
    sheets.forEach((x, i) => files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXml(x.rows, x.widths, x) }));
    return zip(files);
  }
  window.GLX = {
    workbook,
    ready: () => !!downloads,
    async save(filename, data) {
      if (!downloads) throw { code: 'unavailable' };
      return downloads.save({ filename, data });
    }
  };

  /* ---------- PDF (A4 landscape table) ---------- */
  function buildPdf(rows) {
    const W = 842, H = 595, M = 30, size = 7.5, lh = 12;
    const ascii = (s) => { let o = ''; String(s == null ? '' : s).split('').forEach((ch) => { const c = ch.charCodeAt(0); if (c === 8377) o += 'Rs '; else if (c === 8226) o += '*'; else if (c === 8211 || c === 8212 || c === 183) o += '-'; else if (c >= 32 && c < 127) o += ch; }); return o; };
    const esc = (s) => ascii(s).split(BS).join(BS + BS).split('(').join(BS + '(').split(')').join(BS + ')');
    const tw = (s, sz) => ascii(s).length * sz * 0.53;
    const fit = (s, w) => { let t = ascii(s); while (t.length > 1 && tw(t, size) > w) t = t.slice(0, -1); return t; };
    const txt = (font, sz, x, y, s) => 'BT /' + font + ' ' + sz + ' Tf ' + x.toFixed(1) + ' ' + y.toFixed(1) + ' Td (' + esc(s) + ') Tj ET';
    const ZC = { RED: '0.80 0.25 0.22', AMBER: '0.90 0.62 0.10', GREEN: '0.30 0.60 0.35' };
    const cols = [
      { label: 'Loan account', w: 78, get: (r) => r.loan }, { label: 'Customer', w: 140, get: (r) => r.customer }, { label: 'Branch', w: 72, get: (r) => r.branch },
      { label: 'RM', w: 55, get: (r) => r.rm }, { label: 'Month', w: 46, get: (r) => GL.monthLabel(r.month) },
      { label: 'Owed now (Rs)', w: 62, r: 1, get: (r) => GL.int(r.outstanding) }, { label: 'Value at loan', w: 66, r: 1, get: (r) => GL.int(r.value_at_loan) },
      { label: 'Value today', w: 66, r: 1, get: (r) => GL.int(r.value_today) }, { label: 'Change', w: 40, r: 1, get: (r) => GL.signed(r.price_change_pct) },
      { label: 'LTV', w: 40, r: 1, get: (r) => GL.pct(r.ltv_today_pct) }, { label: 'Top-up to 75%', w: 62, r: 1, get: (r) => GL.int(r.topup_75) },
      { label: 'Zone', w: 55, dot: 1, get: (r) => GL.tierOf(r.tier).short + (r.underwater === 'Yes' ? ' (UW)' : '') }
    ];
    const k = (() => { const d = dash.data('kpis'); return d.status === 'ok' && d.data ? d.data[0] : null; })();
    const line2 = k ? GL.int(rows.length) + ' loans | Owed Rs ' + k.outstanding_cr.toFixed(2) + ' Cr | Gold value today Rs ' + k.value_today_cr.toFixed(2) + ' Cr | LTV ' + GL.pct(k.ltv_today_pct) + ' | Top-up to 75%: Rs ' + k.topup_cr.toFixed(2) + ' Cr' : GL.int(rows.length) + ' loans';
    const B = window.GL_BRAND || null;
    const pages = []; let ops = [], y = 0;
    const header = () => {
      ops = []; y = H - M - 13;
      const LH = 30, LW = B ? LH * B.w / B.h : 0;
      if (B) ops.push('q ' + LW.toFixed(1) + ' 0 0 ' + LH + ' ' + M + ' ' + (y - 14) + ' cm /Im1 Do Q');
      const X0 = M + (B ? LW + 10 : 0);
      if (B) ops.push(txt('F2', 8, X0, y + 6, B.name));
      ops.push(txt('F2', 13, X0, y - 8, 'Gold loan price risk'));
      y -= 22;
      ops.push(txt('F1', 7, W - M - 110, y + 2, 'Exported ' + stamp()));
      y -= 15; ops.push(txt('F1', 8, M, y, filterText()));
      y -= 12; ops.push(txt('F1', 8, M, y, line2));
      y -= 20;
      ops.push('0.92 0.92 0.92 rg ' + M + ' ' + (y - 4) + ' ' + (W - 2 * M) + ' ' + lh + ' re f 0 0 0 rg');
      let x = M; cols.forEach((c) => { ops.push(txt('F2', size, c.r ? x + c.w - 4 - tw(c.label, size) : x + 3, y, c.label)); x += c.w; });
      y -= lh;
    };
    header();
    rows.forEach((r) => {
      if (y < M + 18) { pages.push(ops); header(); }
      let x = M;
      cols.forEach((c) => {
        const t = fit(c.get(r), c.w - (c.dot ? 14 : 6));
        if (c.dot) ops.push((ZC[r.tier] || '0.5 0.5 0.5') + ' rg ' + (x + 3) + ' ' + (y - 0.5) + ' 6 6 re f 0 0 0 rg');
        ops.push(txt('F1', size, c.r ? x + c.w - 4 - tw(t, size) : x + 3 + (c.dot ? 9 : 0), y, t));
        x += c.w;
      });
      ops.push('0.86 0.86 0.86 RG 0.4 w ' + M + ' ' + (y - 3.5) + ' m ' + (W - M) + ' ' + (y - 3.5) + ' l S');
      y -= lh;
    });
    if (!rows.length) ops.push(txt('F1', 9, M, y, 'No loans match these filters.'));
    pages.push(ops);
    const objs = [];
    objs[0] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    /* logo: JPEG kept as hex text so the whole file stays ASCII */
    objs[4] = B ? '<< /Type /XObject /Subtype /Image /Width ' + B.w + ' /Height ' + B.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ' + (B.jpgHex.length + 1) + ' >>' + NL + 'stream' + NL + B.jpgHex + '>' + NL + 'endstream' : '<< >>';
    const kids = [];
    pages.forEach((p, i) => {
      const stream = p.concat([txt('F1', 7, M, M - 14, (B ? B.name + ' | ' : '') + (GL_CONFIG.masked ? 'Names and loan numbers masked. ' : '') + 'LTV = amount owed / gold value at the 24K rate shown. UW = underwater.'), txt('F1', 7, W - M - 50, M - 14, 'Page ' + (i + 1) + ' of ' + pages.length)]).join(NL);
      const pn = objs.length + 1;
      objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Im1 5 0 R >> >> /Contents ' + (pn + 1) + ' 0 R >>');
      objs.push('<< /Length ' + stream.length + ' >>' + NL + 'stream' + NL + stream + NL + 'endstream');
      kids.push(pn + ' 0 R');
    });
    objs[1] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pages.length + ' >>';
    let out = '%PDF-1.4' + NL; const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj' + NL + o + NL + 'endobj' + NL; });
    const xref = out.length;
    out += 'xref' + NL + '0 ' + (objs.length + 1) + NL + '0000000000 65535 f ' + NL + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n ' + NL).join('');
    out += 'trailer' + NL + '<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>' + NL + 'startxref' + NL + xref + NL + '%%EOF';
    return enc.encode(out);
  }

  const run = async (kind) => {
    const rows = GL.tableRows();
    if (!downloads || !rows) return;
    if (!rows.length) { showMsg('none'); return; }
    try {
      if (kind === 'xlsx') await save('xlsx', buildXlsx(rows));
      else if (kind === 'pdf') await save('pdf', buildPdf(rows));
    } catch (e) { console.error(e); showMsg('error'); }
  };
  document.querySelectorAll('[data-export=xlsx]').forEach((b) => b.addEventListener('click', () => run('xlsx')));
  document.querySelectorAll('[data-export=pdf]').forEach((b) => b.addEventListener('click', () => run('pdf')));
})();
