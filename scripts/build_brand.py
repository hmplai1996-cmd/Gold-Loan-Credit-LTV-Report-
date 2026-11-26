"""Make js/brand.js from assets/logo.png: company name, PNG data URI for the page, JPEG hex for the PDF export."""
import base64, io
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parent.parent
png = (ROOT / 'assets' / 'logo.png').read_bytes()
im = Image.open(io.BytesIO(png)).convert('RGB')
buf = io.BytesIO(); im.save(buf, 'JPEG', quality=92); jpg = buf.getvalue()
mark = (ROOT / 'assets' / 'logo-mark.png').read_bytes()
js = ('/* Company branding: name and logo (made by scripts/build_brand.py from assets/logo.png). */\n'
      'window.GL_BRAND = {\n'
      "  name: 'HINDUSTHAN FINCAP CONSULTANCY LLP',\n"
      "  short: 'Hindusthan FinCap',\n"
      f"  w: {im.width}, h: {im.height},\n"
      f"  logo: 'data:image/png;base64,{base64.b64encode(png).decode()}',\n"
      f"  mark: 'data:image/png;base64,{base64.b64encode(mark).decode()}',\n"
      f"  jpgHex: '{jpg.hex()}'\n"
      '};\n'
      '(function () {\n'
      "  document.querySelectorAll('[data-brand-logo]').forEach((img) => { img.src = window.GL_BRAND.logo; });\n"
      "  document.querySelectorAll('[data-brand-name]').forEach((el) => { el.textContent = window.GL_BRAND.name; });\n"
      "  const fav = document.querySelector('link[rel=icon]'); if (fav) fav.href = window.GL_BRAND.mark;\n"
      '})();\n')
(ROOT / 'js' / 'brand.js').write_text(js)
print(len(js), 'bytes', im.size, len(jpg), 'jpg bytes')
