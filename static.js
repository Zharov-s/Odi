(() => {
  const SPREADSHEET_ID = '1p5J6hw_fNIT99BXM9UDPEi5cTbDiSwudalQCWgAI4I8';
  const TZ = 'Europe/Moscow';
  const fmt = (n, digits = 0) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(n) || 0);
  const money = n => `${new Intl.NumberFormat('ru-RU').format(Math.round(Number(n) || 0))} ₽`;
  const num = v => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const clamp = (n, min = 0, max = 100) => Math.min(max, Math.max(min, n));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));

  function gviz(sheet) {
    return new Promise((resolve, reject) => {
      const callback = `odyssey_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      const timer = setTimeout(() => done(new Error('Таблица не ответила')), 18000);
      const done = (error, data) => { clearTimeout(timer); delete window[callback]; script.remove(); error ? reject(error) : resolve(data); };
      window[callback] = response => done(null, response);
      script.onerror = () => done(new Error('Нет доступа к Google Sheets'));
      script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?sheet=${encodeURIComponent(sheet)}&headers=0&tqx=out:json;responseHandler:${callback}&cache=${Date.now()}`;
      document.head.appendChild(script);
    });
  }
  function rows(response) {
    if (response.status !== 'ok') throw new Error('Ошибка Google Sheets');
    return response.table.rows.map(row => (row.c || []).map(cell => cell?.v ?? cell?.f ?? ''));
  }
  function workdays() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now);
    const year = num(parts.find(p => p.type === 'year')?.value), month = num(parts.find(p => p.type === 'month')?.value) - 1, today = num(parts.find(p => p.type === 'day')?.value);
    const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate(); let total = 0, elapsed = 0, left = 0;
    for (let day = 1; day <= count; day++) { const dow = new Date(Date.UTC(year, month, day)).getUTCDay(); if (dow !== 0 && dow !== 6) { total++; if (day <= today) elapsed++; if (day >= today) left++; } }
    return { total, elapsed: Math.max(elapsed, 1), left, monthLabel: new Intl.DateTimeFormat('ru-RU', { month:'long', year:'numeric', timeZone:TZ }).format(now).replace(/^./, c => c.toUpperCase()) };
  }
  function stage(percent, target) {
    if (percent > target) return ['Курс перевыполнен', 'Флот вышел за пределы намеченного курса'];
    if (percent >= target) return ['Возвращение в Итаку', 'Итака достигнута'];
    if (percent >= 71) return ['Берег Итаки уже виден', `До цели осталось ${fmt(target - percent, 1)}%`];
    if (percent >= 61) return ['Преодоление пролива', 'Флот вошёл в последний сложный участок'];
    if (percent >= 41) return ['Путь между островами', 'Экспедиция держит курс на пролив'];
    if (percent >= 21) return ['Открытое море', 'Корабли набирают скорость'];
    return ['Выход из гавани', 'Путешествие к Итаке началось'];
  }
  function aggregate(rows, isUpsell = false) {
    const map = new Map();
    rows.slice(1).forEach(row => {
      const name = String(row[0] || '').trim(); if (!name || name.toLowerCase().includes('фио')) return;
      const current = map.get(name) || { name, amount:0, count:0, products:new Set() };
      current.amount += num(row[1]); current.count += isUpsell ? 1 : num(row[2]); if (isUpsell && row[2]) current.products.add(String(row[2])); map.set(name, current);
    });
    return map;
  }
  function setField(name, value) { document.querySelectorAll(`[data-field="${name}"]`).forEach(el => { el.textContent = value; }); }
  function direction(root, data) {
    const set = (name, value) => root.querySelectorAll(`[data-dir="${name}"]`).forEach(el => { if (name === 'rail') el.style.width = `${clamp((data.percent / data.targetPercent) * 100)}%`; else el.textContent = value; });
    set('percent', fmt(data.percent, 1)); set('target', fmt(data.targetPercent)); set('total', fmt(data.total)); set('renewed', fmt(data.renewed)); set('remaining', fmt(data.remaining)); set('forecast', fmt(data.forecastPercent, 1)); set('online', fmt(data.online)); set('offline', fmt(data.offline)); set('online-percent', fmt(data.total ? data.online / data.total * 100 : 0, 1)); set('offline-percent', fmt(data.total ? data.offline / data.total * 100 : 0, 1)); set('rail', '');
  }
  async function load() {
    const shell = document.getElementById('dashboard'); const warning = document.getElementById('data-warning'); shell.classList.add('static-loading');
    try {
      const [goalRaw, hotelRaw, fmsRaw, upsellRaw] = await Promise.all(['Цель август','Отель','ФМС','Личные допродажи'].map(gviz));
      const goalRows = rows(goalRaw), hotelRows = rows(hotelRaw), fmsRows = rows(fmsRaw), upsellRows = rows(upsellRaw);
      const lookup = new Map(goalRows.map(row => [String(row[0] || '').trim().toLowerCase(), row]));
      const val = (label, column) => num(lookup.get(label.toLowerCase())?.[column]);
      const build = (key, name, column) => { const total = val('Количество поставок', column), renewed = val('Кол-во продлено', column), pr = val('% продлений', column), tr = val('цель августа', column); return { key, name, total, renewed, online:val('Продлено онлайн',column), offline:val('Продлено офлайн',column), percent:pr <= 1 ? pr * 100 : pr, targetPercent:tr <= 1 ? tr * 100 : tr, targetCount:Math.round(val('цель августа шт',column)), remaining:Math.round(Math.max(val('Осталось до цели',column),0)), dailyTarget:val('цель на день',column) }; };
      const wd = workdays(), overall = build('overall','Весь флот',1), directions = [build('hotel','Отель',2), build('fms','ФМС',3)];
      const forecast = d => Math.min(140, d.total ? (d.renewed / wd.elapsed) * wd.total / d.total * 100 : 0); overall.forecastPercent = forecast(overall); directions.forEach(d => d.forecastPercent = forecast(d));
      const [stageTitle, stageNote] = stage(overall.percent, overall.targetPercent), pace = overall.renewed / wd.elapsed, delta = pace - overall.dailyTarget, good = delta >= 0;
      setField('target', fmt(overall.targetPercent)); setField('percent', fmt(overall.percent,1)); setField('renewed',fmt(overall.renewed)); setField('total',fmt(overall.total)); setField('remaining',fmt(overall.remaining)); setField('workdays',fmt(wd.left)); setField('forecast',fmt(overall.forecastPercent,1)); setField('forecast-note',overall.forecastPercent >= overall.targetPercent ? 'курс выдержан' : 'ниже курса'); setField('stage',stageTitle); setField('stage-note',stageNote); setField('daily',fmt(overall.dailyTarget,1)); setField('pace',fmt(pace,1)); setField('delta',`${delta >= 0 ? '+' : ''}${fmt(delta,1)}`); setField('arrival',overall.forecastPercent >= overall.targetPercent ? 'До конца месяца' : 'После срока'); setField('month',wd.monthLabel); setField('target-count',fmt(overall.targetCount)); setField('online',fmt(overall.online)); setField('offline',fmt(overall.offline)); setField('updated',new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:TZ}).format(new Date()));
      directions.forEach(d => direction(document.querySelector(`[data-direction="${d.key}"]`), d)); setField('hotel-percent',fmt(directions[0].percent,1)); setField('fms-percent',fmt(directions[1].percent,1));
      directions.forEach(d => { const p = clamp(d.percent / overall.targetPercent * 78, 6, 82); document.getElementById(`ship-${d.key}`).style.left = `${p}%`; document.getElementById(`route-${d.key}`).style.width = `${clamp(d.percent / overall.targetPercent * 100)}%`; });
      const status = document.getElementById('course-status'), weather = document.getElementById('weather-status'), message = document.getElementById('course-message'); [status,weather].forEach(el => el.className = `status ${good ? 'good':'risk'}`); status.textContent = good ? 'По курсу':'Отставание'; weather.textContent = good ? 'Спокойно':'Внимание'; message.className = `course-message ${good ? 'good':'risk'}`; message.innerHTML = `<span>${good ? '✓':'!'}</span><p>${good ? 'Текущей скорости достаточно для прибытия в Итаку' : `Флот отстаёт от курса на ${fmt(Math.abs(delta),1)} продления в день`}</p>`;
      const upsells = [...aggregate(upsellRows,true).values()].sort((a,b) => b.amount-a.amount).slice(0,5); document.getElementById('ranking').innerHTML = upsells.length ? upsells.map((m,i) => `<div class="rank-row"><span class="rank-place p${i+1}">${i+1}</span><div><b>${esc(m.name)}</b><small>${i===0?'Капитан экспедиции':`${m.count} допродаж · ${[...m.products].slice(0,3).map(esc).join(', ')}`}</small></div><strong>${money(m.amount)}</strong></div>`).join('') : '<div class="empty-state">В журнале допродаж пока нет записей.</div>';
      document.getElementById('logbook').innerHTML = [["✦","Текущий курс",`Продлено ${fmt(overall.renewed)} из ${fmt(overall.targetCount)} необходимых поставок`],["⚓","Корабль «Отель»",`Достиг отметки ${fmt(directions[0].percent,1)}% · осталось ${fmt(directions[0].remaining)}`],["≋","Корабль «ФМС»",`Достиг отметки ${fmt(directions[1].percent,1)}% · осталось ${fmt(directions[1].remaining)}`],["◎","Прогноз прибытия",overall.forecastPercent>=overall.targetPercent?'Скорости достаточно для прибытия в Итаку':`Прогноз ${fmt(overall.forecastPercent,1)}% — курс требует усиления`]].map(e=>`<div class="log-row"><span>${e[0]}</span><div><small>${e[1]}</small><b>${e[2]}</b></div></div>`).join('');
      const points = Array.from({length:12},(_,i)=>clamp(((pace*(i/11*wd.total))/Math.max(overall.total,1))*100,0,120)), max = Math.max(100,...points); document.getElementById('forecast-bars').innerHTML = points.map((p,i)=>`<i class="${i<=Math.round(wd.elapsed/wd.total*11)?'actual':'forecast'}" style="height:${p/max*100}%"></i>`).join(''); document.getElementById('target-line').style.bottom = `${overall.targetPercent/max*100}%`;
      warning.hidden = true;
    } catch (error) { warning.hidden = false; }
    finally { shell.classList.remove('static-loading'); }
  }
  document.getElementById('refresh').addEventListener('click', load); document.getElementById('data-warning').addEventListener('click', load); load(); setInterval(load,300000);
})();
