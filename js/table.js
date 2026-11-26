/*
 * table.js
 * Customer list (search, sort, pages, row details), branch table, tabs,
 * filter controls and CSV export.
 */
(function () {
  const Q = String.fromCharCode(34), NL = String.fromCharCode(10);
  GL.redrawTable = () => { dash.draw('register'); dash.draw('reg_count'); dash.draw('pager'); };
  document.querySelectorAll('.gl-masked-only').forEach((n) => { n.hidden = !GL_CONFIG.masked; });

  dash.draw('zonepills', (el) => {
    const t = dash.data('tiers'); const sel = dash.params().tier || '';
    const counts = {}; if (t.status === 'ok' && t.data) t.data.forEach((d) => { counts[d.tier] = d.loans; });
    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    const mk = (key, label) => {
      const b = GL.el('button', 'gl-btn'); b.type = 'button'; b.setAttribute('aria-pressed', sel === key ? 'true' : 'false');
      if (key) { const sw = GL.el('i', 'gl-sw'); sw.style.background = GL.tierOf(key).color; b.append(sw); }
      b.append(label + (t.status === 'ok' ? ' · ' + GL.int(key ? counts[key] || 0 : total) : ''));
      b.onclick = () => { GL.state.page = 1; dash.setParams({ tier: key }); };
      return b;
    };
    el.replaceChildren(mk('', 'All'), mk('RED', 'Red'), mk('AMBER', 'Amber'), mk('GREEN', 'Green'));
  });

  dash.draw('reg_count', (el) => {
    const rows = GL.tableRows();
    if (!rows) { el.textContent = dash.data('view').status === 'error' ? 'The customer list could not load.' : 'Loading…'; return; }
    const p = dash.params(), n = rows.length, start = n ? (GL.state.page - 1) * GL.state.size + 1 : 0, end = Math.min(n, GL.state.page * GL.state.size);
    const bits = [];
    if (p.tier) bits.push(GL.tierOf(p.tier).label);
    if (p.branch) bits.push(p.branch);
    if (p.rm) bits.push('RM ' + p.rm);
    if (p.from || p.to) bits.push((p.from ? GL.monthLabel(p.from) : 'start') + ' to ' + (p.to ? GL.monthLabel(p.to) : 'latest'));
    if (GL.state.q.trim()) bits.push('matching “' + GL.state.q.trim() + '”');
    el.textContent = 'Showing ' + GL.int(start) + '–' + GL.int(end) + ' of ' + GL.int(n) + ' loans' + (bits.length ? ' · ' + bits.join(' · ') : '');
  });

  dash.draw('register', (tb) => {
    tb.replaceChildren();
    const rows = GL.tableRows();
    const emptyRow = (text) => { const tr = GL.el('tr'); const td = GL.el('td', 'gl-empty', text); td.colSpan = 13; tr.append(td); tb.append(tr); };
    if (!rows) { emptyRow(dash.data('view').status === 'error' ? 'The customer list could not load. Reload the page to try again.' : 'Loading…'); return; }
    if (!rows.length) { emptyRow('No loans match these filters or this search. Try Reset filters.'); return; }
    const pages = Math.max(1, Math.ceil(rows.length / GL.state.size));
    if (GL.state.page > pages) GL.state.page = pages;
    const start = (GL.state.page - 1) * GL.state.size;
    rows.slice(start, start + GL.state.size).forEach((r) => {
      const tr = GL.el('tr', r.updated || r.isnew ? 'gl-upd' : null); tr.dataset.key = r.loan;
      if (r.updated || r.isnew) tr.title = r.isnew ? 'Added from a new disbursement upload' : 'Updated from your POS / interest file';
      const td = (text, cls) => { const c = GL.el('td', cls, text); tr.append(c); return c; };
      td(r.loan); td(r.customer); td(r.branch); td(r.rm); td(GL.monthLabel(r.month));
      td(GL.rupee(r.outstanding), 'n'); td(r.interest === null ? '—' : GL.rupee(r.interest), 'n'); td(GL.rupee(r.value_today), 'n'); td(GL.signed(r.price_change_pct), 'n');
      const lc = td(GL.pct(r.ltv_today_pct), 'n'); const bar = GL.el('span', 'gl-ltvbar'); const fill = GL.el('i'); fill.style.width = Math.min(100, r.ltv_today_pct / 1.2) + '%'; fill.style.background = GL.tierOf(r.tier).color; bar.append(fill); lc.append(bar);
      td(GL.rupee(r.topup_75), 'n');
      const T = GL.tierOf(r.tier); const c = td(''); c.append(GL.el('span', 'gl-pill ' + r.tier, T.short + (r.underwater === 'Yes' ? ' · UW' : '')));
      const a = td('', 'gl-actcol'); const b = GL.el('button', 'gl-btn', 'View'); b.type = 'button';
      b.setAttribute('aria-label', 'View details for ' + r.customer);
      b.onclick = () => {
        GL.state.detail = r.loan; dash.draw('detail');
        setTimeout(() => document.querySelectorAll('#loan-detail').forEach((e) => { e.focus({ preventScroll: true }); e.scrollIntoView({ block: 'nearest', behavior: GL.reduced() ? 'auto' : 'smooth' }); }), 40);
      };
      a.append(b);
      tb.append(tr);
    });
  });

  dash.draw('pager', (el) => {
    el.replaceChildren();
    const rows = GL.tableRows(); if (!rows || !rows.length) return;
    const pages = Math.max(1, Math.ceil(rows.length / GL.state.size));
    const mk = (label, page, dis) => { const b = GL.el('button', 'gl-btn', label); b.type = 'button'; b.disabled = dis; b.onclick = () => { GL.state.page = page; GL.redrawTable(); }; return b; };
    el.append(mk('← Previous', GL.state.page - 1, GL.state.page <= 1), GL.el('span', null, 'Page ' + GL.state.page + ' of ' + pages), mk('Next →', GL.state.page + 1, GL.state.page >= pages));
  });

  dash.draw('detail', (el) => {
    el.replaceChildren();
    const id = GL.state.detail; if (!id) return;
    const s = dash.data('view'); if (s.status !== 'ok' || !s.data) return;
    const r = s.data.find((x) => x.loan === id); if (!r) return;
    const head = GL.el('div', 'gl-dhead'); const hw = GL.el('div');
    hw.append(GL.el('h2', null, r.customer), GL.el('p', 'gl-sub', 'Loan ' + r.loan + ' · ' + r.branch + ' · RM ' + r.rm + ' · given ' + GL.monthLabel(r.month)));
    const close = GL.el('button', 'gl-btn', 'Close'); close.type = 'button'; close.onclick = () => { GL.state.detail = ''; dash.draw('detail'); };
    head.append(hw, close);
    const dl = GL.el('dl', 'gl-dgrid');
    const item = (label, text) => { const w = GL.el('div'); w.append(GL.el('dt', null, label), GL.el('dd', null, text)); dl.append(w); };
    item('Main ornament', r.orn_main);
    item('Karat pledged', r.kg_text || (String(r.karat).split('/').join(', ') + 'K'));
    if (r.gross_g) item('Gross → net weight', r.gross_g.toFixed(2) + ' g − stones ' + r.stone_g.toFixed(2) + ' g → ' + r.net_g.toFixed(2) + ' g');
    item('Net gold weight', r.net_g.toFixed(2) + ' g');
    item('Pure-gold weight', r.gold24_g.toFixed(2) + ' g');
    item('Amount lent', GL.rupee(r.disbursed));
    const roiMode = dash.params().intmode !== 'pos' && r.roi;
    item(roiMode ? 'Owed as on ' + GL.fmtDate(r.asof) : 'Owed now', GL.rupee(r.outstanding));
    item(roiMode ? 'Principal' : 'POS (principal)', GL.rupee(roiMode ? r.principal : r.pos));
    item('Rate of interest', r.roi ? r.roi + '% a year' : 'Not in data');
    if (roiMode) {
      item('Interest due as on ' + GL.fmtDate(r.asof), GL.rupee(r.int_due) + ' · ' + GL.int(r.int_days) + ' days since sanction');
      if (r.int_mode === 'cap') {
        item('Interest added at month ends', GL.rupee(r.int_cap));
        item('Interest this month (added on ' + GL.fmtDate(GL.monthEnd(r.asof)) + ')', GL.rupee(r.int_acc));
        item('Interest per day now', GL.rupee(r.int_per_day));
      } else item('Interest per day', GL.rupee(r.int_per_day));
      item('Interest for the full 12 months', GL.rupee(r.int_to_maturity));
    } else item('Interest due', r.interest === null ? 'Not uploaded yet' : GL.rupee(r.interest));
    item('24K rate at loan', GL.rupee(r.rate24_at_loan) + '/g');
    item('Gold value at loan', GL.rupee(r.value_at_loan));
    item('Gold value today', GL.rupee(r.value_today));
    item('LTV at loan', GL.pct(r.ltv_at_loan_pct));
    item('LTV today', GL.pct(r.ltv_today_pct));
    item('Top-up to bring LTV to 75%', GL.rupee(r.topup_75));
    item('Zone', GL.tierOf(r.tier).label);
    let msg;
    if (r.underwater === 'Yes') msg = 'Underwater: the gold is worth less than the amount owed. Contact the customer first and ask for a part-payment of about ' + GL.rupee(r.topup_75) + ' or extra gold, as per policy.';
    else if (r.tier === 'RED') msg = 'Red zone: ask for a part-payment of about ' + GL.rupee(r.topup_75) + ' or extra gold to bring LTV back to 75%.';
    else if (r.tier === 'AMBER') msg = 'Amber zone: keep watching this loan and remind the customer about interest dues.' + (r.topup_75 > 0 ? ' A part-payment of ' + GL.rupee(r.topup_75) + ' brings LTV to 75%.' : '');
    else msg = 'Green zone: enough cushion at today’s rate.';
    /* Karat-wise valuation: each karat at its own rate, then LTV on the total. */
    const kt = GL.el('div', 'gl-wrap'); const t = GL.el('table', 'gl-table gl-ktable');
    const th = GL.el('thead'); const hr = GL.el('tr');
    ['Karat', 'Net weight', 'Rate at loan (₹/g)', 'Value at loan', 'Rate today (₹/g)', 'Value today', 'Change'].forEach((h, i) => hr.append(GL.el('th', i ? 'n' : null, h)));
    th.append(hr); const tb = GL.el('tbody');
    const cell = (tr, v, n, cls) => tr.append(GL.el('td', (n ? 'n' : '') + (cls ? ' ' + cls : ''), v));
    let g = 0, vt = 0, vn = 0;
    (r.items || []).forEach((it) => {
      const tr = GL.el('tr'); g += it.g; vt += it.value_then; vn += it.value_now;
      const c = it.value_then > 0 ? (it.value_now / it.value_then - 1) * 100 : 0;
      cell(tr, it.k + 'K'); cell(tr, it.g.toFixed(2) + ' g', 1); cell(tr, GL.rupee(it.rate_then), 1); cell(tr, GL.rupee(it.value_then), 1);
      cell(tr, GL.rupee(it.rate_now), 1); cell(tr, GL.rupee(it.value_now), 1); cell(tr, GL.signed(+c.toFixed(1)), 1, c < 0 ? 'gl-bad' : '');
      tb.append(tr);
    });
    const tot = GL.el('tr', 'gl-ktot'); cell(tot, 'Total'); cell(tot, g.toFixed(2) + ' g', 1); cell(tot, '', 1); cell(tot, GL.rupee(vt), 1); cell(tot, '', 1); cell(tot, GL.rupee(vn), 1);
    const ct = vt > 0 ? (vn / vt - 1) * 100 : 0; cell(tot, GL.signed(+ct.toFixed(1)), 1, ct < 0 ? 'gl-bad' : ''); tb.append(tot);
    t.append(th, tb); kt.append(t);
    const calc = GL.el('div', 'gl-kcalc');
    const ln = (label, a, b, res) => { const p = GL.el('p'); p.append(GL.el('b', null, label + ': '), a + ' ÷ ' + b + ' = ', GL.el('b', null, res)); calc.append(p); };
    ln('LTV today', 'owed ' + GL.rupee(r.outstanding), 'gold value today ' + GL.rupee(r.value_today), GL.pct(r.ltv_today_pct));
    ln('LTV at loan', 'amount lent ' + GL.rupee(r.disbursed), 'gold value at loan ' + GL.rupee(r.value_at_loan), GL.pct(r.ltv_at_loan_pct));
    if (r.matamt) ln('RBI LTV (bullet loan)', 'repayable at maturity ' + GL.rupee(r.matamt), 'gold value today ' + GL.rupee(r.value_today), GL.pct(r.rbi_ltv_pct) + ' (cap ' + r.cap_pct + '%)');
    /* Ornaments pledged, piece by piece */
    let ot = null;
    if (r.pieces && r.pieces.length) {
      ot = GL.el('div', 'gl-wrap'); const t2 = GL.el('table', 'gl-table gl-ktable'); const h2 = GL.el('tr');
      ['Ornament', 'Karat', 'Net weight', 'Value at loan', 'Value today', 'Share of loan'].forEach((h, i) => h2.append(GL.el('th', i > 1 ? 'n' : null, h)));
      const th2 = GL.el('thead'); th2.append(h2); const b2 = GL.el('tbody');
      r.pieces.forEach((p) => { const tr = GL.el('tr'); [[p.type], [p.k + 'K'], [p.g.toFixed(2) + ' g', 1], [GL.rupee(p.then), 1], [GL.rupee(p.now), 1], [GL.pct(p.share * 100), 1]].forEach(([v, n]) => tr.append(GL.el('td', n ? 'n' : null, v))); b2.append(tr); });
      t2.append(th2, b2); ot.append(t2);
    }
    el.append(head, dl);
    if (ot) el.append(GL.el('h3', 'gl-kh3', 'Ornaments pledged'), ot);
    el.append(GL.el('h3', 'gl-kh3', 'Gold valued karat by karat'), kt, calc, GL.el('p', 'gl-action', msg));
  });

  /* Gold by karat, all loans shown */
  dash.draw('karatmix', (tb) => {
    tb.replaceChildren();
    const d = dash.data('karatmix'); if (d.status !== 'ok' || !d.data) return;
    let L = 0, G = 0, P = 0, V0 = 0, V1 = 0;
    d.data.forEach((x) => {
      const tr = GL.el('tr'); const c = (v, n, cls) => tr.append(GL.el('td', (n ? 'n' : '') + (cls ? ' ' + cls : ''), v));
      c(x.karat + 'K'); c(GL.int(x.loans), 1); c(GL.int(Math.round(x.net_g)) + ' g', 1); c(GL.int(Math.round(x.pure_g)) + ' g', 1); c(GL.rupee(x.rate_now), 1);
      c(GL.cr(x.value_then / 1e7), 1); c(GL.cr(x.value_now / 1e7), 1); c(GL.signed(x.change_pct), 1, x.change_pct < 0 ? 'gl-bad' : ''); c(x.main_loans ? GL.int(x.main_loans) + ' · ' + GL.pct(x.main_ltv_pct) : '—', 1);
      tb.append(tr); G += x.net_g; P += x.pure_g; V0 += x.value_then; V1 += x.value_now;
    });
    const s = dash.data('view'); L = s.status === 'ok' && s.data ? s.data.length : 0;
    const tr = GL.el('tr', 'gl-ktot'); [['Total'], [GL.int(L), 1], [GL.int(Math.round(G)) + ' g', 1], [GL.int(Math.round(P)) + ' g', 1], ['', 1], [GL.cr(V0 / 1e7), 1], [GL.cr(V1 / 1e7), 1], [GL.signed(+((V1 / V0 - 1) * 100).toFixed(1)), 1], ['', 1]].forEach(([v, n]) => tr.append(GL.el('td', n ? 'n' : null, v)));
    tb.append(tr);
  });

  dash.draw('btable', (tb) => {
    tb.replaceChildren();
    const b = dash.data('branches');
    const emptyRow = (text) => { const tr = GL.el('tr'); const td = GL.el('td', 'gl-empty', text); td.colSpan = 8; tr.append(td); tb.append(tr); };
    if (b.status !== 'ok' || !b.data) { emptyRow(b.status === 'error' ? 'The branch summary could not load.' : 'Loading…'); return; }
    if (!b.data.length) { emptyRow('No loans match these filters.'); return; }
    const sel = dash.params().branch || '';
    GL.sortRows(b.data, GL.state.bsort, GL.state.bdir).forEach((r) => {
      const tr = GL.el('tr'); if (sel === r.branch) tr.style.fontWeight = '600';
      const td = (text, cls) => { const c = GL.el('td', cls, text); tr.append(c); return c; };
      const nameCell = td(''); const btn = GL.el('button', 'gl-sort', r.branch); btn.type = 'button'; btn.title = 'Filter the dashboard to this branch';
      btn.onclick = () => { GL.state.page = 1; dash.setParams({ branch: sel === r.branch ? '' : r.branch, rm: '' }); }; nameCell.append(btn);
      td(GL.int(r.loans), 'n'); td(GL.lakh(r.outstanding_lakh), 'n'); td(GL.int(r.red), 'n'); td(GL.int(r.amber), 'n'); td(GL.int(r.underwater), 'n'); td(GL.pct(r.ltv_today_pct), 'n'); td(GL.lakh(r.topup_lakh), 'n');
      tb.append(tr);
    });
  });

  /* Sorting */
  const syncSort = () => {
    document.querySelectorAll('#loan-table th').forEach((th) => { const b = th.querySelector('[data-sort]'); if (!b) return; th.setAttribute('aria-sort', b.dataset.sort === GL.state.sort ? (GL.state.dir === 'asc' ? 'ascending' : 'descending') : 'none'); });
    document.querySelectorAll('#branch-sum th').forEach((th) => { const b = th.querySelector('[data-bsort]'); if (!b) return; th.setAttribute('aria-sort', b.dataset.bsort === GL.state.bsort ? (GL.state.bdir === 'asc' ? 'ascending' : 'descending') : 'none'); });
  };
  document.querySelectorAll('#loan-table [data-sort]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.sort;
    if (GL.state.sort === k) GL.state.dir = GL.state.dir === 'asc' ? 'desc' : 'asc'; else { GL.state.sort = k; GL.state.dir = GL.TEXT_KEYS.includes(k) ? 'asc' : 'desc'; }
    GL.state.page = 1; syncSort(); GL.redrawTable();
  }));
  document.querySelectorAll('#branch-sum [data-bsort]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.bsort;
    if (GL.state.bsort === k) GL.state.bdir = GL.state.bdir === 'asc' ? 'desc' : 'asc'; else { GL.state.bsort = k; GL.state.bdir = k === 'branch' ? 'asc' : 'desc'; }
    syncSort(); dash.draw('btable');
  }));
  syncSort();

  /* Search and page size */
  let searchTimer = 0;
  document.querySelectorAll('#gl-search').forEach((el) => el.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { GL.state.q = el.value; GL.state.page = 1; GL.redrawTable(); }, 150); }));
  document.querySelectorAll('#gl-size').forEach((el) => el.addEventListener('change', () => { GL.state.size = Number(el.value) || 25; GL.state.page = 1; GL.redrawTable(); }));

  /* Filters */
  const setRate = (v) => { const n = Math.round(Number(v)); if (n >= 1000 && n <= 50000) dash.setParams({ rate: n }); };
  document.querySelectorAll('#gl-rate-num').forEach((el) => el.addEventListener('change', () => { if (el.value && el.validity.valid) setRate(el.value); }));
  let raf = 0;
  document.querySelectorAll('#gl-rate-range').forEach((el) => el.addEventListener('input', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setRate(el.value)); }));
  const clearKarats = () => { const o = {}; GL.KARATS.forEach((k) => { o['r' + k] = ''; }); return o; };
  document.querySelectorAll('[data-rate]').forEach((b) => b.addEventListener('click', () => { const n = Math.round(Number(b.dataset.rate)); dash.setParams(Object.assign(clearKarats(), { rate: n })); }));
  document.querySelectorAll('input[data-karat]').forEach((inp) => inp.addEventListener('change', () => {
    const k = Number(inp.dataset.karat); const v = Math.round(Number(inp.value));
    const auto = GL.autoRate(k);
    dash.setParams({ ['r' + k]: !inp.value || !(v > 0) || v === auto ? '' : v });
  }));
  document.querySelectorAll('#gl-kreset').forEach((b) => b.addEventListener('click', () => dash.setParams(clearKarats())));
  document.querySelectorAll('#gl-tier').forEach((el) => el.addEventListener('change', () => { GL.state.page = 1; dash.setParams({ tier: el.value }); }));
  document.querySelectorAll('#gl-reset').forEach((el) => el.addEventListener('click', () => {
    GL.state.q = ''; GL.state.page = 1;
    document.querySelectorAll('#gl-search').forEach((s) => { s.value = ''; });
    dash.setParams({ tier: '', branch: '', rm: '', from: '', to: '' });
    GL.redrawTable();
  }));
  document.querySelectorAll('[data-zone]').forEach((c) => {
    c.addEventListener('click', () => GL.showZone(c.dataset.zone));
    c.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); GL.showZone(c.dataset.zone); } });
  });

  /* Tabs */
  const tabs = Array.from(document.querySelectorAll('[data-tab]'));
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => GL.goTab(b.dataset.tab));
    b.addEventListener('keydown', (ev) => {
      let j = -1;
      if (ev.key === 'ArrowRight') j = (i + 1) % tabs.length; else if (ev.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length; else if (ev.key === 'Home') j = 0; else if (ev.key === 'End') j = tabs.length - 1;
      if (j >= 0) { ev.preventDefault(); GL.goTab(tabs[j].dataset.tab); tabs[j].focus(); }
    });
  });
  GL.goTab((location.hash || '').replace('#', '') || 'overview', true);
  window.addEventListener('beforeprint', () => { GL.TABS.forEach((t) => document.querySelectorAll('#' + t).forEach((s) => { s.hidden = false; })); });
  window.addEventListener('afterprint', () => GL.goTab(GL.state.tab));

  /* CSV export (Excel and PDF are in export.js) */
  let downloads = null;
  const showMsg = (key) => {
    document.querySelectorAll('[data-msg]').forEach((m) => { m.hidden = m.dataset.msg !== key; });
    clearTimeout(showMsg.t); showMsg.t = setTimeout(() => document.querySelectorAll('[data-msg]').forEach((m) => { m.hidden = true; }), 5000);
  };
  claude.use('downloads').then((d) => { downloads = d; document.querySelectorAll('.gl-export').forEach((b) => { b.hidden = !d; }); });
  const cell = (v) => { const s = v == null ? '' : String(v); return s.includes(',') || s.includes(Q) || s.includes(NL) ? Q + s.split(Q).join(Q + Q) + Q : s; };
  const exportCsv = async () => {
    const rows = GL.tableRows();
    if (!downloads || !rows) return;
    if (!rows.length) { showMsg('none'); return; }
    const rate = GL.rate(), p = dash.params();
    const head = ['Loan account', 'Customer', 'Branch', 'RM', 'Loan month', 'Karat', 'Pure gold (g)', 'Amount lent', 'POS', 'Interest', 'Owed now', '24K rate at loan', 'Gold value at loan', '24K rate today', 'Gold value today', 'Price change %', 'LTV at loan %', 'LTV today %', 'Top-up to 75% LTV', 'Zone', 'Underwater', 'Repayable at maturity', 'RBI cap %', 'LTV on maturity amount %', 'Over RBI cap', 'To pay to reach cap', 'Maturity month', 'Gold by karat', 'Rate used per karat (Rs/g)', 'Main ornament', 'Ornaments', 'ROI %', 'Interest as on', 'Interest days', 'Principal'];
    const lines = [head.map(cell).join(',')].concat(rows.map((r) => [r.loan, r.customer, r.branch, r.rm, GL.monthLabel(r.month), String(r.karat).split('/').join(' '), r.gold24_g, r.disbursed, r.pos, r.interest === null ? '' : r.interest, r.outstanding, r.rate24_at_loan, r.value_at_loan, rate, r.value_today, r.price_change_pct, r.ltv_at_loan_pct, r.ltv_today_pct, r.topup_75, GL.tierOf(r.tier).short, r.underwater, r.matamt, r.cap_pct, r.rbi_ltv_pct, r.rbi_breach, r.reduce_to_cap, GL.monthLabel(r.maturity), r.kg_text, String(r.rates_text).split('₹').join('Rs '), r.orn_main, r.orn_text, r.roi || '', r.asof, r.int_days, r.principal].map(cell).join(',')));
    const slug = (s) => String(s).toLowerCase().split(' ').filter(Boolean).join('-');
    const name = ['gold-loan-risk', p.tier ? slug(p.tier) : 'all-zones', p.branch ? slug(p.branch) : '', 'rate-' + rate].filter(Boolean).join('_') + '.csv';
    try { await downloads.save({ filename: name, data: String.fromCharCode(65279) + lines.join(NL) }); showMsg('saved'); }
    catch (e) { showMsg(e && e.code === 'declined' ? 'declined' : 'error'); }
  };
  document.querySelectorAll('[data-export=csv]').forEach((b) => b.addEventListener('click', exportCsv));

  /* Keep controls in step with the filters */
  dash.onData(() => {
    const r = GL.rate(), p = dash.params();
    document.querySelectorAll('#gl-rate-num, #gl-rate-range').forEach((el) => { if (document.activeElement !== el) el.value = r; });
    const anyOwn = GL.KARATS.some((k) => GL.overridden(k));
    document.querySelectorAll('[data-rate]').forEach((b) => { b.setAttribute('aria-pressed', Number(b.dataset.rate) === r && !anyOwn ? 'true' : 'false'); });
    document.querySelectorAll('input[data-karat]').forEach((inp) => {
      const k = Number(inp.dataset.karat);
      if (document.activeElement !== inp) inp.value = Math.round(GL.rateFor(k));
      inp.closest('.gl-kar').classList.toggle('gl-kov', GL.overridden(k));
    });
    document.querySelectorAll('#gl-kreset').forEach((b) => { b.disabled = !anyOwn; });
    document.querySelectorAll('[data-k24]').forEach((e) => { e.textContent = GL.rupee(r); });
    document.querySelectorAll('[data-sw]').forEach((e) => { e.style.background = dash.colors[+e.dataset.sw]; });
    document.querySelectorAll('#gl-tier').forEach((el) => { el.value = p.tier || ''; });
    document.querySelectorAll('[data-zone]').forEach((c) => { c.setAttribute('aria-pressed', p.tier === c.dataset.zone ? 'true' : 'false'); });
    const row = (() => { const d = dash.data('kpis'); return d.status === 'ok' && d.data ? d.data[0] : null; })();
    if (!row) return;
    document.querySelectorAll('.gl-pdown').forEach((e) => { e.hidden = !row.price_down; });
    document.querySelectorAll('.gl-pup').forEach((e) => { e.hidden = !!row.price_down; });
    document.querySelectorAll('.gl-pchg').forEach((e) => { e.classList.toggle('gl-bad', !!row.price_down); e.classList.toggle('gl-ok', !row.price_down); });
    document.querySelectorAll('.gl-vdown').forEach((e) => { e.hidden = !row.value_down; });
    document.querySelectorAll('.gl-vup').forEach((e) => { e.hidden = !!row.value_down; });
    document.querySelectorAll('.gl-vchg').forEach((e) => { e.classList.toggle('gl-bad', !!row.value_down); e.classList.toggle('gl-ok', !row.value_down); });
  });
})();
