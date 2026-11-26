/*
 * core.js
 * Shared helpers (window.GL) and every calculation the dashboard shows.
 * Calculations re-run whenever the data or a filter changes.
 */
window.GL = (function () {
  const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const TABS = ['overview', 'goldrate', 'rbi', 'ornaments', 'alm', 'branches', 'customers', 'advisor', 'update', 'method'];
  const TEXT_KEYS = ['loan', 'customer', 'branch', 'rm', 'month', 'tier'];
  const api = {
    DEFAULT_RATE: 12458,
    KARATS: [18, 19, 20, 21, 22, 23],
    TABS,
    TEXT_KEYS,
    state: { q: '', sort: 'ltv_today_pct', dir: 'desc', page: 1, size: 25, detail: '', bsort: 'red_outstanding_lakh', bdir: 'desc', tab: 'overview' },
    TIERS: [
      { key: 'RED', label: 'Red zone', short: 'Red', desc: 'LTV 90% or more', color: 'var(--color-bad)' },
      { key: 'AMBER', label: 'Amber zone', short: 'Amber', desc: 'LTV 75% to 90%', color: 'var(--color-warn)' },
      { key: 'GREEN', label: 'Green zone', short: 'Green', desc: 'LTV below 75%', color: 'var(--color-ok)' }
    ],
    rate() { const r = Number(dash.params().rate); return r > 0 ? r : api.DEFAULT_RATE; },
    /* Rate per gram for a karat: your own rate if typed in, else 24K rate × karat ÷ 24. */
    rateFor(k) { const o = Number(dash.params()['r' + k]); return k !== 24 && o > 0 ? o : api.rate() * k / 24; },
    autoRate(k) { return Math.round(api.rate() * k / 24); },
    overridden(k) { return Number(dash.params()['r' + k]) > 0; },
    rupee: (v) => '₹' + inr.format(Math.round(v || 0)),
    int: (v) => inr.format(Math.round(v || 0)),
    cr: (v) => '₹' + Number(v || 0).toFixed(2) + ' Cr',
    lakh: (v) => '₹' + Number(v || 0).toFixed(1) + ' L',
    pct: (v) => Number(v || 0).toFixed(1) + '%',
    signed: (v) => (v > 0 ? '+' : '') + Number(v || 0).toFixed(1) + '%',
    monthLabel(m) { if (!m) return ''; return MONTHS[+String(m).slice(5, 7) - 1] + ' ' + String(m).slice(0, 4); },
    monthShort(m) { return MONTHS[+String(m).slice(5, 7) - 1] || ''; },
    tierOf(k) { return api.TIERS.find((t) => t.key === k) || api.TIERS[2]; },
    /* Ornament groups used in the analysis (Maharashtra haar types grouped with necklaces). */
    ORN_GROUPS: ['Mangalsutra', 'Necklaces & haars', 'Earrings', 'Chains', 'Rings', 'Bangles & bracelets', 'Pendants & coins', 'Other'],
    ornGroup(t) {
      const x = String(t || '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
      if (/MANGAL/.test(x)) return 'Mangalsutra';
      if (/HAAR|HAR\b|NECK|MOHAN|BORMAL|GALSAR|THUSHI|MAAL|MALA|CHOKER/.test(x)) return 'Necklaces & haars';
      if (/EAR|TOPS|JHUM|KUDI|BALI/.test(x)) return 'Earrings';
      if (/CHAIN/.test(x)) return 'Chains';
      if (/RING|ANGTHI/.test(x)) return 'Rings';
      if (/BANG|BRACE|KADA|PATLI|BALE/.test(x)) return 'Bangles & bracelets';
      if (/PEND|LOCKET|COIN|BAR\b|BISCUIT/.test(x)) return 'Pendants & coins';
      return 'Other';
    },
    /* RBI 2025 Directions: LTV cap by the borrower's total gold-loan amount (consumption loans). */
    CAPS: [{ max: 250000, cap: 0.85, label: 'Up to ₹2.5 lakh' }, { max: 500000, cap: 0.80, label: '₹2.5–5 lakh' }, { max: Infinity, cap: 0.75, label: 'Above ₹5 lakh' }],
    addDays(d, k) { return new Date(Date.parse(d + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10); },
    daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); },
    monthEnd(d) { const y = +d.slice(0, 4), m = +d.slice(5, 7); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); },
    /* Daily interest at ROI/365 from `from` to `to` (both counted), added to the balance at every month end. */
    accrue(bal, roi, from, to) {
      let b = +bal || 0, d = from, acc = 0, days = 0;
      if (!roi || !from || to < from) return { balance: b, accrued: 0, owed: b, days: 0 };
      for (let guard = 0; d <= to && guard < 400; guard++) {
        const me = api.monthEnd(d), end = me < to ? me : to, n = api.daysBetween(d, end) + 1, i = b * roi / 100 / 365 * n;
        days += n;
        if (end === me) { b = Math.round((b + i) * 100) / 100; acc = 0; } else acc = i;
        d = api.addDays(end, 1);
      }
      return { balance: b, accrued: acc, owed: b + acc, days };
    },
    todayISO() { const n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); },
    capFor(total) { return (api.CAPS.find((c) => total <= c.max) || api.CAPS[2]).cap; },
    zoneOfLtv(p) { return p >= 90 ? 'RED' : p >= 75 ? 'AMBER' : 'GREEN'; },
    /* Count a number up or down to its new value (skipped when motion is reduced). */
    animateNumber(el, value, fmt) {
      const from = typeof el.__glv === 'number' ? el.__glv : null;
      el.__glv = value;
      cancelAnimationFrame(el.__glraf || 0);
      if (from === null || from === value || api.reduced() || !isFinite(value)) { el.textContent = fmt(value); return; }
      const t0 = performance.now(), dur = 450, ip = d3.interpolateNumber(from, value);
      const step = (t) => { const k = Math.min(1, (t - t0) / dur); el.textContent = fmt(ip(d3.easeCubicOut(k))); if (k < 1) el.__glraf = requestAnimationFrame(step); };
      el.__glraf = requestAnimationFrame(step);
    },
    /* Entry motion only the first time a chart draws with data. */
    firstDraw(el) { if (el.__gldrawn || api.reduced()) return false; el.__gldrawn = true; return true; },
    width(el) { return Math.max(260, Math.floor(el.clientWidth || 600)); },
    reduced() { return !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches; },
    el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; },
    empty(el, status, msg) {
      const text = status === 'error' ? 'This part could not load. Reload the page to try again.' : status === 'loading' ? 'Loading…' : (msg || 'Nothing to show for these filters.');
      el.replaceChildren(api.el('p', 'gl-empty', text));
    },
    textWidth(svg, strings) {
      const t = svg.append('text').attr('x', -9999).attr('y', -9999);
      let w = 0;
      strings.forEach((s) => { t.text(s); const m = t.node().getComputedTextLength(); w = Math.max(w, m > 0 ? m : String(s).length * 7); });
      t.remove();
      return w;
    },
    svg(el, W, H, label) { return d3.select(el).append('svg').attr('width', '100%').attr('viewBox', '0 0 ' + W + ' ' + H).attr('role', 'img').attr('aria-label', label); },
    tip(el) {
      const t = api.el('div', 'gl-tip'); t.hidden = true; el.append(t);
      return {
        show(lines, x, y) {
          t.replaceChildren(...lines.map((l, i) => api.el('div', i === 0 ? 'gl-tip-h' : null, l)));
          t.hidden = false;
          const w = t.offsetWidth, h = t.offsetHeight, W = el.clientWidth;
          let left = x + 14; if (left + w > W) left = Math.max(0, x - w - 14);
          t.style.left = left + 'px'; t.style.top = Math.max(0, y - h - 10) + 'px';
        },
        hide() { t.hidden = true; }
      };
    },
    searchRows(rows) {
      const q = api.state.q.trim().toLowerCase();
      if (!q) return rows;
      return rows.filter((r) => (r.customer + ' ' + r.loan + ' ' + r.rm + ' ' + r.branch).toLowerCase().includes(q));
    },
    sortRows(rows, key, dir) {
      const m = dir === 'asc' ? 1 : -1;
      return rows.slice().sort((a, b) => {
        const x = a[key] === null ? -Infinity : a[key], y = b[key] === null ? -Infinity : b[key];
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * m;
        return String(x).localeCompare(String(y)) * m;
      });
    },
    tableRows() {
      const v = dash.data('view');
      if (v.status !== 'ok' || !v.data) return null;
      return api.sortRows(api.searchRows(v.data), api.state.sort, api.state.dir);
    },
    goTab(id, quiet) {
      if (!TABS.includes(id)) id = 'overview';
      TABS.forEach((t) => {
        document.querySelectorAll('#' + t).forEach((s) => { s.hidden = t !== id; });
        document.querySelectorAll('[data-tab=' + t + ']').forEach((b) => { b.setAttribute('aria-selected', t === id ? 'true' : 'false'); b.tabIndex = t === id ? 0 : -1; });
      });
      api.state.tab = id;
      if (!quiet) dash.setLink(id);
    },
    showZone(t) {
      api.state.page = 1;
      dash.setParams({ tier: t });
      api.goTab('customers');
      document.querySelectorAll('#customers').forEach((s) => s.scrollIntoView({ block: 'start', behavior: api.reduced() ? 'auto' : 'smooth' }));
    }
  };
  return api;
})();

