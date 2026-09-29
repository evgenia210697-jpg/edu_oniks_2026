// После сборки демо: экранируем управляющие символы в JS (хостинг артефактов их не принимает)
// и готовим страницу demo.html для публикации на claude.ai.
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '../release/demo');
const assets = OUT; // assetsDir: '' — всё лежит рядом со страницей

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

// Страница для claude.ai: весь код и стили встраиваются прямо в неё —
// просмотрщик артефактов не загружает скрипты и стили из отдельных файлов.
const html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const pick = (re) => (html.match(re) || [])[1];
const read = (rel) => fs.readFileSync(path.join(OUT, rel.replace(/^\.\//, '')), 'utf8');
const jsFile = pick(/<script type="module"[^>]*src="([^"]+)"/);
const cssFiles = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
const js = read(jsFile).replace(/<\/script/gi, '<\\/script');
const css = cssFiles.map(read).join('\n').replace(/<\/style/gi, '<\\/style');
fs.writeFileSync(path.join(OUT, 'demo.html'), [
  '<title>Учебный центр (демо)</title>',
  '<style>body{margin:0;background:#f3f5f8;color:#19212c}</style>',
  `<style>${css}</style>`,
  '<div id="root"><div class="demo-boot">Загружаем платформу…</div></div>',
  `<script type="module">${js}</script>`,
].join('\n') + '\n');
const kb = Math.round(fs.statSync(path.join(OUT, 'demo.html')).size / 1024);
console.log(`demo.html готова (${kb} КБ):`, path.join(OUT, 'demo.html'));
