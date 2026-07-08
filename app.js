'use strict';

const CACHE_KEY = 'takamatsu-weather:v2:last-success';
const LOCATION = { name: '高松市', latitude: 34.3428, longitude: 134.0466, timezone: 'Asia/Tokyo' };
const HOURS = [0, 3, 6, 9, 12, 15, 18, 21];
const RISK_ORDER = { low: 0, mid: 1, high: 2 };
const RISK = {
  low: { label: '低', className: 'risk-low' },
  mid: { label: '中', className: 'risk-mid' },
  high: { label: '高', className: 'risk-high' }
};

const state = {
  weather: null,
  selectedDate: null,
  deferredInstallPrompt: null
};

const els = {};

document.addEventListener('DOMContentLoaded', init);

function init() {
  bindElements();
  bindEvents();
  setupClock();
  setupNetworkStatus();
  setupInstall();
  registerServiceWorker();
  els.locationName.textContent = LOCATION.name;

  const cached = readCachedWeather();
  if (cached) {
    state.weather = cached;
    state.selectedDate = cached.base?.daily?.[0]?.date || null;
    renderAll(true);
  }

  refreshWeather();
}

function bindElements() {
  Object.assign(els, {
    clockText: document.getElementById('clockText'),
    networkStatus: document.getElementById('networkStatus'),
    locationName: document.getElementById('locationName'),
    updatedAt: document.getElementById('updatedAt'),
    refreshButton: document.getElementById('refreshButton'),
    decisionTitle: document.getElementById('decisionTitle'),
    decisionMessage: document.getElementById('decisionMessage'),
    decisionRisk: document.getElementById('decisionRisk'),
    dangerTime: document.getElementById('dangerTime'),
    shortOuting: document.getElementById('shortOuting'),
    hikingAdvice: document.getElementById('hikingAdvice'),
    nextHours: document.getElementById('nextHours'),
    agreementScore: document.getElementById('agreementScore'),
    baseRisk: document.getElementById('baseRisk'),
    jmaRisk: document.getElementById('jmaRisk'),
    agreementComment: document.getElementById('agreementComment'),
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

function bindEvents() {
  els.refreshButton.addEventListener('click', refreshWeather);
}

function setupClock() {
  const tick = () => {
    els.clockText.textContent = new Intl.DateTimeFormat('ja-JP', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: LOCATION.timezone
    }).format(new Date());
  };
  tick();
  setInterval(tick, 30000);
}

function setupNetworkStatus() {
  const update = () => {
    const online = navigator.onLine;
    els.networkStatus.textContent = online ? 'オンライン' : 'オフライン';
    els.networkStatus.classList.toggle('offline', !online);
  };
  update();
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
}

function setupInstall() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone) return;
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
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    els.installButton.hidden = true;
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js');
  } catch (error) {
    console.warn('Service worker failed:', error);
  }
}

async function refreshWeather() {
  setLoading(true);
  try {
    const weather = await fetchWeatherBundle();
    state.weather = weather;
    state.selectedDate = weather.base.daily[0]?.date || null;
    writeCachedWeather(weather);
    renderAll(false);
  } catch (error) {
    console.error(error);
    const cached = readCachedWeather();
    if (cached) {
      state.weather = cached;
      state.selectedDate = state.selectedDate || cached.base?.daily?.[0]?.date || null;
      renderAll(true);
      showToast('最新取得に失敗しました。前回データを表示しています。');
    } else {
      renderError(error);
    }
  } finally {
    setLoading(false);
  }
}

function setLoading(isLoading) {
  els.refreshButton.disabled = isLoading;
  els.refreshButton.innerHTML = isLoading ? '<span aria-hidden="true">↻</span> 取得中' : '<span aria-hidden="true">↻</span> 更新する';
}

