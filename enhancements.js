'use strict';

const EXT = {
  weatherCacheKey: 'takamatsu-weather:v2-1:last-success',
  logKey: 'takamatsu-weather:sky-logs:v1',
  lat: 34.3428,
  lon: 134.0466,
  tz: 'Asia/Tokyo',
  latestTimeUrl: 'https://www.jma.go.jp/bosai/amedas/data/latest_time.txt',
  tableUrl: 'https://www.jma.go.jp/bosai/amedas/const/amedastable.json'
};

const extState = { amedas: null, selectedSky: null, selectedTan: null, patchingTable: false, wrapped: false };

document.addEventListener('DOMContentLoaded', () => {
  setupOfficialLinks();
  setupCollapsibleSections();
  setupAmedas();
  setupLogs();
  scheduleForecastPatch();
  document.getElementById('refreshButton')?.addEventListener('click', () => setTimeout(() => { fetchAmedas(); scheduleForecastPatch(); }, 1600));
  document.getElementById('amedasRefresh')?.addEventListener('click', fetchAmedas);
  document.getElementById('weeklyList')?.addEventListener('click', () => setTimeout(scheduleForecastPatch, 120));
  const tbody = document.getElementById('hourlyTableBody');
  if (tbody) {
    const observer = new MutationObserver(() => {
      if (!extState.patchingTable) setTimeout(scheduleForecastPatch, 80);
    });
    observer.observe(tbody, { childList: true });
  }
});

function setupCollapsibleSections() {
  if (extState.wrapped) return;
  extState.wrapped = true;
  wrapSection('.official-card', '公式確認・雨雲/雲画像');
  wrapSection('.log-card', '実際の空を記録する');
}
function wrapSection(selector, label) {
  const section = document.querySelector(selector);
  if (!section || section.closest('details')) return;
  const details = document.createElement('details');
  details.className = 'collapse-block';
  const summary = document.createElement('summary');
  summary.textContent = label;
  section.parentNode.insertBefore(details, section);
  details.appendChild(summary);
  details.appendChild(section);
}

function setupOfficialLinks() {
  setHref('nowcastLink', `https://www.jma.go.jp/bosai/nowc/#lat:${EXT.lat}/lon:${EXT.lon}/zoom:11/colordepth:normal/elements:hrpns&slmcs`);
  setHref('himawariLink', `https://www.jma.go.jp/bosai/map.html#6/${EXT.lat}/${EXT.lon}/&elem=ir&contents=himawari`);
  setHref('amedasMapLink', `https://www.jma.go.jp/bosai/map.html#8/${EXT.lat}/${EXT.lon}/&contents=amedas`);
}
function setHref(id, href) { const el = document.getElementById(id); if (el) el.href = href; }
function setupAmedas() { fetchAmedas(); }

