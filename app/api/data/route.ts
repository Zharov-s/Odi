import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SPREADSHEET_ID = "1p5J6hw_fNIT99BXM9UDPEi5cTbDiSwudalQCWgAI4I8";
const TZ = "Europe/Moscow";
type Cell = { v?: string | number; f?: string } | null;

function number(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function sheet(name: string) {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?sheet=${encodeURIComponent(name)}&headers=0&tqx=out:json&cache=${Date.now()}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Google Sheets: ${response.status}`);
  const text = await response.text();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const payload = JSON.parse(text.slice(start, end + 1));
  if (payload.status !== "ok") throw new Error("Google Sheets query failed");
  return (payload.table.rows as { c: Cell[] }[]).map(row => row.c.map(cell => cell?.v ?? cell?.f ?? ""));
}

function aggregatePeople(rows: (string | number)[][], direction: string) {
  const map = new Map<string, { name: string; renewals: number; amount: number; directions: Set<string> }>();
  for (const row of rows.slice(1)) {
    const name = String(row[0] || "").trim();
    if (!name || name.toLowerCase().includes("фио")) continue;
    const current = map.get(name) || { name, renewals: 0, amount: 0, directions: new Set<string>() };
    current.amount += number(row[1]); current.renewals += number(row[2]); current.directions.add(direction); map.set(name, current);
  }
  return map;
}

function weekdays(year: number, month: number) {
  const todayParts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const todayDay = number(todayParts.find(part => part.type === "day")?.value);
  const todayMonth = number(todayParts.find(part => part.type === "month")?.value) - 1;
  let total = 0, elapsed = 0, left = 0;
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  for (let day = 1; day <= count; day++) {
    const dow = new Date(Date.UTC(year, month, day)).getUTCDay();
    if (dow !== 0 && dow !== 6) { total++; if (month === todayMonth && day <= todayDay) elapsed++; if (month === todayMonth && day >= todayDay) left++; }
  }
  if (month !== todayMonth) { elapsed = 1; left = total; }
  return { total, elapsed: Math.max(elapsed, 1), left };
}

export async function GET() {
  try {
    const [goalRows, hotelRows, fmsRows, upsellRows] = await Promise.all([sheet("Цель август"), sheet("Отель"), sheet("ФМС"), sheet("Личные допродажи")]);
    const lookup = new Map(goalRows.map(row => [String(row[0] || "").trim().toLowerCase(), row]));
    const val = (label: string, column: number) => number(lookup.get(label.toLowerCase())?.[column]);
    const build = (key: "hotel" | "fms", name: string, column: number) => {
      const total = val("Количество поставок", column), renewed = val("Кол-во продлено", column);
      const targetPercentRaw = val("цель августа", column);
      const percentRaw = val("% продлений", column);
      const targetCount = val("цель августа шт", column);
      const remaining = Math.max(val("Осталось до цели", column), 0);
      return { key, name, total, renewed, online: val("Продлено онлайн", column), offline: val("Продлено офлайн", column), percent: percentRaw <= 1 ? percentRaw * 100 : percentRaw, targetPercent: targetPercentRaw <= 1 ? targetPercentRaw * 100 : targetPercentRaw, targetCount: Math.round(targetCount), remaining: Math.round(remaining), dailyTarget: val("цель на день", column), forecastPercent: 0 };
    };
    const directions = [build("hotel", "Отель", 2), build("fms", "ФМС", 3)];
    const overall = build("hotel", "Весь флот", 1);
    const now = new Date();
    const year = number(new Intl.DateTimeFormat("en", { timeZone: TZ, year: "numeric" }).format(now));
    const month = number(new Intl.DateTimeFormat("en", { timeZone: TZ, month: "numeric" }).format(now)) - 1;
    const wd = weekdays(year, month);
    const forecast = (renewed: number, total: number) => Math.min(140, total ? ((renewed / wd.elapsed) * wd.total / total) * 100 : 0);
    overall.forecastPercent = forecast(overall.renewed, overall.total);
    directions.forEach(direction => { direction.forecastPercent = forecast(direction.renewed, direction.total); });
    const hotelPeople = aggregatePeople(hotelRows, "Отель"), fmsPeople = aggregatePeople(fmsRows, "ФМС");
    for (const [name, person] of fmsPeople) {
      const current = hotelPeople.get(name);
      if (current) { current.amount += person.amount; current.renewals += person.renewals; person.directions.forEach(direction => current.directions.add(direction)); }
      else hotelPeople.set(name, person);
    }
    const crew = [...hotelPeople.values()].sort((a, b) => b.renewals - a.renewals || b.amount - a.amount).map(person => ({ name: person.name, renewals: person.renewals, amount: person.amount, direction: [...person.directions].join(" · ") }));
    const upsellsMap = new Map<string, { name: string; amount: number; count: number; products: Set<string> }>();
    for (const row of upsellRows.slice(1)) {
      const name = String(row[0] || "").trim();
      if (!name || name.toLowerCase().includes("фио")) continue;
      const current = upsellsMap.get(name) || { name, amount: 0, count: 0, products: new Set<string>() };
      current.amount += number(row[1]); current.count += 1; if (row[2]) current.products.add(String(row[2]).trim()); upsellsMap.set(name, current);
    }
    const upsells = [...upsellsMap.values()].sort((a, b) => b.amount - a.amount).slice(0, 5).map(person => ({ ...person, products: [...person.products] }));
    const monthLabel = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: TZ }).format(now).replace(/^./, char => char.toUpperCase());
    return NextResponse.json({ updatedAt: now.toISOString(), monthLabel, workdaysLeft: wd.left, elapsedWorkdays: wd.elapsed, totalWorkdays: wd.total, overall, directions, crew, upsells }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 502 });
  }
}