async function fetchWeatherBundle() {
  const basePromise = fetchOpenMeteoForecast();
  const jmaPromise = fetchOpenMeteoJma();
  const [baseResult, jmaResult] = await Promise.allSettled([basePromise, jmaPromise]);

  if (baseResult.status !== 'fulfilled') throw baseResult.reason;

  const base = baseResult.value;
  const jma = jmaResult.status === 'fulfilled' ? jmaResult.value : null;
  const bundle = {
    updatedAt: new Date().toISOString(),
    location: LOCATION,
    base,
    jma,
    jmaError: jmaResult.status === 'rejected' ? String(jmaResult.reason?.message || jmaResult.reason) : null
  };
  bundle.next3 = analyzeNextHours(bundle, 3);
  return bundle;
}

async function fetchOpenMeteoForecast() {
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
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Open-Meteo Forecast API error: ${res.status}`);
  return normalizeWeather(await res.json(), 'base');
}

async function fetchOpenMeteoJma() {
  const hourly = ['temperature_2m','relative_humidity_2m','precipitation','weather_code','wind_speed_10m','wind_direction_10m'].join(',');
  const daily = ['weather_code','temperature_2m_max','temperature_2m_min','precipitation_sum','wind_speed_10m_max'].join(',');
  const current = ['temperature_2m','relative_humidity_2m','precipitation','weather_code','wind_speed_10m','wind_direction_10m'].join(',');
  const params = new URLSearchParams({
    latitude: LOCATION.latitude,
    longitude: LOCATION.longitude,
    timezone: LOCATION.timezone,
    forecast_days: '4',
    current,
    hourly,
    daily
  });
  const res = await fetch(`https://api.open-meteo.com/v1/jma?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Open-Meteo JMA API error: ${res.status}`);
  return normalizeWeather(await res.json(), 'jma');
}

function normalizeWeather(json, source) {
  const hourly = json.hourly;
  const hourlyList = hourly.time.map((time, i) => {
    const hour = Number(time.slice(11, 13));
    const probability = hourly.precipitation_probability ? hourly.precipitation_probability[i] : null;
    const item = {
      source,
      time,
      date: time.slice(0, 10),
      hour,
      temperature: round(hourly.temperature_2m[i]),
      humidity: hourly.relative_humidity_2m ? hourly.relative_humidity_2m[i] : null,
      precipitationProbability: probability,
      precipitation: round(hourly.precipitation?.[i] ?? 0, 1),
      weatherCode: hourly.weather_code[i],
      windSpeed: round(hourly.wind_speed_10m?.[i] ?? 0),
      windDirectionDeg: hourly.wind_direction_10m?.[i]
    };
    item.weatherText = weatherCodeToText(item.weatherCode);
    item.icon = weatherCodeToIcon(item.weatherCode);
    item.windDirection = windDirectionToText(item.windDirectionDeg);
    item.risk = judgeRainRisk(item.precipitationProbability, item.precipitation, item.weatherCode, item.windSpeed, source);
    return item;
  });

  const dailyList = json.daily.time.map((date, i) => {
    const dayHours = hourlyList.filter((x) => x.date === date);
    const dailyRisk = maxRiskOf(dayHours.map((x) => x.risk.key));
    return {
      source,
      date,
      weatherCode: json.daily.weather_code[i],
      weatherText: weatherCodeToText(json.daily.weather_code[i]),
      icon: weatherCodeToIcon(json.daily.weather_code[i]),
      high: Math.round(json.daily.temperature_2m_max[i]),
      low: Math.round(json.daily.temperature_2m_min[i]),
      precipitationSum: round(json.daily.precipitation_sum?.[i] ?? 0, 1),
      precipitationProbabilityMax: json.daily.precipitation_probability_max ? json.daily.precipitation_probability_max[i] : null,
      windSpeedMax: round(json.daily.wind_speed_10m_max?.[i] ?? 0),
      risk: dailyRisk
    };
  });

  const current = {
    source,
    time: json.current?.time || new Date().toISOString(),
    temperature: Math.round(json.current?.temperature_2m ?? hourlyList[0]?.temperature ?? 0),
    weatherCode: json.current?.weather_code ?? hourlyList[0]?.weatherCode ?? 3,
    precipitation: round(json.current?.precipitation ?? 0, 1),
    windSpeed: round(json.current?.wind_speed_10m ?? 0),
    windDirection: windDirectionToText(json.current?.wind_direction_10m)
  };
  current.weatherText = weatherCodeToText(current.weatherCode);
  current.icon = weatherCodeToIcon(current.weatherCode);

  return { source, current, daily: dailyList, hourly: hourlyList };
}

