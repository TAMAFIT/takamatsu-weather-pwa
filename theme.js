(() => {
  'use strict';

  const style = document.createElement('style');
  style.textContent = `
    body{min-height:100svh;background:#bfefff!important;}
    body::before{content:""!important;position:fixed!important;inset:0!important;z-index:-3!important;background-image:var(--bg-image)!important;background-size:cover!important;background-position:center top!important;background-repeat:no-repeat!important;filter:saturate(1.04) contrast(1.02);}
    body::after{content:""!important;position:fixed!important;inset:0!important;z-index:-2!important;background:linear-gradient(180deg,rgba(255,255,255,.24),rgba(255,255,255,.10) 38%,rgba(255,255,255,.34))!important;pointer-events:none!important;}
    body.theme-sunny{--bg-image:url('./assets/bg-sunny.svg');}
    body.theme-cloudy{--bg-image:url('./assets/bg-cloudy.svg');}
    body.theme-rain{--bg-image:url('./assets/bg-rain.svg');}
    body.theme-night{--bg-image:url('./assets/bg-night.svg');}
    body.theme-rain::after{background:linear-gradient(180deg,rgba(19,45,66,.14),rgba(255,255,255,.18) 55%,rgba(255,255,255,.34))!important;}
    body.theme-night::after{background:linear-gradient(180deg,rgba(0,8,22,.20),rgba(0,18,38,.12) 46%,rgba(255,255,255,.14))!important;}
    .header{text-shadow:0 2px 18px rgba(255,255,255,.85)!important;}
    .hero{background:linear-gradient(145deg,rgba(0,167,200,.58),rgba(43,198,218,.34) 48%,rgba(255,222,151,.16))!important;border:1px solid rgba(255,255,255,.50)!important;backdrop-filter:blur(13px)!important;-webkit-backdrop-filter:blur(13px)!important;box-shadow:0 26px 70px rgba(0,72,96,.24)!important;}
    .theme-cloudy .hero{background:linear-gradient(145deg,rgba(83,139,166,.50),rgba(255,255,255,.25),rgba(249,215,162,.16))!important;}
    .theme-rain .hero{background:linear-gradient(145deg,rgba(43,72,96,.58),rgba(105,138,160,.34),rgba(255,255,255,.12))!important;}
    .theme-night .hero{background:linear-gradient(145deg,rgba(5,17,40,.70),rgba(24,71,108,.36),rgba(255,255,255,.12))!important;}
    .card{background:rgba(255,255,255,.76)!important;border-color:rgba(255,255,255,.76)!important;backdrop-filter:blur(16px)!important;-webkit-backdrop-filter:blur(16px)!important;}
  `;
  document.head.appendChild(style);

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
    body.classList.add('theme-sunny');
  }

  const observer = new MutationObserver(applyTheme);
  [icon, title, rain].filter(Boolean).forEach(el => observer.observe(el, { childList: true, characterData: true, subtree: true }));
  document.addEventListener('DOMContentLoaded', applyTheme);
  setTimeout(applyTheme, 400);
  setTimeout(applyTheme, 1600);
})();
