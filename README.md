# Gold loan price risk dashboard

**HINDUSTHAN FINCAP CONSULTANCY LLP**

> ⚠️ **PRIVATE REPOSITORY ONLY.** This version contains real customer names and full loan account numbers (`data/gold_loans.csv`). Keep the repository private, give access only to staff who need it, and never host it on a public website.

A web dashboard that shows how a fall in the gold price affects an active gold loan book. You enter today's 24K gold rate, and it recalculates the value of every pledged loan and its loan-to-value (LTV). It then shows which accounts are in the **red** (LTV 90%+), **amber** (75–90%) or **green** (below 75%) zone, and which are **underwater** (gold worth less than the amount owed).

It is a static site: plain HTML, CSS and JavaScript, plus [d3](https://d3js.org/) from a CDN. There is no build step and no server code.

> **Privacy:** customer names and loan account numbers in `data/gold_loans.csv` are masked (e.g. `V**** S. P.`, `96731015••••00390`). Mobile numbers, addresses and ID numbers are not included. Amounts, weights and rates are real. Keep the unmasked report out of this repository.

## What it does

- **Gold rate today by karat** (18K–24K): filled in from the 24K rate × karat ÷ 24, or type your own rate for any karat. Each pledged item is valued at its own karat's rate.
- **Filters** for the 24K gold rate (box, slider or preset), loan month range, branch, relationship manager and risk zone. Every card, chart and table updates together.
- **Six headline cards**: amount owed, gold value today vs at loan, book LTV, red-zone loans, amber-zone loans, and the top-up needed to bring loans back to 75% LTV. Clicking Red or Amber opens those accounts.
- **Overview tab**: where the amount owed sits by zone, how far gold has fallen since each month's loans, LTV at loan vs today by month, and a "what if gold falls further" chart.
- **Branches tab**: red-zone amount by branch (click to filter) and a sortable branch summary.
- **Customers tab**: a searchable, sortable, paginated customer list with a details panel and suggested follow-up for each loan.
- **Export**: CSV, Excel (.xlsx, with a Summary sheet) and PDF (A4 landscape) of the loans currently shown.
- **AI expert tab**: an action plan worked out from the figures on screen: where things stand, who to contact first, branch and RM priorities, gold-price triggers and policy suggestions. It updates as you move the rate or filters.
- **Update data tab**:
  - *POS & interest update*: upload the daily POS file (.xlsx or .csv). Loan account, POS and interest columns are detected automatically and can be changed. Amount owed becomes POS + interest (or POS alone if it already includes interest).
  - *New disbursement report*: upload a new FinCap disbursement report to add new loans (or replace all loans). Loans now closed in the report are removed.
  - Files are read inside the browser and never sent anywhere. You can keep uploaded data in this browser or restore the original data.

## Run it on your computer

The page loads its CSV with `fetch`, so open it through a small local web server rather than by double-clicking `index.html`:

```bash
cd gold-loan-risk-dashboard
python -m http.server 8000
```

Then open <http://localhost:8000>.

## Publish with GitHub Pages

1. Push this folder to a GitHub repository.
2. On GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, branch **main**, folder **/ (root)**, and save.
4. After a minute the site is live at `https://<your-username>.github.io/<repository-name>/`.

## Update the data

1. Open the new FinCap disbursement report in Excel and save it once, so the formula results (Status, POS, DB amount) are stored.
2. Run:

   ```bash
   pip install openpyxl
   python scripts/build_data.py path/to/FinCapsDisbursementReport.xlsx
   ```

   This rewrites `data/gold_loans.csv` with masked names and loan numbers.
3. Update the "Data updated" date in `index.html` (header and footer).
4. Commit and push. GitHub Pages republishes automatically.

## Change the defaults

| What | Where |
|---|---|
| Default 24K rate and preset buttons | `DEFAULT_PARAMS.rate` in `js/dash-shim.js`, `DEFAULT_RATE` in `js/core.js`, and the `data-rate` buttons in `index.html` |
| Zone thresholds (90% / 75%) | `tier:` line in the `scored` calculation in `js/core.js`, plus the labels in `index.html` |
| Colours, fonts, spacing | tokens at the top of `css/base.css` |

## How the numbers are worked out

- **Pure-gold weight** = each item's net weight × karat ÷ 24.
- **Gold value at loan** = net weight × the valuer's open-market rate on the loan date.
- **Gold value today** = pure-gold weight × the 24K rate you enter.
- **LTV today** = amount owed now (POS, including interest) ÷ gold value today.
- **Top-up to 75%** = amount owed − 75% of gold value today, for loans above 75%.

The zones are review bands for this dashboard, not a regulatory classification. 75% matches the RBI gold-loan LTV ceiling as understood; confirm against the circular in force.

## Project structure

```
index.html                 page layout
css/base.css               design tokens, light and dark themes
css/style.css              dashboard components
js/dash-shim.js            small data and drawing runtime (filters, recalculation, redraws)
js/core.js                 helpers and all calculations
js/charts.js               cards, filter dropdowns and charts
js/table.js                customer and branch tables, tabs, CSV export
js/export.js               Excel and PDF export
js/upload.js               POS & interest and disbursement uploads (.xlsx / .csv read in the browser)
js/advisor.js              AI expert action plan
data/gold_loans.csv masked loan data
scripts/build_data.py      rebuilds the CSV from a FinCap report
```

## Gold rate tab

- 5 years of daily gold prices are built in (`js/gold-history.js`, made from `data/gold_history_raw.txt` by `scripts/build_history.py`).
- When the page is online it fetches newer prices itself, on opening and every 6 hours: international closes from [xaus.com](https://xaus.com/api) and USD/INR from [frankfurter.dev](https://frankfurter.dev) (ECB rates). Both are free, need no key and allow browser requests.
- Indian 24K estimate = international price in rupees × (1 + import duty in force) × a market premium calibrated to a real Indian rate (default Goodreturns, 25 Nov 2026). Enter the IBJA rate in the tab to recalibrate.
- The rate in use can follow the RBI rule (lower of the previous close and the 30-day average), the previous close, the live price, or stay manual. Every change is logged in the browser.