async function fetchAmedas() {
  setText('amedasStatus', 'アメダス実測を取得中です。');
  try {
    const latestText = await fetchText(EXT.latestTimeUrl);
    const latestDate = new Date(latestText.trim());
    const mapUrl = `https://www.jma.go.jp/bosai/amedas/data/map/${formatJmaTime(latestDate)}.json`;
    const [table, data] = await Promise.all([fetchJson(EXT.tableUrl), fetchJson(mapUrl)]);
    const station = findNearestStation(table, data);
    if (!station) throw new Error('近くのアメダス観測点が見つかりません');
    const obs = parseAmedasObservation(station, data[station.id], latestDate);
    extState.amedas = obs;
    renderAmedas(obs);
    scheduleForecastPatch();
  } catch (error) {
    console.warn(error);
    setText('amedasStatus', `アメダス取得失敗：${error.message || error}`);
    setText('amedasCorrection', '実測が取れないため、予報データのみで判断しています。');
  }
}
async function fetchText(url) { const res = await fetch(url, { cache: 'no-store' }); if (!res.ok) throw new Error(`${url} ${res.status}`); return res.text(); }
async function fetchJson(url) { const res = await fetch(url, { cache: 'no-store' }); if (!res.ok) throw new Error(`${url} ${res.status}`); return res.json(); }
function formatJmaTime(date) {
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: EXT.tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(date).reduce((a, x) => (a[x.type] = x.value, a), {});
  return `${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}`;
}
function findNearestStation(table, data) {
  let best = null;
  Object.entries(table).forEach(([id, station]) => {
    const obs = data[id]; if (!obs) return;
    const lat = toDegree(station.lat), lon = toDegree(station.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (!(obs.sun1h || obs.precipitation1h || obs.temp || obs.humidity || obs.wind)) return;
    const distance = distanceKm(EXT.lat, EXT.lon, lat, lon);
    if (!best || distance < best.distance) best = { id, station, lat, lon, distance };
  });
  return best;
}
function toDegree(v) { return Array.isArray(v) ? Number(v[0]) + Number(v[1] || 0) / 60 : Number(v); }
function valueOf(obs, key) { const v = obs?.[key]; return Array.isArray(v) ? Number(v[0]) : typeof v === 'number' ? v : null; }
function parseAmedasObservation(station, obs, date) {
  const wind = Array.isArray(obs.wind) ? obs.wind : null;
  const windDirection = wind ? windDirectionToText(Number(wind[0])) : '-';
  const windSpeed = wind ? Number(wind[1]) : null;
  return { id: station.id, name: station.station.kjName || station.station.enName || station.id, distance: station.distance, time: date.toISOString(), sun1h: valueOf(obs, 'sun1h'), rain1h: valueOf(obs, 'precipitation1h'), temp: valueOf(obs, 'temp'), humidity: valueOf(obs, 'humidity'), windDirection, windSpeed };
}
function renderAmedas(obs) {
  setText('amedasStatus', `観測 ${formatDateTime(obs.time)} / 約${obs.distance.toFixed(1)}km`);
  setText('amedasStation', obs.name);
  setText('amedasSun', obs.sun1h == null ? '-' : `${obs.sun1h.toFixed(1)}h`);
  setText('amedasRain', obs.rain1h == null ? '-' : `${obs.rain1h.toFixed(1)}mm`);
  setText('amedasTemp', obs.temp == null ? '-' : `${obs.temp.toFixed(1)}℃`);
  setText('amedasHumidity', obs.humidity == null ? '-' : `${Math.round(obs.humidity)}%`);
  setText('amedasWind', obs.windSpeed == null ? '-' : `${obs.windDirection} ${obs.windSpeed.toFixed(1)}m/s`);
  setText('amedasCorrection', amedasCorrectionText(obs));
}
function amedasCorrectionText(obs) {
  if (obs.sun1h != null && obs.sun1h <= 0.1 && (obs.rain1h == null || obs.rain1h <= 0)) return '実測日照ほぼなし。晴れ予報でも曇り寄り。';
  if (obs.sun1h != null && obs.sun1h >= 0.7 && (obs.rain1h == null || obs.rain1h <= 0)) return '実測日照あり。日焼け判断では予報より実測をやや優先。';
  if (obs.rain1h != null && obs.rain1h > 0) return '直近降水あり。日焼け目的なら様子見。';
  return '実測を重ねて補正中。晴れ表示だけで判断しません。';
}

function scheduleForecastPatch() { setTimeout(patchHourlyCardsForSun, 260); setTimeout(renderLogSummary, 320); }
function patchHourlyCardsForSun() {
  const bundle = readWeatherBundle(); if (!bundle?.base?.hourly?.length) return;
  const activeDate = document.querySelector('.daily-card.is-active')?.dataset.date || bundle.base.daily?.[0]?.date;
  const rows = bundle.base.hourly.filter((x) => x.date === activeDate && [0,3,6,9,12,15,18,21].includes(x.hour));
  const tableWrap = document.querySelector('.hourly-table-wrap');
  if (!rows.length || !tableWrap) return;
  let cards = document.getElementById('hourlyCards');
  if (!cards) {
    cards = document.createElement('div');
    cards.id = 'hourlyCards';
    cards.className = 'hourly-cards';
    tableWrap.parentNode.insertBefore(cards, tableWrap);
  }
  extState.patchingTable = true;
  cards.innerHTML = rows.map((row) => {
    const adjusted = adjustedSunJudge(sunJudge(row), row, extState.amedas);
    return `<article class="hour-card">
      <div class="hour-card-main">
        <div><div class="hour-card-time">${String(row.hour).padStart(2, '0')}:00</div><div class="hour-card-weather">${escapeHtml(row.weatherText || '-')}</div></div>
        <div class="hour-card-judge"><span class="sun-badge ${adjusted.className}">${escapeHtml(adjusted.label)}</span></div>
      </div>
      <div class="hour-card-grid">
        <div class="hour-metric"><span>雲量</span><strong>${formatPercent(row.cloudCover)}</strong></div>
        <div class="hour-metric"><span>日照</span><strong>${formatMinutes(row.sunshineMinutes)}</strong></div>
        <div class="hour-metric"><span>UV</span><strong>${formatNumber(row.uvIndex)}</strong></div>
        <div class="hour-metric"><span>降水</span><strong>${formatProbability(row.precipitationProbability)}</strong></div>
      </div>
      <div class="hour-card-reason">${escapeHtml(adjusted.reason)} / ${Number(row.precipitation || 0).toFixed(1)}mm</div>
    </article>`;
  }).join('');
  setTimeout(() => { extState.patchingTable = false; }, 200);
}
function sunJudge(row) {
  let score = 0;
  if (row.hour < 7 || row.hour > 17) score -= 4;
  if (typeof row.cloudCover === 'number') score += row.cloudCover <= 25 ? 3 : row.cloudCover <= 50 ? 2 : row.cloudCover <= 70 ? 1 : -1;
  if (typeof row.sunshineMinutes === 'number') score += row.sunshineMinutes >= 45 ? 3 : row.sunshineMinutes >= 25 ? 2 : row.sunshineMinutes >= 10 ? 1 : -1;
  if (typeof row.uvIndex === 'number') score += row.uvIndex >= 6 ? 2 : row.uvIndex >= 3 ? 1 : 0;
  if (Number(row.precipitation || 0) > 0 || (row.precipitationProbability || 0) >= 60) score -= 2;
  if (score >= 6) return { key: 'high', label: '日差し強', className: 'sun-high', reason: '日焼け狙い候補' };
  if (score >= 3) return { key: 'mid', label: 'やや可', className: 'sun-mid', reason: '雲次第で可' };
  return { key: 'low', label: '微妙', className: 'sun-low', reason: '曇り/弱い日差し' };
}
function adjustedSunJudge(judge, row, obs) {
  const nowHour = Number(new Intl.DateTimeFormat('ja-JP', { timeZone: EXT.tz, hour: '2-digit', hour12: false }).format(new Date()));
  if (obs?.rain1h > 0) return { key: 'low', label: '雨実測', className: 'sun-low', reason: 'アメダスで降水あり' };
  if (obs?.sun1h != null && obs.sun1h <= 0.1 && row.hour <= nowHour + 3) {
    return judge.key === 'high' ? { key: 'mid', label: '保留', className: 'sun-mid', reason: '実測日照ほぼなし' } : { key: 'low', label: '曇り寄り', className: 'sun-low', reason: '実測日照ほぼなし' };
  }
  return judge;
}

function setupLogs() {
  bindChoiceGroup('skyChoices', 'selectedSky'); bindChoiceGroup('tanChoices', 'selectedTan');
  document.getElementById('saveLogButton')?.addEventListener('click', saveCurrentLog);
  document.getElementById('exportLogButton')?.addEventListener('click', exportLogsCsv);
  document.getElementById('clearLogButton')?.addEventListener('click', clearLogs);
  renderLogSummary();
}
function bindChoiceGroup(id, stateKey) {
  const group = document.getElementById(id); if (!group) return;
  group.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]'); if (!button) return;
    group.querySelectorAll('button').forEach((b) => b.classList.remove('is-selected'));
    button.classList.add('is-selected'); extState[stateKey] = button.dataset.value;
  });
}
function saveCurrentLog() {
  if (!extState.selectedSky || !extState.selectedTan) { alert('実際の空と日焼け結果を両方選んでください。'); return; }
  const bundle = readWeatherBundle();
  const nowHours = bundle?.next3?.baseHours || [];
  const record = { id: Date.now(), createdAt: new Date().toISOString(), sky: extState.selectedSky, tanResult: extState.selectedTan, amedas: extState.amedas, forecast: nowHours.map((x) => ({ time: x.time, weather: x.weatherText, cloud: x.cloudCover, sunshine: x.sunshineMinutes, uv: x.uvIndex, precipProb: x.precipitationProbability, precip: x.precipitation })) };
  const logs = readLogs(); logs.unshift(record); localStorage.setItem(EXT.logKey, JSON.stringify(logs.slice(0, 200))); renderLogSummary(); alert('記録しました。');
}
function renderLogSummary() {
  const logs = readLogs(); const summary = document.getElementById('logSummary'); const recent = document.getElementById('recentLogs'); if (!summary || !recent) return;
  if (!logs.length) { summary.textContent = 'まだ記録がありません。晴れ予報なのに曇った時ほど記録価値があります。'; recent.innerHTML = ''; return; }
  const failed = logs.filter((x) => ['曇り','雨'].includes(x.sky) || ['微妙','無理'].includes(x.tanResult)).length;
  const sunny = logs.filter((x) => x.sky === '晴れ' || x.tanResult === 'できた').length;
  summary.textContent = `記録 ${logs.length}件 / 日差し成功 ${sunny}件 / 外れ・微妙 ${failed}件。ログをためるほど高松用補正が作れます。`;
  recent.innerHTML = logs.slice(0, 5).map((log) => `<div class="recent-log"><strong>${formatDateTime(log.createdAt)}：${escapeHtml(log.sky)} / ${escapeHtml(log.tanResult)}</strong><span>雲量 ${avg(log.forecast.map((x) => x.cloud))}%・日照 ${avg(log.forecast.map((x) => x.sunshine))}分・UV ${avg(log.forecast.map((x) => x.uv))}</span></div>`).join('');
}
function exportLogsCsv() {
  const logs = readLogs(); if (!logs.length) { alert('出力できるログがありません。'); return; }
  const header = ['createdAt','sky','tanResult','station','sun1h','rain1h','forecastAvgCloud','forecastAvgSunshine','forecastAvgUv','forecastAvgPrecipProb'];
  const rows = logs.map((log) => [log.createdAt, log.sky, log.tanResult, log.amedas?.name || '', log.amedas?.sun1h ?? '', log.amedas?.rain1h ?? '', avg(log.forecast.map((x) => x.cloud)), avg(log.forecast.map((x) => x.sunshine)), avg(log.forecast.map((x) => x.uv)), avg(log.forecast.map((x) => x.precipProb))]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'takamatsu-weather-logs.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function clearLogs() { if (!confirm('記録をすべて削除しますか？')) return; localStorage.removeItem(EXT.logKey); renderLogSummary(); }

function readLogs() { try { return JSON.parse(localStorage.getItem(EXT.logKey) || '[]'); } catch { return []; } }
function readWeatherBundle() { try { return JSON.parse(localStorage.getItem(EXT.weatherCacheKey)); } catch { return null; } }
function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function formatDateTime(iso) { return new Intl.DateTimeFormat('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: EXT.tz }).format(new Date(iso)); }
function formatPercent(v) { return typeof v === 'number' ? `${Math.round(v)}%` : '-'; }
function formatMinutes(v) { return typeof v === 'number' ? `${Math.round(v)}分` : '-'; }
function formatNumber(v) { return typeof v === 'number' ? Number(v).toFixed(1).replace('.0','') : '-'; }
function formatProbability(v) { return typeof v === 'number' ? `${Math.round(v)}%` : '-'; }
function avg(values) { const clean = values.filter((v) => Number.isFinite(Number(v))).map(Number); return clean.length ? Math.round(clean.reduce((a,b)=>a+b,0) / clean.length * 10) / 10 : ''; }
function csvCell(v) { return `"${String(v ?? '').replaceAll('"','""')}"`; }
function escapeHtml(v) { return String(v).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function distanceKm(lat1, lon1, lat2, lon2) { const r = 6371; const dLat = deg2rad(lat2-lat1); const dLon = deg2rad(lon2-lon1); const a = Math.sin(dLat/2)**2 + Math.cos(deg2rad(lat1))*Math.cos(deg2rad(lat2))*Math.sin(dLon/2)**2; return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); }
function deg2rad(d) { return d * Math.PI / 180; }
function windDirectionToText(deg) { if (!Number.isFinite(deg)) return '-'; const dirs = ['北','北北東','北東','東北東','東','東南東','南東','南南東','南','南南西','南西','西南西','西','西北西','北西','北北西']; return dirs[Math.round(deg / 22.5) % 16]; }
