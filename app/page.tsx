"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Direction = {
  key: "hotel" | "fms";
  name: string;
  total: number;
  renewed: number;
  online: number;
  offline: number;
  percent: number;
  targetPercent: number;
  targetCount: number;
  remaining: number;
  dailyTarget: number;
  forecastPercent: number;
};

type CrewMember = { name: string; renewals: number; amount: number; direction: string };
type Upsell = { name: string; amount: number; count: number; products: string[] };
type DashboardData = {
  updatedAt: string;
  monthLabel: string;
  workdaysLeft: number;
  elapsedWorkdays: number;
  totalWorkdays: number;
  overall: Direction;
  directions: Direction[];
  crew: CrewMember[];
  upsells: Upsell[];
};

const FALLBACK: DashboardData = {
  updatedAt: "2026-08-04T09:00:00+03:00",
  monthLabel: "Август 2026",
  workdaysLeft: 20,
  elapsedWorkdays: 2,
  totalWorkdays: 21,
  overall: { key: "hotel", name: "Весь флот", total: 766, renewed: 319, online: 146, offline: 173, percent: 41.6, targetPercent: 81, targetCount: 620, remaining: 301, dailyTarget: 14.4, forecastPercent: 100 },
  directions: [
    { key: "hotel", name: "Отель", total: 302, renewed: 122, online: 56, offline: 66, percent: 40.4, targetPercent: 77, targetCount: 233, remaining: 111, dailyTarget: 5.3, forecastPercent: 100 },
    { key: "fms", name: "ФМС", total: 464, renewed: 197, online: 90, offline: 107, percent: 42.5, targetPercent: 83, targetCount: 385, remaining: 188, dailyTarget: 9, forecastPercent: 100 },
  ],
  crew: [{ name: "Процкив Ксения", renewals: 10, amount: 100000, direction: "Отель · ФМС" }],
  upsells: [{ name: "Процкив Ксения", amount: 59215, count: 5, products: ["МОБ", "МКБ", "РКЛ", "РСП"] }],
};

const fmt = (value: number, digits = 0) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value || 0);
const money = (value: number) => `${new Intl.NumberFormat("ru-RU").format(Math.round(value || 0))} ₽`;
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

function stageFor(percent: number, target: number) {
  if (percent > target) return { title: "Курс перевыполнен", note: "Флот вышел за пределы намеченного курса" };
  if (percent >= target) return { title: "Возвращение в Итаку", note: "Итака достигнута" };
  if (percent >= 71) return { title: "Берег Итаки уже виден", note: `До цели осталось ${fmt(target - percent, 1)}%` };
  if (percent >= 61) return { title: "Преодоление пролива", note: "Флот вошёл в последний сложный участок" };
  if (percent >= 41) return { title: "Путь между островами", note: "Экспедиция держит курс на пролив" };
  if (percent >= 21) return { title: "Открытое море", note: "Корабли набирают скорость" };
  return { title: "Выход из гавани", note: "Путешествие к Итаке началось" };
}

function ShipMarker({ direction, lane }: { direction: Direction; lane: "top" | "bottom" }) {
  const position = clamp((direction.percent / Math.max(direction.targetPercent, 1)) * 78, 6, 82);
  return (
    <div className={`ship-marker ${direction.key} ${lane}`} style={{ left: `${position}%` }} aria-label={`${direction.name}: ${fmt(direction.percent, 1)} процента`}>
      <span className="ship-symbol" aria-hidden="true">⛵</span>
      <span className="ship-copy"><b>{direction.name}</b><em>{fmt(direction.percent, 1)}%</em></span>
    </div>
  );
}