/* Each loan valued at the 24K rate chosen in the filters. */
dash.calc('scored', {
  inputs: ['loans'],
  fn: (loans) => {
    const P = dash.params(); const p = Number(P.rate); const rate = p > 0 ? p : 12458;
    const asof = /^\d{4}-\d{2}-\d{2}$/.test(P.asof || '') ? P.asof : GL.todayISO();
    const intMode = P.intmode === 'pos' ? 'pos' : P.intmode === 'simple' ? 'simple' : 'cap';
    const DATA_ASOF = (window.GL_CONFIG && GL_CONFIG.dataAsOf) || '2026-11-24';
    const rk = (k) => { const o = Number(P['r' + k]); return Number.isInteger(k) && k >= 18 && k <= 23 && o > 0 ? o : rate * k / 24; };
    /* Borrower totals (amount lent across all their gold loans) set the RBI cap for each loan. */
    const bkeyOf = (r) => (r.bkey ? String(r.bkey) : 'L:' + r.loan);
    const btot = new Map(), bcnt = new Map();
    loans.forEach((r) => { const k = bkeyOf(r); btot.set(k, (btot.get(k) || 0) + (+r.disbursed || 0)); bcnt.set(k, (bcnt.get(k) || 0) + 1); });
    return loans.map((r) => {
      let owed = +r.outstanding; const grams = +r.gold24_g, then = +r.value_at_loan, lent = +r.disbursed;
      const roi = Number(r.roi) > 0 ? +r.roi : null;
      /* Bullet loans: RBI measures LTV on the total repayable at maturity. */
      const matamt = Number(r.matamt) > 0 ? +r.matamt : roi ? Math.round(lent * (1 + roi / 100)) : owed;
      const bk = bkeyOf(r), bt = btot.get(bk) || lent, cap = GL.capFor(bt);
      const auth = r.auth || '';
      let maturity = '';
      if (/^\d{4}-\d{2}/.test(auth)) maturity = (+auth.slice(0, 4) + 1) + '-' + auth.slice(5, 7);
      else if (r.month) maturity = (+String(r.month).slice(0, 4) + 1) + String(r.month).slice(4, 7);
      /* Value each karat the customer pledged at its own rate: 22K gold at the 22K rate, 18K at the 18K rate, and so on. */
      let now = 0;
      const items = [];
      if (r.kg) String(r.kg).split('/').forEach((pair) => {
        const [k, g] = pair.split(':').map(Number);
        if (k > 0 && g > 0) { const rt = rk(k), r0 = (+r.rate24_at_loan || 0) * k / 24; items.push({ k, g, pure: g * k / 24, rate_then: r0, value_then: g * r0, rate_now: rt, value_now: g * rt }); now += g * rt; }
      });
      if (!(now > 0)) { now = grams * rate; items.length = 0; items.push({ k: 24, g: grams, pure: grams, rate_then: +r.rate24_at_loan || 0, value_then: then, rate_now: rate, value_now: now }); }
      const kg_text = items.map((it) => it.k + 'K ' + it.g.toFixed(2) + ' g').join(' + ');
      /* Ornament of each piece (from the report's OrnamentType), valued at its own karat. */
      const pieces = [];
      if (r.orn) String(r.orn).split('|').forEach((s) => {
        const [t, k, g, v] = s.split('~'); const kk = +k, gg = +g;
        if (kk > 0 && gg > 0) pieces.push({ type: t || 'Other', group: GL.ornGroup(t), k: kk, g: gg, then: +v || 0, now: gg * rk(kk) });
      });
      const pnow = pieces.reduce((a, p) => a + p.now, 0);
      pieces.forEach((p) => { p.share = pnow > 0 ? p.now / pnow : 0; });
      const orn_main = pieces.length ? pieces.reduce((a, b) => (b.now > a.now ? b : a)).group : 'Not recorded';
      const orn_text = pieces.map((p) => p.type + ' ' + p.k + 'K ' + p.g.toFixed(2) + ' g').join(' + ');
      const rates_text = items.map((it) => it.k + 'K ₹' + Math.round(it.rate_now).toLocaleString('en-IN')).join(', ');
      /* Interest due as on the chosen date.
         Month-end capitalisation (company method, matches the loan system's POS): interest accrues daily at ROI/365
         (sanction day counted) and is added to the balance on the last day of every month.
         The report's POS already holds interest capitalised up to the month end before the report date,
         so accrual restarts from the first of that month (or from the sanction date, or from an uploaded POS date). */
      const hasInt = r.interest !== undefined && r.interest !== null && r.interest !== '';
      const posv = r.pos !== undefined && r.pos !== null && r.pos !== '' ? +r.pos : owed;
      const principal = lent > 0 ? Math.min(posv, lent) : posv;
      let bal0, from;
      if (r.updated && r.as_on) { bal0 = r.incl === '1' ? posv : posv + (hasInt ? +r.interest : 0); from = GL.addDays(r.as_on, 1); }
      else {
        const pd = r.pos_asof || DATA_ASOF, mStart = pd.slice(0, 8) + '01';
        if (auth && auth > mStart) { bal0 = posv; from = auth; } else { bal0 = posv; from = mStart; }
        if (asof < from && auth) { bal0 = lent > 0 ? lent : posv; from = auth; }   // a date before the report: rebuild from the sanction date
      }
      let int_due, int_days, int_per_day, int_cap = 0, int_acc = 0, owedNew = owed;
      if (intMode === 'simple') {
        const st = auth || (r.month ? r.month + '-01' : '');
        int_days = st ? Math.max(0, GL.daysBetween(st, asof) + 1) : 0;
        int_per_day = roi ? principal * roi / 100 / 365 : 0;
        int_due = Math.round(int_per_day * int_days); owedNew = principal + int_due;
      } else {
        const a = GL.accrue(bal0, roi, from, asof);
        owedNew = a.owed; int_due = Math.round(owedNew - principal); int_days = auth ? Math.max(0, GL.daysBetween(auth, asof) + 1) : a.days;
        int_per_day = roi ? owedNew * roi / 100 / 365 : 0; int_cap = Math.round(a.balance - principal); int_acc = Math.round(a.accrued);
      }
      const roiMode = intMode !== 'pos';
      if (roiMode && roi) owed = Math.round(owedNew);
      const ltv = now > 0 ? owed / now : 9.99;
      return { loan: r.loan, customer: r.customer, branch: r.branch, rm: r.rm, month: r.month, karat: r.karat, items, kg_text, rates_text,
        pieces, orn_main, orn_text, gross_g: +r.gross_g || 0, stone_g: +r.stone_g || 0, bc: r.bc === '1' || r.bc === 1 || r.bc === true, pos_asof: r.pos_asof || '', as_on: r.as_on || '',
        net_g: +r.net_g, gold24_g: grams, disbursed: lent, outstanding: owed, rate24_at_loan: +r.rate24_at_loan,
        pos: posv, interest: roiMode && roi ? int_due : (hasInt ? +r.interest : null),
        principal: Math.round(principal), int_due, int_days, int_per_day: Math.round(int_per_day * 100) / 100, int_cap, int_acc, int_mode: intMode, asof,
        int_to_maturity: roi && auth ? Math.round((intMode === 'simple' ? principal * (1 + roi / 100) : GL.accrue(lent > 0 ? lent : posv, roi, auth, GL.addDays((+auth.slice(0, 4) + 1) + auth.slice(4), -1)).owed) - principal) : null,
        updated: r.updated || '', isnew: r.isnew || '',
        value_at_loan: then, value_today: Math.round(now),
        price_change_pct: then > 0 ? +((now / then - 1) * 100).toFixed(1) : 0,
        ltv_at_loan_pct: then > 0 ? +(lent / then * 100).toFixed(1) : 0,
        ltv_today_pct: +(ltv * 100).toFixed(1),
        topup_75: Math.max(0, Math.round(owed - 0.75 * now)),
        tier: ltv >= 0.9 ? 'RED' : ltv >= 0.75 ? 'AMBER' : 'GREEN',
        underwater: ltv >= 1 ? 'Yes' : 'No',
        roi, matamt, auth, maturity, bkey: bk, bor_total: bt, bor_loans: bcnt.get(bk) || 1, cap_pct: cap * 100,
        rbi_ltv_pct: now > 0 ? +(matamt / now * 100).toFixed(1) : 999,
        rbi_breach: now > 0 && matamt / now > cap ? 'Yes' : 'No',
        reduce_to_cap: Math.max(0, Math.round(matamt - cap * now)) };
    });
  }
});

