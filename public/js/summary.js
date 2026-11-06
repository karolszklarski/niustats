// What the home page says about one scooter, from its monthly statistics (stats.js): how far it goes on a charge,
// its best and lowest months, and which months can be charted. With little riding it says less, rather than show
// a figure it can't back up.
import { MILES_PER_KM } from './stats.js';

/**
 * Niu reports battery use in whole percents, so a short distance says little. On the example scooter, without the
 * months of faulty readings, the range of consecutive trips came within 20% of the range of the whole month in 95%
 * of cases over 20 km and in 98% over 50 km, against 80% over 10 km.
 * Below this distance there is no range estimate and a month's figures aren't shown.
 */
const MINIMUM_KM = 20;

/** From this distance a range estimate isn't rough any more, and a month can be the best or the lowest. */
const SOLID_KM = 50;

/** The range estimate describes the scooter as it is now, so it covers these months up to the last trip. */
const LATEST_MONTHS = 12;

/** Charts and the best and lowest month compare months, which takes at least this many. */
const MONTHS_TO_COMPARE = 2;

/** Battery points used from 100% down to 30%, 20% and 10%. */
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

/** The range of a month from monthlyStats(), from 100% down to 10%. */
export const monthRange = ({ rangeTo30, rangeTo20, rangeTo10 }) => rangeTo30 + rangeTo20 + rangeTo10;

/**
 * The minimum distance for texts that promise something after it. Rounded up: 20 km is 12.4 mi, and "at least 12 mi"
 * would promise too little.
 * @param {'km' | 'mi'} units
 */
export function minimumLabel(units = 'km') {
  return `${Math.ceil(fromKm(MINIMUM_KM, units))} ${units}`;
}

/**
 * @param {ReturnType<typeof import('./stats.js').monthlyStats>} stats the monthly statistics of a scooter, in date
 *   order
 * @param {'km' | 'mi'} units the units of the statistics. The limits convert exactly, so that changing units changes
 *   the figures but not what is shown.
 * @returns {{
 *   estimate: ?{ rough: boolean, at30: number, at20: number, at10: number, distance: number, from: string,
 *     to: string, latestYear: boolean },
 *   best: ?{ month: string, range: number },
 *   lowest: ?{ month: string, range: number },
 *   months: { month: string, reliable: boolean }[],
 *   showCharts: boolean,
 *   shortMonths: boolean,
 * }}
 *   - estimate: how far a charge goes, or null with too little riding. at30, at20 and at10 are the distances at which
 *     the battery is down to that level. It is based on the distance ridden between the months from and to, which
 *     are the latest 12 months if latestYear is set and otherwise the whole history.
 *   - best, lowest: the months with the longest and shortest range, or null with too little riding.
 *   - months: every month from the first to the last, so that a break in riding stays visible. A month with trips has
 *     its statistics too, and is reliable with enough riding to show them.
 *   - showCharts: whether there are enough reliable months for a chart.
 *   - shortMonths: whether some month with trips isn't reliable.
 */
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
  // After a long break the latest months can hold little riding: the whole history then says more.
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

/** Every month from the first to the last. A month without statistics has only its name. */
function everyMonth(stats) {
  if (stats.length === 0) return [];
  const byMonth = new Map(stats.map((month) => [month.month, month]));
  const months = [];
  for (let month = stats[0].month; month <= stats.at(-1).month; month = addMonths(month, 1)) {
    months.push(byMonth.get(month) ?? { month });
  }
  return months;
}

/** Moves a month in yyyymm form: ('202601', -11) → '202502'. */
function addMonths(yyyymm, count) {
  const months = Number(yyyymm.slice(0, 4)) * 12 + Number(yyyymm.slice(4)) - 1 + count;
  return String(Math.floor(months / 12) * 100 + (months % 12) + 1);
}
