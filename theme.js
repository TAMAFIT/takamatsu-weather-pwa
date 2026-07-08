(() => {
  'use strict';

  const body = document.body;
  const hero = document.getElementById('hero');
  const icon = document.getElementById('heroIcon');
  const title = document.getElementById('mainTitle');
  const rain = document.getElementById('rainLevel');

  function applyTheme() {
    const text = [icon?.textContent, title?.textContent, rain?.textContent].join(' ');
    body.classList.remove('theme-ocean', 'theme-sunny', 'theme-cloudy', 'theme-rain', 'theme-night');
    hero?.classList.remove('theme-sunny', 'theme-cloudy', 'theme-rain');

    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', hour12: false }).format(new Date()));
    if (hour >= 18 || hour <= 4) {
      body.classList.add('theme-night');
      return;
    }
    if (text.includes('🌧️') || text.includes('⛈️') || text.includes('雨') || text.includes('高')) {
      body.classList.add('theme-rain');
      hero?.classList.add('theme-rain');
      return;
    }
    if (text.includes('🏖️') || text.includes('☀️') || text.includes('海日和')) {
      body.classList.add('theme-sunny');
      hero?.classList.add('theme-sunny');
      return;
    }
    if (text.includes('⛅') || text.includes('☁️') || text.includes('条件付き') || text.includes('やめとけ')) {
      body.classList.add('theme-cloudy');
      hero?.classList.add('theme-cloudy');
      return;
    }
    body.classList.add('theme-ocean');
  }

  const observer = new MutationObserver(applyTheme);
  [icon, title, rain].filter(Boolean).forEach(el => observer.observe(el, { childList: true, characterData: true, subtree: true }));
  document.addEventListener('DOMContentLoaded', applyTheme);
  setTimeout(applyTheme, 600);
})();
