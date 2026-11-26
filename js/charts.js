/*
 * charts.js
 * Headline numbers, filter dropdowns and every chart (d3 v7).
 */
(function () {
  const kpiRow = () => { const d = dash.data('kpis'); return d.status === 'ok' && d.data ? d.data[0] : null; };
  const bind = (name, field, fmt, animate) => dash.draw(name, (el) => {
    const st = dash.data('kpis').status; const row = kpiRow();
    if (st !== 'loading') el.classList.remove('dash-skeleton');
    if (!row) { el.textContent = '—'; return; }
    if (animate) GL.animateNumber(el, +row[field], fmt); else el.textContent = fmt(row[field]);
  });
  bind('t_red', 'red', GL.int); bind('t_loans', 'base_loans', GL.int); bind('t_redshare', 'red_share_pct', GL.pct); bind('t_under', 'underwater', GL.int);
  bind('k_owed', 'outstanding_cr', GL.cr, true); bind('k_lent', 'lent_cr', GL.cr); bind('k_interest', 'interest_pct', GL.pct);
  bind('k_valnow', 'value_today_cr', GL.cr, true); bind('k_valthen', 'value_at_loan_cr', GL.cr); bind('k_valchg', 'value_change_cr', GL.cr);
  bind('k_ltvnow', 'ltv_today_pct', GL.pct, true); bind('k_ltvthen', 'ltv_at_loan_pct', GL.pct);
  bind('k_red', 'red', GL.int, true); bind('k_redamt', 'red_outstanding_cr', GL.cr); bind('k_under', 'underwater', GL.int);
  bind('k_amber', 'amber', GL.int, true); bind('k_amberamt', 'amber_outstanding_cr', GL.cr);
  bind('k_topup', 'topup_cr', GL.cr, true); bind('k_topupn', 'topup_loans', GL.int);
  bind('k_ratethen', 'rate_at_loan', GL.rupee); bind('k_pricechg', 'price_change_abs_pct', GL.pct);
  bind('tick_red', 'red', GL.int, true); bind('tick_under', 'underwater', GL.int, true); bind('tick_ltv', 'ltv_today_pct', GL.pct, true);
  dash.draw('rate_now', (el) => { el.textContent = GL.rupee(GL.rate()); });
  dash.draw('rate_now2', (el) => { el.textContent = GL.rupee(GL.rate()); });
  dash.draw('tick_rate', (el) => { GL.animateNumber(el, GL.rate(), GL.rupee); });
  dash.draw('tick_22', (el) => { GL.animateNumber(el, GL.rateFor(22), GL.rupee); });
  dash.draw('tick_18', (el) => { GL.animateNumber(el, GL.rateFor(18), GL.rupee); });
  /* How many pledged items of each karat are in the book */
  dash.draw('kcount', (el) => {
    const d = dash.data('loans'); const k = Number(el.dataset.k);
    if (d.status !== 'ok' || !d.data) { el.textContent = ''; return; }
    if (!GL.__kc || GL.__kcRows !== d.data) {
      const c = {}; d.data.forEach((r) => String(r.karat || '').split('/').forEach((x) => { const n = Math.round(Number(x)); if (n) c[n] = (c[n] || 0) + 1; }));
      GL.__kc = c; GL.__kcRows = d.data;
    }
    const n = GL.__kc[k] || 0; el.textContent = n ? GL.int(n) + (n === 1 ? ' item pledged' : ' items pledged') : 'none pledged';
  });
  dash.draw('kauto', (el) => { const k = Number(el.dataset.k); el.textContent = GL.overridden(k) ? 'your rate · auto ' + GL.rupee(GL.autoRate(k)) : 'auto: 24K × ' + k + '/24'; });
  dash.draw('tab_red', (el) => { const r = kpiRow(); el.textContent = r && r.red ? GL.int(r.red) : ''; });

  /* Interest line on the "amount owed" card, only once an interest file has been applied */
  dash.draw('k_posint', (el) => {
    const r = kpiRow();
    el.replaceChildren();
    if (!r || !r.interest_loans) return;
    if (dash.params().intmode !== 'pos') { el.append('Principal ' + GL.cr(r.principal_cr) + ' + interest ' + GL.cr(r.interest_cr) + ' as on ' + GL.fmtDate(dash.params().asof || GL.todayISO())); return; }
    el.append('POS ' + GL.cr(r.pos_cr) + ' + interest ' + GL.cr(r.interest_cr));
  });

  dash.draw('range_label', (el) => {
    const d = dash.data('loans'); const p = dash.params();
    if (d.status !== 'ok' || !d.data || !d.data.length) { el.textContent = '—'; return; }
    const ms = [...new Set(d.data.map((r) => r.month))].filter(Boolean).sort();
    el.textContent = GL.monthLabel(p.from || ms[0]) + ' – ' + GL.monthLabel(p.to || ms[ms.length - 1]);
  });

  /* Where the data on screen came from */
  const dataText = () => {
    const info = window.GLDATA ? GLDATA.info : { base: '', events: [] };
    const last = info.events[info.events.length - 1];
    if (!last) return 'Data: ' + info.base;
    return 'Data: ' + info.base + ' · ' + last.label + ' (' + last.at + ')';
  };
  dash.draw('data_label', (el) => { el.textContent = dataText(); });
  dash.draw('data_label2', (el) => { el.textContent = dataText(); });

  /* Filter dropdowns whose choices come from the data */
  const monthSel = (name, key, allLabel) => dash.draw(name, (sel) => {
    const d = dash.data('loans');
    const ms = d.status === 'ok' && d.data ? [...new Set(d.data.map((r) => r.month))].filter(Boolean).sort() : [];
    sel.replaceChildren(new Option(allLabel, ''), ...ms.map((m) => new Option(GL.monthLabel(m), m)));
    sel.value = dash.params()[key] || '';
    sel.onchange = () => { GL.state.page = 1; dash.setParams({ [key]: sel.value }); };
  });
  monthSel('from_sel', 'from', 'Earliest');
  monthSel('to_sel', 'to', 'Latest');

  dash.draw('branch_sel', (sel) => {
    const d = dash.data('loans');
    const names = d.status === 'ok' && d.data ? [...new Set(d.data.map((r) => r.branch))].filter(Boolean).sort() : [];
    sel.replaceChildren(new Option('All branches', ''), ...names.map((n) => new Option(n, n)));
    sel.value = dash.params().branch || '';
    sel.onchange = () => { GL.state.page = 1; dash.setParams({ branch: sel.value, rm: '' }); };
  });
  dash.draw('rm_sel', (sel) => {
    const d = dash.data('loans'); const b = dash.params().branch || '';
    const rows = d.status === 'ok' && d.data ? d.data.filter((r) => !b || r.branch === b) : [];
    const names = [...new Set(rows.map((r) => r.rm))].filter(Boolean).sort();
    sel.replaceChildren(new Option(b ? 'All RMs in branch' : 'All RMs', ''), ...names.map((n) => new Option(n, n)));
    sel.value = dash.params().rm || '';
    sel.onchange = () => { GL.state.page = 1; dash.setParams({ rm: sel.value }); };
  });

  /* Profile area */
  dash.draw('user_chip', {
    mount(el) {
      el.replaceChildren();
      claude.use('user').then(async (u) => {
        if (!u) return;
        let name = '', role = '';
        try { const me = await u.me(); const id = me && (me.id || me); name = (me && me.name) || ''; if (!name && u.profiles && id) { const ps = await u.profiles([id]); name = (ps && ps[id] && ps[id].name) || ''; } } catch (e) { name = ''; }
        try { role = (await Promise.resolve(u.isOwner())) ? 'Owner' : (await Promise.resolve(u.canEdit())) ? 'Editor' : (GL_CONFIG.edition === 'github' ? 'Public view' : 'Viewer'); } catch (e) { role = ''; }
        const label = name || role; if (!label) return;
        const initials = label.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
        const box = GL.el('span'); box.append(GL.el('span', null, label));
        if (name && role) box.append(GL.el('span', null, ' · ' + role));
        el.replaceChildren(GL.el('span', 'gl-avatar', initials), box);
      });
    },
    update() {}
  });

  /* LTV gauge on the book LTV card */
  dash.draw('ltvgauge', (el) => {
    const r = kpiRow(); if (!r) { el.replaceChildren(); return; }
    const W = GL.width(el), H = el.clientHeight || 64, R = Math.min(W / 2 - 4, H - 6), cx = W / 2, cy = H - 2;
    const max = 120, ang = (v) => (-90 + Math.min(max, Math.max(0, v)) / max * 180) * Math.PI / 180;
    let svg = d3.select(el).select('svg');
    if (svg.empty()) svg = d3.select(el).append('svg').attr('role', 'img');
    svg.attr('viewBox', '0 0 ' + W + ' ' + H).attr('aria-label', 'Book LTV ' + GL.pct(r.ltv_today_pct) + ' on a scale where 75% is amber, 90% red and 100% underwater');
    svg.selectAll('*').remove();
    const g = svg.append('g').attr('transform', 'translate(' + cx + ',' + cy + ')');
    const arc = d3.arc().innerRadius(R - 9).outerRadius(R);
    [[0, 75, 'var(--color-ok)'], [75, 90, 'var(--color-warn)'], [90, 120, 'var(--color-bad)']].forEach(([a, b, c]) => {
      g.append('path').attr('d', arc({ startAngle: ang(a) + Math.PI / 2 - Math.PI / 2, endAngle: ang(b) })).style('fill', c).style('opacity', 0.9);
    });
    g.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', -(R - 13)).attr('transform', 'rotate(' + (ang(r.ltv_at_loan_pct) * 180 / Math.PI) + ')').style('stroke', 'var(--cds-chart-muted)').attr('stroke-width', 2).attr('stroke-dasharray', '2 3');
    const needle = g.append('g');
    needle.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', -(R - 4)).style('stroke', 'var(--color-fg)').attr('stroke-width', 3).attr('stroke-linecap', 'round');
    g.append('circle').attr('r', 5).style('fill', 'var(--color-fg)');
    const to = ang(r.ltv_today_pct) * 180 / Math.PI, from = typeof el.__glang === 'number' ? el.__glang : -90;
    el.__glang = to;
    if (GL.reduced()) needle.attr('transform', 'rotate(' + to + ')');
    else needle.attr('transform', 'rotate(' + from + ')').transition().duration(600).ease(d3.easeCubicOut).attrTween('transform', () => (t) => 'rotate(' + (from + (to - from) * t) + ')');
  });

  /* Zone donut */
  dash.draw('zonedonut', (el) => {
    const t = dash.data('tiers');
    if (t.status !== 'ok' || !t.data) return GL.empty(el, t.status);
    const total = d3.sum(t.data, (d) => d.outstanding_cr);
    if (!total) return GL.empty(el, 'ok', 'No loans match these filters.');
    const animate = GL.firstDraw(el);
    el.replaceChildren();
    const S = Math.min(GL.width(el), 260), H = S, R = S / 2 - 4, sel = dash.params().tier || '';
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', '0 0 ' + S + ' ' + H).attr('role', 'img').attr('aria-label', 'Amount owed by risk zone').style('max-width', S + 'px').style('margin', '0 auto');
    const g = svg.append('g').attr('transform', 'translate(' + S / 2 + ',' + H / 2 + ')');
    const pie = d3.pie().sort(null).value((d) => d.outstanding_cr).padAngle(0.02);
    const arc = d3.arc().innerRadius(R * 0.62).outerRadius(R).cornerRadius(6);
    const arcHi = d3.arc().innerRadius(R * 0.62).outerRadius(R + 4).cornerRadius(6);
    const tip = GL.tip(el);
    const paths = g.selectAll('path').data(pie(t.data.filter((d) => d.outstanding_cr > 0))).join('path')
      .style('fill', (d) => GL.tierOf(d.data.tier).color).style('cursor', 'pointer')
      .style('opacity', (d) => (!sel || sel === d.data.tier ? 1 : 0.35))
      .attr('d', (d) => (sel === d.data.tier ? arcHi(d) : arc(d)))
      .on('mousemove', (ev, d) => { const [mx, my] = d3.pointer(ev, el); tip.show([GL.tierOf(d.data.tier).label, GL.int(d.data.loans) + ' loans', GL.cr(d.data.outstanding_cr) + ' owed (' + GL.pct(d.data.share_pct) + ')', 'Click to open these accounts'], mx, my); })
      .on('mouseleave', () => tip.hide())
      .on('click', (ev, d) => GL.showZone(d.data.tier));
    if (animate) paths.transition().duration(700).ease(d3.easeCubicOut).attrTween('d', (d) => { const i = d3.interpolate({ startAngle: d.startAngle, endAngle: d.startAngle }, d); return (k) => arc(i(k)); });
    g.append('text').attr('text-anchor', 'middle').attr('y', -6).attr('class', 'gl-val').style('font-size', '22px').style('font-family', 'var(--font-anthropic-serif)').text(GL.cr(total));
    g.append('text').attr('text-anchor', 'middle').attr('y', 16).text('owed in total');
  });

  dash.draw('zonecards', (el) => {
    const t = dash.data('tiers'); el.replaceChildren();
    if (t.status !== 'ok' || !t.data) return;
    const sel = dash.params().tier || '';
    t.data.forEach((d) => {
      const T = GL.tierOf(d.tier);
      const b = GL.el('button', 'gl-zone gl-click ' + d.tier); b.type = 'button'; b.id = 'zone-' + d.tier.toLowerCase();
      b.setAttribute('aria-pressed', sel === d.tier ? 'true' : 'false');
      b.setAttribute('aria-label', T.label + ': open these accounts');
      const n = GL.el('span', 'gl-zn'); const sw = GL.el('i', 'gl-sw'); sw.style.background = T.color; n.append(sw, T.label);
      b.append(n, GL.el('span', 'gl-zd', T.desc), GL.el('span', 'gl-zbig', GL.int(d.loans) + ' loans'),
        GL.el('span', 'gl-zf', GL.cr(d.outstanding_cr) + ' owed · ' + GL.pct(d.share_pct)), GL.el('span', 'gl-go', 'View accounts →'));
      b.onclick = () => GL.showZone(d.tier);
      el.append(b);
    });
  });

  /* Price change since each month's loans, coloured by size of the fall */
  dash.draw('ratechart', (el) => {
    const m = dash.data('months');
    if (m.status !== 'ok' || !m.data || !m.data.length) return GL.empty(el, m.status);
    const animate = GL.firstDraw(el);
    el.replaceChildren();
    const rows = m.data, W = GL.width(el), H = 240, top = 20, bottom = 26;
    const svg = GL.svg(el, W, H, 'Change in the 24K gold price from the day of loan to today, by month of loan');
    const lo = Math.min(0, d3.min(rows, (d) => d.price_change_pct)), hi = Math.max(0, d3.max(rows, (d) => d.price_change_pct));
    const y = d3.scaleLinear().domain([lo * 1.2 - 1, hi * 1.2 + 1]).nice().range([H - bottom, top]);
    const left = GL.textWidth(svg, y.ticks(5).map((v) => v + '%')) + 10;
    const x = d3.scaleBand().domain(rows.map((d) => d.month)).range([left, W - 4]).padding(0.28);
    const fall = d3.scaleLinear().domain([0, Math.max(1, -lo)]).range([0.25, 1]).clamp(true);
    const colour = (v) => (v >= 0 ? 'var(--color-ok)' : d3.interpolateRgb('#f6b8a8', '#c42d1b')(fall(-v)));
    svg.append('g').attr('transform', 'translate(' + left + ',0)').call(d3.axisLeft(y).ticks(5).tickSize(-(W - left - 4)).tickFormat((v) => v + '%')).call((g) => g.select('.domain').remove());
    svg.append('line').attr('x1', left).attr('x2', W - 4).attr('y1', y(0)).attr('y2', y(0)).style('stroke', 'var(--cds-chart-axis)');
    const tip = GL.tip(el);
    const g = svg.selectAll('g.bar').data(rows).join('g').attr('class', 'bar');
    const bars = g.append('rect').attr('x', (d) => x(d.month)).attr('width', x.bandwidth()).attr('rx', 4).style('fill', (d) => colour(d.price_change_pct));
    const yTop = (d) => Math.min(y(0), y(d.price_change_pct)), hgt = (d) => Math.max(1, Math.abs(y(d.price_change_pct) - y(0)));
    if (animate) bars.attr('y', y(0)).attr('height', 0).transition().duration(650).delay((d, i) => i * 40).ease(d3.easeCubicOut).attr('y', yTop).attr('height', hgt);
    else bars.attr('y', yTop).attr('height', hgt);
    g.append('text').attr('class', 'gl-val').attr('x', (d) => x(d.month) + x.bandwidth() / 2).attr('y', (d) => (d.price_change_pct < 0 ? y(d.price_change_pct) + 14 : y(d.price_change_pct) - 5)).attr('text-anchor', 'middle').text((d) => (x.bandwidth() > 30 ? d.price_change_pct.toFixed(1) + '%' : ''));
    g.append('text').attr('x', (d) => x(d.month) + x.bandwidth() / 2).attr('y', H - 8).attr('text-anchor', 'middle').text((d) => GL.monthShort(d.month));
    g.append('rect').attr('x', (d) => x(d.month) - x.step() * x.paddingInner() / 2).attr('width', x.step()).attr('y', top).attr('height', H - top - bottom).style('fill', 'transparent')
      .on('mousemove', (ev, d) => { const [mx, my] = d3.pointer(ev, el); tip.show([d.label + ' · ' + GL.int(d.loans) + ' loans', '24K at loan: ' + GL.rupee(d.rate_at_loan) + '/g', '24K today: ' + GL.rupee(GL.rate()) + '/g', 'Change: ' + GL.signed(d.price_change_pct)], mx, my); })
      .on('mouseleave', () => tip.hide());
  });

  /* LTV at loan vs today, by month; today's dot takes its zone colour */
  dash.draw('ltvchart', (el) => {
    const m = dash.data('months');
    if (m.status !== 'ok' || !m.data || !m.data.length) return GL.empty(el, m.status);
    const animate = GL.firstDraw(el);
    el.replaceChildren();
    const rows = m.data, W = GL.width(el), rowH = 27, top = 22, bottom = 24, H = top + rows.length * rowH + bottom;
    const svg = GL.svg(el, W, H, 'LTV when each month of loans was given compared with LTV today');
    const left = GL.textWidth(svg, rows.map((d) => d.label)) + 10, right = GL.textWidth(svg, ['100.0%']) + 12;
    const lo = Math.min(65, d3.min(rows, (d) => Math.min(d.ltv_at_loan_pct, d.ltv_today_pct)) - 3), hi = Math.max(105, d3.max(rows, (d) => d.ltv_today_pct) + 3);
    const x = d3.scaleLinear().domain([lo, hi]).range([left, W - right]);
    const y = d3.scaleBand().domain(rows.map((d) => d.month)).range([top, H - bottom]).padding(0.2);
    [[lo, 75, 'var(--tint-green)'], [75, 90, 'var(--tint-amber)'], [90, hi, 'var(--tint-red)']].forEach(([a, b, c]) => {
      if (b <= lo || a >= hi) return;
      svg.append('rect').attr('x', x(Math.max(lo, a))).attr('width', x(Math.min(hi, b)) - x(Math.max(lo, a))).attr('y', top - 4).attr('height', H - bottom - top + 4).style('fill', c).style('opacity', 0.7);
    });
    svg.append('g').attr('transform', 'translate(0,' + (H - bottom) + ')').call(d3.axisBottom(x).ticks(Math.max(3, Math.floor((W - left - right) / 70))).tickFormat((v) => v + '%')).call((g) => g.select('.domain').remove());
    [75, 90, 100].forEach((v) => {
      if (v < lo || v > hi) return;
      svg.append('line').attr('x1', x(v)).attr('x2', x(v)).attr('y1', top - 4).attr('y2', H - bottom).style('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '3 3');
      svg.append('text').attr('x', x(v)).attr('y', top - 8).attr('text-anchor', 'middle').text(v + '%');
    });
    const tip = GL.tip(el);
    const g = svg.selectAll('g.row').data(rows).join('g').attr('class', 'row').attr('transform', (d) => 'translate(0,' + (y(d.month) + y.bandwidth() / 2) + ')');
    g.append('text').attr('x', left - 8).attr('y', 4).attr('text-anchor', 'end').text((d) => d.label);
    const line = g.append('line').attr('x1', (d) => x(d.ltv_at_loan_pct)).style('stroke', 'var(--cds-chart-muted)').attr('stroke-width', 2.5);
    g.append('circle').attr('cx', (d) => x(d.ltv_at_loan_pct)).attr('r', 5).style('fill', 'var(--cds-chart-muted)').style('stroke', 'var(--color-panel)').attr('stroke-width', 2);
    const dot = g.append('circle').attr('r', 7).style('fill', (d) => GL.tierOf(GL.zoneOfLtv(d.ltv_today_pct)).color).style('stroke', 'var(--color-panel)').attr('stroke-width', 2);
    if (animate) {
      line.attr('x2', (d) => x(d.ltv_at_loan_pct)).transition().duration(700).ease(d3.easeCubicOut).attr('x2', (d) => x(d.ltv_today_pct));
      dot.attr('cx', (d) => x(d.ltv_at_loan_pct)).transition().duration(700).ease(d3.easeCubicOut).attr('cx', (d) => x(d.ltv_today_pct));
    } else { line.attr('x2', (d) => x(d.ltv_today_pct)); dot.attr('cx', (d) => x(d.ltv_today_pct)); }
    g.append('text').attr('class', 'gl-val').attr('x', (d) => x(Math.max(d.ltv_at_loan_pct, d.ltv_today_pct)) + 11).attr('y', 4).text((d) => d.ltv_today_pct.toFixed(1) + '%');
    g.append('rect').attr('x', 0).attr('width', W).attr('y', -rowH / 2).attr('height', rowH).style('fill', 'transparent')
      .on('mousemove', (ev, d) => { const [mx, my] = d3.pointer(ev, el); tip.show([d.label + ' · ' + GL.int(d.loans) + ' loans', 'LTV at loan: ' + GL.pct(d.ltv_at_loan_pct), 'LTV today: ' + GL.pct(d.ltv_today_pct), 'Red zone: ' + GL.int(d.red) + ' · Underwater: ' + GL.int(d.underwater)], mx, my); })
      .on('mouseleave', () => tip.hide());
  });

  /* What-if: loans at risk across gold prices */
  dash.draw('senschart', (el) => {
    const s = dash.data('sensitivity');
    if (s.status !== 'ok' || !s.data || !s.data.length) return GL.empty(el, s.status);
    const kr = kpiRow();
    if (kr && !kr.base_loans) return GL.empty(el, 'ok', 'No loans match these filters.');
    const animate = GL.firstDraw(el);
    el.replaceChildren();
    const rows = s.data, W = GL.width(el), H = 270, top = 24, bottom = 30, rate = GL.rate();
    const svg = GL.svg(el, W, H, 'Number of red-zone and underwater loans at each 24K gold price');
    const ymax = kr ? kr.base_loans : d3.max(rows, (d) => d.red);
    const y = d3.scaleLinear().domain([0, Math.max(1, ymax)]).nice().range([H - bottom, top]);
    const left = GL.textWidth(svg, y.ticks(5).map(GL.int)) + 10;
    const x = d3.scaleLinear().domain(d3.extent(rows, (d) => d.rate)).range([left, W - 12]);
    svg.append('g').attr('transform', 'translate(' + left + ',0)').call(d3.axisLeft(y).ticks(5).tickSize(-(W - left - 12)).tickFormat(GL.int)).call((g) => g.select('.domain').remove());
    svg.append('g').attr('transform', 'translate(0,' + (H - bottom) + ')').call(d3.axisBottom(x).ticks(Math.max(3, Math.floor((W - left) / 80))).tickFormat((v) => '₹' + (v / 1000) + 'k'));
    const clipId = 'gl-clip-' + Math.random().toString(36).slice(2);
    const clip = svg.append('clipPath').attr('id', clipId).append('rect').attr('x', left).attr('y', 0).attr('height', H).attr('width', animate ? 0 : W);
    if (animate) clip.transition().duration(900).ease(d3.easeCubicOut).attr('width', W);
    const series = [['red', 'var(--color-bad)'], ['underwater', dash.colors[1]]];
    const plot = svg.append('g').attr('clip-path', 'url(#' + clipId + ')');
    series.forEach(([f, c]) => {
      plot.append('path').datum(rows).style('fill', c).style('opacity', 0.12).attr('d', d3.area().x((d) => x(d.rate)).y0(y(0)).y1((d) => y(d[f])));
      plot.append('path').datum(rows).attr('fill', 'none').style('stroke', c).attr('stroke-width', 2.5).attr('d', d3.line().x((d) => x(d.rate)).y((d) => y(d[f])));
    });
    const [x0, x1] = x.domain();
    if (kr && rate >= x0 && rate <= x1) {
      svg.append('line').attr('x1', x(rate)).attr('x2', x(rate)).attr('y1', top - 4).attr('y2', H - bottom).style('stroke', 'var(--gold)').attr('stroke-width', 2).attr('stroke-dasharray', '4 3');
      svg.append('text').attr('class', 'gl-val').attr('x', x(rate)).attr('y', top - 9).attr('text-anchor', x(rate) > W - 80 ? 'end' : x(rate) < left + 60 ? 'start' : 'middle').text('Now ' + GL.rupee(rate));
      series.forEach(([f, c]) => {
        svg.append('circle').attr('cx', x(rate)).attr('cy', y(kr[f])).attr('r', 6).style('fill', c).style('stroke', 'var(--color-panel)').attr('stroke-width', 2);
        svg.append('text').attr('class', 'gl-val').attr('x', x(rate) + 10).attr('y', y(kr[f]) - 7).text(GL.int(kr[f]));
      });
    }
    const tip = GL.tip(el);
    const hover = svg.append('line').attr('y1', top).attr('y2', H - bottom).style('stroke', 'var(--cds-chart-axis)').style('display', 'none');
    svg.append('rect').attr('x', left).attr('width', W - left - 12).attr('y', top).attr('height', H - top - bottom).style('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [mx, my] = d3.pointer(ev, el); const [sx] = d3.pointer(ev, svg.node());
        const r = x.invert(sx); const d = rows.reduce((a, b) => (Math.abs(b.rate - r) < Math.abs(a.rate - r) ? b : a));
        hover.style('display', null).attr('x1', x(d.rate)).attr('x2', x(d.rate));
        tip.show(['24K at ' + GL.rupee(d.rate) + '/g', 'Red-zone loans: ' + GL.int(d.red), 'Underwater loans: ' + GL.int(d.underwater)], mx, my);
      })
      .on('mouseleave', () => { hover.style('display', 'none'); tip.hide(); });
  });

  /* Red-zone amount by branch, bar colour by branch LTV; click filters the dashboard */
  dash.draw('branchchart', (el) => {
    const b = dash.data('branches');
    if (b.status !== 'ok' || !b.data) return GL.empty(el, b.status);
    const rows = b.data.filter((d) => d.red > 0);
    if (!rows.length) return GL.empty(el, 'ok', 'No branch has red-zone loans for these filters at this rate.');
    const animate = GL.firstDraw(el);
    el.replaceChildren();
    const W = GL.width(el), rowH = 28, H = rows.length * rowH + 8, sel = dash.params().branch || '';
    const svg = GL.svg(el, W, H, 'Amount owed on red-zone loans by branch');
    const lab = (d) => GL.lakh(d.red_outstanding_lakh) + ' · ' + d.red + (d.red === 1 ? ' loan' : ' loans');
    const left = GL.textWidth(svg, rows.map((d) => d.branch)) + 12, right = GL.textWidth(svg, rows.map(lab)) + 12;
    const x = d3.scaleLinear().domain([0, d3.max(rows, (d) => d.red_outstanding_lakh)]).range([left, Math.max(left + 40, W - right)]);
    const y = d3.scaleBand().domain(rows.map((d) => d.branch)).range([4, H - 4]).padding(0.22);
    const heat = d3.scaleLinear().domain([80, 95]).range([0, 1]).clamp(true);
    const colour = (d) => d3.interpolateRgb('#f4a261', '#c0281a')(heat(d.ltv_today_pct));
    const tip = GL.tip(el);
    const g = svg.selectAll('g.br').data(rows).join('g').attr('class', 'br').style('cursor', 'pointer').style('opacity', (d) => (!sel || sel === d.branch ? 1 : 0.35));
    g.append('text').attr('x', left - 8).attr('y', (d) => y(d.branch) + y.bandwidth() / 2 + 4).attr('text-anchor', 'end').text((d) => d.branch);
    const bars = g.append('rect').attr('x', left).attr('y', (d) => y(d.branch)).attr('height', y.bandwidth()).attr('rx', 4).style('fill', colour);
    const wid = (d) => Math.max(2, x(d.red_outstanding_lakh) - left);
    if (animate) bars.attr('width', 0).transition().duration(650).delay((d, i) => i * 25).ease(d3.easeCubicOut).attr('width', wid); else bars.attr('width', wid);
    g.append('text').attr('class', 'gl-val').attr('x', (d) => x(d.red_outstanding_lakh) + 6).attr('y', (d) => y(d.branch) + y.bandwidth() / 2 + 4).text(lab);
    g.append('rect').attr('x', 0).attr('width', W).attr('y', (d) => y(d.branch) - 2).attr('height', y.step()).style('fill', 'transparent')
      .on('mousemove', (ev, d) => { const [mx, my] = d3.pointer(ev, el); tip.show([d.branch, 'Red-zone loans: ' + GL.int(d.red) + ' of ' + GL.int(d.loans), 'Owed on them: ' + GL.lakh(d.red_outstanding_lakh), 'Branch LTV today: ' + GL.pct(d.ltv_today_pct), sel === d.branch ? 'Click to clear the branch filter' : 'Click to filter the dashboard'], mx, my); })
      .on('mouseleave', () => tip.hide())
      .on('click', (ev, d) => { GL.state.page = 1; dash.setParams({ branch: sel === d.branch ? '' : d.branch, rm: '' }); });
  });
})();