/* Loans in the selected loan months, branch and RM (zone not applied). */
dash.calc('base', {
  inputs: ['scored'],
  fn: (scored) => {
    const p = dash.params();
    return scored.filter((r) => (!p.branch || r.branch === p.branch) && (!p.rm || r.rm === p.rm) && (!p.orn || r.orn_main === p.orn) && (!p.from || r.month >= p.from) && (!p.to || r.month <= p.to));
  }
});

/* Loans matching every filter, the risk zone included. */
dash.calc('view', {
  inputs: ['base'],
  fn: (base) => {
    const t = dash.params().tier || '';
    return t ? base.filter((r) => r.tier === t) : base;
  }
});

/* Headline totals. Zone counts use 'base' so each zone stays comparable. */
dash.calc('kpis', {
  inputs: ['view', 'base'],
  fn: (view, base) => {
    const p = Number(dash.params().rate); const rate = p > 0 ? p : 12458;
    const sum = (rows, f) => rows.reduce((s, r) => s + (+r[f] || 0), 0);
    const div = (a, b) => (b ? a / b : 0);
    const cr = (v) => +(v / 1e7).toFixed(2);
    const lent = sum(view, 'disbursed'), owed = sum(view, 'outstanding'), grams = sum(view, 'gold24_g');
    const then = sum(view, 'value_at_loan'), now = sum(view, 'value_today'), rateThen = div(then, grams);
    const red = base.filter((r) => r.tier === 'RED'), amber = base.filter((r) => r.tier === 'AMBER');
    const baseOwed = sum(base, 'outstanding');
    return [{ loans: view.length, base_loans: base.length,
      lent_cr: cr(lent), outstanding_cr: cr(owed), interest_pct: lent ? +((owed / lent - 1) * 100).toFixed(1) : 0,
      value_at_loan_cr: cr(then), value_today_cr: cr(now), value_change_cr: cr(Math.abs(now - then)), value_down: now < then ? 1 : 0,
      rate_at_loan: Math.round(rateThen), price_change_abs_pct: then ? +(Math.abs(now / then - 1) * 100).toFixed(1) : 0, price_down: now < then ? 1 : 0,
      ltv_at_loan_pct: +(div(lent, then) * 100).toFixed(1), ltv_today_pct: +(div(owed, now) * 100).toFixed(1),
      red: red.length, red_outstanding_cr: cr(sum(red, 'outstanding')), red_share_pct: +(div(sum(red, 'outstanding'), baseOwed) * 100).toFixed(1),
      amber: amber.length, amber_outstanding_cr: cr(sum(amber, 'outstanding')),
      underwater: base.filter((r) => r.underwater === 'Yes').length,
      topup_cr: cr(sum(view, 'topup_75')), topup_loans: view.filter((r) => r.topup_75 > 0).length,
      pos_cr: cr(sum(view, 'pos')), interest_cr: cr(view.reduce((s, r) => s + (r.interest || 0), 0)), principal_cr: cr(sum(view, 'principal')),
      interest_loans: view.filter((r) => r.interest !== null).length }];
  }
});

