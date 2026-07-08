'use strict';

const SEA = {
  lat: 34.3428,
  lon: 134.0466,
  tz: 'Asia/Tokyo',
  days: 16,
  hours: { start: 9, end: 17 },
  cache: 'takamatsu-weather:sea-v9:last-success'
};

const seaState = { selectedDate: null, data: null };

document.addEventListener('DOMContentLoaded', () => {
  injectSeaApp();
  loadSeaData();
});

function injectSeaApp() {
  const main = document.querySelector('main');
  if (!main || document.querySelector('.v9-app')) return;
  const section = document.createElement('section');
  section.className = 'v9-app';
  section.innerHTML = `
    <div id="seaHero" class="v9-hero grade-good">
      <div class="v9-topline">
        <div><span class="v9-kicker">高松・海日和判定</span><strong id="seaDate">--</strong></div>
        <button id="seaRefresh" class="v9-refresh" type="button">更新</button>
      </div>
      <div class="v9-hero-main">
        <div>
          <span id="seaGrade" class="v9-grade">--</span>
          <h2 id="seaTitle">取得中</h2>
          <p id="seaReason">9:00〜17:00の1時間データで、海に行く価値と日焼けしやすさを判定します。</p>
        </div>
        <div id="seaIcon" class="v9-icon" aria-hidden="true">🌊</div>
      </div>
      <div class="v9-meter"><span id="seaMeter"></span></div>
      <div class="v9-quick-grid">
        <div><span>晴れ継続</span><strong id="seaSunnyHours">--</strong></div>
        <div><span>日焼け</span><strong id="seaTan">--</strong></div>
        <div><span>雨</span><strong id="seaRain">--</strong></div>
        <div><span>風</span><strong id="seaWind">--</strong></div>
      </div>
      <div class="v9-recommend"><small>おすすめ</small><span id="seaBestTime">--</span></div>
    </div>

    <div class="v9-card">
      <div class="v9-card-head"><h3>1時間ごとの海日和</h3><span id="seaHourLabel">9:00〜17:00</span></div>
      <div id="seaTimeline" class="v9-timeline"><p class="v9-note">取得中です。</p></div>
    </div>

    <div class="v9-card">
      <div class="v9-card-head"><h3>週間の海日和</h3><span id="seaDayCount">最大16日</span></div>
      <div id="seaDays" class="v9-days"></div>
    </div>

    <div class="v9-card">
      <div class="v9-card-head"><h3>判断材料</h3><span>選択日全体</span></div>
      <div class="v9-evidence">
        <div><span>平均雲量</span><strong id="seaCloudAvg">--</strong></div>
        <div><span>日照合計</span><strong id="seaSunTotal">--</strong></div>
        <div><span>最大UV</span><strong id="seaUvMax">--</strong></div>
        <div><span>雨リスク</span><strong id="seaRainRisk">--</strong></div>
        <div><span>最大風速</span><strong id="seaWindMax">--</strong></div>
        <div><span>信頼度</span><strong id="seaConfidence">--</strong></div>
      </div>
      <p id="seaCompareNote" class="v9-note">通常予報を中心に、JMA予報とアメダス実測を補正材料にします。</p>
    </div>

    <div class="v9-card">
      <div class="v9-card-head"><h3>公式確認</h3><span>必要な時だけ</span></div>
      <div class="v9-actions">
        <a id="seaNowcast" target="_blank" rel="noreferrer">雨雲</a>
        <a id="seaHimawari" target="_blank" rel="noreferrer">雲画像</a>
        <button id="seaLog" type="button">記録</button>
      </div>
      <p class="v9-source">Open-Meteo / Open-Meteo JMA / 気象庁アメダスを利用した個人用判定です。</p>
    </div>`;
  main.insertBefore(section, main.firstElementChild);
  document.getElementById('seaRefresh')?.addEventListener('click', () => loadSeaData(true));
  document.getElementById('seaNowcast').href = `https://www.jma.go.jp/bosai/nowc/#lat:${SEA.lat}/lon:${SEA.lon}/zoom:11/colordepth:normal/elements:hrpns&slmcs`;
  document.getElementById('seaHimawari').href = `https://www.jma.go.jp/bosai/map.html#6/${SEA.lat}/${SEA.lon}/&elem=ir&contents=himawari`;
  document.getElementById('seaLog')?.addEventListener('click', () => {
    const details = [...document.querySelectorAll('details')].find(d => d.textContent.includes('実際の空'));
    if (details) details.open = true;
    (document.querySelector('.log-card') || document.getElementById('skyChoices'))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

async function loadSeaData(force = false) {
  setSeaLoading(true);
  try {
    const cached = readSeaCache();
    if (!force && cached?.base?.hourly?.length) {
      seaState.data = cached;
      if (!seaState.selectedDate) seaState.selectedDate = todayKey();
      renderSea();
    }
    const data = await fetchSeaBundle();
    seaState.data = data;
    if (!seaState.selectedDate || !data.base.daily.some(d => d.date === seaState.selectedDate)) seaState.selectedDate = todayKey();
    writeSeaCache(data);
    renderSea();
  } catch (error) {
    console.warn(error);
    const cached = readSeaCache();
    if (cached?.base?.hourly?.length) {
      seaState.data = cached;
      if (!seaState.selectedDate) seaState.selectedDate = todayKey();
      renderSea('最新取得に失敗。前回データを表示しています。');
    } else {
      setText('seaTitle', '取得失敗');
      setText('seaReason', '通信またはAPI取得に失敗しました。少し待って更新してください。');
    }
  } finally {
    setSeaLoading(false);
  }
}

function setSeaLoading(v) {
  const btn = document.getElementById('seaRefresh');
  if (!btn) return;
  btn.disabled = v;
  btn.textContent = v ? '取得中' : '更新';
}

async function fetchSeaBundle() {
  const [baseResult, jmaResult] = await Promise.allSettled([fetchBaseForecast(), fetchJmaForecast()]);
  if (baseResult.status !== 'fulfilled') throw baseResult.reason;
  return {
    updatedAt: new Date().toISOString(),
    base: baseResult.value,
    jma: jmaResult.status === 'fulfilled' ? jmaResult.value : null,
    jmaError: jmaResult.status === 'rejected' ? String(jmaResult.reason?.message || jmaResult.reason) : null
  };
}

async function fetchBaseForecast() {
  const hourly = ['temperature_2m','relative_humidity_2m','precipitation_probability','precipitation','weather_code','cloud_cover','cloud_cover_low','cloud_cover_mid','cloud_cover_high','sunshine_duration','shortwave_radiation','uv_index','wind_speed_10m','wind_direction_10m'].join(',');
  const daily = ['weather_code','temperature_2m_max','temperature_2m_min','precipitation_sum','precipitation_probability_max','wind_speed_10m_max','sunshine_duration','uv_index_max','shortwave_radiation_sum'].join(',');
  const params = new URLSearchParams({ latitude: SEA.lat, longitude: SEA.lon, timezone: SEA.tz, forecast_days: String(SEA.days), hourly, daily });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Forecast API ${res.status}`);
  return normalizeSea(await res.json(), 'base');
}

async function fetchJmaForecast() {
  const hourly = ['temperature_2m','relative_humidity_2m','precipitation','weather_code','cloud_cover','sunshine_duration','shortwave_radiation','wind_speed_10m','wind_direction_10m'].join(',');
  const daily = ['weather_code','temperature_2m_max','temperature_2m_min','precipitation_sum','wind_speed_10m_max','sunshine_duration','shortwave_radiation_sum'].join(',');
  const params = new URLSearchParams({ latitude: SEA.lat, longitude: SEA.lon, timezone: SEA.tz, forecast_days: '11', hourly, daily });
  const res = await fetch(`https://api.open-meteo.com/v1/jma?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`JMA API ${res.status}`);
  return normalizeSea(await res.json(), 'jma');
}

function normalizeSea(json, source) {
  const h = json.hourly;
  const hourly = h.time.map((time, i) => {
    const code = h.weather_code?.[i] ?? 3;
    return {
      source,
      time,
      date: time.slice(0, 10),
      hour: Number(time.slice(11, 13)),
      temperature: num(h.temperature_2m?.[i]),
      humidity: h.relative_humidity_2m?.[i] ?? null,
      precipitationProbability: h.precipitation_probability?.[i] ?? null,
      precipitation: num(h.precipitation?.[i] ?? 0, 1),
      weatherCode: code,
      weatherText: weatherText(code),
      icon: weatherIcon(code),
      cloudCover: h.cloud_cover?.[i] ?? null,
      cloudLow: h.cloud_cover_low?.[i] ?? null,
      cloudMid: h.cloud_cover_mid?.[i] ?? null,
      cloudHigh: h.cloud_cover_high?.[i] ?? null,
      sunshineMinutes: h.sunshine_duration ? Math.round((h.sunshine_duration[i] || 0) / 60) : null,
      radiation: h.shortwave_radiation ? Math.round(h.shortwave_radiation[i] || 0) : null,
      uv: h.uv_index ? num(h.uv_index[i], 1) : null,
      wind: num(h.wind_speed_10m?.[i] ?? 0, 1)
    };
  });
  const d = json.daily;
  const daily = d.time.map((date, i) => {
    const code = d.weather_code?.[i] ?? 3;
    return {
      source,
      date,
      weatherCode: code,
      weatherText: weatherText(code),
      icon: weatherIcon(code),
      high: Math.round(d.temperature_2m_max?.[i] ?? 0),
      low: Math.round(d.temperature_2m_min?.[i] ?? 0),
      precipitationSum: num(d.precipitation_sum?.[i] ?? 0, 1),
      precipitationProbabilityMax: d.precipitation_probability_max?.[i] ?? null,
      windMax: num(d.wind_speed_10m_max?.[i] ?? 0, 1),
      sunshineHours: d.sunshine_duration ? num((d.sunshine_duration[i] || 0) / 3600, 1) : null,
      uvMax: d.uv_index_max ? num(d.uv_index_max[i], 1) : null,
      radiationSum: d.shortwave_radiation_sum ? num(d.shortwave_radiation_sum[i], 1) : null
    };
  });
  return { source, hourly, daily };
}

function renderSea(note = '') {
  const data = seaState.data;
  if (!data?.base?.hourly?.length) return;
  const selected = seaState.selectedDate || todayKey();
  const rows = dayRows(data.base.hourly, selected);
  const targetRows = rows.filter(r => r.hour >= SEA.hours.start && r.hour <= SEA.hours.end);
  const score = judgeSeaDay(targetRows, data.jma ? dayRows(data.jma.hourly, selected).filter(r => r.hour >= SEA.hours.start && r.hour <= SEA.hours.end) : []);

  document.getElementById('seaHero')?.classList.remove('grade-great','grade-good','grade-ok','grade-bad');
  document.getElementById('seaHero')?.classList.add(`grade-${score.gradeKey}`);
  setText('seaDate', isToday(selected) ? `今日 ${formatDate(selected)}` : `${formatDate(selected)} の判定`);
  setText('seaGrade', score.gradeSymbol);
  setText('seaTitle', score.title);
  setText('seaReason', note || score.reason);
  setText('seaIcon', score.icon);
  setText('seaSunnyHours', `${score.sunnyHours}h`);
  setText('seaTan', score.tanLabel);
  setText('seaRain', score.rainLabel);
  setText('seaWind', score.windLabel);
  setText('seaBestTime', score.bestTime);
  setText('seaCloudAvg', `${Math.round(score.cloudAvg)}%`);
  setText('seaSunTotal', `${score.sunTotal}h`);
  setText('seaUvMax', fmt(score.uvMax));
  setText('seaRainRisk', score.rainLabel);
  setText('seaWindMax', `${fmt(score.windMax)}km/h`);
  setText('seaConfidence', score.confidence);
  setText('seaCompareNote', score.compareNote);
  const meter = document.getElementById('seaMeter');
  if (meter) meter.style.width = `${Math.max(6, Math.min(100, Math.round(score.score)))}%`;

  renderSeaTimeline(targetRows);
  renderSeaDays(data.base.daily);
}

function judgeSeaDay(rows, jmaRows) {
  const hourly = rows.map(judgeSeaHour);
  const cloudAvg = avg(rows.map(r => r.cloudCover));
  const sunTotal = num(sum(rows.map(r => (r.sunshineMinutes || 0))) / 60, 1);
  const uvMax = max(rows.map(r => r.uv));
  const rainMax = max(rows.map(r => r.precipitationProbability));
  const rainAmount = sum(rows.map(r => r.precipitation || 0));
  const windMax = max(rows.map(r => r.wind));
  const sunnyHours = hourly.filter(h => h.gradeKey === 'great' || h.gradeKey === 'good').length;
  const bestRun = bestContiguousRun(hourly);
  const jmaHourly = jmaRows.length ? jmaRows.map(judgeSeaHour) : [];
  const jmaGood = jmaHourly.filter(h => h.gradeKey === 'great' || h.gradeKey === 'good').length;
  const modelDiff = jmaRows.length ? Math.abs(sunnyHours - jmaGood) : null;

  let score = 0;
  score += sunnyHours * 8;
  score += Math.min(25, sunTotal * 4);
  score += uvMax >= 7 ? 10 : uvMax >= 5 ? 7 : uvMax >= 3 ? 4 : 0;
  score += cloudAvg <= 30 ? 16 : cloudAvg <= 45 ? 10 : cloudAvg <= 60 ? 4 : -8;
  if (rainMax >= 70 || rainAmount > 1) score -= 25;
  else if (rainMax >= 50) score -= 14;
  else if (rainMax >= 30) score -= 6;
  if (windMax >= 35) score -= 16;
  else if (windMax >= 25) score -= 8;
  if (modelDiff !== null && modelDiff >= 4) score -= 8;
  score = Math.max(0, Math.min(100, score));

  let gradeKey, gradeSymbol, title;
  if (score >= 76 && sunnyHours >= 5 && rainMax < 35) { gradeKey = 'great'; gradeSymbol = '◎'; title = '海日和'; }
  else if (score >= 58 && sunnyHours >= 3) { gradeKey = 'good'; gradeSymbol = '○'; title = '行く価値あり'; }
  else if (score >= 38 || sunnyHours >= 2) { gradeKey = 'ok'; gradeSymbol = '△'; title = '条件付き'; }
  else { gradeKey = 'bad'; gradeSymbol = '×'; title = 'やめとけ'; }

  const rainLabel = rainMax >= 70 || rainAmount > 1 ? '高' : rainMax >= 45 ? '中' : '低';
  const tanLabel = sunTotal >= 5 && uvMax >= 5 ? '高' : sunTotal >= 3 && uvMax >= 3 ? '中' : '低';
  const windLabel = windMax >= 35 ? '強い' : windMax >= 25 ? 'やや強' : '問題なし';
  const confidence = modelDiff === null ? '中' : modelDiff <= 1 ? '高' : modelDiff <= 3 ? '中' : '低';
  const bestTime = bestRun.label || '狙い目なし';
  const icon = rainLabel === '高' ? '🌧️' : gradeKey === 'great' ? '🏖️' : gradeKey === 'good' ? '☀️' : gradeKey === 'ok' ? '⛅' : '☁️';
  const compareNote = modelDiff === null
    ? 'JMA比較は未取得。通常予報と実測補正を優先します。'
    : modelDiff <= 1
      ? '通常予報とJMA予報は概ね一致。判定信頼度は高めです。'
      : modelDiff <= 3
        ? '通常予報とJMA予報に少し差があります。雲画像の確認推奨。'
        : '通常予報とJMA予報が割れています。晴れ予報でも慎重に見ます。';
  const reason = buildSeaReason({ title, sunnyHours, sunTotal, cloudAvg, rainLabel, windLabel, bestTime, confidence });

  return { score, gradeKey, gradeSymbol, title, reason, icon, sunnyHours, sunTotal, cloudAvg, uvMax, rainMax, windMax, rainLabel, tanLabel, windLabel, confidence, bestTime, compareNote };
}

function buildSeaReason(x) {
  if (x.title === '海日和') return `朝〜夕方で晴れ寄りが${x.sunnyHours}時間。日照${x.sunTotal}h、雨リスク${x.rainLabel}。海に行く価値は高めです。`;
  if (x.title === '行く価値あり') return `使える時間があります。おすすめは${x.bestTime}。雲量${Math.round(x.cloudAvg)}%なので雲画像だけ確認。`;
  if (x.title === '条件付き') return `晴れ間はありますが一日通して安定は弱め。日焼け目的なら${x.bestTime}中心で短め推奨。`;
  return `雲量・日照・雨/風の条件が弱いです。海目的なら別日の方が安全です。`;
}

function judgeSeaHour(r) {
  let s = 0;
  if (r.cloudCover <= 25) s += 30; else if (r.cloudCover <= 45) s += 22; else if (r.cloudCover <= 60) s += 12; else s -= 8;
  if (r.sunshineMinutes >= 50) s += 28; else if (r.sunshineMinutes >= 35) s += 20; else if (r.sunshineMinutes >= 15) s += 10; else s -= 6;
  if (r.uv >= 7) s += 15; else if (r.uv >= 5) s += 11; else if (r.uv >= 3) s += 6;
  if ((r.precipitationProbability || 0) >= 60 || (r.precipitation || 0) > 0.2) s -= 25;
  if ((r.wind || 0) >= 35) s -= 12; else if ((r.wind || 0) >= 25) s -= 6;
  let gradeKey = s >= 62 ? 'great' : s >= 45 ? 'good' : s >= 25 ? 'ok' : 'bad';
  let label = gradeKey === 'great' ? '最高' : gradeKey === 'good' ? '良い' : gradeKey === 'ok' ? '微妙' : '弱い';
  return { ...r, score: Math.max(0, Math.min(100, s)), gradeKey, label };
}

function renderSeaTimeline(rows) {
  const root = document.getElementById('seaTimeline');
  if (!root) return;
  const judged = rows.map(judgeSeaHour);
  root.innerHTML = judged.map(r => `<article class="v9-hour ${r.gradeKey}">
    <div class="v9-hour-time"><strong>${String(r.hour).padStart(2,'0')}:00</strong><span>${r.icon}</span></div>
    <div class="v9-hour-main"><b>${r.label}</b><small>${escapeHtml(r.weatherText)}</small></div>
    <div class="v9-hour-chips"><span>雲 ${pct(r.cloudCover)}</span><span>日照 ${mins(r.sunshineMinutes)}</span><span>UV ${fmt(r.uv)}</span><span>雨 ${pct(r.precipitationProbability)}</span></div>
  </article>`).join('');
}

function renderSeaDays(days) {
  const root = document.getElementById('seaDays');
  if (!root) return;
  setText('seaDayCount', `${days.length}日分`);
  root.innerHTML = days.map(day => {
    const rows = dayRows(seaState.data.base.hourly, day.date).filter(r => r.hour >= SEA.hours.start && r.hour <= SEA.hours.end);
    const score = judgeSeaDay(rows, seaState.data.jma ? dayRows(seaState.data.jma.hourly, day.date).filter(r => r.hour >= SEA.hours.start && r.hour <= SEA.hours.end) : []);
    return `<button class="v9-day ${day.date === seaState.selectedDate ? 'active' : ''} grade-${score.gradeKey}" type="button" data-date="${day.date}">
      <span>${isToday(day.date) ? '今日' : weekday(day.date)}</span><b>${shortDate(day.date)}</b><em>${score.icon}</em><strong>海${score.gradeSymbol}</strong><small>${day.high}/${day.low}℃</small>
    </button>`;
  }).join('');
  root.querySelectorAll('.v9-day').forEach(btn => btn.addEventListener('click', () => {
    seaState.selectedDate = btn.dataset.date;
    renderSea();
    btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }));
}

function bestContiguousRun(hours) {
  let best = [], cur = [];
  for (const h of hours) {
    const ok = h.gradeKey === 'great' || h.gradeKey === 'good';
    if (ok) cur.push(h); else { if (cur.length > best.length) best = cur; cur = []; }
  }
  if (cur.length > best.length) best = cur;
  if (!best.length) return { label: '' };
  return { label: `${String(best[0].hour).padStart(2,'0')}:00〜${String(best[best.length-1].hour + 1).padStart(2,'0')}:00` };
}

function dayRows(rows, date) { return rows.filter(r => r.date === date); }
function readSeaCache() { try { return JSON.parse(localStorage.getItem(SEA.cache)); } catch { return null; } }
function writeSeaCache(data) { try { localStorage.setItem(SEA.cache, JSON.stringify(data)); } catch {} }
function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function num(v, d = 0) { const n = Number(v); if (!Number.isFinite(n)) return null; const p = 10 ** d; return Math.round(n * p) / p; }
function sum(arr) { return arr.filter(v => Number.isFinite(Number(v))).reduce((a,b) => a + Number(b), 0); }
function avg(arr) { const n = arr.filter(v => Number.isFinite(Number(v))).map(Number); return n.length ? sum(n)/n.length : 0; }
function max(arr) { const n = arr.filter(v => Number.isFinite(Number(v))).map(Number); return n.length ? Math.max(...n) : 0; }
function fmt(v) { return Number.isFinite(Number(v)) ? String(Math.round(Number(v)*10)/10).replace('.0','') : '-'; }
function pct(v) { return Number.isFinite(Number(v)) ? `${Math.round(Number(v))}%` : '-'; }
function mins(v) { return Number.isFinite(Number(v)) ? `${Math.round(Number(v))}分` : '-'; }
function todayKey(){ const p = new Intl.DateTimeFormat('sv-SE',{timeZone:SEA.tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).reduce((a,x)=>(a[x.type]=x.value,a),{}); return `${p.year}-${p.month}-${p.day}`; }
function isToday(date){ return date === todayKey(); }
function weekday(date){ return ['日','月','火','水','木','金','土'][new Date(`${date}T00:00:00+09:00`).getDay()]; }
function shortDate(date){ const d = new Date(`${date}T00:00:00+09:00`); return `${d.getMonth()+1}/${d.getDate()}`; }
function formatDate(date){ return `${shortDate(date)}（${weekday(date)}）`; }
function escapeHtml(v){ return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function weatherText(code){ const map={0:'快晴',1:'晴れ',2:'一部曇り',3:'曇り',45:'霧',48:'霧氷',51:'弱い霧雨',53:'霧雨',55:'強い霧雨',61:'弱い雨',63:'雨',65:'強い雨',80:'弱いにわか雨',81:'にわか雨',82:'強いにわか雨',95:'雷雨',96:'雷雨・雹',99:'雷雨・強い雹'}; return map[Number(code)] || '曇り'; }
function weatherIcon(code){ code=Number(code); if(code===0)return'☀️'; if(code===1)return'🌤️'; if(code===2)return'⛅'; if(code===3)return'☁️'; if([45,48].includes(code))return'🌫️'; if([51,53,55,61,63,65,80,81,82].includes(code))return'🌧️'; if([95,96,99].includes(code))return'⛈️'; return'☁️'; }