function RouteMap({ data }: { data: DashboardData }) {
  const goal = data.overall.targetPercent;
  const stages = [
    { pct: 0, label: "Старт" },
    { pct: 20, label: "Открытое море" },
    { pct: 40, label: "Острова" },
    { pct: 60, label: "Пролив" },
    { pct: goal, label: "Итака" },
  ];
  return (
    <section className="route-card panel" aria-label="Маршрут к Итаке">
      <div className="route-image" />
      <div className="route-shade" />
      <div className="route-head">
        <div><span className="eyebrow">Центральный маршрут</span><h2>Путь к Итаке</h2></div>
        <span className="live-pill"><i /> Данные Google Sheets</span>
      </div>
      <div className="route-track route-a"><i style={{ width: `${clamp((data.directions[0]?.percent / goal) * 100)}%` }} /></div>
      <div className="route-track route-b"><i style={{ width: `${clamp((data.directions[1]?.percent / goal) * 100)}%` }} /></div>
      {data.directions[0] && <ShipMarker direction={data.directions[0]} lane="top" />}
      {data.directions[1] && <ShipMarker direction={data.directions[1]} lane="bottom" />}
      <div className="beacon" aria-label={`Итака, цель ${fmt(goal)} процентов`}><span className="beacon-light" /><b>{fmt(goal)}%</b><small>Итака</small></div>
      <div className="route-stages">
        {stages.map((stage, index) => <span key={`${stage.label}-${index}`} style={{ left: `${index === stages.length - 1 ? 92 : 6 + index * 21}%` }}><i />{stage.label}<em>{fmt(stage.pct)}%</em></span>)}
      </div>
      <div className="weather-note"><span aria-hidden="true">◌</span><div><b>{data.overall.forecastPercent >= goal ? "Попутный ветер" : "Штормовая зона"}</b><small>{data.overall.forecastPercent >= goal ? "Текущего темпа достаточно" : "Необходимо увеличить скорость"}</small></div></div>
    </section>
  );
}

