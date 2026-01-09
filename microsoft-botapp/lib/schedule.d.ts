export type DayOfWeek = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";
export type ScheduleRule = {
    id: string;
    title: string;
    daysOfWeek: DayOfWeek[];
    startTime: string;
    endTime: string;
    capacity: number;
    location?: string;
    notes?: string;
};
export type ScheduleConfig = {
    timezone: string;
    rules: ScheduleRule[];
};
export declare function loadScheduleConfig(): ScheduleConfig;
export declare function toDayOfWeek(date: Date): DayOfWeek;
export declare function formatYYYYMMDD(date: Date): string;
export declare function makeSessionId(ruleId: string, date: Date): string;
export declare function findRuleForDate(cfg: ScheduleConfig, date: Date): ScheduleRule | null;
export declare function findNextRule(cfg: ScheduleConfig, from: Date, maxDaysAhead?: number): {
    rule: ScheduleRule;
    date: Date;
} | null;
