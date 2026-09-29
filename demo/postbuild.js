// После сборки демо: экранируем управляющие символы в JS (хостинг артефактов их не принимает)
// и готовим страницу demo.html для публикации на claude.ai.
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '../release/demo');
const assets = path.join(OUT, 'assets');

for (const f of fs.readdirSync(assets)) {
  if (!/\.(m?js)$/.test(f)) continue;
  const p = path.join(assets, f);
  const src = fs.readFileSync(p, 'utf8');
  // во внутренностях pdf.js такие символы встречаются только в строковых литералах — \xNN там эквивалентен
  const fixed = src
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
    .replace(/\uFFFD/g, '\\uFFFD'); // минификатор превращает '\uFFFD' обратно в символ
  if (fixed !== src) fs.writeFileSync(p, fixed);
}

const html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const pick = (re) => (html.match(re) || [])[1];
const js = pick(/<script type="module"[^>]*src="([^"]+)"/);
const css = pick(/<link rel="stylesheet"[^>]*href="([^"]+)"/);
const pre = pick(/<link rel="modulepreload"[^>]*href="([^"]+)"/);
fs.writeFileSync(path.join(OUT, 'demo.html'), [
  '<title>Учебный центр (демо)</title>',
  '<style>body{margin:0;background:#f3f5f8;color:#19212c}</style>',
  `<link rel="stylesheet" href="${css}">`,
  pre ? `<link rel="modulepreload" href="${pre}">` : '',
  '<div id="root"><div class="demo-boot">Загружаем платформу…</div></div>',
  `<script type="module" src="${js}"></script>`,
].filter(Boolean).join('\n') + '\n');
console.log('demo.html готова:', path.join(OUT, 'demo.html'));
