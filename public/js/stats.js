
export const MILES_PER_KM = 0.621371192;

const MAX_TIMES = 3;

const POINTS_ABOVE = 2;

const POINTS_BELOW = 1;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthLabel(month) {
  return `${MONTH_NAMES[Number(month.slice(4)) - 1]} ${month.slice(0, 4)}`;
}

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
