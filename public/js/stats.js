// Monthly range statistics of one scooter. README.md explains how they are computed and why.

export const MILES_PER_KM = 0.621371192;

/** Trips whose battery use per distance is above this percentile of all the scooter's trips are left out. */
const OUTLIER_PERCENTILE = 0.98;

/** With fewer trips than this, the percentile would leave nothing out. */
const TRIPS_FOR_PERCENTILE = 50;

/** So with fewer trips, those above this battery use per metre (5% per km) are left out instead. */
const MAX_BATTERY_PER_METRE = 5 / 1000;

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
 *   rangeTo10: number }[]} for each month with trips, in date order: the distance driven, the battery percent used
 *   per distance unit, and the range from 100% to 30%, from 30% to 20% and from 20% to 10%
 */
export function monthlyStats(trips, units = 'km') {
  const unitsPerKm = units === 'mi' ? MILES_PER_KM : 1;
  const months = new Map();
  for (const trip of withoutOutliers(trips)) {
    const month = Math.floor(trip.d / 100);
    const totals = months.get(month) ?? { metres: 0, battery: 0 };
    totals.metres += trip.m;
    totals.battery += trip.b;
    months.set(month, totals);
  }
  return [...months]
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
 * The trips that used some battery, without those above the limit of battery use per distance: mostly very short
 * trips and faulty readings. The limit is the outlier percentile or, with too few trips for that, a fixed value.
 */
function withoutOutliers(trips) {
  const batteryPerMetre = (trip) => trip.b / trip.m;
  const percentileLimit = () => {
    const sorted = trips.map(batteryPerMetre).sort((a, b) => a - b);
    return sorted[Math.ceil(trips.length * OUTLIER_PERCENTILE) - 1];
  };
  const limit = trips.length < TRIPS_FOR_PERCENTILE ? MAX_BATTERY_PER_METRE : percentileLimit();
  return trips.filter((trip) => trip.b > 0 && batteryPerMetre(trip) <= limit);
}
