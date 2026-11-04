const pad = (n: number) => String(n).padStart(2, "0");

/** Local-date ISO string (yyyy-mm-dd). */
export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseDate = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (s: string, days: number) => {
  const d = parseDate(s);
  d.setDate(d.getDate() + days);
  return toISODate(d);
};

export const today = () => toISODate(new Date());

export const mondayOf = (s: string) => {
  const d = parseDate(s);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return toISODate(d);
};

export const daysBetween = (from: string, to: string) =>
  Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);

export const fmtDate = (s?: string) =>
  s ? parseDate(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Not set";

export const fmtShort = (s: string) => parseDate(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export const fmtDateTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })
    : "Not recorded";

export const fmtRelative = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  if (days < 8) return `${days} day${days > 1 ? "s" : ""} ago`;
  return fmtDate(iso.slice(0, 10));
};

export const weekLabel = (weekStart: string) => `${fmtShort(weekStart)} to ${fmtShort(addDays(weekStart, 6))}`;

export const ageFrom = (dob: string) => {
  const b = parseDate(dob);
  const n = new Date();
  let age = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) age--;
  return age;
};

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** ISO timestamp n days ago at a given hour. */
export const stamp = (daysAgo: number, hour = 10, minute = 15) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};