dash.calc('tiers', {
  inputs: ['base'],
  fn: (base) => {
    const total = base.reduce((s, r) => s + r.outstanding, 0);
    return ['RED', 'AMBER', 'GREEN'].map((tier) => {
      const rows = base.filter((r) => r.tier === tier); const amt = rows.reduce((s, r) => s + r.outstanding, 0);
      return { tier, loans: rows.length, outstanding_cr: +(amt / 1e7).toFixed(2), share_pct: total ? +(amt / total * 100).toFixed(1) : 0 };
    });
  }
});

dash.calc('months', {
  inputs: ['view'],
  fn: (view) => {
    const p = Number(dash.params().rate); const rate = p > 0 ? p : 12458;
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return [...new Set(view.map((r) => r.month))].sort().map((m) => {
      const S = view.filter((r) => r.month === m);
      const grams = S.reduce((s, r) => s + r.gold24_g, 0), then = S.reduce((s, r) => s + r.value_at_loan, 0);
      const lent = S.reduce((s, r) => s + r.disbursed, 0), owed = S.reduce((s, r) => s + r.outstanding, 0), now = S.reduce((s, r) => s + r.value_today, 0);
      const rateThen = grams ? then / grams : 0;
      return { month: m, label: names[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4), loans: S.length, rate_at_loan: Math.round(rateThen),
        price_change_pct: then ? +((now / then - 1) * 100).toFixed(1) : 0,
        ltv_at_loan_pct: then ? +(lent / then * 100).toFixed(1) : 0, ltv_today_pct: now ? +(owed / now * 100).toFixed(1) : 0,
        red: S.filter((r) => r.tier === 'RED').length, underwater: S.filter((r) => r.underwater === 'Yes').length };
    });
  }
});

