// Shared interactions for every page: mobile menu, scroll reveals, and
// readout count-ups.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- mobile menu ----------
const menu = document.querySelector('[data-menu]');
const menuToggle = document.querySelector('[data-menu-toggle]');
const setMenu = (open) => {
  menu?.classList.toggle('open', open);
  menuToggle?.setAttribute('aria-expanded', String(open));
};
menuToggle?.addEventListener('click', () => setMenu(!menu.classList.contains('open')));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setMenu(false);
});

// ---------- light / dark theme ----------
// The saved choice is applied before paint by an inline script in Base.astro;
// this just handles the button. Other scripts listen for "themechange".
const themeBtn = document.querySelector('[data-theme-toggle]');
const themeMeta = document.querySelector('meta[name="theme-color"]');
const applyThemeUI = () => {
  const light = document.documentElement.dataset.theme === 'light';
  themeBtn?.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
  themeMeta?.setAttribute('content', light ? '#f7f3fd' : '#110c1a');
};
applyThemeUI();
themeBtn?.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('theme', next);
  } catch {}
  applyThemeUI();
  window.dispatchEvent(new CustomEvent('themechange'));
});

// ---------- scroll reveal ----------
const revealed = document.querySelectorAll('[data-reveal]');
if ('IntersectionObserver' in window && !reduceMotion) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' }
  );
  revealed.forEach((el) => io.observe(el));
} else {
  revealed.forEach((el) => el.classList.add('in'));
}

// ---------- readout count-up ----------
// <strong data-count="1234">1,234</strong>: the real number is already in the
// HTML; this only animates up to it when it scrolls into view.
const counters = document.querySelectorAll('[data-count]');
const fmt = new Intl.NumberFormat('en-US');
const runCount = (el) => {
  const target = Number(el.dataset.count);
  const start = performance.now();
  const dur = 1200;
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    el.textContent = fmt.format(Math.round(target * (1 - Math.pow(1 - t, 3))));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};
if (counters.length && 'IntersectionObserver' in window && !reduceMotion) {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      runCount(entry.target);
      io.unobserve(entry.target);
    }
  });
  counters.forEach((el) => io.observe(el));
}
