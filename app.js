(() => {
  'use strict';
  const CFG={lat:34.3428,lon:134.0466,marineLat:34.35,marineLon:134.05,tz:'Asia/Tokyo',days:16,startHour:9,endHour:17,cacheKey:'takamatsu-sea-weather:v10-ui6-5-3',logKey:'takamatsu-sea-weather:logs',appVersion:'v6.5.3-temp-pill-fix',historyKey:'takamatsu-sea-weather:forecast-history-v1',autoKey:'takamatsu-sea-weather:auto-verification-v1',legacyCacheKeys:['takamatsu-sea-weather:v10-ui6-2-1','takamatsu-sea-weather:v10-ui6-2','takamatsu-sea-weather:v10-ui6-1','takamatsu-sea-weather:v10-ui6','takamatsu-sea-weather:v10-ui5','takamatsu-sea-weather:v10-ui4','takamatsu-sea-weather:v2-1:last-success']};
  const state={selectedDate:null,bundle:null,status:{forecast:'未取得',jma:'未取得',marine:'未取得',amedas:'未取得',satellite:'未取得',runs:'未取得'}};
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(input,init)=>{
    const url=typeof input==='string'?input:input?.url||String(input);
    const t=Date.now();
    try{
      const res=await nativeFetch(input,init);
      recordFetch(url,res.status,Date.now()-t);
      return res;
    }catch(e){
      recordFetch(url,'ERR',Date.now()-t,String(e.message||e));
      throw e;
    }
  };
  document.addEventListener('DOMContentLoaded',()=>{try{bindStaticUi();load(false);renderLogs();renderAutoEvaluations();registerServiceWorker()}catch(e){console.error(e);text('mainTitle','初期化失敗');text('mainReason','画面初期化でエラーが出ました。ファイルを再配置してください。')}});
  function bindStaticUi(){ $('#refreshBtn')?.addEventListener('click',()=>load(true)); $('#openLogBtn')?.addEventListener('click',()=>$('#logDialog')?.showModal()); $('#closeLogBtn')?.addEventListener('click',()=>$('#logDialog')?.close()); $('#logForm')?.addEventListener('submit',e=>{e.preventDefault();saveLog();$('#logDialog')?.close()});
    $('#copyDebugBtn')?.addEventListener('click',copyDebugLog);
    $('#saveDebugBtn')?.addEventListener('click',saveDebugLogFile);
    $('#runTestBtn')?.addEventListener('click',runConnectionTest);
    $('#clearCacheBtn')?.addEventListener('click',clearAppCache); const b='https://www.jma.go.jp/bosai'; $('#nowcastLink').href=`${b}/nowc/#lat:${CFG.lat}/lon:${CFG.lon}/zoom:11/colordepth:normal/elements:hrpns&slmcs`; $('#himawariLink').href=`${b}/map.html#6/${CFG.lat}/${CFG.lon}/&elem=ir&contents=himawari`; }
  async function load(force){setLoading(true);try{
    state.status={forecast:'取得中',jma:'取得中',marine:'取得中',amedas:'取得中',satellite:'取得中',runs:'取得中'};
    updateStatus();
    const cached=readCache();
    if(!force&&isUsableCache(cached)){state.bundle=cached;state.status=normalizeStatus(cached.status);state.selectedDate ||= todayKey();renderAll()}
    const bundle=await fetchBundle();
    state.bundle=bundle;state.status=normalizeStatus(bundle.status);state.selectedDate ||= todayKey();
    if(!bundle.forecast.daily.some(d=>d.date===state.selectedDate))state.selectedDate=bundle.forecast.daily[0]?.date||todayKey();
    writeCache(bundle);renderAll();toast('更新しました')
  }catch(e){console.error(e);const cached=readCache();
    if(isUsableCache(cached)){
      const fallback={...cached,status:normalizeStatus({...cached.status,forecast:'前回'})};
      state.bundle=fallback;state.status=fallback.status;state.selectedDate ||= todayKey();
      renderAll();
      toast('最新取得に失敗。前回データを表示中');
    }
    else{text('mainTitle','取得失敗');text('mainReason','通信またはAPI取得に失敗しました。前回データがないため表示できません。GitHub Pages上で開くか、少し待って更新してください。');state.status=normalizeStatus({...state.status,forecast:'失敗'});updateStatus()}
  }finally{setLoading(false)}}
  async function fetchBundle(){const status={forecast:'取得中',jma:'取得中',marine:'取得中',amedas:'取得中',satellite:'取得中',runs:'取得中'};
    const [forecast,jma,marine,amedas,satellite]=await Promise.allSettled([fetchForecast(),fetchJma(),fetchMarine(),fetchAmedas(),fetchSatelliteRadiation()]);
    if(forecast.status!=='fulfilled'&&jma.status!=='fulfilled')throw forecast.reason||jma.reason||new Error('main forecast unavailable');
    const forecastData=forecast.status==='fulfilled'?forecast.value:jma.value;

    let history={type:'local-history',samples:0,hourly:[]};
    let historyError='';
    try{
      history=buildForecastHistory(forecastData);
      saveForecastHistory(forecastData);
    }catch(e){
      historyError=String(e?.message||e||'history error');
      history={type:'local-history',samples:0,hourly:[],error:historyError};
      console.warn('forecast history skipped',e);
    }

    status.forecast=forecast.status==='fulfilled'?'OK':'JMA代替';
    status.jma=jma.status==='fulfilled'?'OK':'失敗';
    status.marine=marine.status==='fulfilled'?'OK':'失敗';
    status.amedas=amedas.status==='fulfilled'?'OK':'補助未使用';
    status.satellite=satellite.status==='fulfilled'?'OK':'失敗';
    status.runs=historyError?'履歴エラー':(history.samples>0?'OK':'記録開始');
    status.forecastError=forecast.status==='fulfilled'?'':String(forecast.reason?.message||forecast.reason||'');
    status.satelliteError=satellite.status==='fulfilled'?'':String(satellite.reason?.message||satellite.reason||'');
    status.runsError=historyError;
    status.amedasError=amedas.status==='fulfilled'?'':String(amedas.reason?.message||amedas.reason||'');

    return{version:CFG.appVersion,updatedAt:new Date().toISOString(),forecast:forecastData,jma:jma.status==='fulfilled'?jma.value:null,marine:marine.status==='fulfilled'?marine.value:null,amedas:amedas.status==='fulfilled'?amedas.value:null,satellite:satellite.status==='fulfilled'?satellite.value:null,runs:history,status:normalizeStatus(status)}
  }
  async function fetchForecast(){
    const essentialAttempts=[
      {
        hourly:['temperature_2m','precipitation_probability','precipitation','weather_code','cloud_cover','sunshine_duration','shortwave_radiation','uv_index','wind_speed_10m'],
        daily:['weather_code','temperature_2m_max','temperature_2m_min','precipitation_sum','precipitation_probability_max','uv_index_max','sunshine_duration']
      },
      {
        hourly:['temperature_2m','precipitation_probability','precipitation','weather_code','cloud_cover','shortwave_radiation','uv_index','wind_speed_10m'],
        daily:['weather_code','temperature_2m_max','temperature_2m_min','precipitation_sum','precipitation_probability_max']
      },
      {
        hourly:['temperature_2m','precipitation','weather_code','cloud_cover','shortwave_radiation','wind_speed_10m'],
        daily:['weather_code','temperature_2m_max','temperature_2m_min','precipitation_sum']
      }
    ];
    const detailVars={
      hourly:['relative_humidity_2m','cloud_cover_low','cloud_cover_mid','cloud_cover_high','wind_gusts_10m'],
      daily:['wind_speed_10m_max','shortwave_radiation_sum']
    };
    let base=null,lastErr=null;
    for(const a of essentialAttempts){
      try{base=await fetchForecastPart(a.hourly,a.daily);break}catch(e){lastErr=e}
    }
    if(!base)throw lastErr||new Error('forecast unavailable');
    const detail=await fetchForecastPart(detailVars.hourly,detailVars.daily).catch(()=>null);
    return mergeForecasts(base,detail);
  }
  async function fetchForecastPart(hourlyVars,dailyVars){
    const qs=new URLSearchParams({latitude:CFG.lat,longitude:CFG.lon,timezone:CFG.tz,forecast_days:String(CFG.days),hourly:hourlyVars.join(','),daily:dailyVars.join(',')});
    const res=await fetch(`https://api.open-meteo.com/v1/forecast?${qs}`,{cache:'no-store'});
    if(!res.ok)throw new Error(`forecast ${res.status}`);
    return normalizeForecast(await res.json());
  }
  function mergeForecasts(base,detail){
    if(!detail)return base;
    const byTime=new Map((detail.hourly||[]).map(r=>[r.time,r]));
    const hourly=(base.hourly||[]).map(r=>{
      const d=byTime.get(r.time);if(!d)return r;
      const merged={...r};
      for(const k of ['humidity','cloudLow','cloudMid','cloudHigh','gust'])if(d[k]!==undefined&&d[k]!==null)merged[k]=d[k];
      return merged;
    });
    const byDate=new Map((detail.daily||[]).map(r=>[r.date,r]));
    const daily=(base.daily||[]).map(r=>{
      const d=byDate.get(r.date);
      if(!d)return r;
      const merged={...r};
      for(const [k,v] of Object.entries(d)){
        if(k==='date')continue;
        if(v===undefined||v===null)continue;
        // 追加API側は気温を持たないことがあるため、0/0℃で本体の気温を上書きしない
        if((k==='high'||k==='low')&&Number(v)===0&&Number(r[k])>0)continue;
        merged[k]=v;
      }
      return merged;
    });
    return{hourly,daily};
  }
  async function fetchJma(){const hourly=['temperature_2m','relative_humidity_2m','precipitation','weather_code','cloud_cover','sunshine_duration','shortwave_radiation','wind_speed_10m'].join(',');const daily=['weather_code','temperature_2m_max','temperature_2m_min','precipitation_sum','wind_speed_10m_max','sunshine_duration','shortwave_radiation_sum'].join(',');const qs=new URLSearchParams({latitude:CFG.lat,longitude:CFG.lon,timezone:CFG.tz,forecast_days:'11',hourly,daily});const res=await fetch(`https://api.open-meteo.com/v1/jma?${qs}`,{cache:'no-store'});if(!res.ok)throw new Error(`jma ${res.status}`);return normalizeForecast(await res.json())}
  async function fetchMarine(){const hourly=['wave_height','wave_period','wind_wave_height','swell_wave_height','sea_surface_temperature'].join(',');const qs=new URLSearchParams({latitude:CFG.marineLat,longitude:CFG.marineLon,timezone:CFG.tz,forecast_days:String(CFG.days),hourly});const res=await fetch(`https://marine-api.open-meteo.com/v1/marine?${qs}`,{cache:'no-store'});if(!res.ok)throw new Error(`marine ${res.status}`);const j=await res.json(),h=j.hourly||{};return{hourly:(h.time||[]).map((time,i)=>({time,date:time.slice(0,10),hour:Number(time.slice(11,13)),wave:round(h.wave_height?.[i],2),wavePeriod:round(h.wave_period?.[i],1),windWave:round(h.wind_wave_height?.[i],2),swell:round(h.swell_wave_height?.[i],2),seaTemp:round(h.sea_surface_temperature?.[i],1)}))}}
  async function fetchSatelliteRadiation(){
    const base={latitude:CFG.lat,longitude:CFG.lon,timezone:CFG.tz,past_days:'2',forecast_days:'1',models:'satellite_radiation_seamless'};
    const attempts=[
      ['shortwave_radiation','sunshine_duration'],
      ['shortwave_radiation']
    ];
    let lastErr=null;
    for(const vars of attempts){
      const qs=new URLSearchParams({...base,hourly:vars.join(',')});
      const res=await fetch(`https://satellite-api.open-meteo.com/v1/archive?${qs}`,{cache:'no-store'});
      if(!res.ok){lastErr=new Error(`satellite ${res.status}`);continue}
      const j=await res.json(),h=j.hourly||{};
      const rows=(h.time||[]).map((time,i)=>({time,date:time.slice(0,10),hour:Number(time.slice(11,13)),satRad:round(h.shortwave_radiation?.[i],0),satSunMin:h.sunshine_duration?Math.round((h.sunshine_duration[i]||0)/60):null}))
        .filter(r=>Number.isFinite(Number(r.satRad))||Number.isFinite(Number(r.satSunMin)));
      return{hourly:rows};
    }
    throw lastErr||new Error('satellite unavailable');
  }
  function buildForecastHistory(forecast){
    const prev=readForecastHistory();
    const last1=prev[prev.length-1]||null;
    const last2=prev[prev.length-2]||null;
    const rows=(forecast.hourly||[]).map(r=>{
      const p1=last1?findHistoryRow(last1,r.date,r.hour):null;
      const p2=last2?findHistoryRow(last2,r.date,r.hour):null;
      return{date:r.date,hour:r.hour,cloud:nv(r.cloud),cloud1:nv(p1?.cloud),cloud2:nv(p2?.cloud),rainProb:nv(r.rainProb),rainProb1:nv(p1?.rainProb),rainProb2:nv(p2?.rainProb),rad:nv(r.radiation),rad1:nv(p1?.radiation),rad2:nv(p2?.radiation),sunMin:nv(r.sunMin),sunMin1:nv(p1?.sunMin),sunMin2:nv(p2?.sunMin)}
    });
    return{type:'local-history',samples:prev.length,hourly:rows};
  }
  function findHistoryRow(snapshot,date,hour){return(snapshot.hourly||[]).find(r=>r.date===date&&r.hour===hour)||null}
  function readForecastHistory(){try{const arr=JSON.parse(localStorage.getItem(CFG.historyKey)||'[]');return Array.isArray(arr)?arr.filter(x=>x&&x.hourly):[]}catch{return[]}}
  function saveForecastHistory(forecast){
    try{
      const arr=readForecastHistory();
      const snap={time:new Date().toISOString(),hourly:(forecast.hourly||[]).map(r=>({date:r.date,hour:r.hour,cloud:nv(r.cloud),rainProb:nv(r.rainProb),radiation:nv(r.radiation),sunMin:nv(r.sunMin)}))};
      arr.push(snap);
      const cut=arr.slice(-8);
      localStorage.setItem(CFG.historyKey,JSON.stringify(cut));
    }catch(e){console.warn('history save skipped',e)}
  }
  async function fetchPreviousRuns(){
    const attempts=[
      ['cloud_cover','cloud_cover_previous_day1','cloud_cover_previous_day2','precipitation_probability','precipitation_probability_previous_day1','precipitation_probability_previous_day2','shortwave_radiation','shortwave_radiation_previous_day1','shortwave_radiation_previous_day2'],
      ['cloud_cover','cloud_cover_previous_day1','cloud_cover_previous_day2','precipitation','precipitation_previous_day1','precipitation_previous_day2','shortwave_radiation','shortwave_radiation_previous_day1','shortwave_radiation_previous_day2']
    ];
    let lastErr=null;
    for(const vars of attempts){
      const qs=new URLSearchParams({latitude:CFG.lat,longitude:CFG.lon,timezone:CFG.tz,forecast_days:'5',past_days:'0',hourly:vars.join(',')});
      const res=await fetch(`https://previous-runs-api.open-meteo.com/v1/forecast?${qs}`,{cache:'no-store'});
      if(!res.ok){lastErr=new Error(`previous runs ${res.status}`);continue}
      const j=await res.json(),h=j.hourly||{};
      return{hourly:(h.time||[]).map((time,i)=>({time,date:time.slice(0,10),hour:Number(time.slice(11,13)),
        cloud:nv(h.cloud_cover?.[i]),cloud1:nv(h.cloud_cover_previous_day1?.[i]),cloud2:nv(h.cloud_cover_previous_day2?.[i]),
        rainProb:nv(h.precipitation_probability?.[i]),rainProb1:nv(h.precipitation_probability_previous_day1?.[i]),rainProb2:nv(h.precipitation_probability_previous_day2?.[i]),
        precip:nv(h.precipitation?.[i]),precip1:nv(h.precipitation_previous_day1?.[i]),precip2:nv(h.precipitation_previous_day2?.[i]),
        rad:nv(h.shortwave_radiation?.[i]),rad1:nv(h.shortwave_radiation_previous_day1?.[i]),rad2:nv(h.shortwave_radiation_previous_day2?.[i])
      }))};
    }
    throw lastErr||new Error('previous runs unavailable');
  }
  async function fetchAmedas(){
    const latest=await fetchText('https://www.jma.go.jp/bosai/amedas/data/latest_time.txt');
    const latestDate=new Date(latest.trim());
    const key=amedasTimeKey(latestDate);
    const [table,map]=await Promise.all([fetchJson('https://www.jma.go.jp/bosai/amedas/const/amedastable.json'),fetchJson(`https://www.jma.go.jp/bosai/amedas/data/map/${key}.json`)]);
    let best=null;
    for(const [code,meta] of Object.entries(table||{})){
      const obs=map?.[code];if(!obs)continue;
      const lat=coord(meta.lat),lon=coord(meta.lon);
      if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
      const dist=Math.hypot(lat-CFG.lat,lon-CFG.lon);
      if(!best||dist<best.dist)best={code,meta,obs,dist};
    }
    if(!best)throw new Error('amedas station not found');
    const stamps=[];
    for(let i=0;i<18;i++){const d=new Date(latestDate.getTime()-i*10*60*1000);stamps.push({date:d,key:amedasTimeKey(d)})}
    const maps=await Promise.allSettled(stamps.map(s=>fetchJson(`https://www.jma.go.jp/bosai/amedas/data/map/${s.key}.json`)));
    const series=maps.map((r,i)=>{if(r.status!=='fulfilled')return null;const obs=r.value?.[best.code];if(!obs)return null;return{time:stamps[i].date.toISOString(),key:stamps[i].key,sun1h:valueOf(obs.sun1h),rain1h:valueOf(obs.precipitation1h),temp:valueOf(obs.temp),humidity:valueOf(obs.humidity),wind:valueOf(obs.wind)}}).filter(Boolean).reverse();
    return{station:best.meta.kjName||best.meta.enName||best.code,timeKey:key,sun1h:valueOf(best.obs.sun1h),rain1h:valueOf(best.obs.precipitation1h),temp:valueOf(best.obs.temp),humidity:valueOf(best.obs.humidity),wind:valueOf(best.obs.wind),series}
  }
  function normalizeForecast(j){const h=j.hourly||{},d=j.daily||{};return{hourly:(h.time||[]).map((time,i)=>{const code=number(h.weather_code?.[i],3);return{time,date:time.slice(0,10),hour:Number(time.slice(11,13)),temp:round(h.temperature_2m?.[i],1),humidity:h.relative_humidity_2m?.[i]??null,rainProb:h.precipitation_probability?.[i]??null,rain:round(h.precipitation?.[i],1)||0,code,weather:weatherText(code),icon:weatherIcon(code),cloud:h.cloud_cover?.[i]??null,cloudLow:h.cloud_cover_low?.[i]??null,cloudMid:h.cloud_cover_mid?.[i]??null,cloudHigh:h.cloud_cover_high?.[i]??null,sunMin:h.sunshine_duration?Math.round((h.sunshine_duration[i]||0)/60):null,radiation:h.shortwave_radiation?Math.round(h.shortwave_radiation[i]||0):null,uv:h.uv_index?round(h.uv_index[i],1):null,wind:round(h.wind_speed_10m?.[i],1)||0,gust:round(h.wind_gusts_10m?.[i],1)}}),daily:(d.time||[]).map((date,i)=>{const code=number(d.weather_code?.[i],3);const hi=Number(d.temperature_2m_max?.[i]);const lo=Number(d.temperature_2m_min?.[i]);return{date,code,icon:weatherIcon(code),high:Number.isFinite(hi)?Math.round(hi):null,low:Number.isFinite(lo)?Math.round(lo):null}})}}
  function renderAll(note=''){const b=state.bundle;if(!b?.forecast?.hourly?.length)return;const selected=state.selectedDate||todayKey();
    state.status=normalizeStatus(b.status||state.status);
    const baseRows=targetRows(b.forecast.hourly,selected),jmaRows=b.jma?targetRows(b.jma.hourly,selected):[],marineRows=b.marine?targetRows(b.marine.hourly,selected):[],satRows=b.satellite?targetRows(b.satellite.hourly,selected):[],runRows=b.runs?targetRows(b.runs.hourly,selected):[];
    const r=judgeDay(baseRows,jmaRows,marineRows,b.amedas,selected,satRows,runRows);
    $('#hero').classList.remove('great','good','ok','bad');$('#hero').classList.add(r.gradeKey);applyBgTheme(r);
    text('selectedDate',isToday(selected)?`今日 ${dateLabel(selected)}`:`${dateLabel(selected)} の判定`);
    text('gradeMark',r.symbol);text('mainTitle',r.title);text('mainReason',note||r.reason);text('heroIcon',r.icon);
    text('tempSummary',heroTempSummary(selected,b.forecast.daily,baseRows));
    text('sunnyHours',`${r.goodHours}h`);text('tanLevel',r.tanLevel);text('rainLevel',r.rainLevel);text('seaLevel',r.marineLabel);text('bestTime',r.bestTime||'狙い目なし');
    text('avgCloud',`${Math.round(r.cloudAvg)}%`);text('sunTotal',`${r.sunHours}h`);text('uvMax',fmt(r.uvMax));text('rainRisk',r.rainLevel);text('marineRisk',r.marineLabel);text('confidence',r.confidence);
    text('compareNote',r.compareNote);text('satSignal',r.satLabel);text('amedasTrend',r.amedasTrend);
    $('#scoreMeter').style.width=`${Math.max(5,Math.min(100,Math.round(r.score)))}%`;
    renderHours(baseRows.map(row=>judgeHour(row,r.marineByHour.get(row.hour))));
    renderDays(b.forecast.daily);updateStatus();savePredictionSnapshot(selected,r,baseRows,jmaRows,marineRows,satRows);renderAutoEvaluations();runAutoVerification(b).catch(console.warn)
  }
  function targetRows(rows,date){return(rows||[]).filter(r=>r.date===date&&r.hour>=CFG.startHour&&r.hour<=CFG.endHour)}
  
  function isRainCode(code){
    const c=Number(code);
    return (c>=51&&c<=67)||(c>=80&&c<=82)||(c>=95&&c<=99);
  }
  function isSunnyCode(code){
    const c=Number(code);
    return c===0||c===1||c===2;
  }
  function rainHourPenalty(row){
    const rainProb=Number.isFinite(Number(row.rainProb))?Number(row.rainProb):((row.rain||0)>0?70:0);
    const rain=Number(row.rain||0);
    const sunMin=Number.isFinite(Number(row.sunMin))?Number(row.sunMin):sunFromWeather(row.code,row.radiation);
    const uv=Number.isFinite(Number(row.uv))?Number(row.uv):0;
    const codeRain=isRainCode(row.code);
    if(rain>0.3||codeRain)return -25;
    if(rain>0.05)return -14;
    const bright=isSunnyCode(row.code)&&(sunMin>=20||uv>=5);
    if(rainProb>=80)return bright?-8:-16;
    if(rainProb>=65)return bright?-6:-12;
    if(rainProb>=45)return bright?-4:-8;
    if(rainProb>=30)return -3;
    return 0;
  }
  function rainProfile({baseRows,jmaRows,amedas,selectedDate,sat,rainProbMax,rainAmount}){
    const baseRainCodes=(baseRows||[]).filter(r=>isRainCode(r.code)).length;
    const jmaRainCodes=(jmaRows||[]).filter(r=>isRainCode(r.code)).length;
    const jmaRainAmount=sum((jmaRows||[]).map(r=>r.rain||0));
    const amedasRain=isToday(selectedDate)&&amedas&&Number(amedas.rain1h)>0;
    const satStrong=sat?.level==='強'||sat?.level==='中';
    const clearish=(baseRows||[]).filter(r=>isSunnyCode(r.code)).length>=(baseRows||[]).length/2;
    const probabilityOnly=rainProbMax>=65&&rainAmount<=0.2&&baseRainCodes===0&&jmaRainAmount<=0.2&&jmaRainCodes<=1&&!amedasRain&&satStrong;
    const hard=amedasRain||rainAmount>1||baseRainCodes>=2||jmaRainAmount>1||jmaRainCodes>=3;
    let penalty=0,label='低',note='';
    if(hard){
      penalty=rainProbMax>=70||rainAmount>1||amedasRain?-25:-16;
      label='高';
      note='雨量・雨天コード・実測雨のいずれかが出ています。';
    }else if(probabilityOnly){
      penalty=-6;
      label='注意';
      note='降水確率は高めですが、降水量0mm・雨天コードなし・実測雨なし・衛星日射ありのため、にわか雨注意扱いです。';
    }else if(rainProbMax>=70){
      penalty=clearish?-12:-18;
      label='中';
      note='降水確率は高め。雨量が少なければ短時間判断。';
    }else if(rainProbMax>=50){
      penalty=-8;
      label='中';
      note='雨の可能性あり。';
    }else if(rainProbMax>=30){
      penalty=-4;
      label='低';
      note='軽い雨注意。';
    }
    return{label,penalty,note,probabilityOnly,hard,baseRainCodes,jmaRainCodes,jmaRainAmount,amedasRain,satStrong};
  }

  function judgeHour(row,marine){
    const cloud = Number.isFinite(Number(row.cloud)) ? Number(row.cloud) : cloudFromWeather(row.code);
    const sunMin = Number.isFinite(Number(row.sunMin)) ? Number(row.sunMin) : sunFromWeather(row.code, row.radiation);
    const uv = Number.isFinite(Number(row.uv)) ? Number(row.uv) : 0;
    const rainProb = Number.isFinite(Number(row.rainProb)) ? Number(row.rainProb) : ((row.rain||0)>0 ? 70 : 0);
    const rain = Number(row.rain||0);
    const wind = Number(row.wind||0);
    let score=0;
    if(cloud<=20)score+=30;else if(cloud<=40)score+=24;else if(cloud<=60)score+=15;else if(cloud<=75)score+=5;else score-=8;
    if(sunMin>=50)score+=30;else if(sunMin>=40)score+=24;else if(sunMin>=25)score+=16;else if(sunMin>=10)score+=7;else score-=5;
    if(uv>=7)score+=15;else if(uv>=5)score+=11;else if(uv>=3)score+=6;else if(uv>=1)score+=2;
    score+=rainHourPenalty({...row,cloud,sunMin,uv,rainProb,rain});
    if(wind>=35)score-=12;else if(wind>=25)score-=6;
    if(marine?.wave>=1.2)score-=10;else if(marine?.wave>=0.8)score-=5;
    if((row.code===0||row.code===1)&&rainProb<45&&sunMin>=40)score+=6;
    if(row.code===2&&rainProb<55&&sunMin>=35)score+=3;
    const gradeKey=score>=68?'great':score>=48?'good':score>=30?'ok':'bad';
    const label=gradeKey==='great'?'最高':gradeKey==='good'?'良い':gradeKey==='ok'?'普通':'弱い';
    return{...row,cloud,sunMin,uv,rainProb,marine,score:clamp(score),gradeKey,label}
  }
  function judgeDay(baseRows,jmaRows,marineRows,amedas,selectedDate,satRows=[],runRows=[]){
    const marineByHour=new Map((marineRows||[]).map(r=>[r.hour,r]));
    const judged=baseRows.map(row=>judgeHour(row,marineByHour.get(row.hour)));
    const goodHours=judged.filter(h=>h.gradeKey==='great'||h.gradeKey==='good').length;
    const cloudAvg=average(baseRows.map(r=>r.cloud));
    const sunHours=round(sum(baseRows.map(r=>r.sunMin||0))/60,1);
    const uvMax=maximum(baseRows.map(r=>r.uv));
    const rainProbMax=maximum(baseRows.map(r=>r.rainProb));
    const rainAmount=sum(baseRows.map(r=>r.rain||0));
    const windMax=maximum(baseRows.map(r=>r.wind));
    const waveMax=maximum(marineRows.map(r=>r.wave));
    const jmaGood=jmaRows.length?jmaRows.map(row=>judgeHour(row,null)).filter(h=>h.gradeKey==='great'||h.gradeKey==='good').length:null;
    const modelDiff=jmaGood===null?null:Math.abs(goodHours-jmaGood);
    const sat=analyzeSatellite(satRows,selectedDate,state.status);
    const amedasTrend=analyzeAmedasTrend(amedas,selectedDate,state.status);
    const stability=analyzeRunStability(runRows,selectedDate,state.status);
    const rainInfo=rainProfile({baseRows,jmaRows,amedas,selectedDate,sat,rainProbMax,rainAmount});

    let score=0;
    score+=goodHours*8;
    score+=Math.min(25,sunHours*4);
    score+=uvMax>=7?10:uvMax>=5?7:uvMax>=3?4:0;
    score+=cloudAvg<=30?16:cloudAvg<=45?10:cloudAvg<=60?4:-8;
    score+=rainInfo.penalty;
    if(windMax>=35)score-=16;
    else if(windMax>=25)score-=8;
    if(waveMax>=1.2)score-=12;
    else if(waveMax>=0.8)score-=6;
    if(modelDiff!==null&&modelDiff>=4)score-=6;

    if(sat.level==='強')score+=10;
    else if(sat.level==='中')score+=4;
    else if(sat.level==='弱')score-=12;

    if(stability.level==='高')score+=5;
    else if(stability.level==='低')score-=8;

    const today=isToday(selectedDate);
    if(today&&amedas){
      if((amedas.rain1h||0)>0)score-=15;
      if(currentHour()>=9&&currentHour()<=17&&Number.isFinite(amedas.sun1h)&&amedas.sun1h<=0.1)score-=10;
      if(Number.isFinite(amedas.sun1h)&&amedas.sun1h>=0.6)score+=6;
      if(amedasTrend.level==='上向き')score+=4;
      else if(amedasTrend.level==='日照なし')score-=8;
    }
    score=clamp(score);

    let gradeKey='bad',symbol='×',title='見送り';
    if(score>=76&&goodHours>=5&&!rainInfo.hard){gradeKey='great';symbol='◎';title='海日和'}
    else if(score>=58&&goodHours>=3){gradeKey='good';symbol='○';title='行ける'}
    else if(score>=38||goodHours>=2||rainInfo.probabilityOnly){gradeKey='ok';symbol='△';title='条件付'}

    const rainLevel=rainInfo.label;
    const tanLevel=sunHours>=5&&uvMax>=5?'高':sunHours>=3&&uvMax>=3?'中':'低';
    const marineLabel=windMax>=35||waveMax>=1.2?'悪い':windMax>=25||waveMax>=0.8?'注意':'良い';
    const confidence=combinedConfidence({modelDiff,stability,sat});
    const bestTime=bestRun(judged);
    const icon=dailyIconByWeather(baseRows,gradeKey,rainLevel);
    const reason=buildReason(title,rainLevel,marineLabel,rainInfo);
    const compareNote=buildCompareNote({modelDiff,jmaGood,goodHours,amedas,selectedDate,waveMax,sat,stability,amedasTrend,rainInfo});
    return{score,gradeKey,symbol,title,icon,reason,goodHours,cloudAvg,sunHours,uvMax,rainLevel,tanLevel,marineLabel,confidence,bestTime,compareNote,marineByHour,satLabel:sat.label,amedasTrend:amedasTrend.label}
  }
  function buildReason(title,rainLevel,marineLabel,rainInfo=null){
    if(title==='海日和')return rainLevel==='注意'?'日差しあり。にわか雨だけ注意。海・日焼け向き。':'日差しあり。雨リスク低め。海・日焼け向き。';
    if(title==='行ける')return rainLevel==='注意'?'晴れ間あり。にわか雨注意でおすすめ時間中心。':'晴れ間あり。行くならおすすめ時間中心で。';
    if(title==='条件付')return rainInfo?.probabilityOnly?'日差しはあるが、にわか雨注意。雲画像確認推奨。':'晴れ間はあるが不安定。短時間ならあり。';
    if(rainLevel==='高'||marineLabel==='悪い')return '雨・風波に注意。海目的なら別日が安全。';
    return '日差し弱め。海目的なら別日が安全。';
  }
  function buildCompareNote({modelDiff,jmaGood,goodHours,amedas,selectedDate,waveMax,sat,stability,amedasTrend,rainInfo}){
    const parts=[];
    if(modelDiff===null)parts.push('JMA比較は未取得。');
    else if(modelDiff<=1)parts.push('通常予報とJMAは概ね一致。');
    else if(modelDiff<=3)parts.push(`通常${goodHours}h / JMA${jmaGood}hで少し差。`);
    else parts.push(`通常${goodHours}h / JMA${jmaGood}hで大きく割れています。雲画像確認推奨。`);
    if(rainInfo?.note)parts.push(rainInfo.note);
    if(sat?.note)parts.push(sat.note);
    else if(sat?.level&&sat.level!=='不明')parts.push(`衛星日射${sat.label}。`);
    if(stability?.note)parts.push(stability.note);
    if(isToday(selectedDate)&&amedas){
      if((amedas.rain1h||0)>0)parts.push(`直近雨${amedas.rain1h}mm。`);
      if(amedasTrend?.level==='夜間')parts.push('実測日照は夜間のため参考外。');
      else{
        if(Number.isFinite(amedas.sun1h))parts.push(`直近日照${amedas.sun1h}h。`);
        if(amedasTrend?.level&&amedasTrend.level!=='不明')parts.push(`日照推移${amedasTrend.label}。`);
      }
    }else if(isToday(selectedDate)&&amedasTrend?.level==='衛星補正'){
      parts.push('アメダス日照は未使用。衛星日射で補正中。');
    }else if(!isToday(selectedDate)){
      parts.push('衛星日射・実測日照は当日確認用。');
    }
    if(Number.isFinite(waveMax)&&waveMax>0)parts.push(`波高最大${waveMax}m。`);
    return parts.join(' ');
  }
  function renderHours(hours){
    $('#hourList').innerHTML=hours.map(h=>`<article class="hour ${h.gradeKey}">
      <div class="hourTime"><strong>${pad(h.hour)}:00</strong></div>
      <div class="hourWeatherIcon" aria-hidden="true"><img src="${hourIconSrc(h)}" alt="" /></div>
      <div class="hourMain"><b>${h.label}</b><small>${escapeHtml(skyLabel(h))}</small><small class="hourTemp">${hourTempText(h)}</small></div>
      <div class="hourChips"><span>雲 ${pct(h.cloud)}</span><span>日照 ${minute(h.sunMin)}</span><span>UV ${fmt(h.uv)}</span><span>雨 ${pct(h.rainProb)}</span></div>
    </article>`).join('')
  }
  function hourTempText(h){
    const t=Number(h?.temp);
    return Number.isFinite(t)?`${Math.round(t)}℃`:'--℃';
  }
  function heroTempSummary(selected,daily,rows=[]){
    const day=(daily||[]).find(d=>d.date===selected)||{};
    let hi=Number(day.high),lo=Number(day.low);
    const temps=(rows||[]).map(r=>Number(r.temp)).filter(Number.isFinite);
    const invalid=!Number.isFinite(hi)||!Number.isFinite(lo)||(hi===0&&lo===0);
    if(invalid&&temps.length){hi=Math.round(Math.max(...temps));lo=Math.round(Math.min(...temps));}
    const hiTxt=Number.isFinite(hi)?Math.round(hi):'--';
    const loTxt=Number.isFinite(lo)?Math.round(lo):'--';
    const range=`高${hiTxt}℃ / 低${loTxt}℃`;
    if(isToday(selected)){
      const nowHour=currentHour();
      const nearest=(rows||[]).slice().sort((a,b)=>Math.abs(a.hour-nowHour)-Math.abs(b.hour-nowHour))[0];
      const nowT=Number(nearest?.temp);
      if(Number.isFinite(nowT))return`今${Math.round(nowT)}℃ / ${range}`;
    }
    return range;
  }
  function renderDays(days){const root=$('#dayStrip');text('dayCount',`${days.length}日分`);root.innerHTML=days.map(day=>{const rows=targetRows(state.bundle.forecast.hourly,day.date),jmaRows=state.bundle.jma?targetRows(state.bundle.jma.hourly,day.date):[],marineRows=state.bundle.marine?targetRows(state.bundle.marine.hourly,day.date):[],r=judgeDay(rows,jmaRows,marineRows,state.bundle.amedas,day.date);const t=dayTemp(day,rows);return`<button class="day ${r.gradeKey} ${day.date===state.selectedDate?'active':''}" type="button" data-date="${day.date}"><span>${isToday(day.date)?'今日':weekday(day.date)}</span><b>${shortDate(day.date)}</b><em>${r.icon}</em><strong>海${r.symbol}</strong><small>${t}</small></button>`}).join('');root.querySelectorAll('.day').forEach(btn=>btn.addEventListener('click',()=>{state.selectedDate=btn.dataset.date;renderAll();btn.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'})}))}
  function dayTemp(day,rows=[]){
    let hi=Number(day?.high),lo=Number(day?.low);
    const invalid=!Number.isFinite(hi)||!Number.isFinite(lo)||(hi===0&&lo===0);
    if(invalid){
      const temps=(rows||[]).map(r=>Number(r.temp)).filter(Number.isFinite);
      if(temps.length){hi=Math.round(Math.max(...temps));lo=Math.round(Math.min(...temps));}
    }
    return Number.isFinite(hi)&&Number.isFinite(lo)?`${hi}/${lo}℃`:'--/--℃';
  }
  function updateStatus(){const s=normalizeStatus(state.status||{});text('sourceForecast',s.forecast);text('sourceJma',s.jma);text('sourceMarine',s.marine);text('sourceAmedas',s.amedas);text('sourceSatellite',s.satellite);text('sourceRuns',s.runs);text('updatedAt',state.bundle?.updatedAt?new Date(state.bundle.updatedAt).toLocaleString('ja-JP',{hour:'2-digit',minute:'2-digit'}):'未取得')}
  function analyzeSatellite(rows,selectedDate,status){
    if(!isToday(selectedDate))return{level:'対象外',label:'当日確認',avg:null,note:'衛星日射は当日確認用。'};
    if(status?.satellite==='失敗')return{level:'失敗',label:'取得失敗',avg:null,note:'衛星日射は取得失敗。'};
    if(status?.satellite==='取得中')return{level:'不明',label:'取得中',avg:null,note:'衛星日射を取得中。'};
    const xs=(rows||[]).filter(r=>Number.isFinite(Number(r.satRad))&&Number(r.satRad)>0);
    if(!xs.length)return{level:'不明',label:'夜/待ち',avg:null,note:'衛星日射は夜間または未更新。'};
    const avg=average(xs.map(r=>r.satRad));
    const label=avg>=550?'強い':avg>=350?'中':avg>=120?'弱め':'弱い';
    const level=avg>=550?'強':avg>=350?'中':avg>=120?'中':'弱';
    return{level,label,avg:round(avg,0)};
  }
  function analyzeAmedasTrend(amedas,selectedDate,status){
    if(!isToday(selectedDate))return{level:'対象外',label:'当日確認'};
    const hour=currentHour();
    const isNight=hour>=18||hour<5;
    if(status?.amedas==='失敗'||status?.amedas==='補助未使用'){
      if(isNight)return{level:'夜間',label:'夜間'};
      if(status?.satellite==='OK')return{level:'衛星補正',label:'衛星補正'};
      return{level:'補助未使用',label:'補助未使用'};
    }
    const s=amedas?.series||[];
    const xs=s.filter(r=>Number.isFinite(Number(r.sun1h)));
    if(!xs.length)return{level:isNight?'夜間':'不明',label:isNight?'夜間':'未取得'};
    const first=average(xs.slice(0,Math.max(1,Math.floor(xs.length/3))).map(r=>r.sun1h));
    const last=average(xs.slice(-Math.max(1,Math.floor(xs.length/3))).map(r=>r.sun1h));
    if(isNight)return{level:'夜間',label:'夜間'};
    if(last>=0.6)return{level:'上向き',label:'良い'};
    if(last<=0.1)return{level:'日照なし',label:'日照なし'};
    if(last>first+0.15)return{level:'上向き',label:'上向き'};
    if(last<first-0.15)return{level:'低下',label:'低下'};
    return{level:'横ばい',label:'横ばい'};
  }
  function analyzeRunStability(rows,selectedDate,status){
    if(status?.runs==='履歴エラー')return{level:'履歴不足',label:'履歴不足',diff:null,note:'予報履歴は保存待ち。次回更新から比較します。'};
    if(status?.runs==='初回'||status?.runs==='記録開始')return{level:'記録開始',label:'記録開始',diff:null,note:'予報安定度は記録開始。次回更新から比較します。'};
    if(status?.runs==='取得中')return{level:'不明',label:'取得中',diff:null,note:'予報安定度を取得中。'};
    const xs=(rows||[]).filter(r=>Number.isFinite(Number(r.cloud))&&(Number.isFinite(Number(r.cloud1))||Number.isFinite(Number(r.cloud2))));
    if(!xs.length)return{level:'記録開始',label:'記録開始',diff:null,note:'予報安定度は記録開始。次回更新から比較します。'};
    const diffs=xs.map(r=>{
      const ds=[];
      if(Number.isFinite(Number(r.cloud1)))ds.push(Math.abs(r.cloud-r.cloud1));
      if(Number.isFinite(Number(r.cloud2)))ds.push(Math.abs(r.cloud-r.cloud2));
      if(Number.isFinite(Number(r.rainProb))&&Number.isFinite(Number(r.rainProb1)))ds.push(Math.abs(r.rainProb-r.rainProb1));
      if(Number.isFinite(Number(r.sunMin))&&Number.isFinite(Number(r.sunMin1)))ds.push(Math.min(100,Math.abs(r.sunMin-r.sunMin1)*1.5));
      if(Number.isFinite(Number(r.rad))&&Number.isFinite(Number(r.rad1)))ds.push(Math.min(100,Math.abs(r.rad-r.rad1)/8));
      return average(ds);
    });
    const diff=average(diffs);
    const level=diff<=10?'高':diff<=22?'中':'低';
    return{level,label:level,diff:round(diff,0),note:`予報履歴の安定度${level}。`};
  }
  function combinedConfidence({modelDiff,stability,sat}){
    let score=0;
    if(modelDiff===null)score+=1;else if(modelDiff<=1)score+=3;else if(modelDiff<=3)score+=2;else score+=0;
    if(stability.level==='高')score+=3;else if(stability.level==='中')score+=2;else if(stability.level==='低')score+=0;else score+=1;
    if(sat.level==='強'||sat.level==='中')score+=2;else if(sat.level==='弱')score+=0;else score+=1;
    return score>=7?'高':score>=4?'中':'低';
  }
  function bestRun(hours){let best=[],cur=[];for(const h of hours){const ok=h.gradeKey==='great'||h.gradeKey==='good';if(ok)cur.push(h);else{if(cur.length>best.length)best=cur;cur=[]}}if(cur.length>best.length)best=cur;return best.length?`${pad(best[0].hour)}:00〜${pad(best[best.length-1].hour+1)}:00`:''}
  
  function readAutoStore(){try{return JSON.parse(localStorage.getItem(CFG.autoKey)||'{"items":[]}')}catch{return{items:[]}}}
  function writeAutoStore(store){try{localStorage.setItem(CFG.autoKey,JSON.stringify({items:(store.items||[]).slice(-120)}))}catch{}}
  function autoSummaryForDebug(){
    const items=readAutoStore().items||[];
    return{count:items.length,evaluated:items.filter(x=>x.evaluation).length,latest:items.slice(-3).map(x=>({date:x.targetDate,title:x.title,savedAt:x.savedAt,evaluation:x.evaluation?.label||null,observed:x.observed||null}))};
  }
  function shouldSavePrediction(date){
    const t=todayKey();
    if(date>t)return true;
    if(date===t&&currentHour()<18)return true;
    return false;
  }
  function savePredictionSnapshot(date,result,baseRows,jmaRows,marineRows,satRows){
    if(!date||!result||!shouldSavePrediction(date))return;
    const store=readAutoStore();
    const items=store.items||[];
    const now=new Date().toISOString();
    const id=`${date}:${todayKey()}`;
    const existing=items.find(x=>x.id===id);
    const snap={
      id,
      targetDate:date,
      savedAt:now,
      selectedAtHour:currentHour(),
      title:result.title,
      gradeKey:result.gradeKey,
      symbol:result.symbol,
      score:round(result.score,0),
      goodHours:result.goodHours,
      cloudAvg:round(result.cloudAvg,0),
      sunHours:result.sunHours,
      uvMax:round(result.uvMax,1),
      rainLevel:result.rainLevel,
      tanLevel:result.tanLevel,
      marineLabel:result.marineLabel,
      bestTime:result.bestTime||'',
      forecast:{
        rainProbMax:maximum((baseRows||[]).map(r=>r.rainProb)),
        rainAmount:round(sum((baseRows||[]).map(r=>r.rain||0)),1),
        rainCodes:(baseRows||[]).filter(r=>isRainCode(r.code)).length,
        jmaGood:jmaRows?.length?(jmaRows||[]).map(r=>judgeHour(r,null)).filter(h=>h.gradeKey==='great'||h.gradeKey==='good').length:null,
        jmaRainCodes:(jmaRows||[]).filter(r=>isRainCode(r.code)).length,
        waveMax:round(maximum((marineRows||[]).map(r=>r.wave)),2),
        satAvg:round(average((satRows||[]).map(r=>r.satRad)),0)
      }
    };
    if(existing){
      if(!existing.evaluation)Object.assign(existing,snap);
    }else{
      items.push(snap);
    }
    writeAutoStore({items});
  }
  async function runAutoVerification(bundle){
    const store=readAutoStore();
    let changed=false;
    const today=todayKey(), hour=currentHour();
    for(const item of store.items||[]){
      if(item.evaluation&&item.evaluation.final)continue;
      const due=item.targetDate<today||(item.targetDate===today&&hour>=18);
      if(!due)continue;
      const observed=await buildObservedOutcome(item.targetDate,bundle).catch(e=>({status:'error',error:String(e.message||e)}));
      const evaluation=evaluatePrediction(item,observed);
      item.observed=observed;
      item.evaluation=evaluation;
      item.evaluatedAt=new Date().toISOString();
      changed=true;
    }
    if(changed){writeAutoStore(store);renderAutoEvaluations();}
  }
  async function buildObservedOutcome(date,bundle){
    const satRows=bundle?.satellite?.hourly?targetRows(bundle.satellite.hourly,date):[];
    const satAvg=average(satRows.map(r=>r.satRad));
    const satStrongHours=satRows.filter(r=>Number(r.satRad)>=350).length;
    const satSunHours=round(sum(satRows.map(r=>Number(r.satSunMin)||0))/60,1);
    let amedasDay=null;
    try{amedasDay=await fetchAmedasDay(date)}catch(e){amedasDay={status:'unavailable',error:String(e.message||e)}}
    const rainAmount=Number.isFinite(Number(amedasDay?.rainSum))?amedasDay.rainSum:null;
    const amedasSun=Number.isFinite(Number(amedasDay?.sunSum))?amedasDay.sunSum:null;
    const sunHours=Number.isFinite(amedasSun)?amedasSun:(Number.isFinite(satSunHours)&&satSunHours>0?satSunHours:null);
    let observedGrade='unknown';
    if(Number.isFinite(sunHours)||Number.isFinite(satAvg)||Number.isFinite(rainAmount)){
      const rainBad=Number.isFinite(rainAmount)&&rainAmount>1;
      const sunGood=(Number.isFinite(sunHours)&&sunHours>=4)||(Number.isFinite(satStrongHours)&&satStrongHours>=4)||(Number.isFinite(satAvg)&&satAvg>=420);
      const sunOk=(Number.isFinite(sunHours)&&sunHours>=2)||(Number.isFinite(satStrongHours)&&satStrongHours>=2)||(Number.isFinite(satAvg)&&satAvg>=220);
      if(rainBad)observedGrade='bad';
      else if(sunGood)observedGrade='good';
      else if(sunOk)observedGrade='ok';
      else observedGrade='bad';
    }
    return{
      status:'ok',
      date,
      satAvg:round(satAvg,0),
      satStrongHours,
      satSunHours,
      amedasStation:amedasDay?.station||null,
      amedasSunHours:amedasSun,
      rainAmount,
      observedGrade,
      source:amedasDay?.status==='ok'?'satellite+amedas':'satellite'
    };
  }
  async function fetchAmedasDay(date){
    const table=await fetchJson('https://www.jma.go.jp/bosai/amedas/const/amedastable.json');
    const latest=await fetchText('https://www.jma.go.jp/bosai/amedas/data/latest_time.txt');
    const latestDate=new Date(latest.trim());
    const latestMap=await fetchJson(`https://www.jma.go.jp/bosai/amedas/data/map/${amedasTimeKey(latestDate)}.json`);
    const best=findNearestAmedasStation(table,latestMap);
    if(!best)throw new Error('amedas station not found');
    const hours=[];
    for(let h=CFG.startHour+1;h<=CFG.endHour+1;h++){
      const hh=String(h).padStart(2,'0');
      hours.push(`${date.replaceAll('-','')}${hh}0000`);
    }
    const maps=await Promise.allSettled(hours.map(key=>fetchJson(`https://www.jma.go.jp/bosai/amedas/data/map/${key}.json`)));
    const rows=maps.map((r,i)=>{
      if(r.status!=='fulfilled')return null;
      const obs=r.value?.[best.code];
      if(!obs)return null;
      return{key:hours[i],sun1h:valueOf(obs.sun1h),rain1h:valueOf(obs.precipitation1h),temp:valueOf(obs.temp),humidity:valueOf(obs.humidity)};
    }).filter(Boolean);
    if(!rows.length)throw new Error('amedas daily rows not found');
    return{status:'ok',station:best.meta.kjName||best.meta.enName||best.code,date,sunSum:round(sum(rows.map(r=>r.sun1h||0)),1),rainSum:round(sum(rows.map(r=>r.rain1h||0)),1),rows:rows.length};
  }
  function findNearestAmedasStation(table,map){
    let best=null;
    for(const [code,meta] of Object.entries(table||{})){
      const obs=map?.[code];if(!obs)continue;
      const lat=coord(meta.lat),lon=coord(meta.lon);
      if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
      const dist=Math.hypot(lat-CFG.lat,lon-CFG.lon);
      if(!best||dist<best.dist)best={code,meta,obs,dist};
    }
    return best;
  }
  function evaluatePrediction(item,observed){
    if(!observed||observed.status!=='ok'||observed.observedGrade==='unknown')return{label:'保留',level:'hold',final:false,reason:'実測データ不足。'};
    const predicted=item.gradeKey==='great'||item.gradeKey==='good'?'good':item.gradeKey==='ok'?'ok':'bad';
    const actual=observed.observedGrade;
    let label='的中',level='hit',reason='';
    if(predicted==='good'&&actual==='bad'){label='外れ';level='miss';reason='行ける予測に対して、実測の日射が弱い/雨あり。'}
    else if(predicted==='bad'&&(actual==='good'||actual==='ok')){label='外れ';level='miss';reason='見送り予測に対して、実測は日差しあり。'}
    else if(predicted==='ok'&&actual==='good'){label='やや外れ';level='partial';reason='条件付き予測より実測は良好。'}
    else if(predicted==='ok'&&actual==='bad'){label='的中寄り';level='hit';reason='条件付き予測どおり、実測も厳しめ。'}
    else if(predicted==='good'&&actual==='ok'){label='やや外れ';level='partial';reason='行ける予測より日射はやや弱め。'}
    else{label='的中';level='hit';reason='予測と実測傾向が一致。'}
    return{label,level,final:true,reason};
  }
  function renderAutoEvaluations(){
    const store=readAutoStore(),items=(store.items||[]).slice().sort((a,b)=>String(b.targetDate).localeCompare(String(a.targetDate))||String(b.savedAt).localeCompare(String(a.savedAt)));
    const evaluated=items.filter(x=>x.evaluation);
    text('autoEvalStatus',`${evaluated.length}/${items.length}件`);
    const root=$('#autoEvalList');if(!root)return;
    if(!items.length){root.innerHTML='<p class="note">まだ自動照合できる予測がありません。</p>';return}
    root.innerHTML=items.slice(0,6).map(item=>{
      const ev=item.evaluation;
      const obs=item.observed;
      const cls=ev?.level||'pending';
      const label=ev?.label||'未照合';
      const source=obs?.source?` / ${obs.source}`:'';
      const obsLine=obs?.status==='ok'?`実測：日射${fmt(obs.satAvg)}W/m² / 強日射${obs.satStrongHours ?? '-'}h / 日照${obs.amedasSunHours ?? obs.satSunHours ?? '-'}h / 雨${obs.rainAmount ?? '-'}mm${source}`:'実測：未取得';
      return`<div class="autoItem ${cls}"><div><strong>${dateLabel(item.targetDate)} ${escapeHtml(item.symbol||'')} ${escapeHtml(item.title||'')}</strong><span>${escapeHtml(label)}</span></div><p>${escapeHtml(obsLine)}</p>${ev?.reason?`<p>${escapeHtml(ev.reason)}</p>`:''}</div>`;
    }).join('');
  }


  function saveLog(){const logs=readLogs();logs.unshift({at:new Date().toISOString(),date:state.selectedDate||todayKey(),sky:$('#skySelect').value,result:$('#resultSelect').value,memo:$('#memoInput').value.trim(),title:$('#mainTitle').textContent,grade:$('#gradeMark').textContent});localStorage.setItem(CFG.logKey,JSON.stringify(logs.slice(0,200)));$('#memoInput').value='';renderLogs();toast('記録しました')}
  function readLogs(){try{return JSON.parse(localStorage.getItem(CFG.logKey))||[]}catch{return[]}}
  function renderLogs(){const logs=readLogs();text('logCount',`${logs.length}件`);const root=$('#recentLogs');if(!root)return;root.innerHTML=logs.slice(0,5).map(l=>`<div class="logItem"><strong>${dateLabel(l.date)} / ${escapeHtml(l.sky)} / ${escapeHtml(l.result)}</strong><br>判定：${escapeHtml(l.grade)} ${escapeHtml(l.title)} ${l.memo?`<br>メモ：${escapeHtml(l.memo)}`:''}</div>`).join('')||'<p class="note">まだ記録がありません。</p>'}

  function applyBgTheme(result){
    const classes=['theme-sunny','theme-cloudy','theme-rain','theme-night'];
    document.body.classList.remove(...classes);
    const hour=currentHour();
    const todayView=isToday(state.selectedDate||todayKey());
    if(todayView&&(hour>=18||hour<=4)){document.body.classList.add('theme-night');return;}
    if(result.rainLevel==='高'||result.gradeKey==='bad'){document.body.classList.add('theme-rain');return;}
    if(result.gradeKey==='ok'){document.body.classList.add('theme-cloudy');return;}
    document.body.classList.add('theme-sunny');
  }

  function rainyCode(code){return[51,53,55,61,63,65,80,81,82,95,96,99].includes(Number(code))}
  function stormCode(code){return[95,96,99].includes(Number(code))}
  function skyType(h){
    const code=Number(h.code);
    const cloud=Number.isFinite(Number(h.cloud))?Number(h.cloud):cloudFromWeather(code);
    const sun=Number.isFinite(Number(h.sunMin))?Number(h.sunMin):sunFromWeather(code,h.radiation);
    const rain=Number(h.rain||0);
    if(stormCode(code)||rainyCode(code)||rain>0.2)return 'rain';
    if(cloud<=18&&sun>=50)return 'sun';
    if(cloud<=38&&sun>=40)return 'sun';
    if(cloud<=55&&sun>=30)return 'sunCloud';
    if(cloud<=72&&sun>=12)return 'cloudSun';
    return 'cloud';
  }
  function skyLabel(h){
    const type=skyType(h);
    if(type==='rain')return stormCode(h.code)?'雷雨':'雨';
    const cloud=Number.isFinite(Number(h.cloud))?Number(h.cloud):cloudFromWeather(h.code);
    const sun=Number.isFinite(Number(h.sunMin))?Number(h.sunMin):sunFromWeather(h.code,h.radiation);
    if(type==='sun'&&cloud<=18&&sun>=50)return '快晴';
    if(type==='sun')return '晴れ';
    if(type==='sunCloud')return '薄雲';
    if(type==='cloudSun')return '雲多め';
    return '曇り';
  }
  function cloudFromWeather(code){code=Number(code);if(code===0)return 5;if(code===1)return 22;if(code===2)return 48;if(code===3)return 88;if([51,53,55,61,63,65,80,81,82,95,96,99].includes(code))return 92;return 75}
  function sunFromWeather(code,radiation){const rad=Number(radiation);if(Number.isFinite(rad)&&rad>0)return Math.max(0,Math.min(60,Math.round(rad/12)));code=Number(code);if(code===0)return 60;if(code===1)return 50;if(code===2)return 35;if(code===3)return 8;return 0}
  function hourIconSrc(h){
    const sky=skyType(h);
    if(sky==='rain')return './icons/weather-rain.svg';
    if(sky==='sun')return './icons/weather-sun.svg';
    if(sky==='sunCloud')return './icons/weather-sun-cloud.svg';
    if(sky==='cloudSun')return './icons/weather-cloud-sun.svg';
    return './icons/weather-cloud.svg';
  }
  function dailyIconByWeather(rows,gradeKey,rainLevel){
    const judged=(rows||[]).map(r=>({row:r,type:skyType(r)}));
    if(judged.some(x=>x.type==='rain'))return '🌧️';
    const sunCount=judged.filter(x=>x.type==='sun').length;
    const sunCloudCount=judged.filter(x=>x.type==='sunCloud').length;
    const cloudSunCount=judged.filter(x=>x.type==='cloudSun').length;
    if(gradeKey==='great'&&sunCount>=4)return '🏖️';
    if(sunCount>=3)return '☀️';
    if(sunCount+sunCloudCount>=3)return '🌤️';
    if(sunCloudCount+cloudSunCount>=3)return '⛅';
    return '☁️';
  }
  function setLoading(v){const b=$('#refreshBtn');b.disabled=v;b.textContent=v?'取得中':'更新'} async function fetchText(url){const res=await fetch(url,{cache:'no-store'});if(!res.ok)throw new Error(`${url} ${res.status}`);return res.text()} async function fetchJson(url){const res=await fetch(url,{cache:'no-store'});if(!res.ok)throw new Error(`${url} ${res.status}`);return res.json()} function amedasKeyFromDate(value){return amedasTimeKey(value)} function amedasTimeKey(value){const d=new Date(value);const p=new Intl.DateTimeFormat('sv-SE',{timeZone:CFG.tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(d).reduce((a,x)=>(a[x.type]=x.value,a),{});return`${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}`} function coord(v){if(Array.isArray(v))return Number(v[0])+Number(v[1]||0)/60;return Number(v)} function valueOf(v){if(Array.isArray(v))return Number(v[0]);const n=Number(v);return Number.isFinite(n)?n:null} function readCache(){
    try{
      const current=JSON.parse(localStorage.getItem(CFG.cacheKey));
      if(isUsableCache(current))return current;
      for(const key of CFG.legacyCacheKeys||[]){
        const b=JSON.parse(localStorage.getItem(key));
        if(b?.forecast?.hourly?.length)return upgradeCache(b);
      }
      return null;
    }catch{return null}
  }
  function upgradeCache(b){return{...b,version:CFG.appVersion,status:normalizeStatus(b.status),satellite:b.satellite||null,runs:b.runs||{type:'none',samples:0,hourly:[]}}}
  function isUsableCache(b){return !!(b&&b.forecast?.hourly?.length)}
  function normalizeStatus(s={}){return{
    forecast:s.forecast||'未取得',
    jma:s.jma||'未取得',
    marine:s.marine||'未取得',
    amedas:s.amedas||'未取得',
    satellite:s.satellite||'未取得',
    runs:s.runs||'未取得',
    forecastError:s.forecastError||'',
    satelliteError:s.satelliteError||'',
    runsError:s.runsError||'',
    amedasError:s.amedasError||''
  }}
  function writeCache(b){try{localStorage.setItem(CFG.cacheKey,JSON.stringify({...b,version:CFG.appVersion,status:normalizeStatus(b.status)}))}catch{}}
  
  function recordFetch(url,status,ms,error=''){
    try{
      const arr=JSON.parse(sessionStorage.getItem(CFG.debugKey)||'[]');
      const item={time:new Date().toISOString(),url:String(url).slice(0,240),status,ms,error:String(error||'').slice(0,240)};
      const last=arr[arr.length-1];
      const now=Date.parse(item.time);
      const lastTime=last?Date.parse(last.time):0;
      const same=last&&last.url===item.url&&String(last.status)===String(item.status)&&Math.abs(now-lastTime)<2000;
      if(same){
        last.ms=Math.min(Number(last.ms)||ms,ms);
        last.count=(last.count||1)+1;
        if(item.error&&!last.error)last.error=item.error;
      }else{
        arr.push(item);
      }
      sessionStorage.setItem(CFG.debugKey,JSON.stringify(arr.slice(-50)));
    }catch{}
  }
  function buildDebugLog(){
    const selected=state.selectedDate||todayKey();
    const b=state.bundle||readCache();
    const status=normalizeStatus(state.status||b?.status||{});
    const rows=b?.forecast?.hourly?targetRows(b.forecast.hourly,selected):[];
    const sampleRows=rows.slice(0,4).map(r=>({time:`${r.date} ${pad(r.hour)}:00`,weather:r.weather,cloud:r.cloud,sunMin:r.sunMin,uv:r.uv,rainProb:r.rainProb,rain:r.rain,wind:r.wind}));
    const cache=readCache();
    let sw={supported:'serviceWorker'in navigator,controller:!!navigator.serviceWorker?.controller,state:navigator.serviceWorker?.controller?.state||null};
    const debugFetches=(()=>{try{return JSON.parse(sessionStorage.getItem(CFG.debugKey)||'[]')}catch{return[]}})();
    const log={
      appVersion:CFG.appVersion,
      timestamp:new Date().toISOString(),
      url:location.href,
      protocol:location.protocol,
      isLocalFile:location.protocol==='file:',
      online:navigator.onLine,
      userAgent:navigator.userAgent,
      language:navigator.language,
      timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
      selectedDate:selected,
      stateStatus:status,
      bundleUpdatedAt:b?.updatedAt||null,
      cacheExists:!!cache,
      cacheUpdatedAt:cache?.updatedAt||null,
      forecastHours:b?.forecast?.hourly?.length||0,
      jmaHours:b?.jma?.hourly?.length||0,
      marineHours:b?.marine?.hourly?.length||0,
      satelliteHours:b?.satellite?.hourly?.length||0,
      amedas:b?.amedas?{station:b.amedas.station,timeKey:b.amedas.timeKey,sun1h:b.amedas.sun1h,rain1h:b.amedas.rain1h,temp:b.amedas.temp,humidity:b.amedas.humidity,seriesCount:b.amedas.series?.length||0}:null,
      runs:b?.runs?{type:b.runs.type,samples:b.runs.samples,hours:b.runs.hourly?.length||0}:null,
      mainView:{
        date:document.getElementById('selectedDate')?.textContent||'',
        title:document.getElementById('mainTitle')?.textContent||'',
        reason:document.getElementById('mainReason')?.textContent||'',
        sunnyHours:document.getElementById('sunnyHours')?.textContent||'',
        tanLevel:document.getElementById('tanLevel')?.textContent||'',
        rainLevel:document.getElementById('rainLevel')?.textContent||'',
        seaLevel:document.getElementById('seaLevel')?.textContent||'',
        confidence:document.getElementById('confidence')?.textContent||'',
        satSignal:document.getElementById('satSignal')?.textContent||'',
        amedasTrend:document.getElementById('amedasTrend')?.textContent||'',
        tempSummary:document.getElementById('tempSummary')?.textContent||'',
        compareNote:document.getElementById('compareNote')?.textContent||''
      },
      sampleRows,
      serviceWorker:sw,
      autoVerification: autoSummaryForDebug(),
      recentFetches:debugFetches
    };
    return log;
  }
  function debugText(){return JSON.stringify(buildDebugLog(),null,2)}
  async function copyDebugLog(){
    const txt=debugText();
    const preview=$('#debugPreview'); if(preview)preview.textContent=txt;
    try{await navigator.clipboard.writeText(txt);toast('診断ログをコピーしました')}
    catch(e){toast('コピー不可。ログ欄から手動コピーしてください')}
  }
  function saveDebugLogFile(){
    const txt=debugText();
    const preview=$('#debugPreview'); if(preview)preview.textContent=txt;
    const blob=new Blob([txt],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    a.href=url;a.download=`takamatsu-weather-debug-${stamp}.json`;
    document.body.appendChild(a);a.click();a.remove();
    URL.revokeObjectURL(url);
    toast('診断ログを保存しました');
  }
  async function runConnectionTest(){
    const tests=[
      ['通常予報','https://api.open-meteo.com/v1/forecast?latitude=34.3428&longitude=134.0466&timezone=Asia%2FTokyo&forecast_days=1&hourly=temperature_2m,weather_code,cloud_cover,precipitation_probability'],
      ['JMA','https://api.open-meteo.com/v1/jma?latitude=34.3428&longitude=134.0466&timezone=Asia%2FTokyo&forecast_days=1&hourly=temperature_2m,weather_code,cloud_cover,precipitation'],
      ['海況','https://marine-api.open-meteo.com/v1/marine?latitude=34.35&longitude=134.05&timezone=Asia%2FTokyo&forecast_days=1&hourly=wave_height,sea_surface_temperature'],
      ['衛星日射','https://satellite-api.open-meteo.com/v1/archive?latitude=34.3428&longitude=134.0466&timezone=Asia%2FTokyo&past_days=1&forecast_days=1&models=satellite_radiation_seamless&hourly=shortwave_radiation'],
      ['アメダス最新','https://www.jma.go.jp/bosai/amedas/data/latest_time.txt'],
      ['アメダス表','https://www.jma.go.jp/bosai/amedas/const/amedastable.json']
    ];
    const results=[];
    for(const [name,url] of tests){
      const t=Date.now();
      try{
        const res=await fetch(url,{cache:'no-store'});
        results.push({name,status:res.status,ok:res.ok,ms:Date.now()-t,url});
        recordFetch(url,res.status,Date.now()-t);
      }catch(e){
        results.push({name,status:'ERR',ok:false,ms:Date.now()-t,error:String(e.message||e),url});
        recordFetch(url,'ERR',Date.now()-t,String(e.message||e));
      }
    }
    const txt=JSON.stringify({timestamp:new Date().toISOString(),protocol:location.protocol,online:navigator.onLine,results},null,2);
    const el=$('#debugTestResult'); if(el)el.textContent=txt;
    const prev=$('#debugPreview'); if(prev)prev.textContent=txt;
    $('#debugDialog')?.showModal();
    toast('接続テスト完了');
  }
  async function clearAppCache(){
    try{
      localStorage.removeItem(CFG.cacheKey);
      for(const key of CFG.legacyCacheKeys||[])localStorage.removeItem(key);
      localStorage.removeItem(CFG.historyKey);
      localStorage.removeItem(CFG.autoKey);
      sessionStorage.removeItem(CFG.debugKey);
      if('caches'in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.includes('takamatsu-weather')).map(k=>caches.delete(k)))}
      toast('キャッシュを初期化しました');
      const p=$('#debugPreview'); if(p)p.textContent='キャッシュを初期化しました。ページを再読み込みしてください。';
    }catch(e){toast('初期化に失敗しました')}
  }
function registerServiceWorker(){if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn)} function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),1800)} function $(id){return document.getElementById(id.replace(/^#/,''))} function text(id,v){const el=$(id);if(el)el.textContent=v} function nv(v){const n=Number(v);return Number.isFinite(n)?n:null} function number(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f} function round(v,d=0){const n=Number(v);if(!Number.isFinite(n))return null;const p=10**d;return Math.round(n*p)/p} function clamp(v){return Math.max(0,Math.min(100,Number(v)||0))} function sum(arr){return arr.filter(v=>Number.isFinite(Number(v))).reduce((a,b)=>a+Number(b),0)} function average(arr){const xs=arr.filter(v=>Number.isFinite(Number(v))).map(Number);return xs.length?sum(xs)/xs.length:100} function maximum(arr){const xs=arr.filter(v=>Number.isFinite(Number(v))).map(Number);return xs.length?Math.max(...xs):0} function fmt(v){return Number.isFinite(Number(v))?String(Math.round(Number(v)*10)/10).replace('.0',''):'-'} function pct(v){return Number.isFinite(Number(v))?`${Math.round(Number(v))}%`:'-'} function minute(v){return Number.isFinite(Number(v))?`${Math.round(Number(v))}分`:'-'} function pad(v){return String(v).padStart(2,'0')} function todayKey(){return new Intl.DateTimeFormat('sv-SE',{timeZone:CFG.tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())} function currentHour(){return Number(new Intl.DateTimeFormat('en-GB',{timeZone:CFG.tz,hour:'2-digit',hour12:false}).format(new Date()))} function isToday(d){return d===todayKey()} function weekday(d){return['日','月','火','水','木','金','土'][new Date(`${d}T00:00:00+09:00`).getDay()]} function shortDate(d){const x=new Date(`${d}T00:00:00+09:00`);return`${x.getMonth()+1}/${x.getDate()}`} function dateLabel(d){return`${shortDate(d)}（${weekday(d)}）`} function escapeHtml(v){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))} function weatherText(code){return{0:'快晴',1:'晴れ',2:'一部曇り',3:'曇り',45:'霧',48:'霧氷',51:'弱い霧雨',53:'霧雨',55:'強い霧雨',61:'弱い雨',63:'雨',65:'強い雨',80:'弱いにわか雨',81:'にわか雨',82:'強いにわか雨',95:'雷雨',96:'雷雨・雹',99:'雷雨・強い雹'}[Number(code)]||'曇り'} function weatherIcon(code){code=Number(code);if(code===0)return'☀️';if(code===1)return'🌤️';if(code===2)return'⛅';if(code===3)return'☁️';if([45,48].includes(code))return'🌫️';if([51,53,55,61,63,65,80,81,82].includes(code))return'🌧️';if([95,96,99].includes(code))return'⛈️';return'☁️'}
})();