/* Every branch for the chosen months, RM and zone, so branches can be compared. */
dash.calc('branches', {
  inputs: ['scored'],
  fn: (scored) => {
    const p = dash.params(); const t = p.tier || '';
    const rows = scored.filter((r) => (!p.rm || r.rm === p.rm) && (!p.from || r.month >= p.from) && (!p.to || r.month <= p.to) && (!t || r.tier === t));
    const L = (v) => +(v / 1e5).toFixed(1);
    return [...new Set(rows.map((r) => r.branch))].map((branch) => {
      const S = rows.filter((r) => r.branch === branch), R = S.filter((r) => r.tier === 'RED');
      const owed = S.reduce((s, r) => s + r.outstanding, 0), val = S.reduce((s, r) => s + r.value_today, 0);
      return { branch, loans: S.length, outstanding_lakh: L(owed), red: R.length, amber: S.filter((r) => r.tier === 'AMBER').length,
        underwater: S.filter((r) => r.underwater === 'Yes').length, red_outstanding_lakh: L(R.reduce((s, r) => s + r.outstanding, 0)),
        ltv_today_pct: val ? +(owed / val * 100).toFixed(1) : 0, topup_lakh: L(S.reduce((s, r) => s + r.topup_75, 0)) };
    }).sort((a, b) => b.red_outstanding_lakh - a.red_outstanding_lakh || b.outstanding_lakh - a.outstanding_lakh);
  }
});

