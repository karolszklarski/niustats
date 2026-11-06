import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exampleData } from '../../public/js/example.js';
import { monthlyStats } from '../../public/js/stats.js';
import { minimumLabel, monthRange, scooterSummary } from '../../public/js/summary.js';

const MILES_PER_KM = 0.621371192;

const trip = (d, m, b) => ({ d, m, b });
/** n trips in one month, by default of 10 km and 20 points: 2 points per km, so 45 km from 100% to 10%. */
const month = (yyyymm, n = 8, m = 10000, b = 20) =>
  Array.from({ length: n }, (_, i) => trip(yyyymm * 100 + 1 + (i % 28), m, b));
const summary = (trips, units = 'km') => scooterSummary(monthlyStats(trips, units), units);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≉ ${expected}`);

test('has nothing to say without months', () => {
  assert.deepEqual(scooterSummary([]), {
    estimate: null,
    best: null,
    lowest: null,
    months: [],
    showCharts: false,
    shortMonths: false,
  });
});

test('has no range estimate below 20 km', () => {
  assert.equal(summary([trip(20240105, 19900, 40)]).estimate, null);
});

test('has a rough range estimate from 20 km', () => {
  const { estimate } = summary([trip(20240105, 20000, 40)]);
  assert.equal(estimate.rough, true);
  assert.equal(estimate.at10, 45);
  assert.equal(estimate.distance, 20);
});

test('calls the estimate rough up to just below 50 km', () => {
  assert.equal(summary([trip(20240105, 49900, 100)]).estimate.rough, true);
});

test('stops calling the estimate rough at 50 km', () => {
  assert.equal(summary([trip(20240105, 50000, 100)]).estimate.rough, false);
});

test('says how far a charge goes down to 30%, 20% and 10%', () => {
  const { at30, at20, at10 } = summary(month(202401)).estimate;
  assert.deepEqual([at30, at20, at10], [35, 40, 45]);
});

test('weighs the months of the estimate by the distance ridden', () => {
  // 240 points over 100 km is 2.4 points per km, while the average of the two months' ranges would be 33.75 km.
  const { estimate } = summary([trip(20240105, 80000, 160), trip(20240205, 20000, 80)]);
  close(estimate.at10, 37.5);
  close(estimate.distance, 100);
});

test('bases the estimate on the 12 months up to the last trip, across New Year', () => {
  // January 2025 uses twice the battery, and is the 13th month back from January 2026.
  const months = [202502, 202503, 202504, 202505, 202506, 202507, 202508, 202509, 202510, 202511, 202512, 202601];
  const { estimate } = summary([...month(202501, 8, 10000, 40), ...months.flatMap((m) => month(m))]);
  assert.equal(estimate.at10, 45);
  assert.equal(estimate.from, '202502');
  assert.equal(estimate.to, '202601');
  assert.equal(estimate.latestYear, true);
});

test('counts the latest 12 months back from the last trip, not from today', () => {
  const { estimate } = summary([...month(201001), ...month(201901), ...month(201906)]);
  assert.equal(estimate.from, '201901');
  assert.equal(estimate.to, '201906');
  assert.equal(estimate.latestYear, true);
});

test('starts the period at the first month ridden in the latest 12 months', () => {
  const season = [202604, 202605, 202606, 202607, 202608, 202609, 202610];
  const { estimate } = summary([...month(202510), ...season.flatMap((m) => month(m))]);
  assert.equal(estimate.from, '202604');
  assert.equal(estimate.latestYear, true);
});

test('calls a history of exactly 12 months the latest 12 months', () => {
  const { estimate } = summary([...month(202401), ...month(202412)]);
  assert.equal(estimate.from, '202401');
  assert.equal(estimate.latestYear, true);
});

test('does not call a shorter history the latest 12 months', () => {
  const { estimate } = summary([...month(202402), ...month(202412)]);
  assert.equal(estimate.from, '202402');
  assert.equal(estimate.latestYear, false);
});

test('falls back to the whole history after a long break with little riding since', () => {
  const season = [202404, 202405, 202406, 202407, 202408, 202409, 202410];
  const { estimate } = summary([...season.flatMap((m) => month(m)), ...month(202604, 3, 8000, 16)]);
  assert.equal(estimate.rough, false);
  assert.equal(estimate.from, '202404');
  assert.equal(estimate.to, '202604');
  assert.equal(estimate.latestYear, false);
});

test('stays with the latest 12 months from exactly 50 km', () => {
  // The first month uses twice the battery, so the result shows which months went in.
  const earlier = month(202301, 8, 10000, 40);
  const atLimit = summary([...earlier, trip(20240605, 50000, 100)]).estimate;
  assert.equal(atLimit.at10, 45);
  assert.equal(atLimit.latestYear, true);

  const belowLimit = summary([...earlier, trip(20240605, 49900, 100)]).estimate;
  assert.equal(belowLimit.from, '202301');
  assert.equal(belowLimit.latestYear, false);
  assert.ok(belowLimit.at10 < 45);
});

test('has a rough estimate from the whole history when that is all there is', () => {
  const { estimate } = summary([trip(20240105, 15000, 30), trip(20260105, 14000, 28)]);
  assert.equal(estimate.rough, true);
  assert.equal(estimate.distance, 29);
  assert.equal(estimate.from, '202401');
  assert.equal(estimate.latestYear, false);
});

test('finds the best and the lowest month', () => {
  const { best, lowest } = summary([...month(202401, 8, 10000, 40), ...month(202402), ...month(202403, 8, 10000, 30)]);
  assert.deepEqual(best, { month: '202402', range: 45 });
  assert.deepEqual(lowest, { month: '202401', range: 22.5 });
});

test('needs two months of at least 50 km for the best and the lowest', () => {
  const { best, lowest } = summary([...month(202401), trip(20240205, 49900, 100)]);
  assert.equal(best, null);
  assert.equal(lowest, null);
});

test('counts a month of exactly 50 km for the best and the lowest, and not one just below', () => {
  const { best, lowest } = summary([
    trip(20240105, 50000, 100), // 2 points per km
    trip(20240205, 50000, 50), // 1 point per km
    trip(20240305, 49900, 200), // 4 points per km, but too short to be the lowest
    trip(20240405, 49900, 25), // 0.5 points per km, but too short to be the best
  ]);
  assert.equal(best.month, '202402');
  assert.equal(lowest.month, '202401');
});

test('looks for the best and the lowest in the whole history', () => {
  const months = [202502, 202503, 202504, 202505, 202506, 202507, 202508, 202509, 202510, 202511, 202512, 202601];
  const { lowest } = summary([...month(202501, 8, 10000, 40), ...months.flatMap((m) => month(m))]);
  assert.equal(lowest.month, '202501');
});

test('does not let a single short trip be the best month', () => {
  // 1 point over 1.2 km would be a range of 108 km.
  const { best } = summary([...month(202401), trip(20240205, 1200, 1), ...month(202403, 8, 10000, 30)]);
  assert.equal(best.month, '202401');
});

test('shows charts from two months of at least 20 km', () => {
  assert.equal(summary([trip(20240105, 20000, 40)]).showCharts, false);
  assert.equal(summary([trip(20240105, 20000, 40), trip(20240205, 19900, 40)]).showCharts, false);
  assert.equal(summary([trip(20240105, 20000, 40), trip(20240205, 20000, 40)]).showCharts, true);
});

test('shows charts for two months far apart', () => {
  const { showCharts, months } = summary([...month(202408), ...month(202608)]);
  assert.equal(showCharts, true);
  assert.equal(months.length, 25);
});

test('lists every month from the first to the last, across New Year', () => {
  const { months } = summary([trip(20231105, 25000, 50), trip(20240205, 25000, 50)]);
  assert.deepEqual(
    months.map(({ month }) => month),
    ['202311', '202312', '202401', '202402'],
  );
  assert.deepEqual(months[1], { month: '202312', reliable: false });
  assert.deepEqual(months[2], { month: '202401', reliable: false });
});

test('keeps the statistics of each month and says whether they are reliable', () => {
  const trips = [trip(20240105, 20000, 40), trip(20240205, 19900, 40)];
  const stats = monthlyStats(trips);
  const { months } = scooterSummary(stats);
  assert.deepEqual(months, [
    { ...stats[0], reliable: true },
    { ...stats[1], reliable: false },
  ]);
});

test('reports a short month, but not a month without trips', () => {
  assert.equal(summary([...month(202401), ...month(202403)]).shortMonths, false);
  assert.equal(summary([...month(202401), trip(20240205, 19900, 40), ...month(202403)]).shortMonths, true);
});

test('treats a month whose only trips are left out as a month without trips', () => {
  const { months, shortMonths } = summary([...month(202401), trip(20240205, 3000, 0), ...month(202403)]);
  assert.deepEqual(months[1], { month: '202402', reliable: false });
  assert.equal(shortMonths, false);
});

test('has no estimate when every trip is left out', () => {
  assert.equal(summary([trip(20240105, 3000, 0), trip(20240106, 900, 0)]).estimate, null);
});

test('has a proper estimate among trips without a distance', () => {
  const { estimate, months } = summary([...month(202401, 58), trip(20240205, 0, 3), trip(20240206, 0, 3)]);
  assert.equal(estimate.at10, 45);
  assert.deepEqual(months.map(({ month }) => month), ['202401']);
});

test('adds up the range of a month', () => {
  assert.equal(monthRange({ rangeTo30: 35, rangeTo20: 5, rangeTo10: 5 }), 45);
});

test('states the minimum distance in whole units, rounded up', () => {
  assert.equal(minimumLabel(), '20 km');
  assert.equal(minimumLabel('km'), '20 km');
  // 20 km is 12.4 mi, so "at least 12 mi" would promise too little.
  assert.equal(minimumLabel('mi'), '13 mi');
});

test('gives the estimate and the records in the chosen units', () => {
  const trips = [...month(202401), ...month(202402, 8, 10000, 40)];
  const km = summary(trips);
  const mi = summary(trips, 'mi');
  close(mi.estimate.at10, km.estimate.at10 * MILES_PER_KM);
  close(mi.estimate.distance, km.estimate.distance * MILES_PER_KM);
  close(mi.best.range, km.best.range * MILES_PER_KM);
  close(mi.lowest.range, km.lowest.range * MILES_PER_KM);
});

test('says the same in kilometres and miles, right at the limits', () => {
  const shape = ({ estimate, best, lowest, months, showCharts, shortMonths }) => ({
    estimate: estimate && { rough: estimate.rough, from: estimate.from, latestYear: estimate.latestYear },
    best: best?.month,
    lowest: lowest?.month,
    reliable: months.map(({ reliable }) => reliable),
    showCharts,
    shortMonths,
  });
  const cases = {
    'just below 20 km': [trip(20240105, 19900, 40)],
    'exactly 20 km': [trip(20240105, 20000, 40)],
    'just below 50 km': [trip(20240105, 49900, 100)],
    'exactly 50 km': [trip(20240105, 50000, 100)],
    'exactly 50 km in several trips': [trip(20240105, 8300, 17), trip(20240106, 17600, 35), trip(20240107, 24100, 48)],
    // These come out just short of the limit when added up in miles.
    'exactly 20 km over three months': [trip(20240105, 2400, 5), trip(20240205, 14200, 28), trip(20240305, 3400, 7)],
    'exactly 50 km over two months': [trip(20240105, 6800, 14), trip(20240205, 43200, 86)],
    'two months of exactly 20 km': [trip(20240105, 20000, 40), trip(20240205, 20000, 40)],
    'two months of exactly 50 km': [trip(20240105, 50000, 100), trip(20240205, 50000, 80)],
    'a month just below 20 km': [...month(202401), trip(20240205, 19900, 40), ...month(202403)],
    'after a long break': [...month(202301), trip(20240605, 49900, 100)],
  };
  for (const [name, trips] of Object.entries(cases)) {
    assert.deepEqual(shape(summary(trips, 'mi')), shape(summary(trips)), name);
  }
});

test('sums up the example scooter', () => {
  const [trips] = Object.values(exampleData.trips);
  const { estimate, best, lowest, months, showCharts, shortMonths } = summary(trips);

  assert.equal(Math.round(estimate.at10), 42);
  assert.equal(estimate.rough, false);
  assert.equal(estimate.from, '202301');
  assert.equal(estimate.to, '202312');
  assert.equal(estimate.latestYear, true);
  assert.equal(Math.round(best.range), 55);
  assert.equal(Math.round(lowest.range), 37);
  assert.equal(months.length, 55);
  assert.ok(months.every(({ reliable }) => reliable));
  assert.equal(showCharts, true);
  assert.equal(shortMonths, false);
});
