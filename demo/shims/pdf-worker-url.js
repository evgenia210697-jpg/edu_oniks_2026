// Просмотрщик PDF работает в отдельном потоке. В демо его код встроен в страницу
// и запускается из blob:-ссылки — отдельные файлы на claude.ai недоступны.
import src from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?raw';

export default URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