/* Relationship managers ranked by red-zone money (used by the AI expert). */
dash.calc('rms', {
  inputs: ['view'],
  fn: (view) => {
    const L = (v) => +(v / 1e5).toFixed(1);
    return [...new Set(view.map((r) => r.rm))].map((rm) => {
      const S = view.filter((r) => r.rm === rm), R = S.filter((r) => r.tier === 'RED');
      return { rm, branch: [...new Set(S.map((r) => r.branch))].join(', '), loans: S.length, red: R.length,
        underwater: S.filter((r) => r.underwater === 'Yes').length, red_outstanding_lakh: L(R.reduce((s, r) => s + r.outstanding, 0)),
        topup_lakh: L(S.reduce((s, r) => s + r.topup_75, 0)) };
    }).sort((a, b) => b.red_outstanding_lakh - a.red_outstanding_lakh);
  }
});

/* Red-zone and underwater counts at 24K rates from ₹10,000 to ₹16,500. */
dash.calc('sensitivity', {
  inputs: ['base'],
  fn: (base) => {
    const p = Number(dash.params().rate); const now24 = p > 0 ? p : 12458;
    const out = [];
    for (let rate = 10000; rate <= 16500; rate += 250) {
      let red = 0, under = 0;
      base.forEach((r) => { const v = r.value_today * rate / now24; const l = v > 0 ? r.outstanding / v : 9.99; if (l >= 0.9) red++; if (l >= 1) under++; });
      out.push({ rate, red, underwater: under });
    }
    return out;
  }
});

