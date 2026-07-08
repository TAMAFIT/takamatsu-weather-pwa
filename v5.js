'use strict';

const V5 = {
  weatherKey: 'takamatsu-weather:v2-1:last-success',
  logKey: 'takamatsu-weather:sky-logs:v1',
  tz: 'Asia/Tokyo'
};

let v5Timer = null;

document.addEventListener('DOMContentLoaded', () => {
  injectV5App();
  renderV5WhenReady();
  document.getElementById('refreshButton')?.addEventListener('click', () => {
    clearTimeout(v5Timer);
    v5Timer = setTimeout(renderV5WhenReady, 1700);
  });
});

function injectV5App() {
  const main = document.querySelector('main');
  if (!main || document.querySelector('.v5-app')) return;
  const section = document.createElement('section');
  section.className = 'v5-app';
  section.innerHTML = `
    <div class="v5-hero">
      <div class="v5-kicker"><span>高松・日差し判定</span><button id="v5Refresh" class="v5-refresh" type="button">更新</button></div>
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
      <div class="v5-section-head"><h3>判断材料</h3><span class="v5-section-note">数字だけ確認</span></div>
      <div class="v5-evidence">
        <div class="v5-evidence-item"><span>平均雲量</span><strong id="v5CloudAvg">--</strong></div>
        <div class="v5-evidence-item"><span>平均日照</span><strong id="v5SunAvg">--</strong></div>
        <div class="v5-evidence-item"><span>最大UV</span><strong id="v5UvMax">--</strong></div>
      </div>
      <div id="v5AmedasNote" class="v5-log-mini"><p>アメダス実測を確認中です。</p><button type="button" id="v5OpenOfficial">公式</button></div>
    </div>

    <div class="v5-section">
      <div class="v5-section-head"><h3>週間</h3><span class="v5-section-note">ざっくり</span></div>
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

  const lat = 34.3428;
  const lon = 134.0466;
  const nowcast = `https://www.jma.go.jp/bosai/nowc/#lat:${lat}/lon:${lon}/zoom:11/colordepth:normal/elements:hrpns&slmcs`;
  const himawari = `https://www.jma.go.jp/bosai/map.html#6/${lat}/${lon}/&elem=ir&contents=himawari`;
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

function renderV5(bundle) {
  const hours = pickNextHours(bundle.base.hourly, 6);
  const now3 = hours.slice(0, 3);
  const decisions = now3.map(row => judgeSun(row));
  const final = summarize(now3, decisions, readAmedasFromDom(), bundle.next3?.comparison);

  setText('v5Decision', final.title);
  setText('v5Reason', final.reason);
  setText('v5Sun', final.sunText);
  setText('v5Rain', final.rainText);
  setText('v5Obs', final.obsText);
  setText('v5Confidence', final.confidence);
  setText('v5TargetDate', formatDateLabel(now3[0]?.date || bundle.base.daily?.[0]?.date));
  setText('v5CloudAvg', percent(avg(now3.map(x => x.cloudCover))));
  setText('v5SunAvg', `${Math.round(avg(now3.map(x => x.sunshineMinutes)) || 0)}分`);
  setText('v5UvMax', formatNum(Math.max(...now3.map(x => Number(x.uvIndex || 0)))));
  setText('v5AmedasNote', final.amedasNote);

  renderHours(hours);
  renderDays(bundle.base.daily || []);
  renderLogsMini();
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
  const confidence = comparison?.agreement ? `一致度 ${comparison.agreement}` : '判定中';

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
  root.innerHTML = days.slice(0, 7).map((day, i) => `<button class="v5-day ${i===0?'is-active':''}" type="button"><b>${i===0?'今日':weekday(day.date)}</b><span class="emoji">${day.icon || '☁️'}</span><span>${escapeHtml(day.weatherText || '-')}</span><strong>${day.high}/${day.low}℃</strong></button>`).join('');
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
function obsShort(obs) { if (obs.rain1h && obs.rain1h > 0) return '雨あり'; if (obs.sun1h === null) return '確認中'; if (obs.sun1h <= 0.1) return '日照なし'; if (obs.sun1h >= 0.7) return '日照あり'; return '少し'; }
function obsNote(obs) { if (obs.rain1h && obs.rain1h > 0) return 'アメダスで降水あり。日焼け目的なら待機寄り。'; if (obs.sun1h === null) return 'アメダス実測を確認中。'; if (obs.sun1h <= 0.1) return '直近1時間の日照ほぼなし。予報より曇り寄りに見ます。'; if (obs.sun1h >= 0.7) return '直近1時間の日照あり。日焼け判断ではプラス材料。'; return '実測日照は少なめ。雲が抜けるかが判断ポイント。'; }

function readBundle(){ try { return JSON.parse(localStorage.getItem(V5.weatherKey)); } catch { return null; } }
function readLogs(){ try { return JSON.parse(localStorage.getItem(V5.logKey) || '[]'); } catch { return []; } }
function setText(id, value){ const el = document.getElementById(id); if (el) el.textContent = value; }
function avg(values){ const nums = values.filter(v => Number.isFinite(Number(v))).map(Number); return nums.length ? nums.reduce((a,b)=>a+b,0)/nums.length : null; }
function parseNumber(text){ const n = Number(String(text).replace(/[^0-9.\-]/g,'')); return Number.isFinite(n) ? n : null; }
function percent(v){ return typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v)}%` : '-'; }
function minutes(v){ return typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v)}分` : '-'; }
function formatNum(v){ return typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 10)/10).replace('.0','') : '-'; }
function weekday(date){ return ['日','月','火','水','木','金','土'][new Date(`${date}T00:00:00+09:00`).getDay()]; }
function formatDateLabel(date){ if(!date) return '今日'; const d = new Date(`${date}T00:00:00+09:00`); return `${d.getMonth()+1}/${d.getDate()}（${weekday(date)}）`; }
function escapeHtml(v){ return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
