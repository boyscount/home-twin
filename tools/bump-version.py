# ใส่เลขเวอร์ชันท้ายไฟล์ JS/CSS ใน index.html ก่อน deploy ทุกครั้ง: python tools/bump-version.py
# กันมือถือ/เบราว์เซอร์ที่แคชไฟล์เก่าไว้ ได้ HTML ใหม่แต่ JS เก่า (โค้ดไม่ตรงกัน → แอปค้าง กดอะไรไม่ได้)
# - <script src="js/main.js?v=…"> + modulepreload + css/*.css?v=…
# - import map: "./js/xxx.js" → "./js/xxx.js?v=…" ทุกไฟล์ใน js/ (import './farm3d.js' ในโค้ดก็ได้ไฟล์เวอร์ชันใหม่ด้วย)
import json, pathlib, re, time

root = pathlib.Path(__file__).resolve().parent.parent
html_path = root / 'index.html'
html = html_path.read_text(encoding='utf-8')
ver = time.strftime('%y%m%d%H%M')

# ไฟล์ของเราเองที่อ้างใน HTML (js/…, css/…) → ?v=ver
html = re.sub(r'((?:href|src)=")((?:js|css)/[\w.-]+\.(?:js|css))(?:\?v=\w+)?(")', rf'\g<1>\g<2>?v={ver}\g<3>', html)

# import map: เติม/อัปเดตรายการไฟล์ใน js/
m = re.search(r'(<script type="importmap">\s*)(\{.*?\})(\s*</script>)', html, re.S)
imap = json.loads(m.group(2))
imports = {k: v for k, v in imap['imports'].items() if not k.startswith('./js/')}
for f in sorted((root / 'js').glob('*.js')):
    imports[f'./js/{f.name}'] = f'./js/{f.name}?v={ver}'
imap['imports'] = imports
body = json.dumps(imap, indent=2, ensure_ascii=False).replace('\n', '\n  ')
html = html[:m.start(2)] + body + html[m.end(2):]

html_path.write_text(html, encoding='utf-8', newline='')
print('version', ver)
