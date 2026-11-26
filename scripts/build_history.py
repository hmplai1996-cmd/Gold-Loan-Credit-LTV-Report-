"""Turn data/gold_history_raw.txt (yyyymmdd,USD per oz close,USD/INR;...) into js/gold-history.js.
Source: xaus.com /api/v1/history (daily XAU/USD closes) and frankfurter.dev (ECB USD/INR)."""
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
raw = (ROOT / 'data' / 'gold_history_raw.txt').read_text().strip()
rows = [r.split(',') for r in raw.split(';')]
assert all(len(r) == 3 for r in rows)
(ROOT / 'js' / 'gold-history.js').write_text(
    '/* Daily gold closes (USD per troy ounce, xaus.com) and USD/INR (ECB via frankfurter.dev), '
    + rows[0][0] + ' to ' + rows[-1][0] + '. The page adds newer days itself when it is online. */\n'
    'window.GL_GOLD_HIST = "' + raw + '";\n')
print(len(rows), 'days', rows[0][0], '->', rows[-1][0])
