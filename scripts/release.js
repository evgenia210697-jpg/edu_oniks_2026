// Сборка готового архива для установки на сервер без интернета:
//   npm run release  →  release/lms-platform-ВЕРСИЯ.zip
// Внутри: собранный интерфейс (client/dist), сервер и все нужные для работы зависимости (node_modules).
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const OUT = path.join(ROOT, 'release');
const NAME = 'lms-platform';
const DIR = path.join(OUT, NAME);
const run = (cmd, cwd = ROOT) => execSync(cmd, { cwd, stdio: 'inherit', shell: true });

console.log('1/4 Сборка интерфейса…');
run('npm run build');

console.log('2/4 Копирование файлов…');
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });
const copy = [
  'server', 'client/dist', 'package.json', 'package-lock.json', '.env.example', 'README.md', 'ИНСТРУКЦИЯ.md',
  'start-linux.sh', 'start-windows.bat', 'Dockerfile', 'docker-compose.yml', '.dockerignore',
];
for (const f of copy) fs.cpSync(path.join(ROOT, f), path.join(DIR, f), { recursive: true });

console.log('3/4 Установка зависимостей для работы (без инструментов разработки)…');
run('npm ci --omit=dev --no-audit --no-fund', DIR);

console.log('4/4 Упаковка в zip…');
const zip = path.join(OUT, `${NAME}-${pkg.version}.zip`);
fs.rmSync(zip, { force: true });
if (process.platform === 'win32') run(`tar -a -c -f "${zip}" ${NAME}`, OUT);
else run(`zip -qr "${zip}" ${NAME}`, OUT);

console.log(`\nГотово: ${zip}`);