function Metric({ label, value, note, accent }: { label: string; value: string; note: string; accent?: boolean }) {
  return <div className={`metric ${accent ? "accent" : ""}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function DirectionCard({ direction }: { direction: Direction }) {
  const reached = direction.percent >= direction.targetPercent;
  return (
    <article className={`direction-card panel ${direction.key}`}>
      <header>
        <div className="direction-icon" aria-hidden="true">⛵</div>
        <div><span className="eyebrow">Корабль</span><h3>«{direction.name}»</h3></div>
        <div className="direction-score"><strong>{fmt(direction.percent, 1)}%</strong><span>цель {fmt(direction.targetPercent)}%</span></div>
      </header>
      <div className="progress-rail" role="progressbar" aria-valuenow={direction.percent} aria-valuemin={0} aria-valuemax={direction.targetPercent}><i style={{ width: `${clamp((direction.percent / direction.targetPercent) * 100)}%` }} /></div>
      <div className="direction-grid">
        <Metric label="Всего поставок" value={fmt(direction.total)} note="флот направления" />
        <Metric label="Продлено" value={fmt(direction.renewed)} note="вернулись в порт" />
        <Metric label={reached ? "Сверх курса" : "Осталось"} value={fmt(reached ? direction.renewed - direction.targetCount : direction.remaining)} note="до цели" accent />
        <Metric label="Прогноз" value={`${fmt(direction.forecastPercent, 1)}%`} note="к концу месяца" />
      </div>
      <div className="channel-grid">
        <div><span><b>Онлайн</b><small>путь под парусом</small></span><strong>{fmt(direction.online)}</strong><em>{fmt(direction.total ? (direction.online / direction.total) * 100 : 0, 1)}%</em></div>
        <div><span><b>Офлайн</b><small>путь на вёслах</small></span><strong>{fmt(direction.offline)}</strong><em>{fmt(direction.total ? (direction.offline / direction.total) * 100 : 0, 1)}%</em></div>
      </div>
    </article>
  );
}

function ForecastChart({ data }: { data: DashboardData }) {
  const points = Array.from({ length: 12 }, (_, index) => {
    const day = (index / 11) * data.totalWorkdays;
    const pace = data.overall.renewed / Math.max(data.elapsedWorkdays, 1);
    return clamp(((pace * day) / Math.max(data.overall.total, 1)) * 100, 0, 120);
  });
  const max = Math.max(100, ...points);
  return (
    <div className="forecast-chart" aria-label="Расчётная динамика продлений">
      <div className="target-line" style={{ bottom: `${(data.overall.targetPercent / max) * 100}%` }}><span>курс {fmt(data.overall.targetPercent)}%</span></div>
      <div className="bars">{points.map((p, i) => <i key={i} style={{ height: `${(p / max) * 100}%` }} className={i <= Math.round((data.elapsedWorkdays / data.totalWorkdays) * 11) ? "actual" : "forecast"} />)}</div>
      <div className="chart-axis"><span>1 авг</span><span>сегодня</span><span>31 авг</span></div>
    </div>
  );
}

function Ranking({ data }: { data: DashboardData }) {
  return (
    <article className="panel ranking-panel">
      <div className="section-head"><div><span className="eyebrow">Личный зачёт</span><h3>Экипаж экспедиции</h3></div><span className="section-badge">Топ-5</span></div>
      <div className="ranking-list">
        {data.upsells.slice(0, 5).map((member, index) => (
          <div className="rank-row" key={member.name}>
            <span className={`rank-place p${index + 1}`}>{index + 1}</span>
            <div><b>{member.name}</b><small>{index === 0 ? "Капитан экспедиции" : `${member.count} допродаж · ${member.products.slice(0, 3).join(", ")}`}</small></div>
            <strong>{money(member.amount)}</strong>
          </div>
        ))}
        {!data.upsells.length && <div className="empty-state">В журнале допродаж пока нет записей.</div>}
      </div>
    </article>
  );
}

function Logbook({ data }: { data: DashboardData }) {
  const hotel = data.directions.find(d => d.key === "hotel") || data.directions[0];
  const fms = data.directions.find(d => d.key === "fms") || data.directions[1];
  const events = [
    { icon: "✦", time: "Текущий курс", text: `Продлено ${fmt(data.overall.renewed)} из ${fmt(data.overall.targetCount)} необходимых поставок` },
    { icon: "⚓", time: "Корабль «Отель»", text: hotel ? `Достиг отметки ${fmt(hotel.percent, 1)}% · осталось ${fmt(hotel.remaining)}` : "Данные уточняются" },
    { icon: "≋", time: "Корабль «ФМС»", text: fms ? `Достиг отметки ${fmt(fms.percent, 1)}% · осталось ${fmt(fms.remaining)}` : "Данные уточняются" },
    { icon: "◎", time: "Прогноз прибытия", text: data.overall.forecastPercent >= data.overall.targetPercent ? "Скорости достаточно для прибытия в Итаку" : `Прогноз ${fmt(data.overall.forecastPercent, 1)}% — курс требует усиления` },
  ];
  return (
    <article className="panel log-panel">
      <div className="section-head"><div><span className="eyebrow">События маршрута</span><h3>Бортовой журнал</h3></div><span className="section-badge">Live</span></div>
      <div className="log-list">{events.map((event, i) => <div className="log-row" key={i}><span>{event.icon}</span><div><small>{event.time}</small><b>{event.text}</b></div></div>)}</div>
    </article>
  );
}

export default function Home() {
  const [data, setData] = useState<DashboardData>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/data", { cache: "no-store" });
      if (!response.ok) throw new Error("data unavailable");
      setData(await response.json()); setError(false);
    } catch { setError(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); const timer = window.setInterval(load, 300000); return () => window.clearInterval(timer); }, [load]);
  const stage = useMemo(() => stageFor(data.overall.percent, data.overall.targetPercent), [data]);
  const actualPace = data.overall.renewed / Math.max(data.elapsedWorkdays, 1);
  const paceDelta = actualPace - data.overall.dailyTarget;
  const updated = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(new Date(data.updatedAt));
  return (
    <main className={`dashboard-shell ${loading ? "is-loading" : ""}`}>
      <div className="noise" />
      <header className="topbar">
        <div className="brand"><div className="compass" aria-hidden="true">✥</div><div><span>Одиссея продлений</span><small>Курс на {fmt(data.overall.targetPercent)}%</small></div></div>
        <div className="top-metrics">
          <Metric label="Текущий результат" value={`${fmt(data.overall.percent, 1)}% / ${fmt(data.overall.targetPercent)}%`} note={stage.title} accent />
          <Metric label="Продлено" value={fmt(data.overall.renewed)} note={`из ${fmt(data.overall.total)} поставок`} />
          <Metric label="До Итаки осталось" value={fmt(data.overall.remaining)} note="продление" />
          <Metric label="Дней осталось" value={fmt(data.workdaysLeft)} note="рабочих дней" />
          <Metric label="Прогноз на конец" value={`${fmt(data.overall.forecastPercent, 1)}%`} note={data.overall.forecastPercent >= data.overall.targetPercent ? "курс выдержан" : "ниже курса"} accent />
        </div>
        <button className="refresh-button" onClick={load} aria-label="Обновить данные" title={`Последнее обновление ${updated}`}>↻<span>{updated}</span></button>
      </header>

      <section className="hero-grid">
        <aside className="navigation panel">
          <div className="section-head"><div><span className="eyebrow">Сводка курса</span><h2>Навигация</h2></div><span className={paceDelta >= 0 ? "status good" : "status risk"}>{paceDelta >= 0 ? "По курсу" : "Отставание"}</span></div>
          <div className="nav-stats">
            <div><span>Необходимо в день</span><strong>{fmt(data.overall.dailyTarget, 1)}</strong><small>продлений</small></div>
            <div><span>Текущий темп</span><strong>{fmt(actualPace, 1)}</strong><small>в рабочий день</small></div>
            <div><span>Отклонение</span><strong className={paceDelta >= 0 ? "positive" : "negative"}>{paceDelta >= 0 ? "+" : ""}{fmt(paceDelta, 1)}</strong><small>в день</small></div>
            <div><span>Расчётное прибытие</span><strong>{data.overall.forecastPercent >= data.overall.targetPercent ? "До конца месяца" : "После срока"}</strong><small>{data.monthLabel}</small></div>
          </div>
          <div className={`course-message ${paceDelta >= 0 ? "good" : "risk"}`}><span>{paceDelta >= 0 ? "✓" : "!"}</span><p>{paceDelta >= 0 ? "Текущей скорости достаточно для прибытия в Итаку" : `Флот отстаёт от курса на ${fmt(Math.abs(paceDelta), 1)} продления в день`}</p></div>
          {error && <button className="data-warning" onClick={load}>Показаны последние доступные данные · повторить</button>}
        </aside>
        <RouteMap data={data} />
      </section>

      <section className="goal-callout panel"><div className="goal-ring"><span>До Итаки</span><strong>{fmt(data.overall.remaining)}</strong><small>продлений</small></div><div><span className="eyebrow">{stage.title}</span><h2>{stage.note}</h2><p>Каждый день приближает флот к Итаке</p></div><div className="goal-numbers"><span><small>Необходимо продлить</small><b>{fmt(data.overall.targetCount)}</b></span><span><small>Общий флот месяца</small><b>{fmt(data.overall.total)}</b></span></div></section>

      <section className="directions-grid">{data.directions.map(direction => <DirectionCard key={direction.key} direction={direction} />)}</section>

      <section className="lower-grid">
        <article className="panel chart-panel"><div className="section-head"><div><span className="eyebrow">Расчётная траектория</span><h3>Динамика продлений</h3></div><span className="section-badge">Факт + прогноз</span></div><ForecastChart data={data} /></article>
        <article className="panel risks-panel"><div className="section-head"><div><span className="eyebrow">Контроль маршрута</span><h3>Штормовые зоны</h3></div><span className={paceDelta >= 0 ? "status good" : "status risk"}>{paceDelta >= 0 ? "Спокойно" : "Внимание"}</span></div><div className="risk-list"><div><span>◈</span><p><b>Расстояние до цели</b><small>{fmt(data.overall.remaining)} поставок</small></p></div><div><span>△</span><p><b>Запас по скорости</b><small>{paceDelta >= 0 ? `+${fmt(paceDelta, 1)} в день` : `${fmt(paceDelta, 1)} в день`}</small></p></div><div><span>◌</span><p><b>Офлайн-маршрут</b><small>{fmt(data.overall.offline)} продлений</small></p></div><div><span>✦</span><p><b>Онлайн-маршрут</b><small>{fmt(data.overall.online)} продлений</small></p></div></div></article>
        <Ranking data={data} />
        <Logbook data={data} />
      </section>
      <footer><span>Источник: Google Sheets · обновление каждые 5 минут</span><span>ОДИССЕЯ ПРОДЛЕНИЙ · {data.monthLabel.toUpperCase()}</span></footer>
    </main>
  );
}
