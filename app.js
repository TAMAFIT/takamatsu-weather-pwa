'use strict';

const CACHE_KEY = 'takamatsu-weather:last-success';
const LOCATION = { name: '高松市', latitude: 34.3428, longitude: 134.0466, timezone: 'Asia/Tokyo' };
const HOURS = [0,3,6,9,12,15,18,21];
const RISK = {
  low: { label: '低', className: 'risk-low' },
  mid: { label: '中', className: 'risk-mid' },
  high: { label: '高', className: 'risk-high' }
};
const state = { weather: null, selectedDate: null, deferredInstallPrompt: null };
const els = {};

document.addEventListener('DOMContentLoaded', init);

function init(){
  bindElements();
  bindEvents();
  setupClock();
  setupNetworkStatus();
  setupInstall();
  registerServiceWorker();
  els.locationName.textContent = LOCATION.name;

  const cached = readCachedWeather();
  if(cached){
    state.weather = cached;
    state.selectedDate = cached.daily?.[0]?.date || null;
    renderAll(true);
  }
  refreshWeather();
}

function bindElements(){
  Object.assign(els, {
    clockText: document.getElementById('clockText'),
    networkStatus: document.getElementById('networkStatus'),
    locationName: document.getElementById('locationName'),
    updatedAt: document.getElementById('updatedAt'),
    refreshButton: document.getElementById('refreshButton'),
    currentIcon: document.getElementById('currentIcon'),
    currentWeather: document.getElementById('currentWeather'),
    currentTemp: document.getElementById('currentTemp'),
    highLow: document.getElementById('highLow'),
    todayRisk: document.getElementById('todayRisk'),
    summaryComment: document.getElementById('summaryComment'),
    weeklyList: document.getElementById('weeklyList'),
    selectedDateText: document.getElementById('selectedDateText'),
    hourlyTableBody: document.getElementById('hourlyTableBody'),
    adviceList: document.getElementById('adviceList'),
    dailyCardTemplate: document.getElementById('dailyCardTemplate'),
    installCard: document.getElementById('installCard'),
    installButton: document.getElementById('installButton'),
    installHint: document.getElementById('installHint')
  });
}

function bindEvents(){ els.refreshButton.addEventListener('click', refreshWeather); }

function setupClock(){
  const tick = () => {
    els.clockText.textContent = new Intl.DateTimeFormat('ja-JP', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:LOCATION.timezone }).format(new Date());
  };
  tick();
  setInterval(tick, 30000);
}

function setupNetworkStatus(){
  const update = () => {
    const online = navigator.onLine;
    els.networkStatus.textContent = online ? 'オンライン' : 'オフライン';
    els.networkStatus.classList.toggle('offline', !online);
  };
  update();
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
}

function setupInstall(){
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if(isStandalone) return;
  els.installCard.hidden = false;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  els.installHint.textContent = isIOS
    ? 'iPhoneはSafariで開き、共有ボタンから「ホーム画面に追加」を選んでください。'
    : 'AndroidはChromeで「インストール」または「ホーム画面に追加」を選べます。';
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    els.installButton.hidden = false;
  });
  els.installButton.addEventListener('click', async () => {
    if(!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    els.installButton.hidden = true;
  });
}

async function registerServiceWorker(){
  if(!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('./sw.js'); } catch(error){ console.warn('Service worker failed:', error); }
}

async function refreshWeather(){
  setLoading(true);
  try{
    const weather = await fetchWeather();
    state.weather = weather;
    state.selectedDate = weather.daily[0]?.date || null;
    writeCachedWeather(weather);
    renderAll(false);
  }catch(error){
    console.error(error);
    const cached = readCachedWeather();
    if(cached){
      state.weather = cached;
      state.selectedDate = state.selectedDate || cached.daily?.[0]?.date || null;
      renderAll(true);
      showToast('最新取得に失敗しました。前回データを表示しています。');
    }else{
      renderError(error);
    }
  }finally{ setLoading(false); }
}

