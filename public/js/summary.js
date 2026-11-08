import { MILES_PER_KM } from './stats.js';

const MINIMUM_KM = 20;

const SOLID_KM = 50;

const LATEST_MONTHS = 12;

const MONTHS_TO_COMPARE = 2;

const POINTS_TO_30 = 70;
const POINTS_TO_20 = 80;
const POINTS_TO_10 = 90;

const fromKm = (km, units) => (units === 'mi' ? km * MILES_PER_KM : km);

/**
 * With a tolerance, because adding up converted distances rounds: months of 6.8 and 43.2 km are 50 km, but come out
 * just short of it in miles, and changing units must not change what is shown.
 */
const reaches = (distance, limit) => distance >= limit - 1e-9;

const totalDistance = (months) => months.reduce((sum, { distance }) => sum + distance, 0);

export const monthRange = ({ rangeTo30, rangeTo20, rangeTo10 }) => rangeTo30 + rangeTo20 + rangeTo10;

export function minimumLabel(units = 'km') {
  return `${Math.ceil(fromKm(MINIMUM_KM, units))} ${units}`;
}

export function scooterSummary(stats, units = 'km') {
  const minimum = fromKm(MINIMUM_KM, units);
  const solid = fromKm(SOLID_KM, units);
  const isReliable = ({ distance }) => reaches(distance, minimum);
  const reliableMonths = stats.filter(isReliable).length;
  const records = stats
    .filter(({ distance }) => reaches(distance, solid))
    .map((month) => ({ month: month.month, range: monthRange(month) }))
    .sort((a, b) => a.range - b.range);
  const canCompare = records.length >= MONTHS_TO_COMPARE;

  return {
    estimate: rangeEstimate(stats, minimum, solid),
    best: canCompare ? records.at(-1) : null,
    lowest: canCompare ? records[0] : null,
    months: everyMonth(stats).map((month) => ({ ...month, reliable: isReliable(month) })),
    showCharts: reliableMonths >= MONTHS_TO_COMPARE,
    shortMonths: reliableMonths < stats.length,
  };
}

function rangeEstimate(stats, minimum, solid) {
  if (stats.length === 0) return null;
  const to = stats.at(-1).month;
  const windowStart = addMonths(to, 1 - LATEST_MONTHS);
  const latest = stats.filter(({ month }) => month >= windowStart);
  const latestYear = reaches(totalDistance(latest), solid) && stats[0].month <= windowStart;
  const period = latestYear ? latest : stats;
  const distance = totalDistance(period);
  if (!reaches(distance, minimum)) return null;

  const battery = period.reduce((sum, month) => sum + month.battery * month.distance, 0);
  const perPoint = distance / battery;
  return {
    rough: !reaches(distance, solid),
    at30: POINTS_TO_30 * perPoint,
    at20: POINTS_TO_20 * perPoint,
    at10: POINTS_TO_10 * perPoint,
    distance,
    from: period[0].month,
    to,
    latestYear,
  };
}

function everyMonth(stats) {
  if (stats.length === 0) return [];
  const byMonth = new Map(stats.map((month) => [month.month, month]));
  const months = [];
  for (let month = stats[0].month; month <= stats.at(-1).month; month = addMonths(month, 1)) {
    months.push(byMonth.get(month) ?? { month });
  }
  return months;
}

function addMonths(yyyymm, count) {
  const months = Number(yyyymm.slice(0, 4)) * 12 + Number(yyyymm.slice(4)) - 1 + count;
  return String(Math.floor(months / 12) * 100 + (months % 12) + 1);
}