/* RBI caps, stress test and maturity schedule for the loans matching the filters (zone not applied). */
dash.calc('rbi', {
  inputs: ['base'],
  fn: (base) => {
    const HAIRCUT = 0.10, COST = 1000;
    const sum = (rows, f) => rows.reduce((s, r) => s + (typeof f === 'function' ? f(r) : +r[f] || 0), 0);
    const cr = (v) => +(v / 1e7).toFixed(2);
    const owed = sum(base, 'outstanding'), val = sum(base, 'value_today'), mat = sum(base, 'matamt'), then = sum(base, 'value_at_loan');
    const br = base.filter((r) => r.rbi_breach === 'Yes');
    const bands = GL.CAPS.map((c) => {
      const S = base.filter((r) => Math.abs(r.cap_pct - c.cap * 100) < 0.01), B = S.filter((r) => r.rbi_breach === 'Yes');
      return { label: c.label, cap_pct: c.cap * 100, borrowers: new Set(S.map((r) => r.bkey)).size, loans: S.length, owed_cr: cr(sum(S, 'outstanding')),
        breach: B.length, breach_owed_cr: cr(sum(B, 'outstanding')), reduce_cr: cr(sum(S, 'reduce_to_cap')) };
    });
    const stress = [0, 5, 10, 15, 20].map((d) => {
      let under = 0, breach = 0, short = 0, nrvT = 0;
      base.forEach((r) => {
        const sv = r.value_today * (1 - d / 100), nrv = Math.max(0, sv * (1 - HAIRCUT) - COST);
        nrvT += nrv; short += Math.max(0, r.outstanding - nrv);
        if (sv <= 0 || r.outstanding / sv >= 1) under++;
        if (sv <= 0 || r.matamt / sv > r.cap_pct / 100) breach++;
      });
      return { decline: d, label: d ? '−' + d + '%' : 'Today', rate24: Math.round(GL.rate() * (1 - d / 100)), underwater: under, breach,
        ltv_pct: val ? +(owed / (val * (1 - d / 100)) * 100).toFixed(1) : 0, nrv_cr: cr(nrvT), shortfall_cr: cr(short) };
    });
    const mm = new Map();
    base.forEach((r) => { if (!r.maturity) return; const m = mm.get(r.maturity) || { month: r.maturity, loans: 0, due: 0, under: 0 }; m.loans++; m.due += r.matamt; if (r.underwater === 'Yes') m.under++; mm.set(r.maturity, m); });
    const maturity = [...mm.values()].sort((a, b) => (a.month < b.month ? -1 : 1)).map((m) => ({ month: m.month, label: GL.monthLabel(m.month), loans: m.loans, due_cr: cr(m.due), underwater: m.under }));
    const bor = new Map();
    base.forEach((r) => { const b = bor.get(r.bkey) || { total: r.bor_total, loans: 0 }; b.loans++; bor.set(r.bkey, b); });
    const B = [...bor.values()];
    const by = (f) => { const m = new Map(); base.forEach((r) => { if (r.underwater === 'Yes') m.set(r[f], (m.get(r[f]) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
    const today = new Date(); const ym = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    return [{ loans: base.length, owed_cr: cr(owed), value_cr: cr(val), mat_cr: cr(mat),
      rbi_ltv_pct: val ? +(mat / val * 100).toFixed(1) : 0, rbi_ltv_at_loan_pct: then ? +(mat / then * 100).toFixed(1) : 0,
      breach: br.length, breach_owed_cr: cr(sum(br, 'outstanding')), reduce_cr: cr(sum(base, 'reduce_to_cap')),
      over_at_loan: base.filter((r) => r.value_at_loan > 0 && r.matamt / r.value_at_loan > r.cap_pct / 100).length,
      within: base.filter((r) => r.rbi_ltv_pct < r.cap_pct - 3).length,
      borrowers: B.length, multi: B.filter((b) => b.loans > 1).length, multi_loans: sum(B.filter((b) => b.loans > 1), 'loans'),
      above25: B.filter((b) => b.total > 250000).length, above25_cr: cr(sum(B.filter((b) => b.total > 250000), 'total')), above5: B.filter((b) => b.total > 500000).length,
      underwater: base.filter((r) => r.underwater === 'Yes').length, under_owed_cr: cr(sum(base.filter((r) => r.underwater === 'Yes'), 'outstanding')),
      under_gap_lakh: +(sum(base.filter((r) => r.underwater === 'Yes'), (r) => r.outstanding - r.value_today) / 1e5).toFixed(1),
      month_interest_lakh: +(sum(base, (r) => (r.roi ? r.outstanding * r.roi / 100 / 12 : 0)) / 1e5).toFixed(1),
      overdue: base.filter((r) => r.maturity && r.maturity < ym).length,
      under_branches: by('branch').slice(0, 4), safe_lend_pct: Math.floor(0.85 / (1 + (d3.median(base, (r) => r.roi) || 24) / 100) * 100),
      bands, stress, maturity }];
  }
});

/* Gold by karat for the loans shown: weight, rate and value of each karat, and the LTV of loans by their main karat. */
dash.calc('karatmix', {
  inputs: ['view'],
  fn: (rows) => {
    const m = new Map();
    rows.forEach((r) => {
      const main = (r.items || []).reduce((a, b) => (b.value_now > (a ? a.value_now : -1) ? b : a), null);
      (r.items || []).forEach((it) => {
        const x = m.get(it.k) || { karat: it.k, loans: new Set(), g: 0, pure: 0, value_then: 0, value_now: 0, rate_now: it.rate_now, main_owed: 0, main_value: 0, main_loans: 0 };
        x.loans.add(r.loan); x.g += it.g; x.pure += it.pure; x.value_then += it.value_then; x.value_now += it.value_now; x.rate_now = it.rate_now;
        m.set(it.k, x);
      });
      if (main) { const x = m.get(main.k); x.main_owed += r.outstanding; x.main_value += r.value_today; x.main_loans++; }
    });
    return [...m.values()].sort((a, b) => b.karat - a.karat).map((x) => ({ karat: x.karat, loans: x.loans.size, net_g: +x.g.toFixed(2), pure_g: +x.pure.toFixed(2),
      rate_now: Math.round(x.rate_now), value_then: Math.round(x.value_then), value_now: Math.round(x.value_now),
      change_pct: x.value_then > 0 ? +((x.value_now / x.value_then - 1) * 100).toFixed(1) : 0,
      main_loans: x.main_loans, main_ltv_pct: x.main_value > 0 ? +(x.main_owed / x.main_value * 100).toFixed(1) : 0 }));
  }
});

/* Ornament analysis for the loans shown: every piece valued at its own karat; each loan's amount owed split across its pieces by value. */
dash.calc('ornmix', {
  inputs: ['view'],
  fn: (rows) => {
    const G = new Map(); const get = (g) => { if (!G.has(g)) G.set(g, { group: g, pieces: 0, loans: new Set(), main: 0, g: 0, kw: 0, low: 0, then: 0, now: 0, owed: 0, uw: 0, loss: 0, gross: 0, stone: 0 }); return G.get(g); };
    let tot = 0;
    rows.forEach((r) => {
      (r.pieces || []).forEach((p) => {
        const x = get(p.group); x.pieces++; x.loans.add(r.loan); x.g += p.g; x.kw += p.k * p.g; if (p.k <= 20) x.low += p.g;
        x.then += p.then; x.now += p.now; x.owed += r.outstanding * p.share; tot += p.now;
      });
      const m = get(r.orn_main); m.main++; if (r.underwater === 'Yes') m.uw++;
      m.loss += Math.max(0, r.outstanding - Math.max(0, r.value_today * 0.9 - 1000)); m.gross += r.gross_g; m.stone += r.stone_g;
    });
    return [...G.values()].filter((x) => x.pieces || x.main).sort((a, b) => b.now - a.now).map((x) => ({ group: x.group, pieces: x.pieces, loans: x.loans.size, main: x.main,
      net_g: Math.round(x.g), avg_k: x.g ? +(x.kw / x.g).toFixed(1) : 0, low_pct: x.g ? +(x.low / x.g * 100).toFixed(1) : 0,
      value_then: Math.round(x.then), value_now: Math.round(x.now), share: tot ? +(x.now / tot * 100).toFixed(1) : 0,
      change: x.then ? +((x.now / x.then - 1) * 100).toFixed(1) : 0, ltv: x.now ? +(x.owed / x.now * 100).toFixed(1) : 0,
      uw: x.uw, uw_pct: x.main ? +(x.uw / x.main * 100).toFixed(1) : 0, loss: Math.round(x.loss), stone_pct: x.gross ? +(x.stone / x.gross * 100).toFixed(1) : 0 }));
  }
});
dash.calc('ornbranch', {
  inputs: ['view'],
  fn: (rows) => {
    const B = new Map();
    rows.forEach((r) => (r.pieces || []).forEach((p) => { const b = B.get(r.branch) || { branch: r.branch, total: 0, g: {} }; b.total += p.now; b.g[p.group] = (b.g[p.group] || 0) + p.now; B.set(r.branch, b); }));
    return [...B.values()].sort((a, b) => b.total - a.total).map((b) => Object.assign({ branch: b.branch, value: Math.round(b.total) },
      Object.fromEntries(GL.ORN_GROUPS.map((g) => [g, b.total ? +((b.g[g] || 0) / b.total * 100).toFixed(1) : 0]))));
  }
});
dash.calc('ornmonth', {
  inputs: ['view'],
  fn: (rows) => {
    const M = new Map();
    rows.forEach((r) => (r.pieces || []).forEach((p) => { const m = M.get(r.month) || { month: r.month, total: 0, ms: 0, plain: 0, loans: new Set() }; m.total += p.then; if (p.group === 'Mangalsutra') m.ms += p.then; if (/Chains|Rings|Bangles|Pendants/.test(p.group)) m.plain += p.then; m.loans.add(r.loan); M.set(r.month, m); }));
    return [...M.values()].filter((m) => m.month).sort((a, b) => (a.month < b.month ? -1 : 1)).map((m) => ({ month: m.month, loans: m.loans.size, ms_pct: m.total ? +(m.ms / m.total * 100).toFixed(1) : 0, plain_pct: m.total ? +(m.plain / m.total * 100).toFixed(1) : 0 }));
  }
});
