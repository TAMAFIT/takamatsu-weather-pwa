(() => {
  'use strict';

  const CFG = {
    lat: 34.3428,
    lon: 134.0466,
    tz: 'Asia/Tokyo',
    days: 16,
    startHour: 9,
    endHour: 17,
    cacheKey: 'takamatsu-weather:sea-v9:last-success'
  };

  const state = { selectedDate: null, bundle: null };

  document.addEventListener('DOMContentLoaded', () => {
    try {
      mount();
      document.body.classList.add('v9-ready');
      load(false);
    } catch (error) {
      console.error('[v9 init]', error);
      document.body.classList.remove('v9-ready');
    }
  });

  function mount() {
    const main = document.querySelector('main');
    if (!main) return;
    document.querySelector('.v9-app')?.remove();
    const app = document.createElement('section');
    app.className = 'v9-app';
    app.innerHTML = `
      <div id="v9Hero" class="v9-hero grade-good">
        <div class="v9-topline">
          <div><span class="v9-kicker">高松・海日和判定</span><strong id="v9Date">--</strong></div>
          <button id="v9Refresh" class="v9-refresh" type="button">更新</button>
        </div>
        <div class="v9-hero-main">
          <div>
            <span id="v9Grade" class="v9-grade">--</span>
            <h2 id="v9Title">取得中</h2>
            <p id="v9Reason">9:00〜17:00の1時間データで、海に行く価値と日焼けしやすさを判定します。</p>
          </div>
          <div id="v9Icon" class="v9-icon" aria-hidden="true">🌊</div>
        </div>
        <div class="v9-meter"><span id="v9Meter"></span></div>
        <div class="v9-quick-grid">
          <div><span>晴れ継続</span><strong id="v9SunnyHours">--</strong></div>
          <div><span>日焼け</span><strong id="v9Tan">--</strong></div>
          <div><span>雨</span><strong id="v9Rain">--</strong></div>
          <div><span>風</span><strong id="v9Wind">--</strong></div>
        </div>
        <div class="v9-recommend"><small>おすすめ</small><span id="v9BestTime">--</span></div>
      </div>

      <div class="v9-card">
        <div class="v9-card-head"><h3>1時間ごとの海日和</h3><span>9:00〜17:00</span></div>
        <div id="v9Timeline" class="v9-timeline"><p class="v9-note">取得中です。</p></div>
      </div>

      <div class="v9-card">
        <div class="v9-card-head"><h3>週間の海日和</h3><span id="v9DayCount">最大16日</span></div>
        <div id="v9Days" class="v9-days"></div>
      </div>

      <div class="v9-card">
        <div class="v9-card-head"><h3>判断材料</h3><span>選択日全体</span></div>
        <div class="v9-evidence">
          <div><span>平均雲量</span><strong id="v9CloudAvg">--</strong></div>
          <div><span>日照合計</span><strong id="v9SunTotal">--</strong></div>
          <div><span>最大UV</span><strong id="v9UvMax">--</strong></div>
          <div><span>雨リスク</span><strong id="v9RainRisk">--</strong></div>
          <div><span>最大風速</span><strong id="v9WindMax">--</strong></div>
          <div><span>信頼度</span><strong id="v9Confidence">--</strong></div>
        </div>
        <p id="v9CompareNote" class="v9-note">通常予報とJMA予報を比較して、総合判断にまとめます。</p>
      </div>

      <div class="v9-card">
        <div class="v9-card-head"><h3>公式確認</h3><span>必要な時だけ</span></div>
        <div class="v9-actions">
          <a id="v9Nowcast" target="_blank" rel="noreferrer">雨雲</a>
          <a id="v9Himawari" target="_blank" rel="noreferrer">雲画像</a>
          <button id="v9Log" type="button">記録</button>
        </div>
        <p class="v9-source">Open-Meteo / Open-Meteo JMA / 気象庁アメダスを利用した個人用判定です。</p>
      </div>`;
    main.insertBefore(app, main.firstElementChild);
    $('#v9Refresh')?.addEventListener('click', () => load(true));
    $('#v9Nowcast').href = `https://www.jma.go.jp/bosai/nowc/#lat:${CFG.lat}/lon:${CFG.lon}/zoom:11/colordepth:normal/elements:hrpns&slmcs`;
    $('#v9Himawari').href = `https://www.jma.go.jp/bosai/map.html#6/${CFG.lat}/${CFG.lon}/&elem=ir&contents=himawari`;
    $('#v9Log')?.addEventListener('click', () => {
      document.body.classList.remove('v9-ready');
      setTimeout(() => document.querySelector('.log-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30);
    });
  }

  async function load(force) {
    setLoading(true);
    try {
      const cached = readCache();
      if (!force && cached?.base?.hourly?.length) {
        state.bundle = cached;
        state.selectedDate ||= todayKey();
        render();
      }
      const bundle = await fetchBundle();
      state.bundle = bundle;
      state.selectedDate ||= todayKey();
      if (!bundle.base.daily.some(d => d.date === state.selectedDate)) state.selectedDate = bundle.base.daily[0]?.date || todayKey();
      writeCache(bundle);
      render();
    } catch (error) {
      console.error('[v9 load]', error);
      const cached = readCache();
      if (cached?.base?.hourly?.length) {
        state.bundle = cached;
        state.selectedDate ||= todayKey();
        render('最新取得に失敗。前回データを表示しています。');
      } else {
        text('v9Title', '取得失敗');
        text('v9Reason', '通信またはAPI取得に失敗しました。白画面ではなく、この画面を維持します。少し待って更新してください。');
      }
    } finally {
      setLoading(false);
    }
  }

  async function fetchBundle() {
    const [base, jma] = await Promise.allSettled([fetchForecast(), fetchJma()]);
    if (base.status !== 'fulfilled') throw base.reason;
    return {
      updatedAt: new Date().toISOString(),
      base: base.value,
      jma: jma.status === 'fulfilled' ? jma.value : null
    };
  }

  async function fetchForecast() {
    const hourly = 'temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,sunshine_duration,shortwave_radiation,uv_index,wind_speed_10m';
    const daily = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,sunshine_duration,uv_index_max,shortwave_radiation_sum';
    const qs = new URLSearchParams({ latitude: CFG.lat, longitude: CFG.lon, timezone: CFG.tz, forecast_days: CFG.days, hourly, daily });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${qs}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Forecast API ${res.status}`);
    return normalize(await res.json());
  }

  async function fetchJma() {
    const hourly = 'temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,sunshine_duration,shortwave_radiation,wind_speed_10m';
    const daily = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,sunshine_duration,shortwave_radiation_sum';
    const qs = new URLSearchParams({ latitude: CFG.lat, longitude: CFG.lon, timezone: CFG.tz, forecast_days: 11, hourly, daily });
    const res = await fetch(`https://api.open-meteo.com/v1/jma?${qs}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`JMA API ${res.status}`);
    return normalize(await res.json());
  }

  function normalize(json) {
    const h = json.hourly || {};
    const d = json.daily || {};
    return {
      hourly: (h.time || []).map((time, i) => {
        const code = n(h.weather_code?.[i], 3);
        return {
          time,
          date: time.slice(0, 10),
          hour: Number(time.slice(11, 13)),
          temp: n(h.temperature_2m?.[i]),
          rainProb: h.precipitation_probability?.[i] ?? null,
          rain: n(h.precipitation?.[i], 0),
          code,
          weather: weatherText(code),
          icon: weatherIcon(code),
          cloud: h.cloud_cover?.[i] ?? null,
          sunMin: h.sunshine_duration ? Math.round((h.sunshine_duration[i] || 0) / 60) : null,
          uv: h.uv_index ? round(h.uv_index[i], 1) : null,
          wind: round(h.wind_speed_10m?.[i] || 0, 1)
        };
      }),
      daily: (d.time || []).map((date, i) => {
        const code = n(d.weather_code?.[i], 3);
        return {
          date,
          code,
          icon: weatherIcon(code),
          high: Math.round(d.temperature_2m_max?.[i] || 0),
          low: Math.round(d.temperature_2m_min?.[i] || 0)
        };
      })
    };
  }

  function render(note = '') {
    const bundle = state.bundle;
    const selected = state.selectedDate || todayKey();
    const baseRows = rowsFor(bundle.base.hourly, selected);
    const jmaRows = bundle.jma ? rowsFor(bundle.jma.hourly, selected) : [];
    const result = judgeDay(baseRows, jmaRows);

    const hero = $('#v9Hero');
    hero?.classList.remove('grade-great', 'grade-good', 'grade-ok', 'grade-bad');
    hero?.classList.add(`grade-${result.gradeKey}`);
    text('v9Date', isToday(selected) ? `今日 ${dateLabel(selected)}` : `${dateLabel(selected)} の判定`);
    text('v9Grade', result.symbol);
    text('v9Title', result.title);
    text('v9Reason', note || result.reason);
    text('v9Icon', result.icon);
    text('v9SunnyHours', `${result.goodHours}h`);
    text('v9Tan', result.tan);
    text('v9Rain', result.rainLabel);
    text('v9Wind', result.windLabel);
    text('v9BestTime', result.bestTime || '狙い目なし');
    text('v9CloudAvg', `${Math.round(result.cloudAvg)}%`);
    text('v9SunTotal', `${result.sunHours}h`);
    text('v9UvMax', fmt(result.uvMax));
    text('v9RainRisk', result.rainLabel);
    text('v9WindMax', `${fmt(result.windMax)}km/h`);
    text('v9Confidence', result.confidence);
    text('v9CompareNote', result.compareNote);
    const meter = $('#v9Meter');
    if (meter) meter.style.width = `${Math.max(5, Math.min(100, Math.round(result.score)))}%`;
    renderTimeline(baseRows.map(judgeHour));
    renderDays(bundle.base.daily);
  }

  function rowsFor(rows, date) {
    return rows.filter(r => r.date === date && r.hour >= CFG.startHour && r.hour <= CFG.endHour);
  }

  function judgeHour(r) {
    let score = 0;
    if (r.cloud <= 25) score += 30; else if (r.cloud <= 45) score += 22; else if (r.cloud <= 60) score += 12; else score -= 8;
    if (r.sunMin >= 50) score += 28; else if (r.sunMin >= 35) score += 20; else if (r.sunMin >= 15) score += 10; else score -= 6;
    if (r.uv >= 7) score += 15; else if (r.uv >= 5) score += 11; else if (r.uv >= 3) score += 6;
    if ((r.rainProb || 0) >= 60 || (r.rain || 0) > 0.2) score -= 25;
    if ((r.wind || 0) >= 35) score -= 12; else if ((r.wind || 0) >= 25) score -= 6;
    const gradeKey = score >= 62 ? 'great' : score >= 45 ? 'good' : score >= 25 ? 'ok' : 'bad';
    const label = gradeKey === 'great' ? '最高' : gradeKey === 'good' ? '良い' : gradeKey === 'ok' ? '微妙' : '弱い';
    return { ...r, score: clamp(score), gradeKey, label };
  }

  function judgeDay(baseRows, jmaRows) {
    const hours = baseRows.map(judgeHour);
    const goodHours = hours.filter(h => h.gradeKey === 'great' || h.gradeKey === 'good').length;
    const cloudAvg = average(baseRows.map(r => r.cloud));
    const sunHours = round(sum(baseRows.map(r => r.sunMin || 0)) / 60, 1);
    const uvMax = maximum(baseRows.map(r => r.uv));
    const rainProbMax = maximum(baseRows.map(r => r.rainProb));
    const rainAmount = sum(baseRows.map(r => r.rain || 0));
    const windMax = maximum(baseRows.map(r => r.wind));
    const jmaGood = jmaRows.length ? jmaRows.map(judgeHour).filter(h => h.gradeKey === 'great' || h.gradeKey === 'good').length : null;
    const diff = jmaGood === null ? null : Math.abs(goodHours - jmaGood);

    let score = 0;
    score += goodHours * 8;
    score += Math.min(25, sunHours * 4);
    score += uvMax >= 7 ? 10 : uvMax >= 5 ? 7 : uvMax >= 3 ? 4 : 0;
    score += cloudAvg <= 30 ? 16 : cloudAvg <= 45 ? 10 : cloudAvg <= 60 ? 4 : -8;
    if (rainProbMax >= 70 || rainAmount > 1) score -= 25; else if (rainProbMax >= 50) score -= 14; else if (rainProbMax >= 30) score -= 6;
    if (windMax >= 35) score -= 16; else if (windMax >= 25) score -= 8;
    if (diff !== null && diff >= 4) score -= 8;
    score = clamp(score);

    let gradeKey = 'bad', symbol = '×', title = 'やめとけ';
    if (score >= 76 && goodHours >= 5 && rainProbMax < 35) { gradeKey = 'great'; symbol = '◎'; title = '海日和'; }
    else if (score >= 58 && goodHours >= 3) { gradeKey = 'good'; symbol = '○'; title = '行く価値あり'; }
    else if (score >= 38 || goodHours >= 2) { gradeKey = 'ok'; symbol = '△'; title = '条件付き'; }

    const rainLabel = rainProbMax >= 70 || rainAmount > 1 ? '高' : rainProbMax >= 45 ? '中' : '低';
    const tan = sunHours >= 5 && uvMax >= 5 ? '高' : sunHours >= 3 && uvMax >= 3 ? '中' : '低';
    const windLabel = windMax >= 35 ? '強い' : windMax >= 25 ? 'やや強' : '問題なし';
    const confidence = diff === null ? '中' : diff <= 1 ? '高' : diff <= 3 ? '中' : '低';
    const bestTime = bestRun(hours);
    const icon = rainLabel === '高' ? '🌧️' : gradeKey === 'great' ? '🏖️' : gradeKey === 'good' ? '☀️' : gradeKey === 'ok' ? '⛅' : '☁️';
    const reason = reasonText(title, goodHours, sunHours, cloudAvg, rainLabel, bestTime);
    const compareNote = diff === null ? 'JMA比較は未取得。通常予報を中心に表示しています。' : diff <= 1 ? '通常予報とJMA予報は概ね一致。判定信頼度は高めです。' : diff <= 3 ? '通常予報とJMA予報に少し差があります。雲画像の確認推奨。' : '通常予報とJMA予報が割れています。晴れ予報でも慎重に見ます。';
    return { score, gradeKey, symbol, title, reason, icon, goodHours, cloudAvg, sunHours, uvMax, rainLabel, tan, windMax, windLabel, confidence, bestTime, compareNote };
  }

  function renderTimeline(hours) {
    const root = $('#v9Timeline');
    if (!root) return;
    root.innerHTML = hours.map(h => `<article class="v9-hour ${h.gradeKey}"><div class="v9-hour-time"><strong>${pad(h.hour)}:00</strong><span>${h.icon}</span></div><div class="v9-hour-main"><b>${h.label}</b><small>${escapeHtml(h.weather)}</small></div><div class="v9-hour-chips"><span>雲 ${pct(h.cloud)}</span><span>日照 ${minute(h.sunMin)}</span><span>UV ${fmt(h.uv)}</span><span>雨 ${pct(h.rainProb)}</span></div></article>`).join('');
  }

  function renderDays(days) {
    const root = $('#v9Days');
    if (!root) return;
    text('v9DayCount', `${days.length}日分`);
    root.innerHTML = days.map(day => {
      const baseRows = rowsFor(state.bundle.base.hourly, day.date);
      const jmaRows = state.bundle.jma ? rowsFor(state.bundle.jma.hourly, day.date) : [];
      const j = judgeDay(baseRows, jmaRows);
      return `<button class="v9-day ${day.date === state.selectedDate ? 'active' : ''} grade-${j.gradeKey}" type="button" data-date="${day.date}"><span>${isToday(day.date) ? '今日' : weekday(day.date)}</span><b>${shortDate(day.date)}</b><em>${j.icon}</em><strong>海${j.symbol}</strong><small>${day.high}/${day.low}℃</small></button>`;
    }).join('');
    root.querySelectorAll('.v9-day').forEach(btn => btn.addEventListener('click', () => {
      state.selectedDate = btn.dataset.date;
      render();
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }));
  }

  function bestRun(hours) {
    let best = [], cur = [];
    for (const h of hours) {
      if (h.gradeKey === 'great' || h.gradeKey === 'good') cur.push(h); else { if (cur.length > best.length) best = cur; cur = []; }
    }
    if (cur.length > best.length) best = cur;
    return best.length ? `${pad(best[0].hour)}:00〜${pad(best[best.length - 1].hour + 1)}:00` : '';
  }

  function reasonText(title, goodHours, sunHours, cloudAvg, rainLabel, bestTime) {
    if (title === '海日和') return `朝〜夕方で晴れ寄りが${goodHours}時間。日照${sunHours}h、雨リスク${rainLabel}。海に行く価値は高めです。`;
    if (title === '行く価値あり') return `使える時間があります。おすすめは${bestTime || '昼前後'}。雲量${Math.round(cloudAvg)}%なので雲画像だけ確認。`;
    if (title === '条件付き') return `晴れ間はありますが一日通して安定は弱め。日焼け目的なら${bestTime || '晴れ間'}中心で短め推奨。`;
    return '雲量・日照・雨/風の条件が弱いです。海目的なら別日の方が安全です。';
  }

  function setLoading(v) { const b = $('#v9Refresh'); if (b) { b.disabled = v; b.textContent = v ? '取得中' : '更新'; } }
  function readCache() { try { return JSON.parse(localStorage.getItem(CFG.cacheKey)); } catch { return null; } }
  function writeCache(v) { try { localStorage.setItem(CFG.cacheKey, JSON.stringify(v)); } catch {} }
  function $(id) { return document.getElementById(id.replace(/^#/, '')); }
  function text(id, value) { const el = $(id); if (el) el.textContent = value; }
  function n(v, fallback = 0) { const x = Number(v); return Number.isFinite(x) ? x : fallback; }
  function round(v, d = 0) { const x = Number(v); if (!Number.isFinite(x)) return null; const p = 10 ** d; return Math.round(x * p) / p; }
  function clamp(v) { return Math.max(0, Math.min(100, Number(v) || 0)); }
  function sum(arr) { return arr.filter(v => Number.isFinite(Number(v))).reduce((a, b) => a + Number(b), 0); }
  function average(arr) { const xs = arr.filter(v => Number.isFinite(Number(v))).map(Number); return xs.length ? sum(xs) / xs.length : 100; }
  function maximum(arr) { const xs = arr.filter(v => Number.isFinite(Number(v))).map(Number); return xs.length ? Math.max(...xs) : 0; }
  function fmt(v) { return Number.isFinite(Number(v)) ? String(Math.round(Number(v) * 10) / 10).replace('.0', '') : '-'; }
  function pct(v) { return Number.isFinite(Number(v)) ? `${Math.round(Number(v))}%` : '-'; }
  function minute(v) { return Number.isFinite(Number(v)) ? `${Math.round(Number(v))}分` : '-'; }
  function pad(v) { return String(v).padStart(2, '0'); }
  function todayKey() { return new Intl.DateTimeFormat('sv-SE', { timeZone: CFG.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  function isToday(d) { return d === todayKey(); }
  function weekday(d) { return ['日','月','火','水','木','金','土'][new Date(`${d}T00:00:00+09:00`).getDay()]; }
  function shortDate(d) { const x = new Date(`${d}T00:00:00+09:00`); return `${x.getMonth() + 1}/${x.getDate()}`; }
  function dateLabel(d) { return `${shortDate(d)}（${weekday(d)}）`; }
  function escapeHtml(s) { return String(s).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }
  function weatherText(code) { return { 0:'快晴', 1:'晴れ', 2:'一部曇り', 3:'曇り', 45:'霧', 48:'霧氷', 51:'弱い霧雨', 53:'霧雨', 55:'強い霧雨', 61:'弱い雨', 63:'雨', 65:'強い雨', 80:'弱いにわか雨', 81:'にわか雨', 82:'強いにわか雨', 95:'雷雨', 96:'雷雨・雹', 99:'雷雨・強い雹' }[Number(code)] || '曇り'; }
  function weatherIcon(code) { code = Number(code); if (code === 0) return '☀️'; if (code === 1) return '🌤️'; if (code === 2) return '⛅'; if (code === 3) return '☁️'; if ([45,48].includes(code)) return '🌫️'; if ([51,53,55,61,63,65,80,81,82].includes(code)) return '🌧️'; if ([95,96,99].includes(code)) return '⛈️'; return '☁️'; }
})();
