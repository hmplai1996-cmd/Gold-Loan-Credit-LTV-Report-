/*
 * rbi.js
 * RBI & stress tab: business call, RBI cap check (borrower-level, bullet-loan basis),
 * stress test with loss on sale, and the maturity schedule.
 */
(function () {
  const row = () => { const d = dash.data('rbi'); return d.status === 'ok' && d.data ? d.data[0] : null; };
  const E = GL.el;
  const B = (t) => E('b', null, t);

  dash.draw('rate_now3', (el) => { el.textContent = GL.rupee(GL.rate()); });

  dash.draw('rbi_report', (el) => {
    el.replaceChildren();
    const url = (window.GL_CONFIG || {}).reportUrl;
    if (!url) return;
    const a = E('a', null, 'Open the full written report'); a.href = url; a.target = '_blank'; a.rel = 'noopener';
    el.append(a, ' (figures there are fixed at 25 Nov 2026; this page updates with the rate and your uploads).');
  });

  dash.draw('rbi_calls', (el) => {
    const r = row(); el.replaceChildren();
    if (!r) return GL.empty(el, dash.data('rbi').status);
    if (!r.loans) return el.append(E('li', null, 'No loans match these filters.'));
    const s10 = r.stress.find((s) => s.decline === 10) || {}, s0 = r.stress[0] || {};
    const li = (...parts) => { const l = E('li'); l.append(...parts); el.append(l); };
    if (r.underwater) {
      const br = r.under_branches.map(([b, n]) => b + ' (' + n + ')').join(', ');
      li(B('Call the ' + GL.int(r.underwater) + ' underwater borrowers first'), ' (' + GL.cr(r.under_owed_cr) + ' owed). They owe only ' + GL.lakh(r.under_gap_lakh) + ' more than their gold is worth in total, so a part-payment or extra gold fixes most of them' + (br ? '. Start with ' + br + '.' : '.'));
    } else li(B('No loan is underwater at this rate.'), ' Keep the red-zone loans under watch.');
    li(B('Collect interest every month, not at maturity.'), ' Unpaid interest adds about ' + GL.lakh(r.month_interest_lakh) + ' a month to what these borrowers owe, so cover shrinks even if gold stays flat.');
    li(B('Lend less on new loans.'), ' RBI counts principal plus a year’s interest against the cap. At the usual rate and an 85% cap, the loan can be at most about ' + r.safe_lend_pct + '% of gold value; ' + GL.int(r.over_at_loan) + ' of these loans were over the cap on the day they were given. Set new loans at 65% or move to monthly-interest loans.');
    li(B('Value gold the RBI way, daily:'), ' the lower of the 30-day average and the previous day’s close. In a falling market that is the previous day’s close.');
    if (r.above25) li(B('Full credit check for the ' + GL.int(r.above25) + ' borrowers above ₹2.5 lakh'), ' (' + GL.cr(r.above25_cr) + ' lent); ' + GL.int(r.above5) + ' are above ₹5 lakh, where the cap is 75%.');
    li(B('Don’t rush to auction.'), ' Selling everything now would leave a ' + GL.cr(s0.shortfall_cr) + ' loss; after another 10% fall it would be ' + GL.cr(s10.shortfall_cr) + '. Notices and part-payments recover more.');
  });

  const card = (icon, cls, label, value, note) => {
    const c = E('div', 'gl-card gl-kpi');
    const h = E('div', 'gl-kh'); const ic = E('span', 'gl-ico ' + cls); ic.innerHTML = icon; h.append(ic, E('span', null, label));
    const v = E('p', 'gl-kv', value); const n = E('p', 'gl-kn'); n.append(...note);
    c.append(h, v, n); return c;
  };
  const I = {
    shield: '<svg class="gl-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>',
    gauge: '<svg class="gl-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-5"/></svg>',
    pay: '<svg class="gl-i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M16 15h2"/></svg>',
    people: '<svg class="gl-i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/></svg>',
    down: '<svg class="gl-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7l6 6 4-4 8 8"/><path d="M21 11v6h-6"/></svg>'
  };
  dash.draw('rbi_kpis', (el) => {
    const r = row(); el.replaceChildren();
    if (!r) return;
    const s0 = r.stress[0] || {};
    el.append(
      card(I.shield, 'red', 'Over the RBI cap', GL.int(r.breach) + ' loans', ['of ', GL.int(r.loans), ' · ', GL.cr(r.breach_owed_cr), ' owed']),
      card(I.gauge, 'teal', 'LTV on maturity amount', GL.pct(r.rbi_ltv_pct), ['RBI basis for bullet loans · ', GL.pct(r.rbi_ltv_at_loan_pct), ' at loan']),
      card(I.pay, 'blue', 'To pay to get within cap', GL.cr(r.reduce_cr), ['Only ', GL.int(r.within), ' loans have 3+ points of room']),
      card(I.people, 'gold', 'Borrowers above ₹2.5 lakh', GL.int(r.above25), [GL.int(r.above5), ' above ₹5 lakh · ', GL.int(r.multi), ' with 2+ loans']),
      card(I.down, 'amber', 'Loss if sold today', GL.cr(s0.shortfall_cr), [GL.int(r.underwater), ' loans underwater'])
    );
  });

  dash.draw('rbi_bands', (tb) => {
    const r = row(); tb.replaceChildren();
    if (!r) { const tr = E('tr'); const td = E('td', 'gl-empty'); td.colSpan = 8; GL.empty(td, dash.data('rbi').status); tr.append(td); tb.append(tr); return; }
    const tr = (cells, bold) => { const t = E('tr'); cells.forEach(([v, n]) => { const c = E('td', n ? 'n' : null); if (bold) c.append(B(v)); else c.textContent = v; t.append(c); }); tb.append(t); };
    r.bands.forEach((b) => tr([[b.label], [b.cap_pct + '%', 1], [GL.int(b.borrowers), 1], [GL.int(b.loans), 1], [GL.cr(b.owed_cr), 1], [GL.int(b.breach), 1], [GL.cr(b.breach_owed_cr), 1], [GL.cr(b.reduce_cr), 1]]));
    tr([['Total'], ['', 1], [GL.int(r.borrowers), 1], [GL.int(r.loans), 1], [GL.cr(r.owed_cr), 1], [GL.int(r.breach), 1], [GL.cr(r.breach_owed_cr), 1], [GL.cr(r.reduce_cr), 1]], true);
  });

  dash.draw('stress_title', (el) => {
    const r = row(); if (!r) { el.textContent = 'If gold keeps falling'; return; }
    const a = r.stress[0], b = r.stress.find((s) => s.decline === 10);
    const k = a.shortfall_cr > 0 ? b.shortfall_cr / a.shortfall_cr : 0;
    el.textContent = 'Another 10% fall in gold would take the loss on sale from ' + GL.cr(a.shortfall_cr) + ' to ' + GL.cr(b.shortfall_cr) + (k >= 2 ? ', more than double' : '');
  });

  /* Vertical bars: loss on sale at each gold fall; the −10% case is highlighted. */
  const bars = (el, rows, opts) => {
    const animate = GL.firstDraw(el);
    el.replaceChildren();
    const W = GL.width(el), H = opts.height, y0 = 26, base = H - opts.below;
    const svg = GL.svg(el, W, H, opts.label);
    const x = d3.scaleBand().domain(rows.map((d) => d.key)).range([8, W - 8]).padding(opts.pad);
    const y = d3.scaleLinear().domain([0, d3.max(rows, opts.value) || 1]).range([base, y0]);
    const tip = GL.tip(el);
    const g = svg.selectAll('g.b').data(rows).join('g').attr('class', 'b');
    const rect = g.append('rect').attr('x', (d) => x(d.key)).attr('width', x.bandwidth()).attr('rx', 4).style('fill', opts.fill);
    if (animate) rect.attr('y', base).attr('height', 0).transition().duration(650).delay((d, i) => i * 30).ease(d3.easeCubicOut).attr('y', (d) => y(opts.value(d))).attr('height', (d) => base - y(opts.value(d)));
    else rect.attr('y', (d) => y(opts.value(d))).attr('height', (d) => base - y(opts.value(d)));
    if (opts.valueLabel) g.append('text').attr('class', 'gl-val').attr('text-anchor', 'middle').attr('x', (d) => x(d.key) + x.bandwidth() / 2).attr('y', (d) => y(opts.value(d)) - 7).text(opts.valueLabel);
    opts.under.forEach((f, i) => g.append('text').attr('text-anchor', 'middle').attr('x', (d) => x(d.key) + x.bandwidth() / 2).attr('y', base + 18 + i * 16)
      .style('font-weight', i === 0 ? 600 : 400).style('fill', i === 0 ? 'var(--color-fg)' : 'var(--color-fg-muted)').text(f));
    svg.append('line').attr('x1', 8).attr('x2', W - 8).attr('y1', base).attr('y2', base).style('stroke', 'var(--color-border-line)');
    g.append('rect').attr('x', (d) => x(d.key) - x.step() * x.paddingInner() / 2).attr('width', x.step()).attr('y', 0).attr('height', H).style('fill', 'transparent')
      .on('mousemove', (ev, d) => { const [mx, my] = d3.pointer(ev, el); tip.show(opts.tip(d), mx, my); })
      .on('mouseleave', () => tip.hide());
  };

  dash.draw('stresschart', (el) => {
    const r = row(); if (!r) return GL.empty(el, dash.data('rbi').status);
    if (!r.loans) return GL.empty(el, 'ok', 'No loans match these filters.');
    const rows = r.stress.map((s) => Object.assign({ key: s.label }, s));
    const narrow = GL.width(el) < 520;
    bars(el, rows, { height: 300, below: 62, pad: narrow ? 0.25 : 0.42, label: 'Loss on sale at each further fall in gold',
      value: (d) => d.shortfall_cr, fill: (d) => (d.decline === 10 ? 'var(--chart-1)' : 'var(--cds-chart-muted, #c3c3b6)'),
      valueLabel: (d) => GL.cr(d.shortfall_cr),
      under: [(d) => d.label, (d) => GL.rupee(d.rate24) + '/g', (d) => GL.int(d.underwater) + (narrow ? ' u/w' : ' underwater')],
      tip: (d) => [d.label + (d.decline ? ' (24K ' + GL.rupee(d.rate24) + ')' : ' at ' + GL.rupee(d.rate24)), 'Loss on sale: ' + GL.cr(d.shortfall_cr), 'Sale value after costs: ' + GL.cr(d.nrv_cr), 'Underwater loans: ' + GL.int(d.underwater), 'Over RBI cap: ' + GL.int(d.breach), 'Book LTV: ' + GL.pct(d.ltv_pct)] });
  });

  dash.draw('maturitychart', (el) => {
    const r = row(); if (!r) return GL.empty(el, dash.data('rbi').status);
    if (!r.maturity.length) return GL.empty(el, 'ok', 'No maturity dates for these loans.');
    const rows = r.maturity.map((m) => Object.assign({ key: m.month }, m));
    const narrow = GL.width(el) < 520;
    bars(el, rows, { height: 250, below: 44, pad: 0.3, label: 'Amount repayable at maturity by month',
      value: (d) => d.due_cr, fill: () => 'var(--gold)',
      valueLabel: narrow ? null : (d) => GL.cr(d.due_cr),
      under: [(d) => GL.monthShort(d.month) + " '" + String(d.month).slice(2, 4), (d) => (narrow ? '' : GL.int(d.loans) + ' loans')],
      tip: (d) => [d.label, 'Loans due: ' + GL.int(d.loans), 'Repayable: ' + GL.cr(d.due_cr), 'Underwater today: ' + GL.int(d.underwater)] });
  });
})();
