/*
 * dash-shim.js
 * A small runtime: loads the loan data, recalculates every figure when data or a filter
 * changes, and redraws the page. Also holds uploaded data (window.GLDATA).
 * Needs d3 v7 loaded first. Settings come from window.GL_CONFIG.
 */
(function () {
  'use strict';

  const CFG = Object.assign({ dataUrl: 'data/gold_loans_masked.csv', masked: true, edition: 'github', dataLabel: 'FinCap disbursement report, 24 Nov 2026', storageKey: 'gl-uploaded-v1' }, window.GL_CONFIG || {});
  window.GL_CONFIG = CFG;
  const DEFAULT_PARAMS = { rate: 12458, r18: '', r19: '', r20: '', r21: '', r22: '', r23: '', tier: '', branch: '', rm: '', orn: '', asof: '', intmode: 'cap', bucc: 13, salary: 1100000, itfee: 0.01, buccscope: 'all', from: '', to: '', ver: 0 };

  let params = Object.assign({}, DEFAULT_PARAMS);
  const sources = {};
  const calcs = [];
  const calcValues = {};
  const draws = {};
  const listeners = [];
  let scheduled = false;
  let originalRows = null;

  const store = {
    get() { try { const s = localStorage.getItem(CFG.storageKey); return s ? JSON.parse(s) : null; } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(CFG.storageKey, JSON.stringify(v)); return true; } catch (e) { return false; } },
    clear() { try { localStorage.removeItem(CFG.storageKey); } catch (e) { /* ignore */ } }
  };

  function loadLoans() {
    if (sources.loans) return;
    sources.loans = { status: 'loading', data: [], columns: [] };
    /* A single-file copy carries its CSV inside the page (<script type="text/csv" id="gl-data">). */
    const inline = document.getElementById('gl-data');
    const load = inline ? Promise.resolve(d3.csvParse(inline.textContent.trim())) : d3.csv(CFG.dataUrl);
    load
      .then((rows) => {
        originalRows = rows;
        const saved = store.get();
        if (saved && Array.isArray(saved.rows) && saved.rows.length) {
          sources.loans = { status: 'ok', data: saved.rows };
          GLDATA.info = saved.info || GLDATA.info;
          GLDATA.remember = true;
        } else {
          sources.loans = { status: 'ok', data: rows };
        }
        refresh();
      })
      .catch((e) => { console.error('Could not load ' + CFG.dataUrl, e); sources.loans = { status: 'error', data: [], message: String((e && e.message) || e) }; refresh(); });
  }

  function get(id) {
    if (id === 'loans') { loadLoans(); return sources.loans; }
    return calcValues[id] || { status: 'loading', data: null };
  }

  function recompute() {
    calcs.forEach((c) => {
      const ins = c.inputs.map(get);
      const blocked = ins.find((s) => s.status !== 'ok');
      if (blocked) { calcValues[c.id] = { status: blocked.status, data: null }; return; }
      try { calcValues[c.id] = { status: 'ok', data: c.fn(...ins.map((s) => s.data)) }; }
      catch (e) { console.error('Calculation ' + c.id + ' failed', e); calcValues[c.id] = { status: 'error', data: null, message: String(e) }; }
    });
  }

  const isVisible = (el) => !el.closest('[hidden]');
  const isNested = (el) => !!(el.parentElement && el.parentElement.closest('[data-draw]'));

  function runDraw(name, el) {
    const d = draws[name];
    if (!d) return;
    try {
      if (typeof d.spec === 'function') d.spec(el);
      else {
        if (!d.made.has(el)) d.made.set(el, d.spec.mount ? d.spec.mount(el) : undefined);
        if (d.spec.update) d.spec.update(el, d.made.get(el));
      }
    } catch (e) { console.error('Drawing ' + name + ' failed', e); }
    el.__glWidth = el.clientWidth;
  }

  function drawAll(only, onlyResized) {
    document.querySelectorAll('[data-draw]').forEach((el) => {
      const name = el.dataset.draw;
      if (only && name !== only) return;
      if (!isVisible(el) || isNested(el)) return;
      if (onlyResized && el.__glWidth === el.clientWidth) return;
      runDraw(name, el);
    });
  }

  function refresh() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      recompute();
      listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
      drawAll();
    });
  }

  window.dash = {
    data(id) {
      const s = get(id);
      return { status: s.status, data: s.data, columns: s.columns || [], message: s.message || '', refreshing: false, truncated: false, meta: [] };
    },
    calc(id, opts) { calcs.push({ id, inputs: opts.inputs || [], fn: opts.fn }); },
    loader() {},
    draw(name, spec) {
      if (spec === undefined) { drawAll(name); return; }
      draws[name] = { spec, made: new WeakMap() };
    },
    onData(fn) { listeners.push(fn); try { fn(); } catch (e) { console.error(e); } },
    params() { return Object.assign({}, params); },
    setParams(obj) { params = Object.assign({}, params, obj); refresh(); },
    resetParams() { params = Object.assign({}, DEFAULT_PARAMS); refresh(); },
    setLink(id) { try { history.replaceState(null, '', '#' + id); } catch (e) { /* ignore */ } },
    refresh,
    colors: ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)']
  };

  /* Uploaded data: replaces the built-in loans for this browser. */
  const GLDATA = window.GLDATA = {
    info: { base: CFG.dataLabel, events: [] },
    remember: false,
    rows() { return sources.loans && sources.loans.status === 'ok' ? sources.loans.data : null; },
    isOriginal() { return !!originalRows && sources.loans && sources.loans.data === originalRows; },
    replace(rows, event) {
      sources.loans = { status: 'ok', data: rows };
      if (event) GLDATA.info = { base: GLDATA.info.base, events: GLDATA.info.events.concat([event]).slice(-8) };
      if (GLDATA.remember) GLDATA.persist();
      params = Object.assign({}, params, { ver: (params.ver || 0) + 1 });
      refresh();
    },
    restore() {
      if (!originalRows) return;
      sources.loans = { status: 'ok', data: originalRows };
      GLDATA.info = { base: CFG.dataLabel, events: [] };
      store.clear();
      params = Object.assign({}, params, { ver: (params.ver || 0) + 1 });
      refresh();
    },
    persist() { return store.set({ rows: sources.loans.data, info: GLDATA.info }); },
    setRemember(on) { GLDATA.remember = !!on; if (on) { if (!GLDATA.isOriginal()) GLDATA.persist(); } else store.clear(); refresh(); }
  };

  /* Stand-ins for the Claude page capabilities, used only when the page runs outside Claude. */
  if (!window.claude) {
    const MIME = { csv: 'text/csv;charset=utf-8', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pdf: 'application/pdf' };
    window.claude = {
      use(name) {
        if (name === 'downloads') {
          return Promise.resolve({
            save({ filename, data }) {
              return new Promise((resolve, reject) => {
                try {
                  const ext = String(filename).split('.').pop().toLowerCase();
                  const blob = data instanceof Blob ? data : new Blob([data], { type: MIME[ext] || 'application/octet-stream' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = filename; a.style.display = 'none';
                  document.body.append(a); a.click(); a.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 4000);
                  resolve({ status: 'saved' });
                } catch (e) { reject({ code: 'unavailable', message: String(e) }); }
              });
            }
          });
        }
        if (name === 'user') return Promise.resolve({ me: async () => ({ name: '' }), profiles: async () => ({}), isOwner: () => false, canEdit: () => false });
        return Promise.resolve(null);
      }
    };
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => drawAll(null, true), 150); });

  document.addEventListener('DOMContentLoaded', () => {
    const mo = new MutationObserver(() => refresh());
    document.querySelectorAll('[role=tabpanel]').forEach((p) => mo.observe(p, { attributes: true, attributeFilter: ['hidden'] }));
    refresh();
  });
})();
