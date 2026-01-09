"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadScheduleConfig = loadScheduleConfig;
exports.toDayOfWeek = toDayOfWeek;
exports.formatYYYYMMDD = formatYYYYMMDD;
exports.makeSessionId = makeSessionId;
exports.findRuleForDate = findRuleForDate;
exports.findNextRule = findNextRule;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function loadScheduleConfig() {
    const filePath = path_1.default.join(process.cwd(), "config", "schedule.json");
    const raw = fs_1.default.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
}
function toDayOfWeek(date) {
    // JS: 0=Sun ... 6=Sat
    const map = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    return map[date.getDay()];
}
function pad2(n) {
    return String(n).padStart(2, "0");
}
function formatYYYYMMDD(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
function makeSessionId(ruleId, date) {
    // e.g., "lunch-yoga_2026-01-05"
    return `${ruleId}_${formatYYYYMMDD(date)}`;
}
function findRuleForDate(cfg, date) {
    const dow = toDayOfWeek(date);
    return cfg.rules.find(r => r.daysOfWeek.includes(dow)) ?? null;
}
function findNextRule(cfg, from, maxDaysAhead = 14) {
    // search next N days (including tomorrow)
    for (let i = 1; i <= maxDaysAhead; i++) {
        const d = new Date(from);
        d.setDate(from.getDate() + i);
        const rule = findRuleForDate(cfg, d);
        if (rule)
            return { rule, date: d };
    }
    return null;
}
//# sourceMappingURL=schedule.js.map