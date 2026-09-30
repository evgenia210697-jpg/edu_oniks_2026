// Глобальные «тактильные» эффекты интерфейса, подключаются один раз при запуске:
// • скользящая подложка у вкладок (как сегментированный переключатель iOS);
// • предзагрузка данных страницы при наведении на ссылку — к клику всё уже загружено;
// • мгновенная реакция :active на касание в iOS/Android.
import { prefetch } from './ui';


/* ---------- Вкладки со скользящей подложкой ---------- */
function syncTabs() {
  document.querySelectorAll('.tabs').forEach((tabs) => {
    let ind = tabs.querySelector(':scope > .tab-ind');
    if (!ind) {
      ind = document.createElement('span');
      ind.className = 'tab-ind';
      ind.setAttribute('aria-hidden', 'true');
      tabs.insertBefore(ind, tabs.firstChild);
      tabs.classList.add('has-ind');
    }
    const active = tabs.querySelector(':scope > .tab.active');
    if (!active) { ind.style.opacity = '0'; return; }
    const first = !ind.dataset.ready;
    if (first) ind.style.transition = 'none';
    ind.style.opacity = '1';
    ind.style.width = `${active.offsetWidth}px`;
    ind.style.height = `${active.offsetHeight}px`;
    ind.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
    if (first) { void ind.offsetWidth; ind.style.transition = ''; ind.dataset.ready = '1'; }
  });
}
let tabsRaf = 0;
const scheduleTabs = () => { cancelAnimationFrame(tabsRaf); tabsRaf = requestAnimationFrame(syncTabs); };

/* ---------- Предзагрузка по наведению ---------- */
// Только безопасные запросы: открытие урока на сервере отмечает его как «начатый», поэтому уроки не предзагружаем
function apiForHref(href) {
  let m;
  if ((m = href.match(/^\/course\/(\d+)\/?$/))) return `/learn/courses/${m[1]}`;
  if ((m = href.match(/^\/course\/(\d+)\/certificate$/))) return `/learn/courses/${m[1]}`;
  if ((m = href.match(/^\/admin\/courses\/(\d+)(?:\/(?:students|settings))?$/))) return `/admin/courses/${m[1]}`;
  if ((m = href.match(/^\/admin\/users\/(\d+)$/))) return `/admin/users/${m[1]}`;
  if ((m = href.match(/^\/admin\/reviews\/(\d+)$/))) return `/admin/submissions/${m[1]}`;
  if (href === '/') return '/learn/courses';
  if (href === '/admin/courses') return '/admin/courses';
  if (href === '/admin/users') return '/admin/users';
  return null;
}
const hoverTimers = new WeakMap();
function onLinkOver(e) {
  const a = e.target.closest?.('a[href]');
  if (!a || hoverTimers.has(a)) return;
  const url = apiForHref(a.getAttribute('href') || '');
  if (!url) return;
  // небольшая задержка — не грузим всё подряд, когда курсор просто пролетает мимо
  hoverTimers.set(a, setTimeout(() => { prefetch(url); }, 70));
  a.addEventListener('pointerleave', () => { clearTimeout(hoverTimers.get(a)); hoverTimers.delete(a); }, { once: true });
}

let installed = false;
export function installInteractions() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  // вкладки: пересчитываем при любых изменениях интерфейса и размеров окна
  new MutationObserver(scheduleTabs).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', scheduleTabs);
  document.fonts?.ready.then(scheduleTabs);
  document.addEventListener('pointerover', onLinkOver, { passive: true });
  document.addEventListener('focusin', onLinkOver);
  // в Safari на iPhone :active срабатывает только при наличии обработчика касаний
  document.addEventListener('touchstart', () => {}, { passive: true });
  scheduleTabs();
}