function analyzeNextHours(bundle, hourCount) {
  const baseHours = pickNextHours(bundle.base.hourly, hourCount);
  const jmaHours = bundle.jma ? alignRows(baseHours, bundle.jma.hourly) : [];
  const risk = maxRiskOf(baseHours.map((x) => x.risk.key));
  const dangerous = baseHours.filter((x) => x.risk.key === 'high');
  const midOrHigh = baseHours.filter((x) => x.risk.key !== 'low');
  const dangerTime = dangerous[0]?.hour ?? midOrHigh[0]?.hour ?? null;
  const comparison = compareForecasts(baseHours, jmaHours, Boolean(bundle.jma));
  return { baseHours, jmaHours, risk, dangerTime, comparison };
}

function pickNextHours(rows, hourCount) {
  const now = new Date();
  const localParts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: LOCATION.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(now).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  const currentLocal = `${localParts.year}-${localParts.month}-${localParts.day}T${localParts.hour}:00`;
  const picked = rows.filter((row) => row.time >= currentLocal).slice(0, hourCount);
  return picked.length ? picked : rows.slice(0, hourCount);
}

function alignRows(baseRows, jmaRows) {
  return baseRows.map((row) => jmaRows.find((j) => j.time === row.time) || null);
}

function compareForecasts(baseRows, jmaRows, hasJma) {
  if (!hasJma || !jmaRows.some(Boolean)) {
    return {
      agreement: '取得不可',
      className: 'risk-mid',
      baseRisk: maxRiskOf(baseRows.map((x) => x.risk.key)),
      jmaRisk: null,
      comment: 'JMA予報を取得できませんでした。通常予報のみで判定しています。'
    };
  }

  const paired = baseRows.map((base, index) => ({ base, jma: jmaRows[index] })).filter((p) => p.jma);
  const baseRisk = maxRiskOf(baseRows.map((x) => x.risk.key));
  const jmaRisk = maxRiskOf(paired.map((p) => p.jma.risk.key));
  const riskDiff = Math.abs(RISK_ORDER[baseRisk.key] - RISK_ORDER[jmaRisk.key]);
  const precipDiffAvg = average(paired.map((p) => Math.abs((p.base.precipitation ?? 0) - (p.jma.precipitation ?? 0))));
  const rainDisagreeCount = paired.filter((p) => isRainCode(p.base.weatherCode) !== isRainCode(p.jma.weatherCode)).length;

  if (riskDiff === 0 && precipDiffAvg < 0.8 && rainDisagreeCount === 0) {
    return {
      agreement: '高', className: 'risk-low', baseRisk, jmaRisk,
      comment: '通常予報とJMA予報がかなり近いです。短時間判断の信用度は高めです。'
    };
  }
  if (riskDiff <= 1 && precipDiffAvg < 2.0 && rainDisagreeCount <= 1) {
    return {
      agreement: '中', className: 'risk-mid', baseRisk, jmaRisk,
      comment: '通常予報とJMA予報に少し差があります。出発直前に再更新してください。'
    };
  }
  return {
    agreement: '低', className: 'risk-high', baseRisk, jmaRisk,
    comment: '通常予報とJMA予報が割れています。雨の有無・時間帯は外れやすい状況です。'
  };
}

function renderAll(fromCache) {
  if (!state.weather) return;
  renderDecision();
  renderSummary(fromCache);
  renderWeekly();
  renderHourly();
  renderAdvice();
}

