/*
 * interest.js
 * "Interest due as on" date (today by default), quick dates, owed basis, and the summary line.
 */
(function () {
  const E = GL.el;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmt = (d) => { const [y, m, dd] = d.split('-'); return +dd + ' ' + MON[+m - 1] + ' ' + y; };
  const iso = (dt) => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  const asof = () => dash.params().asof || GL.todayISO();
  GL.fmtDate = fmt;

  const inp = document.getElementById('gl-asof');
  const mode = document.getElementById('gl-intmode');
  if (inp) inp.addEventListener('change', () => { if (/^\d{4}-\d{2}-\d{2}$/.test(inp.value)) dash.setParams({ asof: inp.value === GL.todayISO() ? '' : inp.value }); });
  if (mode) mode.addEventListener('change', () => dash.setParams({ intmode: mode.value }));

  dash.draw('int_chips', (el) => {
    if (inp && inp.value !== asof()) inp.value = asof();
    if (mode && mode.value !== (dash.params().intmode || 'cap')) mode.value = dash.params().intmode || 'cap';
    if (inp) inp.disabled = dash.params().intmode === 'pos';
    el.replaceChildren();
    const t = new Date(); const y = t.getFullYear(), m = t.getMonth();
    const fy = m >= 3 ? y + 1 : y;                                   // financial year ends 31 March
    const picks = [['Today', GL.todayISO()], ['Month end', iso(new Date(y, m + 1, 0))], ['Next month end', iso(new Date(y, m + 2, 0))], ['31 Mar ' + fy, fy + '-03-31']];
    picks.forEach(([lab, d]) => {
      const b = E('button', 'gl-btn', lab); b.type = 'button'; b.title = fmt(d);
      b.setAttribute('aria-pressed', String(asof() === d && dash.params().intmode !== 'pos'));
      b.addEventListener('click', () => dash.setParams({ asof: d === GL.todayISO() ? '' : d, intmode: dash.params().intmode === 'pos' ? 'cap' : dash.params().intmode }));
      el.append(b);
    });
  });

  dash.draw('int_line', (el) => {
    el.replaceChildren();
    const d = dash.data('kpis'); if (d.status !== 'ok' || !d.data) return;
    const k = d.data[0];
    if (dash.params().intmode === 'pos') { el.append('Amount owed uses POS as in the report or your upload (' + GL.cr(k.outstanding_cr) + ').'); return; }
    const simple = dash.params().intmode === 'simple';
    el.append('Interest due as on ', E('b', null, fmt(asof())), ': ', E('b', null, GL.cr(k.interest_cr)), ' on principal ' + GL.cr(k.principal_cr) + ' · amount owed ' + GL.cr(k.outstanding_cr) + '. ' +
      (simple ? 'Simple interest at each loan’s ROI, 365-day year, from the sanction date.' : 'Daily interest at each loan’s ROI ÷ 365, added to the balance at every month end (the loan system’s method).'));
  });
})();
