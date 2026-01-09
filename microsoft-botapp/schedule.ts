import fs from "fs";
import path from "path";

export type DayOfWeek = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";

export type ScheduleRule = {
  id: string;
  title: string;
  daysOfWeek: DayOfWeek[];
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
  capacity: number;
  location?: string;
  notes?: string;
};

export type ScheduleConfig = {
  timezone: string; // for now informational
  rules: ScheduleRule[];
};

export function loadScheduleConfig(): ScheduleConfig {
  const filePath = path.join(process.cwd(), "config", "schedule.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as ScheduleConfig;
}

export function toDayOfWeek(date: Date): DayOfWeek {
  // JS: 0=Sun ... 6=Sat
  const map: DayOfWeek[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return map[date.getDay()];
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function formatYYYYMMDD(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function makeSessionId(ruleId: string, date: Date) {
  // e.g., "lunch-yoga_2026-01-05"
  return `${ruleId}_${formatYYYYMMDD(date)}`;
}

export function findRuleForDate(cfg: ScheduleConfig, date: Date): ScheduleRule | null {
  const dow = toDayOfWeek(date);
  return cfg.rules.find(r => r.daysOfWeek.includes(dow)) ?? null;
}

export function findNextRule(cfg: ScheduleConfig, from: Date, maxDaysAhead = 14): { rule: ScheduleRule; date: Date } | null {
  // search next N days (including tomorrow)
  for (let i = 1; i <= maxDaysAhead; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    const rule = findRuleForDate(cfg, d);
    if (rule) return { rule, date: d };
  }
  return null;
}