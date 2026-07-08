'use strict';

const V5 = {
  weatherKey: 'takamatsu-weather:v2-1:last-success',
  logKey: 'takamatsu-weather:sky-logs:v1',
  tz: 'Asia/Tokyo',
  lat: 34.3428,
  lon: 134.0466,
  maxDays: 16
};

const v5State = { selectedDate: null, bundle: null };
let v5Timer = null;

document.addEventListener('DOMContentLoaded', () => {
  injectV5App();
  renderV5WhenReady();
  extendForecastAndRender();
  document.getElementById('refreshButton')?.addEventListener('click', () => {
    clearTimeout(v5Timer);
    v5Timer = setTimeout(() => {
      renderV5WhenReady();
      extendForecastAndRender();
    }, 1700);
  });
});

function injectV5App() {
  const main = document.querySelector('main');
  if (!main || document.querySelector('.v5-app')) return;
  const section = document.createElement('section');
  section.className = 'v5-app';
  section.innerHTML = `
    <div class="v5-hero">
      <div class="v5-kicker"><span id="v5HeroLabel">高松・日差し判定</span><button id="v5Refresh" class="v5-refresh" type="button">更新</button></div>
      <span id="v5Confidence" class="v5-status-pill">判定中</span>
      <h2 id="v5Decision">取得中</h2>
      <p id="v5Reason" class="v5-main-reason">最新データを読み込んでいます。</p>
      <div class="v5-quick-grid">
        <div class="v5-quick"><span>日差し</span><strong id="v5Sun">--</strong></div>
        <div class="v5-quick"><span>雨</span><strong id="v5Rain">--</strong></div>
        <div class="v5-quick"><span>実測</span><strong id="v5Obs">--</strong></div>
      </div>
    </div>

    <div class="v5-section">
      <div class="v5-section-head"><h3>時間別の狙い目</h3><span id="v5TargetDate" class="v5-section-note">今日</span></div>
      <div id="v5Hours" class="v5-hour-list"><p class="v5-empty">予報データを読み込み中です。</p></div>
    </div>

    <div class="v5-section">
      <div class="v5-section-head"><h3>判断材料</h3><span class="v5-section-note">選択日</span></div>
      <div class="v5-evidence">
        <div class="v5-evidence-item"><span>平均雲量</span><strong id="v5CloudAvg">--</strong></div>
        <div class="v5-evidence-item"><span>平均日照</span><strong id="v5SunAvg">--</strong></div>
        <div class="v5-evidence-item"><span>最大UV</span><strong id="v5UvMax">--</strong></div>
      </div>
      <div id="v5AmedasNote" class="v5-log-mini"><p>アメダス実測を確認中です。</p><button type="button" id="v5OpenOfficial">公式</button></div>
    </div>

    <div class="v5-section">
      <div class="v5-section-head"><h3>週間</h3><span id="v5DayCount" class="v5-section-note">最大16日</span></div>
      <div id="v5Days" class="v5-forecast-strip"></div>
    </div>

    <div class="v5-section">
      <div class="v5-section-head"><h3>確認・記録</h3><span class="v5-section-note">必要な時だけ</span></div>
      <div class="v5-actions">
        <a id="v5Nowcast" class="v5-action primary" target="_blank" rel="noreferrer">雨雲を見る</a>
        <a id="v5Himawari" class="v5-action" target="_blank" rel="noreferrer">雲画像を見る</a>
      </div>
      <div class="v5-log-mini"><p id="v5LogSummary">晴れ予報なのに曇った時は記録すると補正材料になります。</p><button type="button" id="v5JumpLog">記録</button></div>
    </div>`;
  main.insertBefore(section, main.firstElementChild);

  const nowcast = `https://www.jma.go.jp/bosai/nowc/#lat:${V5.lat}/lon:${V5.lon}/zoom:11/colordepth:normal/elements:hrpns&slmcs`;
  const himawari = `https://www.jma.go.jp/bosai/map.html#6/${V5.lat}/${V5.lon}/&elem=ir&contents=himawari`;
  document.getElementById('v5Nowcast').href = nowcast;
  document.getElementById('v5Himawari').href = himawari;
  document.getElementById('v5Refresh')?.addEventListener('click', () => document.getElementById('refreshButton')?.click());
  document.getElementById('v5OpenOfficial')?.addEventListener('click', () => window.open(himawari, '_blank', 'noopener'));
  document.getElementById('v5JumpLog')?.addEventListener('click', () => {
    const details = [...document.querySelectorAll('details')].find(d => d.textContent.includes('実際の空'));
    if (details) details.open = true;
    (document.querySelector('.log-card') || document.getElementById('skyChoices'))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function renderV5WhenReady() {
  const bundle = readBundle();
  if (!bundle?.base?.hourly?.length) {
    setText('v5Decision', '取得中');
    setText('v5Reason', '更新すると最新データを取得します。');
    setTimeout(() => {
      const again = readBundle();
      if (again?.base?.hourly?.length) renderV5(again);
    }, 900);
    return;
  }
  renderV5(bundle);
}

async function extendForecastAndRender() {
  try {
    const base = await fetchExtendedForecast();
    const current = readBundle() || {};
    const merged = { ...current, updatedAt: new Date().toISOString(), base };
    if (merged.base?.hourly?.length) merged.next3 = { ...(merged.next3 || {}), baseHours: pickNextHours(merged.base.hourly, 3) };
    localStorage.setItem(V5.weatherKey, JSON.stringify(merged));
    renderV5(merged);
  } catch (error) {
    console.warn('extended forecast failed', error);
  }
}

async function fetchExtendedForecast() {
  const hourly = ['temperature_2m','relative_humidity_2m','precipitation_probability','precipitation','weather_code','cloud_cover','cloud_cover_low','cloud_cover_mid','cloud_cover_high','sunshine_duration','shortwave_radiation','uv_index','wind_speed_10m','wind_direction_10m'].join(',');
  const daily = ['weather_code','temperature_2m_max','temperature_2m_min','precipitation_sum','precipitation_probability_max','wind_speed_10m_max','sunshine_duration','uv_index_max','shortwave_radiation_sum'].join(',');
  const current = ['temperature_2m','relative_humidity_2m','precipitation','weather_code','cloud_cover','wind_speed_10m','wind_direction_10m'].join(',');
  const params = new URLSearchParams({ latitude: V5.lat, longitude: V5.lon, timezone: V5.tz, forecast_days: String(V5.maxDays), current, hourly, daily });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Open-Meteo Forecast API error: ${res.status}`);
  return normalizeForecast(await res.json());
}

function normalizeForecast(json) {
  const h = json.hourly;
  const hourly = h.time.map((time, i) => {
    const row = {
      source: 'base',
      time,
      date: time.slice(0, 10),
      hour: Number(time.slice(11, 13)),
      temperature: round(h.temperature_2m?.[i]),
      humidity: h.relative_humidity_2m?.[i] ?? null,
      precipitationProbability: h.precipitation_probability?.[i] ?? null,
      precipitation: round(h.precipitation?.[i] ?? 0, 1),
      weatherCode: h.weather_code?.[i] ?? 3,
      cloudCover: h.cloud_cover?.[i] ?? null,
      cloudCoverLow: h.cloud_cover_low?.[i] ?? null,
      cloudCoverMid: h.cloud_cover_mid?.[i] ?? null,
      cloudCoverHigh: h.cloud_cover_high?.[i] ?? null,
      sunshineMinutes: h.sunshine_duration ? Math.round((h.sunshine_duration[i] || 0) / 60) : null,
      shortwaveRadiation: h.shortwave_radiation ? Math.round(h.shortwave_radiation[i] || 0) : null,
      uvIndex: h.uv_index ? round(h.uv_index[i], 1) : null,
      windSpeed: round(h.wind_speed_10m?.[i] ?? 0),
      windDirectionDeg: h.wind_direction_10m?.[i]
    };
    row.weatherText = weatherText(row.weatherCode);
    row.icon = weatherIcon(row.weatherCode);
    return row;
  });
  const d = json.daily;
  const daily = d.time.map((date, i) => ({
    source: 'base',
    date,
    weatherCode: d.weather_code?.[i] ?? 3,
    weatherText: weatherText(d.weather_code?.[i] ?? 3),
    icon: weatherIcon(d.weather_code?.[i] ?? 3),
    high: Math.round(d.temperature_2m_max?.[i] ?? 0),
    low: Math.round(d.temperature_2m_min?.[i] ?? 0),
    precipitationSum: round(d.precipitation_sum?.[i] ?? 0, 1),
    precipitationProbabilityMax: d.precipitation_probability_max?.[i] ?? null,
    windSpeedMax: round(d.wind_speed_10m_max?.[i] ?? 0),
    sunshineHours: d.sunshine_duration ? round((d.sunshine_duration[i] || 0) / 3600, 1) : null,
    uvIndexMax: d.uv_index_max ? round(d.uv_index_max[i], 1) : null,
    shortwaveRadiationSum: d.shortwave_radiation_sum ? round(d.shortwave_radiation_sum[i], 1) : null
  }));
  const c = json.current || {};
  const current = {
    source: 'base',
    time: c.time || new Date().toISOString(),
    temperature: Math.round(c.temperature_2m ?? hourly[0]?.temperature ?? 0),
    weatherCode: c.weather_code ?? hourly[0]?.weatherCode ?? 3,
    precipitation: round(c.precipitation ?? 0, 1),
    cloudCover: c.cloud_cover ?? null,
    windSpeed: round(c.wind_speed_10m ?? 0)
  };
  current.weatherText = weatherText(current.weatherCode);
  current.icon = weatherIcon(current.weatherCode);
  return { source: 'base', current, hourly, daily };
}

function renderV5(bundle) {
  v5State.bundle = bundle;
  const days = bundle.base?.daily || [];
  if (!v5State.selectedDate || !days.some(d => d.date === v5State.selectedDate)) v5State.selectedDate = todayDate(days[0]?.date);
  renderSelectedDate();
}

function renderSelectedDate() {
  const bundle = v5State.bundle;
  if (!bundle?.base?.hourly?.length) return;
  const date = v5State.selectedDate;
  const selectedRows = rowsForDate(bundle.base.hourly, date);
  const basisRows = isToday(date) ? pickNextHours(bundle.base.hourly, 3) : daylightRows(selectedRows).slice(0, 3);
  const decisions = basisRows.map(row => judgeSun(row));
  const final = summarize(basisRows, decisions, isToday(date) ? readAmedasFromDom() : { sun1h: null, rain1h: null }, isToday(date) ? bundle.next3?.comparison : null);

  setText('v5HeroLabel', isToday(date) ? '高松・今から判定' : '高松・選択日判定');
  setText('v5Decision', final.title);
  setText('v5Reason', final.reason);
  setText('v5Sun', final.sunText);
  setText('v5Rain', final.rainText);
  setText('v5Obs', final.obsText);
  setText('v5Confidence', final.confidence);
  setText('v5TargetDate', formatDateLabel(date));
  setText('v5CloudAvg', percent(avg(basisRows.map(x => x.cloudCover))));
  setText('v5SunAvg', `${Math.round(avg(basisRows.map(x => x.sunshineMinutes)) || 0)}分`);
  setText('v5UvMax', formatNum(Math.max(...basisRows.map(x => Number(x.uvIndex || 0)))));
  setText('v5AmedasNote', final.amedasNote);

  renderHours(selectedRows);
  renderDays(bundle.base.daily || []);
  renderLogsMini();
}

function rowsForDate(rows, date) {
  const dayRows = rows.filter(x => x.date === date && [0,3,6,9,12,15,18,21].includes(x.hour));
  if (!isToday(date)) return dayRows;
  const next = pickNextHours(rows, 6);
  return next.length ? next : dayRows;
}

function daylightRows(rows) {
  const filtered = rows.filter(x => x.hour >= 9 && x.hour <= 18);
  return filtered.length ? filtered : rows;
}

function pickNextHours(rows, count) {
  const now = new Date();
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: V5.tz, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', hour12:false }).formatToParts(now).reduce((a, x) => (a[x.type] = x.value, a), {});
  const key = `${p.year}-${p.month}-${p.day}T${p.hour}:00`;
  const picked = rows.filter(x => x.time >= key).slice(0, count);
  return picked.length ? picked : rows.slice(0, count);
}

function judgeSun(row) {
  let score = 0;
  if (row.hour < 7 || row.hour > 17) score -= 4;
  if (typeof row.cloudCover === 'number') score += row.cloudCover <= 25 ? 3 : row.cloudCover <= 50 ? 2 : row.cloudCover <= 70 ? 1 : -2;
  if (typeof row.sunshineMinutes === 'number') score += row.sunshineMinutes >= 45 ? 3 : row.sunshineMinutes >= 25 ? 2 : row.sunshineMinutes >= 10 ? 1 : -1;
  if (typeof row.uvIndex === 'number') score += row.uvIndex >= 6 ? 2 : row.uvIndex >= 3 ? 1 : 0;
  if ((row.precipitationProbability || 0) >= 60 || Number(row.precipitation || 0) > 0) score -= 2;
  if (score >= 6) return { key:'high', label:'狙い目', badge:'high', reason:'日差し条件が良い' };
  if (score >= 3) return { key:'mid', label:'やや可', badge:'mid', reason:'雲次第' };
  return { key:'low', label:'微妙', badge:'low', reason:'雲/日照が弱い' };
}

function summarize(rows, decisions, obs, comparison) {
  const hasHigh = decisions.some(d => d.key === 'high');
  const hasMid = decisions.some(d => d.key === 'mid');
  const rainRisk = rows.some(r => (r.precipitationProbability || 0) >= 60 || Number(r.precipitation || 0) > 0);
  const noSunObs = obs.sun1h !== null && obs.sun1h <= 0.1;
  const strongObs = obs.sun1h !== null && obs.sun1h >= 0.7;
  const cloudAvg = avg(rows.map(x => x.cloudCover));
  const sunAvg = avg(rows.map(x => x.sunshineMinutes));
  const confidence = comparison?.agreement ? `一致度 ${comparison.agreement}` : isToday(v5State.selectedDate) ? '判定中' : '予報のみ';

  if (rainRisk) return { title:'今日は微妙', reason:'雨リスク高め。日焼け狙いなら雲画像と実測確認が必要です。', sunText: hasHigh ? '一部可' : '弱い', rainText:'注意', obsText: obsShort(obs), confidence, amedasNote: obsNote(obs) };
  if (noSunObs && !hasHigh) return { title:'曇り寄り', reason:'実測の日照が弱いです。晴れ表示でも準備前に空を確認。', sunText:'弱い', rainText:'低め', obsText:'日照なし', confidence, amedasNote: obsNote(obs) };
  if (hasHigh || (strongObs && hasMid)) return { title:'日差し期待', reason:'日照・UV・雲量の条件が比較的良い時間があります。', sunText:'強め', rainText:'低め', obsText: obsShort(obs), confidence, amedasNote: obsNote(obs) };
  if (hasMid) return { title:'少し期待', reason:`平均雲量${percent(cloudAvg)}、平均日照${Math.round(sunAvg || 0)}分。雲次第で使えます。`, sunText:'中', rainText:'低め', obsText: obsShort(obs), confidence, amedasNote: obsNote(obs) };
  return { title:'日焼け微妙', reason:'雲量が高いか日照予測が弱いです。晴れマークだけでは信用しない方が安全。', sunText:'弱い', rainText:'低め', obsText: obsShort(obs), confidence, amedasNote: obsNote(obs) };
}

function renderHours(rows) {
  const root = document.getElementById('v5Hours');
  if (!root) return;
  root.innerHTML = rows.map(row => {
    const j = judgeSun(row);
    return `<article class="v5-hour">
      <div><div class="v5-time">${String(row.hour).padStart(2,'0')}:00</div><span class="v5-sub">${escapeHtml(row.weatherText || '-')}</span></div>
      <div><div class="v5-hour-title">${escapeHtml(j.reason)}</div><div class="v5-hour-meta"><span>雲 ${percent(row.cloudCover)}</span><span>日照 ${minutes(row.sunshineMinutes)}</span><span>UV ${formatNum(row.uvIndex)}</span><span>雨 ${percent(row.precipitationProbability)}</span></div></div>
      <span class="v5-badge ${j.badge}">${escapeHtml(j.label)}</span>
    </article>`;
  }).join('');
}

function renderDays(days) {
  const root = document.getElementById('v5Days');
  if (!root) return;
  setText('v5DayCount', `${days.length}日分`);
  root.innerHTML = days.map((day, i) => `<button class="v5-day ${day.date === v5State.selectedDate ? 'is-active' : ''}" type="button" data-date="${day.date}"><b>${i===0?'今日':weekday(day.date)}</b><span class="emoji">${day.icon || '☁️'}</span><span>${escapeHtml(day.weatherText || '-')}</span><strong>${day.high}/${day.low}℃</strong></button>`).join('');
  root.querySelectorAll('.v5-day').forEach(button => {
    button.addEventListener('click', () => {
      v5State.selectedDate = button.dataset.date;
      renderSelectedDate();
      button.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    });
  });
}

function renderLogsMini() {
  const logs = readLogs();
  const root = document.getElementById('v5LogSummary');
  if (!root) return;
  if (!logs.length) { root.textContent = '晴れ予報なのに曇った時は記録すると補正材料になります。'; return; }
  const failed = logs.filter(x => ['曇り','雨'].includes(x.sky) || ['微妙','無理'].includes(x.tanResult)).length;
  root.textContent = `記録${logs.length}件 / 外れ・微妙${failed}件。`;
}

function readAmedasFromDom() {
  const sunText = document.getElementById('amedasSun')?.textContent || '';
  const rainText = document.getElementById('amedasRain')?.textContent || '';
  return { sun1h: parseNumber(sunText), rain1h: parseNumber(rainText) };
}
function obsShort(obs) { if (obs.rain1h && obs.rain1h > 0) return '雨あり'; if (obs.sun1h === null) return isToday(v5State.selectedDate) ? '確認中' : '予報'; if (obs.sun1h <= 0.1) return '日照なし'; if (obs.sun1h >= 0.7) return '日照あり'; return '少し'; }
function obsNote(obs) { if (!isToday(v5State.selectedDate)) return '未来日は実測なし。予報の雲量・日照・UVで判断します。'; if (obs.rain1h && obs.rain1h > 0) return 'アメダスで降水あり。日焼け目的なら待機寄り。'; if (obs.sun1h === null) return 'アメダス実測を確認中。'; if (obs.sun1h <= 0.1) return '直近1時間の日照ほぼなし。予報より曇り寄りに見ます。'; if (obs.sun1h >= 0.7) return '直近1時間の日照あり。日焼け判断ではプラス材料。'; return '実測日照は少なめ。雲が抜けるかが判断ポイント。'; }

function readBundle(){ try { return JSON.parse(localStorage.getItem(V5.weatherKey)); } catch { return null; } }
function readLogs(){ try { return JSON.parse(localStorage.getItem(V5.logKey) || '[]'); } catch { return []; } }
function setText(id, value){ const el = document.getElementById(id); if (!el) return; if (el.tagName === 'DIV' && el.classList.contains('v5-log-mini')) { const p = el.querySelector('p'); if (p) p.textContent = value; else el.textContent = value; } else el.textContent = value; }
function avg(values){ const nums = values.filter(v => Number.isFinite(Number(v))).map(Number); return nums.length ? nums.reduce((a,b)=>a+b,0)/nums.length : null; }
function parseNumber(text){ const n = Number(String(text).replace(/[^0-9.\-]/g,'')); return Number.isFinite(n) ? n : null; }
function percent(v){ return typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v)}%` : '-'; }
function minutes(v){ return typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v)}分` : '-'; }
function formatNum(v){ return typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 10)/10).replace('.0','') : '-'; }
function round(v, digits = 0){ const p = 10 ** digits; return Math.round(Number(v) * p) / p; }
function todayDate(fallback){ const p = new Intl.DateTimeFormat('sv-SE', { timeZone: V5.tz, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date()).reduce((a, x) => (a[x.type] = x.value, a), {}); return `${p.year}-${p.month}-${p.day}` || fallback; }
function isToday(date){ return date === todayDate(date); }
function weekday(date){ return ['日','月','火','水','木','金','土'][new Date(`${date}T00:00:00+09:00`).getDay()]; }
function formatDateLabel(date){ if(!date) return '今日'; const d = new Date(`${date}T00:00:00+09:00`); return `${d.getMonth()+1}/${d.getDate()}（${weekday(date)}）`; }
function escapeHtml(v){ return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function weatherText(code){ const map = {0:'快晴',1:'晴れ',2:'一部曇り',3:'曇り',45:'霧',48:'霧氷',51:'弱い霧雨',53:'霧雨',55:'強い霧雨',56:'弱い凍雨',57:'強い凍雨',61:'弱い雨',63:'雨',65:'強い雨',66:'弱い凍雨',67:'強い凍雨',71:'弱い雪',73:'雪',75:'強い雪',77:'雪粒',80:'弱いにわか雨',81:'にわか雨',82:'強いにわか雨',85:'弱いにわか雪',86:'強いにわか雪',95:'雷雨',96:'雷雨・弱い雹',99:'雷雨・強い雹'}; return map[Number(code)] || `不明:${code}`; }
function weatherIcon(code){ code = Number(code); if (code === 0) return '☀️'; if (code === 1) return '🌤️'; if (code === 2) return '⛅'; if (code === 3) return '☁️'; if ([45,48].includes(code)) return '🌫️'; if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return '🌧️'; if ([71,73,75,77,85,86].includes(code)) return '❄️'; if ([95,96,99].includes(code)) return '⛈️'; return '☁️'; }
