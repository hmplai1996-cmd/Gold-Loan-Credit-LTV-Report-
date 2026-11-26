/*
 * templates.js
 * "Download format" buttons on the Update data tab: blank input files with only the columns
 * the dashboard reads, plus a Guide sheet explaining each column.
 */
(function () {
  const POS_COLS = [
    ['Loan Account', 'Required', 'Loan account number exactly as in the loan system. Keep this column as Text so Excel does not change long numbers.', '96731015050000390'],
    ['POS', 'Required', 'Principal outstanding today, in rupees. 0 means the loan is closed.', '401300'],
    ['Interest Due', 'Optional', 'Interest accrued and not yet paid, in rupees. Leave blank if POS already includes interest.', '18250']
  ];
  const DISB_COLS = [
    ['Loan Account', 'Required', 'Loan account number. Keep as Text.', '96731015050000390'],
    ['Status', 'Required', 'S04 = active. Any other status is treated as closed.', 'S04'],
    ['POS', 'Required', 'Principal outstanding, in rupees.', '401300'],
    ['DB amount', 'Required', 'Amount disbursed, in rupees.', '401300'],
    ['ApplicationDate', 'Required', 'Loan date, dd/mm/yyyy.', '23/11/2026'],
    ['AuthorizationDate', 'Recommended', 'Sanction date, dd/mm/yyyy. Used for the maturity date (+12 months).', '23/11/2026'],
    ['BranchName', 'Required', 'Branch name.', 'Gadhinglaj'],
    ['RelationshipManager', 'Recommended', 'RM code or name.', 'SBE869'],
    ['ApplicantName', 'Recommended', 'Customer name (shown in the customer list).', 'Customer name'],
    ['CustomerID', 'Recommended', 'Customer ID. Groups a borrower’s loans for the RBI caps. 0 or blank if none.', '123456'],
    ['ROI', 'Recommended', 'Interest rate % a year.', '24'],
    ['EMI', 'Recommended', 'Total repayable at maturity (principal + interest) for bullet loans.', '489342'],
    ['TotalGrossWeight', 'Recommended', 'Total gross weight of all items, grams.', '58.5'],
    ['TotalStoneWeight', 'Recommended', 'Total weight of stones and beads deducted, grams.', '9.5'],
    ['TotalNetWeight', 'Required', 'Total net gold weight of all items, grams.', '49'],
    ['OrnamentType', 'Recommended', 'Ornament of each item, separated by commas, in item order (Mangalsutra, Chain, Ring, Earings, Bangles, Necklace, Laxmi Haar…).', 'Mangalsutra, Ring, Earings'],
    ['Karat', 'Required', 'Karat of each item, separated by commas, in item order.', '22, 24, 22'],
    ['MarketRate', 'Required', 'Bank rate per gram used for each item, same order.', '10300, 11250, 10300'],
    ['BankNetValue', 'Required', 'Bank value of each item, same order (net weight × MarketRate).', '58298, 11250, 30900'],
    ['OpenMarketValue', 'Required', 'Open-market rate per gram for each item on the loan date, same order.', '13750, 15000, 13750'],
    ['BuccsLoanAcNo', 'Optional', 'BC partner loan account, for loans through a business correspondent. Blank otherwise.', '']
  ];
  const TEXT_COLS = new Set(['OrnamentType', 'Loan Account', 'Status', 'ApplicationDate', 'AuthorizationDate', 'CustomerID', 'Karat', 'MarketRate', 'BankNetValue', 'OpenMarketValue', 'BuccsLoanAcNo']);

  const stamp = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const guideSheet = (title, cols, notes) => {
    const rows = [[{ v: (window.GL_BRAND ? GL_BRAND.name : ''), s: 5 }], [{ v: title, s: 5 }], ...notes.map((n) => [{ v: n, s: 11 }]), [], [{ v: 'Column', s: 1 }, { v: 'Needed?', s: 1 }, { v: 'What to enter', s: 1 }, { v: 'Example', s: 1 }]];
    cols.forEach(([c, need, what, ex]) => rows.push([{ v: c, s: need === 'Required' ? 10 : 0 }, { v: need }, { v: what, s: 11 }, { v: ex, s: 9 }]));
    return { name: 'Guide', rows, widths: [22, 13, 70, 26] };
  };
  const currentLoans = () => {
    if (GL_CONFIG.masked) return [];                     // masked numbers cannot be looked up in the loan system
    const rows = (window.GLDATA && GLDATA.rows && GLDATA.rows()) || [];
    return rows.slice().sort((a, b) => String(a.branch).localeCompare(String(b.branch)) || String(a.loan).localeCompare(String(b.loan)));
  };

  function posBook() {
    const loans = currentLoans();
    const data = [POS_COLS.map(([c, need]) => ({ v: c, s: need === 'Required' ? 10 : 1 }))].concat(loans.map((r) => [{ v: String(r.loan), s: 9 }]));
    const notes = [
      'Fill the “POS update” sheet, save, and upload it on the Update data tab under “POS & interest update”.',
      loans.length ? 'The ' + loans.length + ' loan accounts on the dashboard today are already listed; fill in POS and interest for each. Loans you leave out keep their current amounts (or are removed if you tick that option when uploading).' : 'Paste the loan account numbers from your loan system, one per row.',
      'Amount owed = POS + Interest Due. Yellow headers are required.'
    ];
    return [{ name: 'POS update', rows: data, widths: [22, 14, 14], freeze: true, colStyle: [9, 2, 2] }, guideSheet('POS & interest update — format', POS_COLS, notes)];
  }
  function disbBook() {
    const data = [DISB_COLS.map(([c, need]) => ({ v: c, s: need === 'Required' ? 10 : 1 }))];
    const notes = [
      'Fill one row per gold loan in the “Disbursement report” sheet, save, and upload it on the Update data tab under “New disbursement report”.',
      'A loan with several items has the item details in one cell each, separated by commas, in the same order in OrnamentType, Karat, MarketRate, BankNetValue and OpenMarketValue.',
      'The full FinCap disbursement report also works: these are the same column names. No other columns are needed (no address, mobile, PAN or Aadhaar).',
      'Yellow headers are required.'
    ];
    return [{ name: 'Disbursement report', rows: data, widths: DISB_COLS.map(([c]) => Math.max(12, c.length + 4)), freeze: true, colStyle: DISB_COLS.map(([c]) => (TEXT_COLS.has(c) ? 9 : 2)) }, guideSheet('New disbursement report — format', DISB_COLS, notes)];
  }
  const csvCell = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.split('"').join('""') + '"' : s; };
  const csvOf = (sheet) => '﻿' + sheet.rows.map((r) => r.map((c) => csvCell(c && c.v)).join(',')).join('\r\n') + '\r\n';

  async function download(kind, fmt, btn) {
    const book = kind === 'pos' ? posBook() : disbBook();
    const base = (kind === 'pos' ? 'POS_interest_update_format_' : 'New_disbursement_report_format_') + stamp();
    const msg = btn.closest('.gl-tpl').querySelector('.gl-tplmsg');
    try {
      if (fmt === 'xlsx') await GLX.save(base + '.xlsx', GLX.workbook(book));
      else await GLX.save(base + '.csv', csvOf(book[0]));
      msg.textContent = 'Saved ' + base + '.' + fmt + (fmt === 'csv' ? ' — if you open it in Excel, set the Loan Account column to Text before typing numbers.' : '');
    } catch (e) {
      msg.textContent = e && e.code === 'declined' ? 'Download cancelled.' : 'Downloads are not available in this view.';
    }
  }
  document.querySelectorAll('[data-tpl]').forEach((b) => b.addEventListener('click', () => { const [kind, fmt] = b.dataset.tpl.split(':'); download(kind, fmt, b); }));
})();