function setLoading(isLoading){
  els.refreshButton.disabled = isLoading;
  els.refreshButton.innerHTML = isLoading ? '<span aria-hidden="true">↻</span> 取得中' : '<span aria-hidden="true">↻</span> 更新する';
}

async function fetchWeather(){
  const hourly = ['temperature_2m','relative_humidity_2m','precipitation_probability','precipitation','weather_code','wind_speed_10m','wind_direction_10m'].join(',');
  const daily = ['weather_code','temperature_2m_max','temperature_2m_min','precipitation_sum','precipitation_probability_max','wind_speed_10m_max'].join(',');
  const current = ['temperature_2m','relative_humidity_2m','precipitation','weather_code','wind_speed_10m','wind_direction_10m'].join(',');
  const params = new URLSearchParams({
    latitude: LOCATION.latitude,
    longitude: LOCATION.longitude,
    timezone: LOCATION.timezone,
    forecast_days: '7',
    current,
    hourly,
    daily
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { cache:'no-store' });
  if(!res.ok) throw new Error(`Open-Meteo API error: ${res.status}`);
  return normalizeWeather(await res.json());
}

function normalizeWeather(json){
  const hourly = json.hourly;
  const hourlyList = hourly.time.map((time, i) => {
    const hour = Number(time.slice(11,13));
    const item = {
      time, date: time.slice(0,10), hour,
      temperature: round(hourly.temperature_2m[i]),
      humidity: hourly.relative_humidity_2m[i],
      precipitationProbability: hourly.precipitation_probability[i] ?? 0,
      precipitation: round(hourly.precipitation[i] ?? 0, 1),
      weatherCode: hourly.weather_code[i],
      windSpeed: round(hourly.wind_speed_10m[i] ?? 0),
      windDirectionDeg: hourly.wind_direction_10m[i]
    };
    item.weatherText = weatherCodeToText(item.weatherCode);
    item.icon = weatherCodeToIcon(item.weatherCode);
    item.windDirection = windDirectionToText(item.windDirectionDeg);
    item.risk = judgeRainRisk(item.precipitationProbability, item.precipitation, item.weatherCode, item.windSpeed);
    return item;
  });

  const dailyList = json.daily.time.map((date, i) => {
    const dayHours = hourlyList.filter(x => x.date === date);
    const maxRisk = maxRiskOf(dayHours.map(x => x.risk.key));
    return {
      date,
      weatherCode: json.daily.weather_code[i],
      weatherText: weatherCodeToText(json.daily.weather_code[i]),
      icon: weatherCodeToIcon(json.daily.weather_code[i]),
      high: Math.round(json.daily.temperature_2m_max[i]),
      low: Math.round(json.daily.temperature_2m_min[i]),
      precipitationSum: round(json.daily.precipitation_sum[i] ?? 0, 1),
      precipitationProbabilityMax: json.daily.precipitation_probability_max[i] ?? 0,
      windSpeedMax: round(json.daily.wind_speed_10m_max[i] ?? 0),
      risk: maxRisk
    };
  });

  const current = {
    time: json.current?.time || new Date().toISOString(),
    temperature: Math.round(json.current?.temperature_2m ?? hourlyList[0]?.temperature ?? 0),
    weatherCode: json.current?.weather_code ?? hourlyList[0]?.weatherCode ?? 3,
    precipitation: round(json.current?.precipitation ?? 0, 1),
    windSpeed: round(json.current?.wind_speed_10m ?? 0),
    windDirection: windDirectionToText(json.current?.wind_direction_10m)
  };
  current.weatherText = weatherCodeToText(current.weatherCode);
  current.icon = weatherCodeToIcon(current.weatherCode);

  return { location: LOCATION, updatedAt: new Date().toISOString(), current, daily: dailyList, hourly: hourlyList };
}

function renderAll(fromCache){
  if(!state.weather) return;
  renderSummary(fromCache);
  renderWeekly();
  renderHourly();
  renderAdvice();
}

function renderSummary(fromCache){
  const w = state.weather;
  const today = w.daily[0];
  const current = w.current;
  els.updatedAt.textContent = `${fromCache ? '前回取得' : '最終更新'} ${formatDateTime(w.updatedAt)}`;
  els.currentIcon.textContent = current.icon;
  els.currentWeather.textContent = current.weatherText;
  els.currentTemp.textContent = `${current.temperature}℃`;
  els.highLow.textContent = `最高${today.high}℃ / 最低${today.low}℃`;
  setRiskBadge(els.todayRisk, today.risk);
  els.summaryComment.textContent = summaryComment(today);
}

function renderWeekly(){
  els.weeklyList.innerHTML = '';
  state.weather.daily.forEach((day, index) => {
    const node = els.dailyCardTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.date = day.date;
    node.setAttribute('aria-selected', String(day.date === state.selectedDate));
    node.classList.toggle('is-active', day.date === state.selectedDate);
    node.querySelector('.day-label').textContent = index === 0 ? '今日' : weekdayShort(day.date);
    node.querySelector('.date-label').textContent = formatMonthDay(day.date);
    node.querySelector('.daily-icon').textContent = day.icon;
    node.querySelector('.daily-weather').textContent = day.weatherText;
    node.querySelector('.temp-high').textContent = day.high;
    node.querySelector('.temp-low').textContent = day.low;
    setRiskBadge(node.querySelector('.daily-risk'), day.risk);
    node.addEventListener('click', () => {
      state.selectedDate = day.date;
      renderWeekly(); renderHourly(); renderAdvice();
    });
    els.weeklyList.appendChild(node);
  });
}

function renderHourly(){
  const date = state.selectedDate;
  const rows = state.weather.hourly.filter(x => x.date === date && HOURS.includes(x.hour));
  els.selectedDateText.textContent = formatLongDate(date);
  if(!rows.length){
    els.hourlyTableBody.innerHTML = '<tr><td colspan="7" class="empty-cell">この日の3時間データがありません。</td></tr>';
    return;
  }
  els.hourlyTableBody.innerHTML = rows.map(row => `
    <tr>
      <td>${String(row.hour).padStart(2,'0')}:00</td>
      <td><span class="weather-cell"><span class="hour-icon">${row.icon}</span>${escapeHtml(row.weatherText)}</span></td>
      <td>${row.temperature}℃</td>
      <td>${row.precipitationProbability}%</td>
      <td>${row.precipitation.toFixed(1)}mm</td>
      <td>${escapeHtml(row.windDirection)} ${row.windSpeed}km/h</td>
      <td><span class="risk-badge ${row.risk.className}">${row.risk.label}</span></td>
    </tr>`).join('');
}

function renderAdvice(){
  const selected = state.weather.daily.find(x => x.date === state.selectedDate) || state.weather.daily[0];
  const hours = state.weather.hourly.filter(x => x.date === selected.date);
  const afternoonMax = Math.max(...hours.filter(x => x.hour >= 12 && x.hour <= 18).map(x => x.precipitationProbability), 0);
  const highRiskHours = hours.filter(x => x.risk.key === 'high').map(x => `${String(x.hour).padStart(2,'0')}:00`);
  const advices = [];
  if(selected.risk.key === 'low') advices.push('通常の外出はしやすい予報です。念のため出発前に更新してください。');
  if(selected.risk.key === 'mid') advices.push('外出は可能ですが、時間帯によって雨具を用意した方が安全です。');
  if(selected.risk.key === 'high') advices.push('雨リスクが高い日です。登山や長時間の屋外予定は慎重に判断してください。');
  if(afternoonMax >= 50) advices.push('午後は降水確率が上がります。日山に行くなら早め・短時間が無難です。');
  else advices.push('午後の降水確率は極端には高くありません。予定前の再確認が有効です。');
  if(highRiskHours.length) advices.push(`雨リスク高の時間帯：${highRiskHours.slice(0,4).join('、')}。この前後は移動に注意。`);
  else advices.push('雨リスク高の時間帯は今のところありません。');
  els.adviceList.innerHTML = advices.map(x => `<li>${escapeHtml(x)}</li>`).join('');
}

function setRiskBadge(el, risk){
  el.textContent = risk.label;
  el.classList.remove('risk-low','risk-mid','risk-high');
  el.classList.add(risk.className);
}

function judgeRainRisk(probability, precipitation, weatherCode, windSpeed){
  const rainCodes = [51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99];
  let score = 0;
  if(probability >= 70) score += 3; else if(probability >= 50) score += 2; else if(probability >= 30) score += 1;
  if(precipitation >= 3) score += 3; else if(precipitation >= 1) score += 2; else if(precipitation > 0) score += 1;
  if(rainCodes.includes(weatherCode)) score += 2;
  if(windSpeed >= 8) score += 1;
  if(score >= 6) return { key:'high', ...RISK.high };
  if(score >= 3) return { key:'mid', ...RISK.mid };
  return { key:'low', ...RISK.low };
}

function maxRiskOf(keys){
  if(keys.includes('high')) return { key:'high', ...RISK.high };
  if(keys.includes('mid')) return { key:'mid', ...RISK.mid };
  return { key:'low', ...RISK.low };
}

function summaryComment(day){
  if(day.risk.key === 'high') return '雨リスク高。登山・長時間の屋外予定は避けたい日です。';
  if(day.risk.key === 'mid') return '外出は可。時間帯によってにわか雨に注意。';
  return '外出しやすい予報です。予定前にもう一度更新すると安全です。';
}

function weatherCodeToText(code){
  const map = {0:'快晴',1:'晴れ',2:'一部曇り',3:'曇り',45:'霧',48:'霧氷',51:'弱い霧雨',53:'霧雨',55:'強い霧雨',56:'弱い凍雨',57:'強い凍雨',61:'弱い雨',63:'雨',65:'強い雨',66:'弱い凍雨',67:'強い凍雨',71:'弱い雪',73:'雪',75:'強い雪',77:'雪粒',80:'弱いにわか雨',81:'にわか雨',82:'強いにわか雨',85:'弱いにわか雪',86:'強いにわか雪',95:'雷雨',96:'雷雨・弱い雹',99:'雷雨・強い雹'};
  return map[code] || `不明:${code}`;
}

function weatherCodeToIcon(code){
  if(code === 0) return '☀️';
  if(code === 1) return '🌤️';
  if(code === 2) return '⛅';
  if(code === 3) return '☁️';
  if([45,48].includes(code)) return '🌫️';
  if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return '🌧️';
  if([71,73,75,77,85,86].includes(code)) return '❄️';
  if([95,96,99].includes(code)) return '⛈️';
  return '☁️';
}

function windDirectionToText(deg){
  if(deg == null || Number.isNaN(Number(deg))) return '-';
  const dirs = ['北','北北東','北東','東北東','東','東南東','南東','南南東','南','南南西','南西','西南西','西','西北西','北西','北北西'];
  return dirs[Math.round(Number(deg) / 22.5) % 16];
}

function weekdayShort(date){ return ['日','月','火','水','木','金','土'][new Date(`${date}T00:00:00+09:00`).getDay()]; }
function formatMonthDay(date){ const d = new Date(`${date}T00:00:00+09:00`); return `${d.getMonth()+1}/${d.getDate()}（${weekdayShort(date)}）`; }
function formatLongDate(date){ return date ? `${formatMonthDay(date)} の予報` : '--'; }
function formatDateTime(iso){ return new Intl.DateTimeFormat('ja-JP',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:LOCATION.timezone}).format(new Date(iso)); }
function round(v, digits=0){ const p = 10 ** digits; return Math.round(Number(v) * p) / p; }
function escapeHtml(v){ return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function readCachedWeather(){ try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; } }
function writeCachedWeather(data){ try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {} }
function renderError(error){ els.hourlyTableBody.innerHTML = `<tr><td colspan="7" class="empty-cell error-box">取得に失敗しました：${escapeHtml(error.message || error)}</td></tr>`; els.updatedAt.textContent = '取得失敗'; }
function showToast(message){
  const div = document.createElement('div'); div.className = 'toast'; div.textContent = message; document.body.appendChild(div);
  setTimeout(() => div.remove(), 3600);
}
