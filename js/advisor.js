/*
 * advisor.js
 * "AI expert" tab. A built-in action plan worked out from the numbers on screen, and,
 * where the page runs inside Claude, a button that asks Claude for a deeper expert plan.
 */
(function () {
  const el = GL.el;
  const ok = (id) => { const d = dash.data(id); return d.status === 'ok' && d.data ? d.data : null; };
  const ICON = {
    situation: "<svg class='gl-i' viewBox='0 0 24 24'><path d='M4 18a8 8 0 1 1 16 0'/><path d='M12 18l4-5'/></svg>",
    call: "<svg class='gl-i' viewBox='0 0 24 24'><path d='M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2z'/></svg>",
    branch: "<svg class='gl-i' viewBox='0 0 24 24'><path d='M4 20V8l8-4 8 4v12'/><path d='M9 20v-6h6v6'/></svg>",
    rm: "<svg class='gl-i' viewBox='0 0 24 24'><circle cx='12' cy='8' r='3.5'/><path d='M5 20c1-4 4-6 7-6s6 2 7 6'/></svg>",
    trigger: "<svg class='gl-i' viewBox='0 0 24 24'><path d='M12 3v4'/><path d='M12 17v4'/><path d='M3 12h4'/><path d='M17 12h4'/><circle cx='12' cy='12' r='4'/></svg>",
    policy: "<svg class='gl-i' viewBox='0 0 24 24'><path d='M6 3h9l3 3v15H6z'/><path d='M9 10h6'/><path d='M9 14h6'/></svg>"
  };
  const ICOCLASS = { situation: 'blue', call: 'red', branch: 'amber', rm: 'teal', trigger: 'gold', policy: 'green' };

  /* The built-in plan: plain rules applied to the current figures. */
  function buildPlan() {
    const view = ok('view'), kr = (ok('kpis') || [])[0], br = ok('branches'), rms = ok('rms'), sens = ok('sensitivity'), months = ok('months');
    if (!view || !kr || !br || !rms || !sens || !months) return null;
    const rate = GL.rate();
    const plan = [];

    const sit = [];
    sit.push([GL.int(kr.red) + ' loans are in the red zone (LTV 90%+), holding ' + GL.pct(kr.red_share_pct) + ' of the amount owed.', GL.int(kr.underwater) + ' are underwater: the gold is worth less than what is owed.']);
    if (kr.price_down) sit.push(['Gold at ' + GL.rupee(rate) + '/g is ' + GL.pct(kr.price_change_abs_pct) + ' below the average price when these loans were given (' + GL.rupee(kr.rate_at_loan) + ').', 'Every further 5% fall pushes more loans past 90% LTV.']);
    const worst = months.slice().sort((a, b) => b.ltv_today_pct - a.ltv_today_pct).slice(0, 2);
    if (worst.length) sit.push(['Most exposed loan months: ' + worst.map((m) => m.label + ' (' + GL.pct(m.ltv_today_pct) + ')').join(' and ') + '.', 'Older loans have more unpaid interest added on top of the price fall.']);
    sit.push(['Bringing every loan back to 75% LTV needs about ' + GL.cr(kr.topup_cr) + ' in part-payments or extra gold, across ' + GL.int(kr.topup_loans) + ' loans.', '']);
    plan.push({ key: 'situation', title: 'Where things stand', items: sit });

    const pri = view.slice().sort((a, b) => (b.underwater === 'Yes') - (a.underwater === 'Yes') || b.ltv_today_pct - a.ltv_today_pct || b.topup_75 - a.topup_75).filter((r) => r.tier !== 'GREEN').slice(0, 8);
    plan.push({ key: 'call', title: 'Contact first', ordered: true, items: pri.length ? pri.map((r) => [r.customer + ' — ' + r.branch + ', RM ' + r.rm, 'LTV ' + GL.pct(r.ltv_today_pct) + ' · owes ' + GL.rupee(r.outstanding) + ' · ask for about ' + GL.rupee(r.topup_75) + (r.underwater === 'Yes' ? ' · underwater' : '')]) : [['No red or amber loans for these filters.', '']] });

    const topB = br.filter((b) => b.red > 0).slice(0, 5);
    plan.push({ key: 'branch', title: 'Branch priorities', ordered: true, items: topB.length ? topB.map((b) => [b.branch + ': ' + GL.int(b.red) + ' red loans, ' + GL.lakh(b.red_outstanding_lakh) + ' owed', 'Branch LTV ' + GL.pct(b.ltv_today_pct) + ' · top-up to 75%: ' + GL.lakh(b.topup_lakh) + ' · ' + (b.ltv_today_pct >= 92 ? 'branch manager to review in person this week' : 'RM phone follow-up this week')]) : [['No branch has red-zone loans for these filters.', '']] });

    const topR = rms.filter((r) => r.red > 0).slice(0, 5);
    plan.push({ key: 'rm', title: 'RM follow-up list', ordered: true, items: topR.length ? topR.map((r) => [r.rm + ' (' + r.branch + '): ' + GL.int(r.red) + ' red loans', GL.lakh(r.red_outstanding_lakh) + ' at risk' + (r.underwater ? ' · ' + GL.int(r.underwater) + ' underwater' : '')]) : [['No RM has red-zone loans for these filters.', '']] });

    const total = kr.base_loans || 1; const trig = [];
    const highestRateWhere = (test) => { const hits = sens.filter(test); return hits.length ? hits[hits.length - 1] : null; };
    [[0.10, 'underwater'], [0.25, 'underwater'], [0.50, 'red']].forEach(([share, f]) => {
      const p = highestRateWhere((d) => d[f] / total >= share);
      if (p && p.rate < rate) trig.push(['If 24K falls to ' + GL.rupee(p.rate) + '/g (' + GL.pct((1 - p.rate / rate) * 100) + ' below today), about ' + GL.int(p[f]) + ' loans would be ' + (f === 'red' ? 'in the red zone' : 'underwater') + '.', 'Set a price alert at ' + GL.rupee(p.rate + 250) + '/g.']);
      else if (p && p.rate >= rate) trig.push(['Already ' + GL.int(p[f]) + ' loans would be ' + (f === 'red' ? 'red' : 'underwater') + ' at today’s rate band.', '']);
    });
    if (!trig.length) trig.push(['Loans stay out of danger down to ' + GL.rupee(sens[0].rate) + '/g.', '']);
    plan.push({ key: 'trigger', title: 'Price triggers to watch', items: trig });

    const pol = [];
    if (kr.price_down) pol.push(['New loans are going out at about ' + GL.pct(kr.ltv_at_loan_pct) + ' LTV. While gold is falling, consider sanctioning nearer 65–70% LTV.', 'A lower starting LTV gives more cushion if prices keep sliding.']);
    pol.push(['Send top-up or part-payment notices to every red-zone customer, starting with underwater loans.', 'Keep a record of each contact and the customer’s reply.']);
    pol.push(['Collect interest regularly on older loans.', 'Unpaid interest raises LTV even when the gold price holds steady.']);
    pol.push(['Re-run this dashboard daily with the latest POS & interest file and gold rate.', 'Use the Update data tab.']);
    pol.push(['Any auction only under the RBI gold-loan directions and your board-approved policy, with proper notice to the customer.', 'Confirm the current circular before acting.']);
    plan.push({ key: 'policy', title: 'Policy suggestions', items: pol });
    return plan;
  }

  dash.draw('advisor_plan', (box) => {
    const plan = buildPlan();
    if (!plan) { box.replaceChildren(el('p', 'gl-thinking', 'Working out the plan…')); return; }
    box.replaceChildren();
    plan.forEach((sec) => {
      const card = el('div', 'gl-card');
      const h = el('h3'); const ico = el('span', 'gl-ico ' + ICOCLASS[sec.key]); ico.innerHTML = ICON[sec.key]; h.append(ico, sec.title);
      const list = el(sec.ordered ? 'ol' : 'ul');
      sec.items.forEach(([main, sub]) => { const li = el('li', null, main); if (sub) li.append(el('small', null, sub)); list.append(li); });
      card.append(h, list); box.append(card);
    });
  });

  /* ---------- Claude expert plan (only inside Claude) ---------- */
  let sample = null, ctl = null;
  const out = () => document.querySelector('#ai-output');
  const status = (t) => document.querySelectorAll('#ai-status').forEach((s) => { s.textContent = t; });

  function render(text) {
    const box = out(); if (!box) return;
    box.replaceChildren();
    let list = null;
    text.split('\n').forEach((raw) => {
      const line = raw.replace(/\*\*/g, '').trimEnd();
      if (!line.trim()) { list = null; return; }
      const h = line.match(/^#{1,4}\s+(.*)/);
      const b = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
      if (h) { list = null; box.append(el('h3', null, h[1])); }
      else if (b) { if (!list) { list = el('ul'); box.append(list); } list.append(el('li', null, b[1])); }
      else { list = null; box.append(el('p', null, line)); }
    });
  }

  function dataForClaude() {
    const kr = (ok('kpis') || [])[0], tiers = ok('tiers') || [], months = ok('months') || [], br = (ok('branches') || []).slice(0, 10), rms = (ok('rms') || []).slice(0, 10), sens = ok('sensitivity') || [], view = ok('view') || [];
    const p = dash.params();
    const top = view.slice().sort((a, b) => b.ltv_today_pct - a.ltv_today_pct).slice(0, 20).map((r) => ({ loan_last5: String(r.loan).slice(-5), branch: r.branch, rm: r.rm, loan_month: r.month, owed: r.outstanding, interest: r.interest, ltv_pct: r.ltv_today_pct, topup_to_75: r.topup_75 }));
    return {
      gold_rate_24k_per_g_today: GL.rate(), filters: { branch: p.branch || 'all', rm: p.rm || 'all', zone: p.tier || 'all', months: (p.from || 'earliest') + ' to ' + (p.to || 'latest') },
      totals: kr && { loans: kr.loans, lent_cr: kr.lent_cr, owed_cr: kr.outstanding_cr, gold_value_at_loan_cr: kr.value_at_loan_cr, gold_value_today_cr: kr.value_today_cr, avg_24k_rate_at_loan: kr.rate_at_loan, ltv_at_loan_pct: kr.ltv_at_loan_pct, ltv_today_pct: kr.ltv_today_pct, red_loans: kr.red, amber_loans: kr.amber, underwater_loans: kr.underwater, topup_to_75_cr: kr.topup_cr },
      zones: tiers, by_loan_month: months.map((m) => ({ month: m.label, loans: m.loans, rate_at_loan: m.rate_at_loan, price_change_pct: m.price_change_pct, ltv_at_loan: m.ltv_at_loan_pct, ltv_today: m.ltv_today_pct, red: m.red, underwater: m.underwater })),
      top_branches: br, top_rms: rms, what_if_rates: sens.filter((d, i) => i % 2 === 0), riskiest_loans: top
    };
  }

  function prompt() {
    return 'You are a senior gold-loan credit risk expert at an Indian NBFC. The gold price has been falling, and the lender worries that borrowers whose loans were given at high prices may stop paying and leave the gold.\n\n'
      + 'Using ONLY the data below (amounts in rupees; cr = crore, lakh = 100,000; LTV = amount owed / gold value at today\'s 24K rate; zones: red 90%+, amber 75-90%, underwater 100%+), write a practical action plan for the risk and collections team.\n\n'
      + 'Use these headings, each starting with "## ": Summary; Who to contact first; Branch and RM priorities; Price triggers and alerts; Policy changes to consider; Risks to watch.\n'
      + 'Under each heading use 2-5 short bullet points starting with "- ". Quote the numbers from the data. Plain English, under 450 words in total. Do not invent figures. Mention RBI gold-loan rules only in general terms and say the current circular should be checked. Keep the tone fair to customers: no pressure tactics.\n\n'
      + 'DATA (JSON):\n' + JSON.stringify(dataForClaude());
  }

  const MSG = { not_granted: 'Claude was not allowed for this page.', sampling_disabled: 'Claude is not available for this account.', rate_limited: 'Too many requests right now. Please try again in a few minutes.', session_expired: 'Please sign in to Claude again.', refused: 'Claude could not answer this request.', empty_completion: 'Claude returned an empty answer. Try again.', prompt_too_large: 'Too much data to send. Narrow the filters and try again.' };

  async function ask() {
    const go = document.querySelector('#ai-ask'), stop = document.querySelector('#ai-stop');
    if (!sample || !dash.data('kpis').data) return;
    ctl = new AbortController(); go.disabled = true; stop.hidden = false;
    document.querySelectorAll('#ai-card').forEach((c) => { c.hidden = false; });
    out().replaceChildren(el('span', 'gl-thinking', 'Claude is reading the numbers…')); status('');
    try {
      const res = await sample(prompt(), { signal: ctl.signal, modelTier: 'default', cache: false, onText: ({ text }) => render(text) });
      render(res.text); status('Plan written by Claude from the figures on screen at ' + GL.rupee(GL.rate()) + '/g. Check before acting.' + (res.truncated ? ' (The answer was cut short.)' : ''));
    } catch (e) {
      if (e && e.text) render(e.text); else if (!e || e.code !== 'cancelled') out().replaceChildren();
      if (e && (e.code === 'not_granted' || e.code === 'sampling_disabled' || e.code === 'not_declared' || e.code === 'capability_disabled' || e.code === 'capability_removed')) document.querySelectorAll('.gl-ai-only').forEach((n) => { n.hidden = true; });
      status(e && e.code === 'cancelled' ? 'Stopped.' : (MSG[e && e.code] || 'Something went wrong. Please try again.'));
    } finally { go.disabled = false; stop.hidden = true; }
  }

  claude.use('sample').then((s) => {
    sample = s;
    document.querySelectorAll('.gl-ai-only').forEach((n) => { n.hidden = !s; });
    document.querySelectorAll('.gl-ai-off').forEach((n) => { n.hidden = !!s; });
  });
  document.querySelectorAll('#ai-ask').forEach((b) => b.addEventListener('click', ask));
  document.querySelectorAll('#ai-stop').forEach((b) => b.addEventListener('click', () => ctl && ctl.abort()));
})();
