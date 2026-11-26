"""
Build data/gold_loans_masked.csv from a FinCap disbursement report (.xlsx).

Usage:
    pip install openpyxl
    python scripts/build_data.py path/to/FinCapsDisbursementReport.xlsx

What it does:
  * reads the 'Report' sheet (the sheet with Status, POS and DB amount columns)
  * keeps active gold loans: Status = S04 and POS (amount owed) above zero
  * works out each loan's pure-gold (24K-equivalent) weight and its gold value on the loan date
  * masks customer names and loan account numbers so the file can go on a public site
  * writes data/gold_loans_masked.csv, which the dashboard reads

Status, POS and DB amount are VLOOKUP formulas in the report. Open the report in Excel and
save it once before running this, so the formula results are stored in the file.
"""
import csv
import hashlib
import hmac
import os
import sys
from pathlib import Path

import openpyxl

OUT = Path(__file__).resolve().parent.parent / 'data' / 'gold_loans.csv'
COLUMNS = ['loan', 'customer', 'branch', 'rm', 'month', 'karat', 'disbursed', 'outstanding',
           'net_g', 'gold24_g', 'value_at_loan', 'rate24_at_loan', 'kg',
           'roi', 'matamt', 'auth', 'bkey', 'orn', 'gross_g', 'stone_g', 'bc']
SALT = os.urandom(16)                                   # new every build, never saved: borrower keys only group loans


def borrower_key(r, idx):
    """Same borrower -> same short key. Customer ID, else PAN, else name + date of birth; hashed, so no ID is published."""
    get = lambda c: str(r[idx[c]]).strip() if c in idx and r[idx[c]] is not None else ''
    cid, pan = get('CustomerID'), get('PAN').upper()
    if cid not in ('', '0', 'None'):
        key = 'C:' + cid
    elif len(pan) == 10:
        key = 'P:' + pan
    else:
        key = 'N:' + ' '.join(get('ApplicantName').upper().split()) + '|' + get('DateOfBirth')
    if get('BuccsLoanAcNo'):
        key = 'BC|' + key                                 # BC-partner loans are a separate book
    return hmac.new(SALT, key.encode(), hashlib.sha256).hexdigest()[:12]


def iso_date(v):
    d = str(v or '')
    return f'{d[6:10]}-{d[3:5]}-{d[0:2]}' if len(d) >= 10 and d[2] in '/-' else ''


def num(v):
    try:
        return float(str(v).replace(',', '').strip())
    except (TypeError, ValueError):
        return None


def parts(v):
    return [p.strip() for p in str(v).split(',')] if v is not None else []


def mask_name(name):
    words = [w for w in str(name).replace(',', ' ').split() if w]
    if not words:
        return 'CUSTOMER'
    first = words[0][:1] + '*' * max(2, len(words[0]) - 1)
    return ' '.join([first] + [w[0] + '.' for w in words[1:]])


def mask_loan(loan):
    loan = str(loan)
    if len(loan) <= 13:
        return loan[:2] + '•' * max(0, len(loan) - 6) + loan[-4:]
    return loan[:8] + '•' * (len(loan) - 13) + loan[-5:]


def main(path, out=OUT, masked=False):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb['Report']
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    idx = {h: i for i, h in enumerate(header)}
    rows_out, skipped = [], 0
    for r in rows:
        if not r or all(v is None for v in r):
            continue
        if r[idx['Status']] != 'S04':
            continue
        pos = num(r[idx['POS']]) or 0
        if pos <= 0:
            continue
        karats, rates, bank, omv = (parts(r[idx[c]]) for c in ('Karat', 'MarketRate', 'BankNetValue', 'OpenMarketValue'))
        gold24 = value_then = 0.0
        by_karat = {}                              # net grams per karat
        pieces = []                                # ornament~karat~net grams~value at loan, one per piece
        orns = parts(r[idx['OrnamentType']]) if 'OrnamentType' in idx else []
        ok = karats and len(karats) == len(rates) == len(bank) == len(omv)
        if ok:
            for k, m, b, o in zip(karats, rates, bank, omv):
                k, m, b, o = num(k), num(m), num(b), num(o)
                if not (k and m and b and o):
                    ok = False
                    break
                grams = b / m                      # item net weight
                gold24 += grams * k / 24.0         # pure-gold equivalent
                by_karat[k] = by_karat.get(k, 0) + grams
                value_then += grams * o            # value at the valuer's open-market rate
                t = orns[len(pieces)] if len(pieces) < len(orns) else 'Other'
                t = ' '.join(str(t).replace('~', ' ').replace('|', ' ').split()).title() or 'Other'
                pieces.append(f'{t}~{k:g}~{grams:.3f}~{round(grams * o)}')
        if not ok:                                 # fall back to total net weight and average karat
            skipped += 1
            ks = [num(k) for k in karats if num(k)]
            os_ = [num(o) * 24 / num(k) for k, o in zip(karats, omv) if num(k) and num(o)]
            avgk = sum(ks) / len(ks) if ks else 22
            gold24 = (num(r[idx['TotalNetWeight']]) or 0) * avgk / 24.0
            by_karat = {round(avgk, 2): num(r[idx['TotalNetWeight']]) or 0}
            pieces = []
            value_then = gold24 * (sum(os_) / len(os_) if os_ else 0)
        if gold24 <= 0:
            continue
        d = str(r[idx['ApplicationDate']])            # dd/mm/yyyy
        rows_out.append([
            mask_loan(r[idx['Loan Account']]) if masked else str(r[idx['Loan Account']]),
            mask_name(r[idx['ApplicantName']]) if masked else ' '.join(str(r[idx['ApplicantName']]).replace(',', ' ').split()),
            r[idx['BranchName']], r[idx['RelationshipManager']], f'{d[6:10]}-{d[3:5]}',
            str(r[idx['Karat']]).replace(', ', '/').replace(',', '/'),
            round(num(r[idx['DB amount']]) or 0), round(pos), round(num(r[idx['TotalNetWeight']]) or 0, 2),
            round(gold24, 3), round(value_then), round(value_then / gold24),
            '/'.join(f'{k:g}:{g:.3f}' for k, g in sorted(by_karat.items())),
            num(r[idx['ROI']]) if 'ROI' in idx else '',
            round(num(r[idx['EMI']]) or 0) if 'EMI' in idx else '',   # amount repayable at maturity (bullet loan)
            iso_date(r[idx['AuthorizationDate']]) if 'AuthorizationDate' in idx else '',
            borrower_key(r, idx),
            '|'.join(pieces),
            round(num(r[idx['TotalGrossWeight']]) or 0, 2) if 'TotalGrossWeight' in idx else '',
            round(num(r[idx['TotalStoneWeight']]) or 0, 2) if 'TotalStoneWeight' in idx else '',
            '1' if 'BuccsLoanAcNo' in idx and str(r[idx['BuccsLoanAcNo']] or '').strip() not in ('', '0', 'None') else '',
        ])
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open('w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(COLUMNS)
        w.writerows(rows_out)
    print(f'Wrote {len(rows_out)} active loans to {out} ({skipped} used the fallback weight).')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