function renderDecision() {
  const analysis = state.weather.next3 || analyzeNextHours(state.weather, 3);
  setRiskBadge(els.decisionRisk, analysis.risk);
  els.decisionTitle.textContent = decisionTitle(analysis.risk.key);
  els.decisionMessage.textContent = decisionMessage(analysis);
  els.dangerTime.textContent = analysis.dangerTime == null ? 'なし' : `${String(analysis.dangerTime).padStart(2, '0')}:00前後`;
  els.shortOuting.textContent = shortOutingText(analysis.risk.key);
  els.hikingAdvice.textContent = hikingText(analysis.risk.key, analysis.comparison.agreement);
  renderNextHourChips(analysis.baseHours);
  renderComparison(analysis.comparison);
}

function renderNextHourChips(rows) {
  els.nextHours.innerHTML = rows.map((row) => `
    <div class="next-hour-chip">
      <div class="time">${String(row.hour).padStart(2, '0')}:00</div>
      <div class="weather"><span>${row.icon}</span><span>${escapeHtml(row.weatherText)}</span></div>
      <div class="metrics">${row.temperature}℃ / 降水${formatProbability(row.precipitationProbability)}<br>${row.precipitation.toFixed(1)}mm・${escapeHtml(row.windDirection)} ${row.windSpeed}km/h</div>
      <span class="risk-badge ${row.risk.className}">${row.risk.label}</span>
    </div>
  `).join('');
}

function renderComparison(comparison) {
  els.agreementScore.textContent = comparison.agreement;
  els.agreementScore.className = comparison.className;
  els.baseRisk.innerHTML = `<span class="risk-badge ${comparison.baseRisk.className}">${comparison.baseRisk.label}</span>`;
  if (comparison.jmaRisk) {
    els.jmaRisk.innerHTML = `<span class="risk-badge ${comparison.jmaRisk.className}">${comparison.jmaRisk.label}</span>`;
  } else {
    els.jmaRisk.textContent = '取得不可';
  }
  els.agreementComment.textContent = comparison.comment;
}

function renderSummary(fromCache) {
  const w = state.weather.base;
  const today = w.daily[0];
  const current = w.current;
  els.updatedAt.textContent = `${fromCache ? '前回取得' : '最終更新'} ${formatDateTime(state.weather.updatedAt)}`;
  els.currentIcon.textContent = current.icon;
  els.currentWeather.textContent = current.weatherText;
  els.currentTemp.textContent = `${current.temperature}℃`;
  els.highLow.textContent = `最高${today.high}℃ / 最低${today.low}℃`;
  setRiskBadge(els.todayRisk, today.risk);
  els.summaryComment.textContent = summaryComment(today, state.weather.next3);
}

function renderWeekly() {
  els.weeklyList.innerHTML = '';
  state.weather.base.daily.forEach((day, index) => {
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
      renderWeekly();
      renderHourly();
      renderAdvice();
    });
    els.weeklyList.appendChild(node);
  });
}

function renderHourly() {
  const date = state.selectedDate;
  const rows = state.weather.base.hourly.filter((x) => x.date === date && HOURS.includes(x.hour));
  els.selectedDateText.textContent = formatLongDate(date);
  if (!rows.length) {
    els.hourlyTableBody.innerHTML = '<tr><td colspan="7" class="empty-cell">この日の3時間データがありません。</td></tr>';
    return;
  }
  els.hourlyTableBody.innerHTML = rows.map((row) => `
    <tr>
      <td>${String(row.hour).padStart(2,'0')}:00</td>
      <td><span class="weather-cell"><span class="hour-icon">${row.icon}</span>${escapeHtml(row.weatherText)}</span></td>
      <td>${row.temperature}℃</td>
      <td>${formatProbability(row.precipitationProbability)}</td>
      <td>${row.precipitation.toFixed(1)}mm</td>
      <td>${escapeHtml(row.windDirection)} ${row.windSpeed}km/h</td>
      <td><span class="risk-badge ${row.risk.className}">${row.risk.label}</span></td>
    </tr>`).join('');
}

