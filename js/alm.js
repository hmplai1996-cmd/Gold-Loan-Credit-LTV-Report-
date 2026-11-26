/*
 * alm.js
 * ALM & income: month-on-month principal and interest for the loans shown, the interest split between
 * BUCC (interest expense at the BUCC rate) and FinCap (ROI minus the BUCC rate), salary and IT fees.
 *
 * Each 12-month bullet loan runs from its sanction date to the same date a year later. Interest accrues
 * daily at ROI/365 (sanction day counted) and is added to the balance at every month end (the loan
 * system's method). From the report month on, the balance restarts from the report's POS, so part-payments
 * already made are kept. At maturity the customer repays principal plus all interest.
 */
(function () {
  const E = GL.el;
  const KEY = 'gl-alm-settings-v1';
  const store = { get() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }, set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* private mode */ } } };
  const saved = store.get();
  if (saved) dash.setParams(saved);
  const settings = () => { const p = dash.params(); return { bucc: +p.bucc >= 0 ? +p.bucc : 13, salary: +p.salary >= 0 ? +p.salary : 1100000, itfee: +p.itfee >= 0 ? +p.itfee : 0.01, buccscope: p.buccscope === 'bc' ? 'bc' : 'all' }; };
  const DATA_ASOF = (window.GL_CONFIG && GL_CONFIG.dataAsOf) || '2026-11-24';
  const mLabel = (m) => GL.monthLabel(m);

  /* One loan's months: interest accrued, balance at month end, and the repayment at maturity. */
  function loanMonths(r) {
    const roi = +r.roi; if (!(roi > 0) || !r.auth) return null;
    const start = r.auth, mat = (+start.slice(0, 4) + 1) + start.slice(4), last = GL.addDays(mat, -1);
    const principal = r.disbursed > 0 ? Math.min(r.pos || r.disbursed, r.disbursed) : r.pos;
    const cutoff = (r.pos_asof || DATA_ASOF).slice(0, 8) + '01';
    let bal = r.disbursed > 0 ? r.disbursed : r.pos, d = start, acc = 0, switched = false;
    const out = [];
    for (let g = 0; d <= last && g < 30; g++) {
      if (!switched && d >= cutoff && r.pos > 0) { bal = r.pos; switched = true; }     // actual POS from the report month on
      const me = GL.monthEnd(d), end = me < last ? me : last, n = GL.daysBetween(d, end) + 1, i = bal * roi / 100 / 365 * n;
      if (end === me) { bal = Math.round((bal + i) * 100) / 100; acc = 0; } else acc = i;
      out.push({ m: d.slice(0, 7), int: i, bal: end === me ? bal : bal + acc, active: true });
      d = GL.addDays(end, 1);
    }
    const payoff = bal + acc;
    return { roi, principal, start: start.slice(0, 7), mat: mat.slice(0, 7), months: out, payoff, int_total: payoff - principal };
  }

  dash.calc('alm', {
    inputs: ['view'],
    fn: (rows) => {
      const S = settings(); const M = new Map();
      const get = (m) => { if (!M.has(m)) M.set(m, { month: m, loans: 0, disb: 0, prin_mat: 0, prin_end: 0, aum_end: 0, int: 0, bucc: 0, fin: 0, int_cash: 0, bucc_cash: 0, fin_cash: 0, loans_mat: 0 }); return M.get(m); };
      let skipped = 0, nb = 0;
      rows.forEach((r) => {
        const L = loanMonths(r); if (!L) { skipped++; return; }
        const share = (S.buccscope === 'all' || r.bc) ? Math.min(1, S.bucc / L.roi) : 0;
        if (share > 0) nb++;
        get(L.start).disb += L.principal;
        L.months.forEach((x) => {
          const t = get(x.m); t.int += x.int; t.bucc += x.int * share; t.fin += x.int * (1 - share);
          if (x.m !== L.mat) { t.loans++; t.prin_end += L.principal; t.aum_end += x.bal; }
        });
        const t = get(L.mat); t.prin_mat += L.principal; t.loans_mat++; t.int_cash += L.int_total; t.bucc_cash += L.int_total * share; t.fin_cash += L.int_total * (1 - share);
      });
      const months = [...M.keys()].sort();
      if (!months.length) return [];
      /* fill gaps so every month appears */
      const all = []; let m = months[0];
      while (m <= months[months.length - 1]) { all.push(m); const y = +m.slice(0, 4), mo = +m.slice(5, 7); m = mo === 12 ? (y + 1) + '-01' : y + '-' + String(mo + 1).padStart(2, '0'); }
      const repM = DATA_ASOF.slice(0, 7);
      let cumA = 0, cumC = 0;
      return all.map((mm) => {
        const t = get(mm), it = t.aum_end * S.itfee / 100, net = t.fin - S.salary - it, netc = t.fin_cash - S.salary - it;
        cumA += net; cumC += netc;
        return { month: mm, label: mLabel(mm), status: mm < repM ? 'Actual' : mm === repM ? 'Current' : 'Projected', loans: t.loans, loans_mat: t.loans_mat,
          disb: Math.round(t.disb), prin_mat: Math.round(t.prin_mat), prin_end: Math.round(t.prin_end), aum_end: Math.round(t.aum_end),
          int: Math.round(t.int), bucc: Math.round(t.bucc), fin: Math.round(t.fin), salary: S.salary, itfee: Math.round(it), net: Math.round(net), cum: Math.round(cumA),
          int_cash: Math.round(t.int_cash), bucc_cash: Math.round(t.bucc_cash), fin_cash: Math.round(t.fin_cash), cash_in: Math.round(t.prin_mat + t.int_cash), net_cash: Math.round(netc), cum_cash: Math.round(cumC),
          skipped, nb };
      });
    }
  });

  /* ---------- settings ---------- */
  dash.draw('alm_settings', {
    mount(el) {
      const mk = (id, label, attrs, hint) => {
        const f = E('div', 'gl-field'); const l = E('label', null, label); l.htmlFor = id;
        const i = E('input', 'gl-num'); i.id = id; Object.assign(i, attrs); f.append(l, i); if (hint) f.append(E('p', 'gl-hint', hint)); return [f, i];
      };
      const [f1, bucc] = mk('alm-bucc', 'BUCC interest rate (% a year)', { type: 'number', min: 0, max: 36, step: 0.25 }, 'Paid to BUCC out of each loan’s ROI');
      const [f2, sal] = mk('alm-salary', 'Salary per month (₹)', { type: 'number', min: 0, step: 10000 });
      const [f3, itf] = mk('alm-itfee', 'IT fees (% of AUM per month)', { type: 'number', min: 0, max: 5, step: 0.005 }, 'AUM = loan balance at month end');
      const f4 = E('div', 'gl-field'); const l4 = E('label', null, 'Apply the BUCC share to'); l4.htmlFor = 'alm-scope';
      const sc = E('select', 'dash-select'); sc.id = 'alm-scope';
      [['all', 'All loans'], ['bc', 'Only loans with a BUCC account number']].forEach(([v, t]) => { const o = E('option', null, t); o.value = v; sc.append(o); });
      f4.append(l4, sc);
      const reset = E('button', 'gl-btn', 'Reset to 13% · ₹11,00,000 · 0.01%'); reset.type = 'button';
      const row = E('div', 'gl-almset'); row.append(f1, f2, f3, f4, reset); el.append(row);
      const save = () => { const p = dash.params(); store.set({ bucc: p.bucc, salary: p.salary, itfee: p.itfee, buccscope: p.buccscope }); };
      const num = (i, k) => i.addEventListener('change', () => { const v = parseFloat(i.value); if (isFinite(v) && v >= 0) { dash.setParams({ [k]: v }); save(); } });
      num(bucc, 'bucc'); num(sal, 'salary'); num(itf, 'itfee');
      sc.addEventListener('change', () => { dash.setParams({ buccscope: sc.value }); save(); });
      reset.addEventListener('click', () => { dash.setParams({ bucc: 13, salary: 1100000, itfee: 0.01, buccscope: 'all' }); save(); });
      return { bucc, sal, itf, sc };
    },
    update(el, m) {
      const S = settings();
      if (document.activeElement !== m.bucc) m.bucc.value = S.bucc;
      if (document.activeElement !== m.sal) m.sal.value = S.salary;
      if (document.activeElement !== m.itf) m.itf.value = S.itfee;
      m.sc.value = S.buccscope;
    }
  });

  const rowsOf = () => { const d = dash.data('alm'); return d.status === 'ok' && d.data ? d.data : null; };
  const sum = (a, k) => a.reduce((s, r) => s + (r[k] || 0), 0);

  dash.draw('alm_example', (el) => {
    const S = settings(); el.replaceChildren();
    const roi = 24, rec = 10000, b = Math.round(rec * Math.min(1, S.bucc / roi));
    el.append('Example: ROI ' + roi + '%, BUCC ' + S.bucc + '%, FinCap ' + Math.max(0, roi - S.bucc) + '%. Interest received ' + GL.rupee(rec) + ' → BUCC interest expense ' + GL.rupee(b) + ', FinCap income ' + GL.rupee(rec - b) + '.');
  });

  dash.draw('alm_kpis', (el) => {
    el.replaceChildren();
    const R = rowsOf(); if (!R) return GL.empty(el, dash.data('alm').status);
    if (!R.length) return GL.empty(el, 'ok', 'No loans with an interest rate and sanction date.');
    const S = settings();
    const card = (cls, label, v, note) => { const c = E('div', 'gl-card gl-kpi ' + (cls || '')); c.append(E('div', 'gl-kh', label), E('p', 'gl-kv', v)); const n = E('p', 'gl-kn'); n.append(...note); c.append(n); return c; };
    const I = sum(R, 'int'), B = sum(R, 'bucc'), F = sum(R, 'fin'), SAL = sum(R, 'salary'), IT = sum(R, 'itfee'), N = F - SAL - IT;
    el.append(
      card('', 'Interest from customers', GL.cr(I / 1e7), ['Over the life of these loans, ' + R[0].label + ' – ' + R[R.length - 1].label]),
      card('', 'BUCC interest expense', GL.cr(B / 1e7), [S.bucc + '% out of each ROI · ' + GL.int(R[0].nb) + ' loans']),
      card('gl-kpi-hl', 'FinCap interest income', GL.cr(F / 1e7), [GL.pct(I ? F / I * 100 : 0) + ' of customer interest']),
      card(N < 0 ? 'gl-kpi-bad' : '', 'Net after salary and IT fees', (N < 0 ? '−' : '') + GL.cr(Math.abs(N) / 1e7), ['Salary ' + GL.cr(SAL / 1e7) + ' · IT fees ' + GL.lakh(IT / 1e5)])
    );
  });

  dash.draw('alm_line', (el) => {
    el.replaceChildren();
    const R = rowsOf(); if (!R || !R.length) return;
    const firstCash = R.find((r) => r.cash_in > 0);
    const neg = R.filter((r) => r.net < 0).length;
    const be = R.find((r, i) => r.cum >= 0 && i > 0 && R[i - 1].cum < 0);
    el.append('Customers repay ', E('b', null, GL.cr(sum(R, 'prin_mat') / 1e7) + ' principal + ' + GL.cr(sum(R, 'int_cash') / 1e7) + ' interest'), ' at maturity' + (firstCash ? ', starting ' + firstCash.label : '') + '. Until then FinCap’s share is earned (accrued) but not received in cash. ' +
      (neg ? neg + ' month' + (neg > 1 ? 's' : '') + ' show a loss after salary and IT fees on the accrual basis' + (be ? '; the running total turns positive in ' + be.label : '') + '.' : 'Every month covers salary and IT fees on the accrual basis.'));
  });

  /* Chart: FinCap interest income (accrual) vs salary + IT fees, by month */
  dash.draw('alm_chart', (el) => {
    const R = rowsOf(); const animate = GL.firstDraw(el); el.replaceChildren();
    if (!R || !R.length) return GL.empty(el, (dash.data('alm') || {}).status || 'ok', 'No data.');
    const W = GL.width(el), H = 280, m = { l: 56, r: 10, t: 14, b: 30 };
    const svg = GL.svg(el, W, H, 'FinCap interest income and expenses by month');
    const x = d3.scaleBand().domain(R.map((r) => r.month)).range([m.l, W - m.r]).padding(0.22);
    const xi = d3.scaleBand().domain(['fin', 'exp']).range([0, x.bandwidth()]).padding(0.08);
    const y = d3.scaleLinear().domain([0, d3.max(R, (r) => Math.max(r.fin, r.salary + r.itfee)) * 1.1 || 1]).nice().range([H - m.b, m.t]);
    svg.append('g').attr('transform', 'translate(' + m.l + ',0)').call(d3.axisLeft(y).ticks(5).tickFormat((v) => '₹' + (v / 1e5).toFixed(0) + 'L').tickSize(-(W - m.l - m.r)))
      .call((g) => g.select('.domain').remove()).selectAll('line').style('stroke', 'var(--color-border-line)');
    const repM = DATA_ASOF.slice(0, 7);
    if (R.some((r) => r.month > repM)) {
      const xs = x(R.find((r) => r.month > repM).month) - x.step() * x.paddingInner() / 2;
      svg.append('rect').attr('x', xs).attr('y', m.t).attr('width', W - m.r - xs).attr('height', H - m.t - m.b).style('fill', 'var(--color-fg-muted)').style('opacity', 0.06);
      svg.append('text').attr('x', xs + 6).attr('y', m.t + 12).style('font-size', '11px').style('fill', 'var(--color-fg-muted)').text('Projected');
    }
    const tip = GL.tip(el);
    const g = svg.selectAll('g.mo').data(R).join('g').attr('class', 'mo').attr('transform', (r) => 'translate(' + x(r.month) + ',0)');
    [['fin', 'var(--gold)', (r) => r.fin], ['exp', 'var(--color-bad)', (r) => r.salary + r.itfee]].forEach(([k, col, f]) => {
      const b = g.append('rect').attr('x', xi(k)).attr('width', xi.bandwidth()).attr('rx', 2).style('fill', col).style('opacity', k === 'exp' ? 0.55 : 0.9);
      if (animate) b.attr('y', H - m.b).attr('height', 0).transition().duration(600).attr('y', (r) => y(f(r))).attr('height', (r) => H - m.b - y(f(r)));
      else b.attr('y', (r) => y(f(r))).attr('height', (r) => H - m.b - y(f(r)));
    });
    const every = Math.ceil(R.length / Math.max(4, Math.floor(W / 60)));
    svg.selectAll('text.mx').data(R).join('text').attr('text-anchor', 'middle').attr('x', (r) => x(r.month) + x.bandwidth() / 2).attr('y', H - 10).style('font-size', '11px').style('fill', 'var(--color-fg-muted)')
      .text((r, i) => (i % every === 0 ? GL.monthShort(r.month) + " '" + r.month.slice(2, 4) : ''));
    g.append('rect').attr('x', 0).attr('width', x.bandwidth()).attr('y', m.t).attr('height', H - m.t - m.b).style('fill', 'transparent')
      .on('mousemove', (ev, r) => { const [mx, my] = d3.pointer(ev, el); tip.show([r.label + ' (' + r.status.toLowerCase() + ')', 'Interest from customers: ' + GL.lakh(r.int / 1e5), 'BUCC interest expense: ' + GL.lakh(r.bucc / 1e5), 'FinCap interest income: ' + GL.lakh(r.fin / 1e5), 'Salary + IT fees: ' + GL.lakh((r.salary + r.itfee) / 1e5), 'Net: ' + GL.lakh(r.net / 1e5)], mx, my); })
      .on('mouseleave', () => tip.hide());
  });

  /* Month-on-month table */
  const COLS = [
    ['label', 'Month', 0], ['status', '', 0], ['loans', 'Loans', 'int'], ['disb', 'Disbursed', 'rs'], ['prin_mat', 'Principal maturing', 'rs'], ['prin_end', 'Principal outstanding', 'rs'], ['aum_end', 'AUM (balance)', 'rs'],
    ['int', 'Interest accrued', 'rs'], ['bucc', 'BUCC interest exp.', 'rs'], ['fin', 'FinCap interest income', 'rs'], ['salary', 'Salary', 'rs'], ['itfee', 'IT fees', 'rs'], ['net', 'Net income', 'rs'], ['cum', 'Cumulative net', 'rs'],
    ['int_cash', 'Interest received', 'rs'], ['bucc_cash', 'To BUCC', 'rs'], ['fin_cash', 'FinCap share', 'rs'], ['cash_in', 'Total cash in', 'rs']
  ];
  const fmt = (v, t) => (t === 'rs' ? (v ? (v < 0 ? '−' : '') + GL.int(Math.abs(v)) : '—') : t === 'int' ? GL.int(v) : v);
  dash.draw('alm_table', (tb) => {
    tb.replaceChildren();
    const R = rowsOf();
    if (!R || !R.length) { const tr = E('tr'); const c = E('td', 'gl-empty', 'No data.'); c.colSpan = COLS.length; tr.append(c); tb.append(tr); return; }
    R.forEach((r) => {
      const tr = E('tr', r.status === 'Projected' ? 'gl-proj' : r.status === 'Current' ? 'gl-cur' : null);
      COLS.forEach(([k, , t]) => { const c = E('td', (t ? 'n' : '') + ((k === 'net' || k === 'cum') && r[k] < 0 ? ' gl-bad' : ''), k === 'status' ? '' : fmt(r[k], t)); if (k === 'status') c.append(E('span', 'gl-tag ' + r.status.toLowerCase(), r.status)); tr.append(c); });
      tb.append(tr);
    });
    const tot = E('tr', 'gl-ktot');
    COLS.forEach(([k, , t]) => {
      let v = '';
      if (k === 'label') v = 'Total';
      else if (['disb', 'prin_mat', 'int', 'bucc', 'fin', 'salary', 'itfee', 'net', 'int_cash', 'bucc_cash', 'fin_cash', 'cash_in'].includes(k)) v = GL.int(sum(R, k));
      tot.append(E('td', t ? 'n' : null, v));
    });
    tb.append(tot);
  });

  /* Excel download */
  document.querySelectorAll('[data-alm-xlsx]').forEach((b) => b.addEventListener('click', async () => {
    const R = rowsOf(); const msg = document.getElementById('alm-msg');
    if (!R || !R.length || !window.GLX) return;
    const S = settings();
    const head = COLS.map(([k, h]) => ({ v: k === 'status' ? 'Status' : h + (['label', 'status', 'loans'].includes(k) ? '' : ' (Rs)'), s: 1 }));
    const rows = [head].concat(R.map((r) => COLS.map(([k, , t]) => ({ v: k === 'label' ? r.label : r[k], s: t === 'rs' ? 2 : 0 }))));
    rows.push(COLS.map(([k, , t]) => ({ v: k === 'label' ? 'Total' : ['disb', 'prin_mat', 'int', 'bucc', 'fin', 'salary', 'itfee', 'net', 'int_cash', 'bucc_cash', 'fin_cash', 'cash_in'].includes(k) ? sum(R, k) : '', s: t === 'rs' ? 2 : 1 })));
    const a = [[{ v: (window.GL_BRAND ? GL_BRAND.name : ''), s: 5 }], [{ v: 'ALM & income report — month on month', s: 5 }], [{ v: 'Prepared' }, { v: new Date().toLocaleString('en-IN') }], [],
      [{ v: 'Setting', s: 1 }, { v: 'Value', s: 1 }],
      [{ v: 'BUCC interest rate' }, { v: S.bucc + '% a year, out of each loan’s ROI (BUCC share = ' + S.bucc + ' ÷ ROI of the interest)' }],
      [{ v: 'BUCC share applied to' }, { v: S.buccscope === 'all' ? 'All loans' : 'Only loans with a BUCC account number' }],
      [{ v: 'FinCap income' }, { v: 'Interest minus the BUCC share (ROI − ' + S.bucc + '%)' }],
      [{ v: 'Example' }, { v: 'ROI 24%: interest received Rs 10,000 → BUCC Rs ' + Math.round(10000 * S.bucc / 24) + ', FinCap Rs ' + (10000 - Math.round(10000 * S.bucc / 24)) }],
      [{ v: 'Salary' }, { v: 'Rs ' + GL.int(S.salary) + ' a month' }],
      [{ v: 'IT fees' }, { v: S.itfee + '% of AUM a month (AUM = loan balance at month end)' }],
      [{ v: 'Interest method' }, { v: 'Daily at ROI/365 (sanction day counted), added to the balance at every month end; balance restarts from the report POS in the report month' }],
      [{ v: 'Loans' }, { v: 'Active 12-month bullet loans shown on the dashboard (filters applied); repaid in full at maturity; closed loans are not included (no closure dates in the report)' }],
      [{ v: 'Accrual vs cash' }, { v: 'Interest accrued = income earned each month. Interest received = cash at maturity, when the customer repays principal plus all interest.' }]];
    try {
      const d = new Date(); const fn = 'ALM_Income_Report_' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.xlsx';
      await GLX.save(fn, GLX.workbook([{ name: 'ALM month on month', rows, widths: [11, 10, 8, 14, 14, 16, 15, 14, 14, 16, 12, 11, 13, 14, 14, 13, 13, 14], freeze: true }, { name: 'Assumptions', rows: a, widths: [26, 110] }]));
      if (msg) msg.textContent = 'Saved ' + fn + '.';
    } catch (e) { if (msg) msg.textContent = e && e.code === 'declined' ? 'Download cancelled.' : 'Downloads are not available in this view.'; }
  }));
})();
