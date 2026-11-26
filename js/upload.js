/*
 * upload.js
 * "Update data" tab: read a new FinCap disbursement report or a POS & interest file
 * (.xlsx or .csv) entirely in the browser, and apply it to the loans on screen.
 * Nothing is sent anywhere: files are read on this computer.
 */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const dec = new TextDecoder();
  const norm = (h) => String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9]/g, '');
  const stamp = () => { const d = new Date(); const z = (n) => String(n).padStart(2, '0'); return z(d.getDate()) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] + ', ' + z(d.getHours()) + ':' + z(d.getMinutes()); };
  const el = GL.el;

  /* ---------- Reading .xlsx (zip of XML parts) ---------- */
  async function inflate(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open .xlsx files. Save the file as .csv and upload that instead.');
    const ds = new DecompressionStream('deflate-raw');
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer());
  }
  function unzip(buf) {
    const dv = new DataView(buf);
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw new Error('This file is not a valid .xlsx workbook.');
    const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
    const files = {};
    for (let n = 0; n < count; n++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      files[dec.decode(new Uint8Array(buf, p + 46, nlen))] = { method, csize, off };
      p += 46 + nlen + xlen + clen;
    }
    return {
      async read(name) {
        const f = files[name]; if (!f) return null;
        const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
        const data = new Uint8Array(buf, start, f.csize);
        return dec.decode(f.method === 0 ? data : await inflate(data));
      }
    };
  }
  const colIndex = (ref) => { let n = 0; for (const ch of ref) { const c = ch.charCodeAt(0); if (c < 65 || c > 90) break; n = n * 26 + (c - 64); } return n - 1; };
  const tags = (node, name) => Array.from(node.getElementsByTagName(name));
  async function readXlsx(buf) {
    const z = unzip(buf);
    const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
    const strings = [];
    const ss = await z.read('xl/sharedStrings.xml');
    if (ss) tags(xml(ss), 'si').forEach((si) => strings.push(tags(si, 't').filter((t) => t.parentNode.nodeName !== 'rPh').map((t) => t.textContent).join('')));
    const wbx = await z.read('xl/workbook.xml'); const relx = await z.read('xl/_rels/workbook.xml.rels');
    if (!wbx || !relx) throw new Error('This workbook could not be read. Save it again in Excel as .xlsx, or as .csv.');
    const rel = {}; tags(xml(relx), 'Relationship').forEach((r) => { rel[r.getAttribute('Id')] = r.getAttribute('Target'); });
    const sheets = tags(xml(wbx), 'sheet').map((s) => {
      const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let t = (rel[rid] || '').replace(/^\//, ''); if (!t.startsWith('xl/')) t = 'xl/' + t;
      return { name: s.getAttribute('name'), path: t };
    });
    return sheets.map((s) => ({
      name: s.name,
      async rows() {
        const x = await z.read(s.path); if (!x) return [];
        const out = [];
        tags(xml(x), 'row').forEach((row) => {
          const arr = [];
          tags(row, 'c').forEach((c) => {
            const ref = c.getAttribute('r') || ''; const ci = ref ? colIndex(ref) : arr.length; const t = c.getAttribute('t');
            let v;
            if (t === 'inlineStr') v = tags(c, 't').map((n) => n.textContent).join('');
            else {
              const vn = c.getElementsByTagName('v')[0]; v = vn ? vn.textContent : '';
              if (t === 's') v = strings[+v] == null ? '' : strings[+v];
              else if (t === 'b') v = v === '1' ? 'TRUE' : 'FALSE';
              else if ((!t || t === 'n') && v !== '') v = Number(v);
            }
            arr[ci] = v;
          });
          out[(+row.getAttribute('r') || out.length + 1) - 1] = arr;
        });
        return Array.from(out, (r) => Array.from(r || [], (v) => (v == null ? '' : v)));
      }
    }));
  }

  /* ---------- Reading .csv ---------- */
  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0];
    const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  async function readFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.csv') || name.endsWith('.txt')) { const rows = parseCsv(await file.text()); return [{ name: 'CSV', rows: async () => rows }]; }
    if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) return readXlsx(await file.arrayBuffer());
    if (name.endsWith('.xls')) throw new Error('Old .xls files cannot be read here. In Excel, use Save As → Excel Workbook (.xlsx), or CSV, and upload that.');
    throw new Error('Please upload an .xlsx or .csv file.');
  }

  /* ---------- Helpers ---------- */
  const num = (v) => {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v == null ? '' : v).trim(); if (!s) return null;
    const neg = /^\(.*\)$/.test(s); s = s.replace(/[₹,\s()]|rs\.?/gi, '');
    const n = Number(s); return isFinite(n) ? (neg ? -n : n) : null;
  };
  const parts = (v) => (v == null || v === '' ? [] : String(v).split(',').map((p) => p.trim()));
  const findHeader = (rows) => {
    for (let i = 0; i < Math.min(rows.length, 20); i++) { if ((rows[i] || []).filter((c) => typeof c === 'string' && /[a-z]/i.test(c)).length >= 3) return i; }
    return 0;
  };
  const toMonth = (v) => {
    if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); }
    const s = String(v || '').trim();
    let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/); if (m) return m[3] + '-' + m[2].padStart(2, '0');
    m = s.match(/^(\d{4})-(\d{1,2})/); if (m) return m[1] + '-' + m[2].padStart(2, '0');
    return '';
  };
  const loanText = (v) => {
    if (typeof v === 'number') return { text: Number.isSafeInteger(v) ? String(v) : String(v), lossy: !Number.isSafeInteger(v) };
    return { text: String(v == null ? '' : v).trim().replace(/^'/, '').replace(/\.0$/, ''), lossy: false };
  };
  const maskName = (n) => { const w = String(n).replace(/,/g, ' ').split(/\s+/).filter(Boolean); if (!w.length) return 'CUSTOMER'; return [w[0][0] + '*'.repeat(Math.max(2, w[0].length - 1))].concat(w.slice(1).map((x) => x[0] + '.')).join(' '); };
  const maskLoan = (l) => { l = String(l); if (l.length <= 13) return l.slice(0, 2) + '•'.repeat(Math.max(0, l.length - 6)) + l.slice(-4); return l.slice(0, 8) + '•'.repeat(l.length - 13) + l.slice(-5); };
  /* Short scrambled borrower key (cyrb53 with a per-browser salt), so no Customer ID or PAN is kept. */
  const SALT = (() => { try { let v = localStorage.getItem('gl-bsalt'); if (!v) { v = Math.random().toString(36).slice(2); localStorage.setItem('gl-bsalt', v); } return v; } catch (e) { return 'gl'; } })();
  const hashKey = (str) => { str = SALT + str; let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return 'u' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36); };
  const keyOf = (loan) => (GL_CONFIG.masked ? maskLoan(loan) : String(loan));
  const note = (kind, text) => el('p', 'gl-note ' + kind, text);

  function wireDrop(zone, input, onFile) {
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('gl-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('gl-over'));
    zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('gl-over'); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) onFile(f); });
    input.addEventListener('change', () => { const f = input.files && input.files[0]; if (f) onFile(f); input.value = ''; });
  }

  async function pickSheet(file, score) {
    const sheets = await readFile(file);
    let best = null;
    for (const s of sheets) {
      const rows = await s.rows(); const h = findHeader(rows); const sc = score((rows[h] || []).map(norm));
      if (!best || sc > best.score) best = { sheet: s.name, rows, h, score: sc };
    }
    return best;
  }

  /* ---------- New disbursement report ---------- */
  const DISB_COLS = {
    loan: ['loanaccount', 'loanaccountno', 'loanaccountnumber', 'loanacno', 'loanno'], name: ['applicantname', 'customername', 'borrowername', 'name'],
    branch: ['branchname', 'branch'], rm: ['relationshipmanager', 'rm', 'rmcode', 'rmname'], date: ['applicationdate', 'disbursementdate', 'disbdate', 'loandate'],
    status: ['status', 'loanstatus'], pos: ['pos', 'principaloutstanding', 'principalos', 'posamount'], db: ['dbamount', 'disbursedamount', 'disbursementamount', 'loanamount'],
    sanction: ['sanctionamount'], karat: ['karat'], emi: ['emi', 'emiamount', 'maturityamount', 'totalrepayable'], roi: ['roi', 'rateofinterest', 'interestrate'],
    orn: ['ornamenttype', 'ornament', 'ornaments'], gross: ['totalgrossweight', 'grossweight'], stone: ['totalstoneweight', 'stoneweight'],
    auth: ['authorizationdate', 'authorisationdate', 'sanctiondate'], cid: ['customerid', 'custid', 'customerno'], pan: ['pan', 'panno', 'pannumber'], dob: ['dateofbirth', 'dob'], bc: ['buccsloanacno'], mrate: ['marketrate'], bank: ['banknetvalue'], omv: ['openmarketvalue'], netw: ['totalnetweight', 'netweight']
  };
  let disbPending = null;

  function processDisb(found) {
    const head = (found.rows[found.h] || []).map(norm);
    const idx = {}; Object.keys(DISB_COLS).forEach((k) => { idx[k] = DISB_COLS[k].map((n) => head.indexOf(n)).find((i) => i >= 0); if (idx[k] === undefined) idx[k] = -1; });
    const missing = ['loan', 'karat', 'omv', 'netw'].filter((k) => idx[k] < 0);
    if (missing.length) throw new Error('This does not look like a FinCap disbursement report: missing column(s) ' + missing.map((k) => DISB_COLS[k][0]).join(', ') + '.');
    const out = []; const closedKeys = new Set(); const stats = { read: 0, closed: 0, incomplete: 0, posMissing: 0, lossy: 0 };
    found.rows.slice(found.h + 1).forEach((r) => {
      if (!r || !r.some((v) => v !== '')) return;
      const lt = loanText(r[idx.loan]); if (!lt.text) return;
      stats.read++; if (lt.lossy) stats.lossy++;
      const status = idx.status >= 0 ? String(r[idx.status] || '').trim() : '';
      if (status && status !== 'S04') { stats.closed++; closedKeys.add(keyOf(lt.text)); return; }
      let owed = idx.pos >= 0 ? num(r[idx.pos]) : null;
      const db = idx.db >= 0 ? num(r[idx.db]) : null, sanction = idx.sanction >= 0 ? num(r[idx.sanction]) : null;
      if (owed === null) { owed = db !== null ? db : sanction; stats.posMissing++; }
      if (!owed || owed <= 0) { stats.closed++; closedKeys.add(keyOf(lt.text)); return; }
      const K = parts(r[idx.karat]), M = idx.mrate >= 0 ? parts(r[idx.mrate]) : [], B = idx.bank >= 0 ? parts(r[idx.bank]) : [], O = parts(r[idx.omv]);
      let g24 = 0, then = 0, ok = K.length > 0 && K.length === M.length && M.length === B.length && B.length === O.length;
      let bk = {};
      const OR = idx.orn >= 0 ? parts(r[idx.orn]) : [], pcs = [];
      if (ok) {
        for (let i = 0; i < K.length; i++) {
          const k = num(K[i]), m = num(M[i]), b = num(B[i]), o = num(O[i]);
          if (!(k && m && b && o)) { ok = false; break; }
          const w = b / m; g24 += w * k / 24; then += w * o; bk[k] = (bk[k] || 0) + w;
          const t = String(OR[i] || 'Other').replace(/[~|]/g, ' ').replace(/\s+/g, ' ').trim() || 'Other';
          pcs.push(t + '~' + k + '~' + w.toFixed(3) + '~' + Math.round(w * o));
        }
      }
      if (!ok) {
        const ks = K.map(num).filter(Boolean), avgk = ks.length ? ks.reduce((a, b) => a + b, 0) / ks.length : 22;
        const o24 = K.map((k, i) => (num(k) && num(O[i]) ? num(O[i]) * 24 / num(k) : null)).filter(Boolean);
        g24 = (num(r[idx.netw]) || 0) * avgk / 24; then = g24 * (o24.length ? o24.reduce((a, b) => a + b, 0) / o24.length : 0);
        bk = { [+avgk.toFixed(2)]: num(r[idx.netw]) || 0 }; pcs.length = 0;
      }
      if (!(g24 > 0) || !(then > 0)) { stats.incomplete++; return; }
      const name = idx.name >= 0 ? String(r[idx.name] || '').trim() : '';
      const cell = (k) => (idx[k] >= 0 ? String(r[idx[k]] == null ? '' : r[idx[k]]).trim() : '');
      const cid = cell('cid'), pan = cell('pan').toUpperCase();
      let bkey = cid && cid !== '0' ? 'C:' + cid : pan.length === 10 ? 'P:' + pan : name ? 'N:' + name.toUpperCase().split(/\s+/).join(' ') + '|' + cell('dob') : '';
      if (bkey && cell('bc')) bkey = 'BC|' + bkey;
      const ad0 = cell('auth'), ad = /^\d{5}(\.\d+)?$/.test(ad0) ? new Date(Date.UTC(1899, 11, 30) + Math.floor(+ad0) * 864e5).toISOString().slice(0, 10) : ad0, auth = /^\d{2}[/-]\d{2}[/-]\d{4}/.test(ad) ? ad.slice(6, 10) + '-' + ad.slice(3, 5) + '-' + ad.slice(0, 2) : /^\d{4}-\d{2}-\d{2}/.test(ad) ? ad.slice(0, 10) : '';
      out.push({
        loan: GL_CONFIG.masked ? maskLoan(lt.text) : lt.text, customer: GL_CONFIG.masked ? maskName(name) : name,
        branch: idx.branch >= 0 ? String(r[idx.branch] || '').trim() : '', rm: idx.rm >= 0 ? String(r[idx.rm] || '').trim() : '',
        month: idx.date >= 0 ? toMonth(r[idx.date]) : '', karat: K.join('/'),
        disbursed: Math.round(db !== null ? db : owed), outstanding: Math.round(owed), pos: Math.round(owed), interest: '',
        net_g: +(num(r[idx.netw]) || 0).toFixed(2), gold24_g: +g24.toFixed(3), value_at_loan: Math.round(then), rate24_at_loan: Math.round(then / g24),
        kg: Object.keys(bk).map((k) => k + ':' + bk[k].toFixed(3)).join('/'),
        roi: num(cell('roi')) || '', matamt: Math.round(num(cell('emi')) || 0) || '', auth, bkey: bkey ? hashKey(bkey) : '',
        pos_asof: GL.todayISO(), bc: cell('bc') && cell('bc') !== '0' ? '1' : '', orn: pcs.join('|'), gross_g: num(cell('gross')) || '', stone_g: num(cell('stone')) || ''
      });
    });
    return { rows: out, stats, sheet: found.sheet, closedKeys };
  }

  function showDisb(res, file) {
    const box = $('#disb-result'); box.replaceChildren();
    const cur = GLDATA.rows() || [];
    const have = new Map(cur.map((r) => [String(r.loan), r]));
    const added = res.rows.filter((r) => !have.has(String(r.loan))).length, updated = res.rows.length - added;
    const nowClosed = cur.filter((r) => res.closedKeys.has(String(r.loan))).length;
    box.append(note('info', 'Read ' + GL.int(res.stats.read) + ' rows from “' + file.name + '” (sheet ' + res.sheet + '). Active gold loans: ' + GL.int(res.rows.length) + ' — ' + GL.int(added) + ' new, ' + GL.int(updated) + ' already on the dashboard. Skipped: ' + GL.int(res.stats.closed) + ' closed or zero balance, ' + GL.int(res.stats.incomplete) + ' with incomplete gold details.'));
    if (nowClosed) box.append(note('info', GL.int(nowClosed) + ' loans on the dashboard are closed in this report and will be removed.'));
    if (res.stats.posMissing) box.append(note('warn', 'POS was empty for ' + GL.int(res.stats.posMissing) + ' loans, so the disbursed amount is used as the amount owed. Upload a POS & interest file next to correct it.'));
    if (res.stats.lossy) box.append(note('warn', GL.int(res.stats.lossy) + ' loan numbers were stored as numbers in Excel and may have lost their last digits. Format the loan account column as Text and save again.'));
    if (!res.rows.length) { box.append(note('err', 'No active gold loans were found in this file.')); return; }
    const mode = el('div', 'gl-radio');
    [['merge', 'Add new loans and update existing ones (keeps loans not in this file)'], ['replace', 'Replace all loans with this file']].forEach(([v, t], i) => {
      const lab = el('label', 'gl-check'); const inp = el('input'); inp.type = 'radio'; inp.name = 'disb-mode'; inp.value = v; inp.checked = i === 0; lab.append(inp, el('span', null, t)); mode.append(lab);
    });
    const go = el('button', 'gl-btn gl-btn-dark', 'Apply ' + GL.int(res.rows.length) + ' loans'); go.type = 'button';
    go.onclick = () => {
      const m = (box.querySelector('input[name=disb-mode]:checked') || {}).value || 'merge';
      let rows;
      if (m === 'replace') rows = res.rows.map((r) => Object.assign({}, r, { isnew: '1' }));
      else {
        /* Existing loans keep amounts already refreshed from a POS & interest file. */
        const incoming = new Map(res.rows.map((r) => [String(r.loan), r]));
        rows = cur.filter((r) => !res.closedKeys.has(String(r.loan))).map((r) => {
          const n = incoming.get(String(r.loan)); if (!n) return r;
          return r.updated ? Object.assign({}, n, { pos: r.pos, interest: r.interest, outstanding: r.outstanding, updated: '1', as_on: r.as_on || '', incl: r.incl || '' }) : Object.assign({}, n, { isnew: r.isnew || '' });
        });
        res.rows.forEach((r) => { if (!have.has(String(r.loan))) rows.push(Object.assign({}, r, { isnew: '1' })); });
      }
      GLDATA.replace(rows, { type: 'disb', at: stamp(), label: m === 'replace' ? 'Replaced with ' + file.name : 'New disbursements: ' + GL.int(added) + ' added' + (nowClosed ? ', ' + GL.int(nowClosed) + ' closed removed' : '') + ' from ' + file.name });
      box.replaceChildren(note('ok', 'Done. The dashboard now shows ' + GL.int(rows.length) + ' loans. New and updated loans have a gold mark in the customer list.'));
    };
    box.append(el('p', 'gl-flabel', 'How should these loans be applied?'), mode, go);
  }

  /* ---------- POS & interest file ---------- */
  const isLoanCol = (n) => /loanaccount|loanacno|loanno|accountno|accountnumber|acno|loanid/.test(n) || n === 'account' || n === 'loan';
  const isPosCol = (n) => n === 'pos' || /^pos|principaloutstanding|principalos|outstandingprincipal|principalbalance/.test(n);
  const isIntCol = (n) => /interest|^int(due|os|outstanding|amount)?$|accruedint/.test(n) && !/rate|roi|percent|pct/.test(n);
  let posFile = null;

  function showPos(found, file) {
    posFile = { found, file };
    const box = $('#pos-result'); box.replaceChildren();
    const header = (found.rows[found.h] || []).map((h) => String(h || ''));
    const N = header.map(norm);
    const guess = (test) => { const i = N.findIndex(test); return i; };
    const sel = (id, label, idx, optional) => {
      const f = el('div', 'gl-field'); const l = el('label', null, label); l.htmlFor = id;
      const s = el('select', 'dash-select'); s.id = id;
      if (optional) s.append(new Option('— not in this file —', '-1'));
      header.forEach((h, i) => { if (h) s.append(new Option(h, String(i))); });
      s.value = String(idx); if (s.value === '' || (!optional && idx < 0)) s.selectedIndex = 0;
      s.onchange = () => previewPos();
      f.append(l, s); return f;
    };
    box.append(note('info', 'Read “' + file.name + '”' + (found.sheet !== 'CSV' ? ' (sheet ' + found.sheet + ')' : '') + ': ' + GL.int(found.rows.length - found.h - 1) + ' rows. Check the columns below, then apply.'));
    const map = el('div', 'gl-map');
    map.append(sel('pos-loan', 'Loan account column', guess(isLoanCol), false), sel('pos-pos', 'POS / principal column', guess(isPosCol), true), sel('pos-int', 'Interest column', guess(isIntCol), true));
    const c1 = el('label', 'gl-check'); const i1 = el('input'); i1.type = 'checkbox'; i1.id = 'pos-incl'; i1.onchange = previewPos; c1.append(i1, el('span', null, 'POS already includes the interest (do not add them together)'));
    const c2 = el('label', 'gl-check'); const i2 = el('input'); i2.type = 'checkbox'; i2.id = 'pos-close'; i2.onchange = previewPos; c2.append(i2, el('span', null, 'Loans not in this file are closed: remove them from the dashboard'));
    const prev = el('div', 'gl-preview'); prev.id = 'pos-preview';
    const go = el('button', 'gl-btn gl-btn-dark', 'Apply POS & interest'); go.type = 'button'; go.id = 'pos-apply'; go.onclick = applyPos;
    box.append(map, c1, c2, prev, go);
    previewPos();
  }

  function readPosRows() {
    const { found } = posFile; const li = +$('#pos-loan').value, pi = +$('#pos-pos').value, ii = +$('#pos-int').value;
    const out = new Map(); let lossy = 0;
    found.rows.slice(found.h + 1).forEach((r) => {
      if (!r) return; const lt = loanText(r[li]); if (!lt.text) return; if (lt.lossy) lossy++;
      out.set(keyOf(lt.text), { pos: pi >= 0 ? num(r[pi]) : null, interest: ii >= 0 ? num(r[ii]) : null, raw: lt.text });
    });
    return { map: out, li, pi, ii, lossy };
  }

  function previewPos() {
    const box = $('#pos-preview'); if (!box) return; box.replaceChildren();
    const { map, pi, ii, lossy } = readPosRows();
    const cur = GLDATA.rows() || [];
    const matched = cur.filter((r) => map.has(String(r.loan))).length;
    const go = $('#pos-apply');
    if (pi < 0 && ii < 0) { box.append(note('err', 'Choose at least a POS or an interest column.')); go.disabled = true; return; }
    go.disabled = matched === 0;
    box.append(note(matched ? 'ok' : 'err', matched ? GL.int(matched) + ' of the ' + GL.int(cur.length) + ' loans on the dashboard match this file (' + GL.int(map.size - matched) + ' rows in the file have no matching loan).' : 'No loan numbers in this file match the dashboard. Check the loan account column.'));
    if (lossy) box.append(note('warn', GL.int(lossy) + ' loan numbers were stored as numbers in Excel and lost their last digits, so they cannot match. Format that column as Text and save again.'));
    const t = el('table', 'gl-table'); const th = el('tr'); ['Loan', 'POS', 'Interest', 'New amount owed'].forEach((h) => th.append(el('th', null, h))); const thead = el('thead'); thead.append(th); t.append(thead);
    const tb = el('tbody'); const incl = $('#pos-incl').checked;
    Array.from(map.entries()).slice(0, 5).forEach(([k, v]) => {
      const tr = el('tr'); const owed = v.pos !== null ? v.pos + (incl ? 0 : (v.interest || 0)) : null;
      [k, v.pos === null ? '—' : GL.rupee(v.pos), v.interest === null ? '—' : GL.rupee(v.interest), owed === null ? 'current POS + interest' : GL.rupee(owed)].forEach((x) => tr.append(el('td', null, x)));
      tb.append(tr);
    });
    t.append(tb); const w = el('div', 'gl-wrap'); w.append(t); box.append(w);
  }

  function applyPos() {
    const { map, pi, ii } = readPosRows(); const incl = $('#pos-incl').checked, close = $('#pos-close').checked;
    const cur = GLDATA.rows() || []; let n = 0, removed = 0;
    const rows = [];
    cur.forEach((r) => {
      const u = map.get(String(r.loan));
      if (!u) { if (close) { removed++; return; } rows.push(r); return; }
      n++;
      const basePos = r.pos !== undefined && r.pos !== '' && r.pos !== null ? +r.pos : +r.outstanding;
      const pos = pi >= 0 && u.pos !== null ? u.pos : basePos;
      const interest = ii >= 0 && u.interest !== null ? u.interest : (r.interest === '' || r.interest == null ? null : +r.interest);
      const owed = pos + (incl ? 0 : (interest || 0));
      rows.push(Object.assign({}, r, { pos: Math.round(pos), interest: interest === null ? '' : Math.round(interest), outstanding: Math.round(owed), updated: '1', as_on: GL.todayISO(), incl: incl && interest !== null ? '1' : '' }));
    });
    GLDATA.replace(rows, { type: 'pos', at: stamp(), label: 'POS & interest from ' + posFile.file.name + ': ' + GL.int(n) + ' loans updated' + (removed ? ', ' + GL.int(removed) + ' closed' : '') });
    $('#pos-result').replaceChildren(note('ok', 'Done. ' + GL.int(n) + ' loans now use the new POS' + (ii >= 0 ? ' and interest' : '') + (removed ? '; ' + GL.int(removed) + ' closed loans were removed' : '') + '. Every figure has been recalculated.'));
  }

  /* ---------- Wiring ---------- */
  const fail = (boxSel, e) => { $(boxSel).replaceChildren(note('err', (e && e.message) || 'This file could not be read.')); console.error(e); };
  const busy = (boxSel, name) => { const p = el('p', 'gl-thinking', 'Reading ' + name + '…'); $(boxSel).replaceChildren(p); };
  document.querySelectorAll('#drop-disb').forEach((z) => wireDrop(z, z.querySelector('input'), async (f) => {
    busy('#disb-result', f.name);
    try { const found = await pickSheet(f, (h) => ['status', 'karat', 'openmarketvalue', 'banknetvalue', 'loanaccount', 'pos'].filter((n) => h.includes(n)).length); disbPending = processDisb(found); showDisb(disbPending, f); }
    catch (e) { fail('#disb-result', e); }
  }));
  document.querySelectorAll('#drop-pos').forEach((z) => wireDrop(z, z.querySelector('input'), async (f) => {
    busy('#pos-result', f.name);
    try { const found = await pickSheet(f, (h) => (h.some(isLoanCol) ? 2 : 0) + (h.some(isPosCol) ? 1 : 0) + (h.some(isIntCol) ? 1 : 0)); showPos(found, f); }
    catch (e) { fail('#pos-result', e); }
  }));
  document.querySelectorAll('#gl-remember').forEach((c) => c.addEventListener('change', () => GLDATA.setRemember(c.checked)));
  document.querySelectorAll('#gl-restore').forEach((b) => {
    let armed = false, t = 0;
    b.addEventListener('click', () => {
      if (!armed) { armed = true; b.textContent = 'Click again to restore the original data'; clearTimeout(t); t = setTimeout(() => { armed = false; b.textContent = 'Restore original data'; }, 4000); return; }
      armed = false; b.textContent = 'Restore original data'; GLDATA.restore();
      $('#disb-result').replaceChildren(); $('#pos-result').replaceChildren();
    });
  });

  /* Current data status */
  dash.draw('data_status', (box) => {
    box.replaceChildren();
    const rows = GLDATA.rows(); const info = GLDATA.info;
    if (!rows) { box.append(el('span', 'gl-thinking', 'Loading data…')); return; }
    const upd = rows.filter((r) => r.updated).length, nw = rows.filter((r) => r.isnew).length, withInt = rows.filter((r) => r.interest !== undefined && r.interest !== '' && r.interest !== null).length;
    const line = el('div'); line.append(el('b', null, GL.int(rows.length) + ' loans'), ' from ' + info.base);
    box.append(line, el('span', null, GL.int(nw) + ' added by upload'), el('span', null, GL.int(upd) + ' updated by upload'), el('span', null, GL.int(withInt) + ' with interest figures'));
    if (info.events.length) { const ul = el('ul'); info.events.slice().reverse().forEach((e) => ul.append(el('li', null, e.at + ' — ' + e.label))); const w = el('div'); w.style.flexBasis = '100%'; w.append(ul); box.append(w); }
    document.querySelectorAll('#gl-restore').forEach((b) => { b.disabled = GLDATA.isOriginal(); });
    document.querySelectorAll('#gl-remember').forEach((c) => { c.checked = GLDATA.remember; });
  });
})();