function renderAdvice() {
  const selected = state.weather.base.daily.find((x) => x.date === state.selectedDate) || state.weather.base.daily[0];
  const hours = state.weather.base.hourly.filter((x) => x.date === selected.date);
  const analysis = state.weather.next3;
  const afternoonMax = Math.max(...hours.filter((x) => x.hour >= 12 && x.hour <= 18).map((x) => x.precipitationProbability ?? 0), 0);
  const highRiskHours = hours.filter((x) => x.risk.key === 'high').map((x) => `${String(x.hour).padStart(2, '0')}:00`);
  const advices = [];

  advices.push(decisionMessage(analysis));
  if (analysis.comparison.agreement === '低') advices.push('予報が割れています。Googleや雨雲レーダーも併用し、出発直前に再更新してください。');
  else if (analysis.comparison.agreement === '高') advices.push('通常予報とJMA予報が近いため、今の短時間判断は比較的信用できます。');
  else advices.push('予報に少し差があります。外出直前の再確認が有効です。');

  if (selected.risk.key === 'high') advices.push('選択日は雨リスク高です。登山や長時間の屋外予定は慎重に判断してください。');
  else if (selected.risk.key === 'mid') advices.push('選択日は時間帯によって雨具を用意した方が安全です。');
  else advices.push('選択日は通常の外出はしやすい予報です。');

  if (afternoonMax >= 50) advices.push('午後は降水確率が上がります。日山に行くなら早め・短時間が無難です。');
  if (highRiskHours.length) advices.push(`雨リスク高の時間帯：${highRiskHours.slice(0, 5).join('、')}。この前後は移動に注意。`);

  els.adviceList.innerHTML = advices.slice(0, 5).map((x) => `<li>${escapeHtml(x)}</li>`).join('');
}

function setRiskBadge(el, risk) {
  el.textContent = risk.label;
  el.classList.remove('risk-low','risk-mid','risk-high');
  el.classList.add(risk.className);
}

function judgeRainRisk(probability, precipitation, weatherCode, windSpeed, source) {
  let score = 0;
  if (typeof probability === 'number') {
    if (probability >= 75) score += 3;
    else if (probability >= 55) score += 2;
    else if (probability >= 35) score += 1;
  }
  if (precipitation >= 3) score += 3;
  else if (precipitation >= 1) score += 2;
  else if (precipitation > 0) score += 1;
  if (isRainCode(weatherCode)) score += 2;
  if (isThunderCode(weatherCode)) score += 2;
  if (windSpeed >= 10) score += 1;
  if (source === 'jma' && precipitation >= 0.4) score += 1;

  if (score >= 6) return { key: 'high', ...RISK.high };
  if (score >= 3) return { key: 'mid', ...RISK.mid };
  return { key: 'low', ...RISK.low };
}

function maxRiskOf(keys) {
  const clean = keys.filter(Boolean);
  if (clean.includes('high')) return { key: 'high', ...RISK.high };
  if (clean.includes('mid')) return { key: 'mid', ...RISK.mid };
  return { key: 'low', ...RISK.low };
}

function decisionTitle(key) {
  if (key === 'high') return '今からは雨に注意';
  if (key === 'mid') return '短時間なら様子見';
  return '今は動きやすい';
}

function decisionMessage(analysis) {
  const risk = analysis.risk.key;
  const danger = analysis.dangerTime == null ? '' : `${String(analysis.dangerTime).padStart(2, '0')}:00前後から注意。`;
  if (risk === 'high') return `今から3時間で雨リスクが高い時間帯があります。${danger}外出・日山は慎重に。`;
  if (risk === 'mid') return `今から3時間は完全には安心できません。${danger}短時間外出は可、日山は短め推奨。`;
  return '今から3時間は雨リスク低めです。通常の外出はしやすいですが、出発前に再更新してください。';
}

function shortOutingText(key) {
  if (key === 'high') return '雨具前提';
  if (key === 'mid') return '短時間なら可';
  return 'しやすい';
}

