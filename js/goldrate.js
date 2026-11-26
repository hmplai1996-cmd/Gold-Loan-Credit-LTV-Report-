/*
 * goldrate.js
 * Gold rate tab: daily rate fetched automatically, the RBI valuation rate, 5 years of history,
 * the rate on any date, and a log of the rates used.
 *
 * Indian 24K estimate for a date D = international price in rupees at the last close before D
 * (XAU/USD close × USD/INR ÷ 31.1035) × (1 + import duty in force on D) × market premium.
 * The premium is calibrated to a real Indian market rate (default: Goodreturns, 25 Nov 2026, ₹12,458).
 */
(function () {
  const OZ = 31.1035;
  const DAY = 864e5;
  /* Effective customs duty on gold: [in force until (exclusive), rate]. */
  const DUTY = [['2022-07-01', 0.1075], ['2024-07-24', 0.15], ['2026-05-13', 0.06], ['9999-12-31', 0.15]];
  const dutyOn = (d) => (DUTY.find((x) => d < x[0]) || DUTY[DUTY.length - 1])[1];
  const ANCHOR0 = { date: '2026-11-25', rate: 12458, src: 'Goodreturns 24K, 25 Nov 2026' };
  const KEY = { cache: 'gl-goldhist-v1', mode: 'gl-autorate-v1', anchor: 'gl-goldanchor-v1', log: 'gl-ratelog-v1', pick: 'gl-ratepick-v1' };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const todayISO = () => { const n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); };
  const addDays = (d, k) => iso(Date.parse(d + 'T00:00:00Z') + k * DAY);
  const fmtDate = (d) => { const [y, m, dd] = d.split('-'); return +dd + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1] + ' ' + y; };

  /* ---------- data ---------- */
  const base = String(window.GL_GOLD_HIST || '').split(';').filter(Boolean).map((s) => {
    const [d, usd, fx] = s.split(','); return { d: d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8), usd: +usd, fx: +fx };
  });
  const cache = store.get(KEY.cache, { pts: [], fetched: 0, spot: null });
  const G = window.GLGOLD = {
    closes: [], live: { status: 'idle', at: cache.fetched || 0, spot: cache.spot || null, msg: '' },
    range: '1Y', sel: '', anchor: store.get(KEY.anchor, ANCHOR0),
    mode: store.get(KEY.mode, 'rbi'), lastApplied: null
  };
  const merge = (pts) => {
    const m = new Map(G.closes.map((p) => [p.d, p]));
    pts.forEach((p) => { if (p && p.d && p.usd > 0 && p.fx > 0) m.set(p.d, { d: p.d, usd: +p.usd, fx: +p.fx }); });
    G.closes = [...m.values()].sort((a, b) => (a.d < b.d ? -1 : 1));
  };
  merge(base); merge(cache.pts || []);

  const parity = (p) => p.usd * p.fx / OZ;                       // international ₹ per gram, 24K
  const closeBefore = (d) => {                                    // last close strictly before date d
    const c = G.closes; let lo = 0, hi = c.length - 1, ans = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (c[mid].d < d) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  };
  const premium = () => {
    const i = closeBefore(G.anchor.date);
    return i < 0 ? 1 : G.anchor.rate / (parity(G.closes[i]) * (1 + dutyOn(G.anchor.date)));
  };
  /* Indian 24K estimate for date d (from the close before it). */
  const rateOn = (d) => { const i = closeBefore(d); if (i < 0) return null; const p = G.closes[i]; return { d, close: p, intl: parity(p), duty: dutyOn(d), rate: parity(p) * (1 + dutyOn(d)) * premium() }; };
  /* One point per close, dated the next day (the Indian rate it sets). */
  const series = () => { const k = premium(); return G.closes.map((p) => { const d = addDays(p.d, 1); return { d, t: Date.parse(d), rate: parity(p) * (1 + dutyOn(d)) * k }; }); };
  const lastDate = () => (G.closes.length ? G.closes[G.closes.length - 1].d : '');

  const today = () => {
    const t = todayISO(), prev = rateOn(t);
    if (!prev) return null;
    const from = addDays(t, -30), S = series().filter((s) => s.d > from && s.d <= t);
    const avg30 = S.length ? d3.mean(S, (s) => s.rate) : prev.rate;
    const sp = G.live.spot, fresh = sp && sp.asof && Date.now() - Date.parse(sp.asof) < 36 * 36e5;
    const live = fresh ? sp.inrg * (1 + dutyOn(t)) * premium() : null;
    const ago = (n) => { const r = rateOn(addDays(t, -n)); return r ? (prev.rate / r.rate - 1) * 100 : null; };
    return { date: t, prev: prev.rate, prevClose: prev.close.d, avg30, rbi: Math.min(prev.rate, avg30), live, liveAt: fresh ? sp.asof : null,
      w1: ago(7), m1: ago(30), y1: ago(365), y5: ago(1825) };
  };
  const valueFor = (mode) => { const t = today(); if (!t) return null; return Math.round(mode === 'live' ? (t.live || t.prev) : mode === 'close' ? t.prev : t.rbi); };
  const MODES = { rbi: 'RBI rule (lower of previous close and 30-day average)', close: 'Previous day’s close', live: 'Live price now', off: 'Off — I set the rate myself' };

  /* ---------- fetching ---------- */
  const getJSON = async (u) => { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(u.split('/')[2] + ' answered ' + r.status); return r.json(); };
  let busy = false;
  async function fetchLive(force) {
    if (busy) return;
    if (!force && G.live.at && Date.now() - G.live.at < 6 * 36e5 && G.live.status !== 'error') { G.live.status = G.live.status === 'idle' ? 'cached' : G.live.status; dash.refresh(); return; }
    busy = true; G.live.status = 'loading'; dash.refresh();
    try {
      const from = addDays(lastDate() || '2021-11-01', -12);
      const [h, fx, sp] = await Promise.all([
        getJSON('https://xaus.com/api/v1/history?days=' + Math.min(1825, Math.max(30, Math.ceil((Date.now() - Date.parse(from)) / DAY) + 5))),
        getJSON('https://api.frankfurter.dev/v1/' + from + '..?base=USD&symbols=INR'),
        getJSON('https://xaus.com/api/v1/spot?currency=INR&unit=gram&compact=1').catch(() => null)
      ]);
      const fd = Object.keys(fx.rates || {}).sort();
      let i = 0, last = null;
      const known = new Map(G.closes.map((p) => [p.d, p.fx]));
      const pts = (h.points || []).filter((p) => p.d >= from).map((p) => {
        while (i < fd.length && fd[i] <= p.d) { last = fx.rates[fd[i]].INR; i++; }
        return { d: p.d, usd: +p.c, fx: last || known.get(p.d) || (sp && sp.fx_rate) || 0 };
      });
      merge(pts);
      const spot = sp && sp.xau && sp.xau.price ? { inrg: +sp.xau.price, usd: +sp.spot_usd_oz, fx: +sp.fx_rate, asof: sp.price_as_of || sp.updated_at || new Date().toISOString() } : null;
      const newer = G.closes.filter((p) => p.d > (base.length ? base[base.length - 1].d : ''));
      G.live = { status: 'ok', at: Date.now(), spot, msg: '' };
      store.set(KEY.cache, { pts: newer, fetched: G.live.at, spot });
    } catch (e) {
      G.live.status = 'error';
      G.live.msg = /Failed to fetch|NetworkError|Load failed|blocked/i.test(String(e)) ? 'This view cannot reach the internet (claude.ai pages block outside connections, or you are offline).' : String(e.message || e);
    }
    busy = false;
    applyAuto('fetch');
    dash.refresh();
  }

  /* ---------- rate in use: automatic update and log ---------- */
  let pendingSource = '';
  const setRate = (v, source) => { pendingSource = source; dash.setParams({ rate: Math.round(v) }); };
  function applyAuto() {
    if (G.mode === 'off') return;
    const v = valueFor(G.mode);
    if (!v) return;
    G.lastApplied = { v, mode: G.mode, at: Date.now() };
    if (Math.abs(v - GL.rate()) >= 1) setRate(v, 'Automatic: ' + (G.mode === 'rbi' ? 'RBI rule' : G.mode === 'close' ? 'previous close' : 'live price'));
  }
  const setMode = (m) => { G.mode = MODES[m] ? m : 'off'; store.set(KEY.mode, G.mode); applyAuto(); dash.refresh(); };
  /* A rate typed or clicked by hand turns the automatic update off. */
  const manual = () => { if (G.mode !== 'off') { G.mode = 'off'; store.set(KEY.mode, 'off'); } pendingSource = 'Set by hand'; };
  document.querySelectorAll('#gl-rate-num').forEach((el) => el.addEventListener('change', manual));
  document.querySelectorAll('#gl-rate-range').forEach((el) => el.addEventListener('input', manual));
  document.querySelectorAll('[data-rate]').forEach((el) => el.addEventListener('click', manual));

  let lastRate = null;
  dash.onData(() => {
    const r = GL.rate();
    if (lastRate === null) { lastRate = r; return; }
    if (r === lastRate) return;
    lastRate = r;
    const log = store.get(KEY.log, []);
    const src = pendingSource || 'Set by hand';
    const top = log[0];
    if (top && top.rate === r && top.src === src) { pendingSource = ''; return; }
    if (top && top.src === src && Date.now() - Date.parse(top.at) < 15 * 60e3 && /hand/.test(src)) log.shift();   // slider drags: keep the last value only
    log.unshift({ at: new Date().toISOString(), rate: r, src });
    if (!/^Date: /.test(src)) G.pickDate = '';
    if (G.mode === 'off') store.set(KEY.pick, { rate: r, src, date: G.pickDate });
    store.set(KEY.log, log.slice(0, 40));
    pendingSource = '';
  });

  /* ---------- drawing ---------- */
  const E = GL.el;
  const chg = (v) => (v == null ? '—' : (v > 0 ? '▲ ' : v < 0 ? '▼ ' : '') + Math.abs(v).toFixed(1) + '%');
  const chgCls = (v) => (v == null ? '' : v < 0 ? 'gl-bad' : 'gl-good');

  dash.draw('gr_status', (el) => {
    el.replaceChildren();
    const L = G.live, last = lastDate();
    const dot = E('span', 'gl-dot ' + (L.status === 'ok' || L.status === 'cached' ? 'on' : L.status === 'loading' ? 'wait' : 'off'));
    let txt;
    if (L.status === 'loading') txt = 'Fetching today’s gold price…';
    else if (L.status === 'ok' || L.status === 'cached') txt = 'Live: updated ' + new Date(L.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' · checks again every 6 hours';
    else if (L.status === 'error') txt = 'Not updated: ' + L.msg + ' Showing rates up to ' + fmtDate(last) + '.';
    else txt = 'Rates up to ' + fmtDate(last) + '.';
    el.append(dot, E('span', null, txt));
  });

  dash.draw('gr_kpis', (el) => {
    el.replaceChildren();
    const t = today(); if (!t) return GL.empty(el, 'ok', 'No gold prices loaded.');
    const card = (label, v, note, cls, act) => {
      const c = E('div', 'gl-card gl-kpi' + (cls ? ' ' + cls : ''));
      c.append(E('div', 'gl-kh', label), E('p', 'gl-kv', v == null ? '—' : GL.rupee(v)));
      const n = E('p', 'gl-kn'); n.append(...note); c.append(n);
      if (act && v) { const b = E('button', 'gl-btn gl-mini', 'Use ' + GL.rupee(v)); b.type = 'button'; b.addEventListener('click', () => { manual(); pendingSource = act; dash.setParams({ rate: Math.round(v) }); }); c.append(b); }
      return c;
    };
    const ch = (v, lab) => { const s = E('span', chgCls(v), chg(v)); return [s, ' ' + lab]; };
    el.append(
      card('Live price now', t.live, t.liveAt ? ['at ', new Date(t.liveAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })] : ['Needs an internet connection'], '', 'Live price'),
      card('Previous day’s close', t.prev, [...ch(t.w1, 'in a week'), ' · ', ...ch(t.m1, 'in a month')], '', 'Previous close'),
      card('30-day average', t.avg30, [...ch(t.y1, 'in a year'), ' · ', ...ch(t.y5, 'in 5 years')], '', '30-day average'),
      card('RBI valuation rate', t.rbi, ['Lower of the two — use for LTV'], 'gl-kpi-hl', 'RBI rule')
    );
  });

  dash.draw('gr_auto', (el) => {
    el.replaceChildren();
    const lab = E('label', null, 'Update the rate in use automatically'); lab.htmlFor = 'gr-mode';
    const sel = E('select', 'dash-select'); sel.id = 'gr-mode';
    Object.entries(MODES).forEach(([k, v]) => { const o = E('option', null, v); o.value = k; o.selected = k === G.mode; sel.append(o); });
    sel.addEventListener('change', () => setMode(sel.value));
    const btn = E('button', 'gl-btn', G.live.status === 'loading' ? 'Fetching…' : 'Fetch now'); btn.type = 'button'; btn.disabled = G.live.status === 'loading';
    btn.addEventListener('click', () => fetchLive(true));
    const note = E('p', 'gl-hint');
    note.textContent = G.mode === 'off' ? 'The rate stays where you set it. Typing a rate or clicking a rate button turns automatic updates off.'
      : 'Rate in use now: ' + GL.rupee(GL.rate()) + '. It follows the ' + (G.mode === 'rbi' ? 'RBI rule' : G.mode === 'close' ? 'previous close' : 'live price') + ' each time the page opens and every 6 hours.';
    const w = E('div', 'gl-grauto'); const f = E('div', 'gl-field'); f.append(lab, sel); w.append(f, btn); el.append(w, note);
  });

  dash.draw('gr_line', (el) => {
    el.replaceChildren();
    const t = today(); if (!t) return;
    const a = E('a', null, G.mode === 'off' ? 'Gold rate tab' : 'change'); a.href = '#goldrate';
    a.addEventListener('click', (e) => { e.preventDefault(); GL.goTab('goldrate'); });
    if (G.mode === 'off') el.append('Automatic update is off · RBI rate today ' + GL.rupee(t.rbi) + ' · ', a);
    else el.append(E('span', 'gl-dot on'), 'Auto: ' + (G.mode === 'rbi' ? 'RBI rule' : G.mode === 'close' ? 'previous close' : 'live price') + ' ' + GL.rupee(valueFor(G.mode)) + ' · ', a);
  });

  /* Rate box: calendar (today by default), the last 1 year as a list, and quick picks. */
  const pickDate = (d) => {
    const r = rateOn(d); if (!r) return;
    manual(); G.pickDate = d; pendingSource = 'Date: ' + fmtDate(d);
    const o = { rate: Math.round(r.rate) }; GL.KARATS.forEach((k) => { o['r' + k] = ''; });
    dash.setParams(o);
  };
  dash.draw('gr_pick', {
    mount(el) {
      const row = E('div', 'gl-grpickrow');
      const f1 = E('div', 'gl-grpf'); const l1 = E('label', null, 'Rate on date'); l1.htmlFor = 'gr-ratedate';
      const di = E('input', 'gl-num'); di.type = 'date'; di.id = 'gr-ratedate';
      di.addEventListener('change', () => { if (di.value) pickDate(di.value); });
      f1.append(l1, di);
      const f2 = E('div', 'gl-grpf gl-grpf-wide'); const l2 = E('label', null, 'Last 1 year'); l2.htmlFor = 'gr-rateyear';
      const se = E('select', 'dash-select'); se.id = 'gr-rateyear';
      se.addEventListener('change', () => { if (se.value) pickDate(se.value); });
      f2.append(l2, se);
      row.append(f1, f2);
      const chips = E('div', 'gl-btns gl-grchips');
      el.append(row, chips);
      return { di, se, chips, built: '' };
    },
    update(el, m) {
      const t = todayISO(), first = addDays(t, -365);
      m.di.min = first; m.di.max = t;
      const sel = G.pickDate || (G.mode !== 'off' ? t : '');
      if (m.di.value !== (sel || t)) m.di.value = sel || t;
      /* one entry per trading day, newest first */
      const S = series().filter((s) => s.d > first && s.d <= t).reverse();
      const sig = (S[0] && S[0].d) + '|' + S.length + '|' + premium().toFixed(5);
      if (m.built !== sig) {
        m.se.replaceChildren();
        const o0 = E('option', null, 'Choose a day (' + S.length + ' trading days)'); o0.value = ''; m.se.append(o0);
        let mon = '', grp = null;
        S.forEach((s) => {
          const mm = s.d.slice(0, 7);
          if (mm !== mon) { mon = mm; grp = document.createElement('optgroup'); grp.label = GL.monthLabel(mm); m.se.append(grp); }
          const o = E('option', null, fmtDate(s.d) + ' — ' + GL.rupee(s.rate)); o.value = s.d; grp.append(o);
        });
        m.built = sig;
      }
      m.se.value = sel && S.some((s) => s.d === sel) ? sel : '';
      /* quick picks */
      m.chips.replaceChildren();
      const cur = GL.rate();
      [['Today', 0], ['1 week ago', 7], ['1 month ago', 30], ['3 months ago', 91], ['6 months ago', 182], ['1 year ago', 365]].forEach(([lab, n]) => {
        const d = addDays(t, -n), r = rateOn(d); if (!r) return;
        const v = Math.round(r.rate);
        const b = E('button', 'gl-btn', lab + ' ' + GL.rupee(v)); b.type = 'button';
        b.title = fmtDate(d) + ' (international close of ' + fmtDate(r.close.d) + ')';
        b.setAttribute('aria-pressed', String(v === cur && (G.pickDate === d || (!G.pickDate && n === 0 && G.mode !== 'off'))));
        b.addEventListener('click', () => pickDate(d));
        m.chips.append(b);
      });
    }
  });

  /* History chart */
  const RANGES = { '1M': 31, '3M': 92, '6M': 183, '1Y': 366, '3Y': 1096, '5Y': 1830 };
  dash.draw('gr_ranges', (el) => {
    el.replaceChildren();
    Object.keys(RANGES).forEach((k) => { const b = E('button', 'gl-btn', k); b.type = 'button'; b.setAttribute('aria-pressed', String(G.range === k)); b.addEventListener('click', () => { G.range = k; dash.refresh(); }); el.append(b); });
  });
  const valuerPoints = () => {
    const s = dash.data('scored'); if (s.status !== 'ok' || !s.data) return [];
    const m = new Map();
    s.data.forEach((r) => { if (r.auth && r.rate24_at_loan > 0) { const a = m.get(r.auth) || []; a.push(+r.rate24_at_loan); m.set(r.auth, a); } });
    return [...m.entries()].map(([d, v]) => ({ d, t: Date.parse(d), rate: d3.median(v), n: v.length })).sort((a, b) => a.t - b.t);
  };
  dash.draw('gr_chart', (el) => {
    el.replaceChildren();
    const S0 = series(); if (!S0.length) return GL.empty(el, 'ok', 'No gold prices loaded.');
    const end = S0[S0.length - 1].t, start = end - RANGES[G.range] * DAY;
    const S = S0.filter((s) => s.t >= start);
    const V = valuerPoints().filter((v) => v.t >= start);
    const W = GL.width(el), H = W < 520 ? 260 : 320, m = { l: 58, r: 14, t: 16, b: 28 };
    const svg = GL.svg(el, W, H, '24K gold rate history');
    const x = d3.scaleTime().domain([start, end]).range([m.l, W - m.r]);
    const lo = d3.min([...S, ...V], (s) => s.rate), hi = d3.max([...S, ...V, { rate: GL.rate() }], (s) => s.rate);
    const y = d3.scaleLinear().domain([Math.min(lo, GL.rate()) * 0.97, hi * 1.02]).nice().range([H - m.b, m.t]);
    svg.append('g').attr('class', 'gl-grid').attr('transform', 'translate(' + m.l + ',0)')
      .call(d3.axisLeft(y).ticks(W < 520 ? 4 : 6).tickSize(-(W - m.l - m.r)).tickFormat((v) => '₹' + d3.format(',')(v)))
      .call((g) => g.select('.domain').remove());
    svg.append('g').attr('class', 'gl-axis').attr('transform', 'translate(0,' + (H - m.b) + ')')
      .call(d3.axisBottom(x).ticks(W < 520 ? 4 : 7).tickSizeOuter(0));
    const line = d3.line().x((s) => x(s.t)).y((s) => y(s.rate)).curve(d3.curveMonotoneX);
    const area = d3.area().x((s) => x(s.t)).y0(H - m.b).y1((s) => y(s.rate)).curve(d3.curveMonotoneX);
    svg.append('path').datum(S).attr('d', area).style('fill', 'var(--gold)').style('opacity', 0.12);
    svg.append('path').datum(S).attr('d', line).style('fill', 'none').style('stroke', '#b5860c').style('stroke-width', 2);
    /* rate in use */
    const ry = y(GL.rate());
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', ry).attr('y2', ry).style('stroke', 'var(--color-bad)').style('stroke-dasharray', '5 4');
    svg.append('text').attr('x', W - m.r - 4).attr('y', ry - 6).attr('text-anchor', 'end').attr('class', 'gl-val').style('fill', 'var(--color-bad)').text('Rate in use ' + GL.rupee(GL.rate()));
    /* valuer rates on loan days */
    svg.append('g').selectAll('circle').data(V).join('circle').attr('cx', (v) => x(v.t)).attr('cy', (v) => y(v.rate)).attr('r', 3)
      .style('fill', 'var(--chart-1)').style('opacity', 0.75);
    /* selected date */
    if (G.sel) { const st = Date.parse(G.sel); if (st >= start && st <= end + DAY) svg.append('line').attr('x1', x(st)).attr('x2', x(st)).attr('y1', m.t).attr('y2', H - m.b).style('stroke', 'var(--color-fg-muted)').style('stroke-dasharray', '2 3'); }
    /* hover + click to pick a date */
    const tip = GL.tip(el), bis = d3.bisector((s) => s.t).center;
    const dotH = svg.append('circle').attr('r', 4.5).style('fill', '#b5860c').style('stroke', 'var(--color-panel)').style('stroke-width', 2).style('display', 'none');
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).style('fill', 'transparent').style('cursor', 'pointer')
      .on('mousemove', (ev) => {
        const [mx] = d3.pointer(ev); const s = S[bis(S, x.invert(mx))]; if (!s) return;
        dotH.style('display', null).attr('cx', x(s.t)).attr('cy', y(s.rate));
        const v = V.find((q) => q.d === s.d);
        const [px, py] = d3.pointer(ev, el);
        tip.show([fmtDate(s.d), '24K estimate: ' + GL.rupee(s.rate), '22K: ' + GL.rupee(s.rate * 22 / 24)].concat(v ? ['Your valuers: ' + GL.rupee(v.rate) + ' (' + v.n + ' loans)'] : []).concat(['Click to see this date']), px, py);
      })
      .on('mouseleave', () => { tip.hide(); dotH.style('display', 'none'); })
      .on('click', (ev) => { const [mx] = d3.pointer(ev); const s = S[bis(S, x.invert(mx))]; if (s) { G.sel = s.d; dash.refresh(); } });
  });

  dash.draw('gr_years', (tb) => {
    tb.replaceChildren();
    const S = series(); if (!S.length) return;
    const by = d3.groups(S, (s) => s.d.slice(0, 4));
    let prevEnd = null;
    by.forEach(([yr, v]) => {
      const tr = E('tr'); const avg = d3.mean(v, (s) => s.rate), hi = d3.max(v, (s) => s.rate), lo = d3.min(v, (s) => s.rate), endR = v[v.length - 1].rate;
      const c = prevEnd ? (endR / prevEnd - 1) * 100 : null;
      [[yr + (yr === todayISO().slice(0, 4) ? ' (so far)' : v.length < 200 ? ' (part)' : '')], [GL.rupee(avg), 1], [GL.rupee(lo), 1], [GL.rupee(hi), 1], [GL.rupee(endR), 1], [c == null ? '—' : chg(c), 1, chgCls(c)]].forEach(([t, n, cls]) => { const td = E('td', (n ? 'n' : '') + (cls ? ' ' + cls : ''), t); tr.append(td); });
      tb.append(tr); prevEnd = endR;
    });
  });

  /* Rate on a chosen date */
  dash.draw('gr_day', (el) => {
    el.replaceChildren();
    const first = G.closes.length ? addDays(G.closes[0].d, 1) : '';
    const d = G.sel || todayISO();
    const inp = document.getElementById('gr-date');
    if (inp) { inp.min = first; inp.max = todayISO(); if (inp.value !== d) inp.value = d; }
    const r = rateOn(d);
    if (!r) { el.append(E('p', 'gl-empty', 'No price for that date — choose a date after ' + fmtDate(first) + '.')); return; }
    const head = E('p', 'gl-grday-h');
    head.append(E('b', null, fmtDate(d)), ' · based on the international close of ' + fmtDate(r.close.d) + ': $' + d3.format(',.1f')(r.close.usd) + ' an ounce at ₹' + r.close.fx.toFixed(2) + ' a dollar · import duty ' + (r.duty * 100).toFixed(r.duty === 0.1075 ? 2 : 0) + '%');
    const grid = E('div', 'gl-grkar');
    [24, 23, 22, 21, 20, 19, 18].forEach((k) => {
      const c = E('div', 'gl-kar'); c.append(E('b', null, k + 'K'), E('span', null, GL.rupee(r.rate * k / 24) + ' /g'), E('small', null, GL.rupee(r.rate * k / 24 * 10) + ' /10g')); grid.append(c);
    });
    const v = valuerPoints().find((q) => q.d === d);
    const t = today();
    const foot = E('p', 'gl-hint');
    if (t) foot.append('Compared with the rate in use (' + GL.rupee(GL.rate()) + '): ', E('span', chgCls(GL.rate() / r.rate - 1), chg((GL.rate() / r.rate - 1) * 100)), '. ');
    if (v) foot.append('Your valuers used ' + GL.rupee(v.rate) + ' (24K) on ' + v.n + ' loans that day.');
    const b = E('button', 'gl-btn', 'Use this date’s rate (' + GL.rupee(r.rate) + ')'); b.type = 'button';
    b.addEventListener('click', () => { manual(); pendingSource = 'History: ' + fmtDate(d); dash.setParams({ rate: Math.round(r.rate) }); });
    el.append(head, grid, foot, b);
  });

  dash.draw('gr_log', (tb) => {
    tb.replaceChildren();
    const log = store.get(KEY.log, []);
    if (!log.length) { const tr = E('tr'); const td = E('td', 'gl-empty', 'No changes yet. Every change to the rate in use is listed here, in this browser.'); td.colSpan = 3; tr.append(td); tb.append(tr); return; }
    log.forEach((l) => { const tr = E('tr'); tr.append(E('td', null, new Date(l.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })), E('td', 'n', GL.rupee(l.rate)), E('td', null, l.src)); tb.append(tr); });
  });

  dash.draw('gr_calib', (el) => {
    el.replaceChildren();
    const k = premium();
    const p = E('p', 'gl-sub');
    p.textContent = 'Calibrated to ' + G.anchor.src + ' (' + GL.rupee(G.anchor.rate) + '). Market premium over import parity: ' + ((k - 1) * 100).toFixed(1) + '%. Duty used: 10.75% until 30 Jun 2022, 15% to 23 Jul 2024, 6% to 12 May 2026, 15% since 13 May 2026.';
    const row = E('div', 'gl-grauto');
    const f = E('div', 'gl-field'); const lab = E('label', null, 'Today’s market 24K rate (IBJA or your branch rate), ₹ per gram'); lab.htmlFor = 'gr-anchor';
    const inp = E('input', 'gl-num'); inp.id = 'gr-anchor'; inp.type = 'number'; inp.min = 1000; inp.max = 50000; inp.inputMode = 'numeric'; inp.placeholder = 'e.g. 12458';
    f.append(lab, inp);
    const b = E('button', 'gl-btn', 'Calibrate'); b.type = 'button';
    b.addEventListener('click', () => { const v = Math.round(+inp.value); if (!(v >= 1000 && v <= 50000)) { inp.focus(); return; } G.anchor = { date: todayISO(), rate: v, src: 'your rate on ' + fmtDate(todayISO()) }; store.set(KEY.anchor, G.anchor); applyAuto(); dash.refresh(); });
    const r = E('button', 'gl-btn', 'Reset'); r.type = 'button';
    r.addEventListener('click', () => { G.anchor = ANCHOR0; store.set(KEY.anchor, ANCHOR0); applyAuto(); dash.refresh(); });
    row.append(f, b, r);
    el.append(p, row);
  });

  document.querySelectorAll('#gr-date').forEach((inp) => inp.addEventListener('change', () => { if (inp.value) { G.sel = inp.value; dash.refresh(); } }));
  document.querySelectorAll('#gr-log-clear').forEach((b) => b.addEventListener('click', () => { store.set(KEY.log, []); dash.refresh(); }));

  /* Start: restore the last rate chosen by hand (automatic update off), or apply the automatic rate; then fetch. */
  const saved = store.get(KEY.pick, null);
  if (G.mode === 'off' && saved && saved.rate >= 1000) { G.pickDate = saved.date || ''; pendingSource = saved.src || 'Set by hand'; dash.setParams({ rate: saved.rate }); }
  applyAuto();
  fetchLive(false);
  setInterval(() => fetchLive(true), 6 * 36e5);
})();
