/*
 * ornaments.js
 * Ornaments tab: gold by ornament type (value, karat, stones, LTV, underwater, loss),
 * value chart, mangalsutra share of new lending by month, branch mix, and the main-ornament filter.
 */
(function () {
  const E = GL.el;
  const data = (n) => { const d = dash.data(n); return d.status === 'ok' && d.data ? d.data : null; };
  const lakh = (v) => '₹' + (v / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' L';
  const td = (tr, v, cls) => { const c = E('td', cls || null, v); tr.append(c); return c; };

  /* Filter: main ornament */
  dash.draw('orn_sel', (sel) => {
    const rows = data('scored') || [];
    const have = new Set(rows.map((r) => r.orn_main));
    const opts = GL.ORN_GROUPS.concat(['Not recorded']).filter((g) => have.has(g));
    sel.replaceChildren(new Option('All ornaments', ''), ...opts.map((g) => new Option(g, g)));
    sel.value = dash.params().orn || '';
    sel.onchange = () => { GL.state.page = 1; dash.setParams({ orn: sel.value }); };
  });

  dash.draw('orn_title', (el) => {
    const d = data('ornmix'); if (!d || !d.length) { el.textContent = 'Gold by ornament type'; return; }
    const top = d[0];
    el.textContent = top.group + ' is ' + Math.round(top.share) + '% of the gold behind these loans';
  });

  dash.draw('orn_table', (tb) => {
    tb.replaceChildren();
    const d = data('ornmix');
    if (!d) { const tr = E('tr'); const c = E('td', 'gl-empty'); c.colSpan = 13; GL.empty(c, dash.data('ornmix').status); tr.append(c); tb.append(tr); return; }
    if (!d.some((x) => x.pieces)) { const tr = E('tr'); const c = E('td', 'gl-empty', 'No ornament details in this data. Upload a disbursement report with the OrnamentType column.'); c.colSpan = 13; tr.append(c); tb.append(tr); return; }
    const cur = dash.params().orn || '';
    const hidden = d.filter((x) => !x.pieces).reduce((a, x) => a + x.main, 0);
    let P = 0, M = 0, G = 0, V0 = 0, V1 = 0, UW = 0, LS = 0;
    d.filter((x) => x.pieces).forEach((x) => {
      const tr = E('tr', 'gl-ornrow' + (cur === x.group ? ' is-on' : ''));
      tr.tabIndex = 0; tr.setAttribute('role', 'button');
      tr.setAttribute('aria-label', (cur === x.group ? 'Clear the filter for ' : 'Show only loans with mainly ') + x.group);
      const go = () => { GL.state.page = 1; dash.setParams({ orn: cur === x.group ? '' : x.group }); };
      tr.addEventListener('click', go); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      const nm = td(tr, ''); nm.append(E('b', null, x.group));
      td(tr, GL.int(x.pieces), 'n'); td(tr, GL.int(x.main), 'n'); td(tr, GL.int(x.net_g) + ' g', 'n'); td(tr, x.avg_k ? x.avg_k + 'K' : '—', 'n');
      td(tr, GL.pct(x.low_pct), 'n' + (x.low_pct >= 25 ? ' gl-bad' : '')); td(tr, x.main ? GL.pct(x.stone_pct) : '—', 'n' + (x.stone_pct >= 30 ? ' gl-bad' : ''));
      td(tr, GL.cr(x.value_now / 1e7), 'n'); td(tr, GL.pct(x.share), 'n'); td(tr, GL.signed(x.change), 'n' + (x.change < 0 ? ' gl-bad' : ''));
      td(tr, GL.pct(x.ltv), 'n' + (x.ltv >= 100 ? ' gl-bad' : '')); td(tr, GL.int(x.uw) + (x.main ? ' (' + Math.round(x.uw_pct) + '%)' : ''), 'n'); td(tr, lakh(x.loss), 'n');
      tb.append(tr);
      P += x.pieces; M += x.main; G += x.net_g; V0 += x.value_then; V1 += x.value_now; UW += x.uw; LS += x.loss;
    });
    const tr = E('tr', 'gl-ktot');
    [['Total'], [GL.int(P), 'n'], [GL.int(M), 'n'], [GL.int(G) + ' g', 'n'], ['', 'n'], ['', 'n'], ['', 'n'], [GL.cr(V1 / 1e7), 'n'], ['100%', 'n'], [V0 ? GL.signed(+((V1 / V0 - 1) * 100).toFixed(1)) : '', 'n'], ['', 'n'], [GL.int(UW), 'n'], [lakh(LS), 'n']].forEach(([v, c]) => td(tr, v, c));
    tb.append(tr);
    if (hidden) { const n = E('tr'); const c = E('td', 'gl-sub', GL.int(hidden) + ' loan without item details is not in this table.'); c.colSpan = 13; n.append(c); tb.append(n); }
  });

  dash.draw('orn_filterline', (el) => {
    el.replaceChildren();
    const o = dash.params().orn; if (!o) { el.textContent = 'Showing all ornaments.'; return; }
    const b = E('button', 'gl-btn gl-mini', 'Show all ornaments'); b.type = 'button'; b.onclick = () => dash.setParams({ orn: '' });
    el.append('Filtered to loans whose main ornament is ' + o + ' — every tab follows this filter. ', b);
  });

  /* Horizontal bars: value today, LTV as label */
  dash.draw('orn_chart', (el) => {
    const d = (data('ornmix') || []).filter((x) => x.pieces);
    const animate = GL.firstDraw(el); el.replaceChildren();
    if (!d.length) return GL.empty(el, dash.data('ornmix').status, 'No ornament details.');
    const W = GL.width(el), narrow = W < 520, left = narrow ? 112 : 150, bh = 24, gap = 10, H = d.length * (bh + gap) + 8;
    const svg = GL.svg(el, W, H, 'Gold value today by ornament');
    const x = d3.scaleLinear().domain([0, d3.max(d, (r) => r.value_now) || 1]).range([0, Math.max(40, W - left - (narrow ? 96 : 150))]);
    const tip = GL.tip(el);
    const g = svg.selectAll('g.b').data(d).join('g').attr('class', 'b').attr('transform', (r, i) => 'translate(0,' + (i * (bh + gap)) + ')');
    g.append('text').attr('x', left - 8).attr('y', bh / 2 + 4).attr('text-anchor', 'end').style('fill', 'var(--color-fg)').style('font-size', narrow ? '11px' : '12.5px').text((r) => r.group);
    const rect = g.append('rect').attr('x', left).attr('y', 0).attr('height', bh).attr('rx', 4)
      .style('fill', (r, i) => (i === 0 ? 'var(--chart-1)' : 'var(--gold)')).style('opacity', (r, i) => (i === 0 ? 1 : 0.75));
    if (animate) rect.attr('width', 0).transition().duration(600).attr('width', (r) => Math.max(2, x(r.value_now))); else rect.attr('width', (r) => Math.max(2, x(r.value_now)));
    g.append('text').attr('class', 'gl-val').attr('x', (r) => left + Math.max(2, x(r.value_now)) + 6).attr('y', bh / 2 + 4)
      .text((r) => (narrow ? GL.cr(r.value_now / 1e7) : GL.cr(r.value_now / 1e7) + ' · LTV ' + GL.pct(r.ltv)));
    g.append('rect').attr('x', 0).attr('y', -gap / 2).attr('width', W).attr('height', bh + gap).style('fill', 'transparent').style('cursor', 'pointer')
      .on('mousemove', (ev, r) => { const [mx, my] = d3.pointer(ev, el); tip.show([r.group, 'Value today: ' + GL.cr(r.value_now / 1e7) + ' (' + GL.pct(r.share) + ')', 'LTV: ' + GL.pct(r.ltv), 'Pieces: ' + GL.int(r.pieces) + ' · avg ' + r.avg_k + 'K', 'Underwater (main): ' + GL.int(r.uw), 'Click to filter'], mx, my); })
      .on('mouseleave', () => tip.hide())
      .on('click', (ev, r) => { GL.state.page = 1; dash.setParams({ orn: dash.params().orn === r.group ? '' : r.group }); });
  });

  dash.draw('orn_month_title', (el) => {
    const d = data('ornmonth'); if (!d || !d.length) { el.textContent = 'Mangalsutra share of new lending'; return; }
    const last = d[d.length - 1];
    el.textContent = 'Mangalsutra was ' + Math.round(last.ms_pct) + '% of new gold in ' + GL.monthLabel(last.month);
  });
  dash.draw('orn_month', (el) => {
    const d = data('ornmonth') || [];
    const animate = GL.firstDraw(el); el.replaceChildren();
    if (!d.length) return GL.empty(el, dash.data('ornmonth').status, 'No ornament details.');
    const W = GL.width(el), H = 240, m = { l: 34, r: 8, t: 18, b: 26 }, CAP = 40;
    const svg = GL.svg(el, W, H, 'Mangalsutra share of new lending by month');
    const x = d3.scaleBand().domain(d.map((r) => r.month)).range([m.l, W - m.r]).padding(0.3);
    const y = d3.scaleLinear().domain([0, Math.max(60, d3.max(d, (r) => r.ms_pct) + 8)]).range([H - m.b, m.t]);
    svg.append('g').attr('transform', 'translate(' + m.l + ',0)').call(d3.axisLeft(y).ticks(4).tickFormat((v) => v + '%').tickSize(-(W - m.l - m.r))).call((g) => g.select('.domain').remove()).selectAll('line').style('stroke', 'var(--color-border-line)');
    const tip = GL.tip(el);
    const r = svg.selectAll('rect.b').data(d).join('rect').attr('class', 'b').attr('x', (r) => x(r.month)).attr('width', x.bandwidth()).attr('rx', 3)
      .style('fill', (r) => (r.ms_pct > CAP ? 'var(--color-bad)' : 'var(--gold)')).style('opacity', 0.85);
    if (animate) r.attr('y', H - m.b).attr('height', 0).transition().duration(600).attr('y', (r) => y(r.ms_pct)).attr('height', (r) => H - m.b - y(r.ms_pct));
    else r.attr('y', (r) => y(r.ms_pct)).attr('height', (r) => H - m.b - y(r.ms_pct));
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(CAP)).attr('y2', y(CAP)).style('stroke', 'var(--color-fg-muted)').style('stroke-dasharray', '5 4');
    if (W >= 420) svg.selectAll('text.v').data(d).join('text').attr('class', 'gl-val').attr('text-anchor', 'middle').attr('x', (r) => x(r.month) + x.bandwidth() / 2).attr('y', (r) => y(r.ms_pct) - 5).text((r) => Math.round(r.ms_pct) + '%');
    svg.selectAll('text.m').data(d).join('text').attr('text-anchor', 'middle').attr('x', (r) => x(r.month) + x.bandwidth() / 2).attr('y', H - 8).style('font-size', '11px').style('fill', 'var(--color-fg-muted)').text((r) => GL.monthShort(r.month));
    svg.selectAll('rect.h').data(d).join('rect').attr('class', 'h').attr('x', (r) => x(r.month)).attr('width', x.bandwidth()).attr('y', m.t).attr('height', H - m.t - m.b).style('fill', 'transparent')
      .on('mousemove', (ev, r) => { const [mx, my] = d3.pointer(ev, el); tip.show([GL.monthLabel(r.month), 'Mangalsutra: ' + GL.pct(r.ms_pct), 'Plain gold (chains, rings, bangles, coins): ' + GL.pct(r.plain_pct), 'Loans: ' + GL.int(r.loans)], mx, my); })
      .on('mouseleave', () => tip.hide());
  });

  dash.draw('orn_branch', (tb) => {
    tb.replaceChildren();
    const d = data('ornbranch');
    if (!d || !d.length) { const tr = E('tr'); const c = E('td', 'gl-empty', 'No ornament details.'); c.colSpan = 10; tr.append(c); tb.append(tr); return; }
    d.forEach((b) => {
      const tr = E('tr'); td(tr, b.branch); td(tr, GL.cr(b.value / 1e7), 'n');
      GL.ORN_GROUPS.forEach((g) => {
        const v = b[g] || 0, hot = (g === 'Mangalsutra' && v > 45) || (g === 'Earrings' && v > 20);
        td(tr, v ? Math.round(v) + '%' : '—', 'n' + (hot ? ' gl-hot' : ''));
      });
      tb.append(tr);
    });
  });
})();