function hikingText(key, agreement) {
  if (key === 'high') return '避けたい';
  if (agreement === '低') return '直前確認';
  if (key === 'mid') return '短め推奨';
  return '行きやすい';
}

function summaryComment(day, analysis) {
  if (analysis?.risk?.key === 'high') return '今から3時間の雨リスクが高めです。短時間判断を優先してください。';
  if (day.risk.key === 'high') return '今日全体の雨リスク高。登山・長時間の屋外予定は慎重に。';
  if (day.risk.key === 'mid') return '外出は可。時間帯によってにわか雨に注意。';
  return '外出しやすい予報です。予定前にもう一度更新すると安全です。';
}

function isRainCode(code) {
  return [51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(Number(code));
}

function isThunderCode(code) {
  return [95,96,99].includes(Number(code));
}

function weatherCodeToText(code) {
  const map = {0:'快晴',1:'晴れ',2:'一部曇り',3:'曇り',45:'霧',48:'霧氷',51:'弱い霧雨',53:'霧雨',55:'強い霧雨',56:'弱い凍雨',57:'強い凍雨',61:'弱い雨',63:'雨',65:'強い雨',66:'弱い凍雨',67:'強い凍雨',71:'弱い雪',73:'雪',75:'強い雪',77:'雪粒',80:'弱いにわか雨',81:'にわか雨',82:'強いにわか雨',85:'弱いにわか雪',86:'強いにわか雪',95:'雷雨',96:'雷雨・弱い雹',99:'雷雨・強い雹'};
  return map[code] || `不明:${code}`;
}

function weatherCodeToIcon(code) {
  if (code === 0) return '☀️';
  if (code === 1) return '🌤️';
  if (code === 2) return '⛅';
  if (code === 3) return '☁️';
  if ([45,48].includes(code)) return '🌫️';
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return '🌧️';
  if ([71,73,75,77,85,86].includes(code)) return '❄️';
  if ([95,96,99].includes(code)) return '⛈️';
  return '☁️';
}

function windDirectionToText(deg) {
  if (deg == null || Number.isNaN(Number(deg))) return '-';
  const dirs = ['北','北北東','北東','東北東','東','東南東','南東','南南東','南','南南西','南西','西南西','西','西北西','北西','北北西'];
  return dirs[Math.round(Number(deg) / 22.5) % 16];
}

function weekdayShort(date) {
  return ['日','月','火','水','木','金','土'][new Date(`${date}T00:00:00+09:00`).getDay()];
}

function formatMonthDay(date) {
  const d = new Date(`${date}T00:00:00+09:00`);
  return `${d.getMonth() + 1}/${d.getDate()}（${weekdayShort(date)}）`;
}

function formatLongDate(date) {
  return date ? `${formatMonthDay(date)} の予報` : '--';
}

function formatDateTime(iso) {
  return new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: LOCATION.timezone
  }).format(new Date(iso));
}

function formatProbability(value) {
  return typeof value === 'number' ? `${value}%` : '-';
}

function average(values) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (!clean.length) return 0;
  return clean.reduce((sum, v) => sum + v, 0) / clean.length;
}

function round(v, digits = 0) {
  const p = 10 ** digits;
  return Math.round(Number(v) * p) / p;
}

function escapeHtml(v) {
  return String(v).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function readCachedWeather() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
}

function writeCachedWeather(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
}

function renderError(error) {
  els.hourlyTableBody.innerHTML = `<tr><td colspan="7" class="empty-cell error-box">取得に失敗しました：${escapeHtml(error.message || error)}</td></tr>`;
  els.updatedAt.textContent = '取得失敗';
  els.decisionTitle.textContent = '取得失敗';
  els.decisionMessage.textContent = '通信状態を確認してから、もう一度更新してください。';
}

function showToast(message) {
  const div = document.createElement('div');
  div.className = 'toast';
  div.textContent = message;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3600);
}
