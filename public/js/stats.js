// Monthly range statistics of one scooter. README.md explains how they are computed and why.

export const MILES_PER_KM = 0.621371192;

/**
 * A trip is left out when its battery use and the use its distance should take are too far apart: when either is more
 * than this many times the other. Cold, hills and speed rarely take a real trip that far.
 */
const MAX_TIMES = 3;

/** Whole percents add to that on short rides: one can read 2 points, however little it should take. */
const POINTS_ABOVE = 2;

/** And one that should take a point can read 0. */
const POINTS_BELOW = 1;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A month as yyyymm in words, in English like the rest of the site: '201906' → 'Jun 2019'. */
export function monthLabel(month) {
  return `${MONTH_NAMES[Number(month.slice(4)) - 1]} ${month.slice(0, 4)}`;
}

/**
 * @param {{ d: number, m: number, b: number }[]} trips date (yyyymmdd), distance (metres) and battery used
 *   (percentage points) of each trip
 * @param {'km' | 'mi'} units
 * @returns {{ month: string, distance: number, battery: number, rangeTo30: number, rangeTo20: number,
 *   rangeTo10: number }[]} for each month with trips that show battery use, in date order: the distance driven, the
 *   battery percent used per distance unit, and the range from 100% to 30%, from 30% to 20% and from 20% to 10%
 */
export function monthlyStats(trips, units = 'km') {
  const unitsPerKm = units === 'mi' ? MILES_PER_KM : 1;
  const months = new Map();
  for (const trip of plausibleTrips(trips)) {
    const month = Math.floor(trip.d / 100);
    const totals = months.get(month) ?? { metres: 0, battery: 0 };
    totals.metres += trip.m;
    totals.battery += trip.b;
    months.set(month, totals);
  }
  return [...months]
    // A month of only short trips can show no battery use at all, and its range would be endless.
    .filter(([, { battery }]) => battery > 0)
    .sort(([a], [b]) => a - b)
    .map(([month, { metres, battery }]) => {
      const distance = (metres * unitsPerKm) / 1000;
      const batteryPerUnit = battery / distance;
      return {
        month: String(month),
        distance,
        battery: batteryPerUnit,
        rangeTo30: 70 / batteryPerUnit,
        rangeTo20: 10 / batteryPerUnit,
        rangeTo10: 10 / batteryPerUnit,
      };
    });
}

/**
 * The trips whose battery use fits their distance, given what the scooter typically uses. The others are faulty or
 * missing readings: far too much battery for the distance, or next to none on a trip long enough to tell.
 * Trips without a usable distance or battery use go first: their Infinity or NaN would derail the comparison.
 */
function plausibleTrips(trips) {
  const usable = trips.filter((trip) => trip.m > 0 && trip.b >= 0);
  const typical = typicalBatteryPerMetre(usable);
  if (typical === undefined) return [];
  return usable.filter((trip) => {
    const expected = typical * trip.m;
    return trip.b <= MAX_TIMES * expected + POINTS_ABOVE && expected <= MAX_TIMES * trip.b + POINTS_BELOW;
  });
}

/**
 * The battery use per metre that half of the distance ridden stays under, or undefined if no trip shows any. By
 * distance, because whole percents say little about a very short trip. And only from trips that show battery use,
 * because missing readings can cover much of the distance.
 */
function typicalBatteryPerMetre(trips) {
  const measured = trips.filter((trip) => trip.b > 0).sort((a, b) => a.b / a.m - b.b / b.m);
  let toHalfway = measured.reduce((sum, trip) => sum + trip.m, 0) / 2;
  for (const trip of measured) {
    toHalfway -= trip.m;
    if (toHalfway <= 0) return trip.b / trip.m;
  }
  return undefined;
}
