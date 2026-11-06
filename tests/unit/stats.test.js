import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthLabel, monthlyStats } from '../../public/js/stats.js';

const trip = (d, m, b) => ({ d, m, b });
/** n trips in January 2024 with the same distance (metres) and battery use (percentage points). */
const januaryTrips = (n, m, b) => Array.from({ length: n }, (_, i) => trip(20240101 + (i % 28), m, b));

test('sums distance and battery use per calendar month', () => {
  // January: 30 points over 15 km is 2 points per km, so 70 points take 35 km and each next 10 points 5 km.
  assert.deepEqual(monthlyStats([trip(20240105, 10000, 20), trip(20240120, 5000, 10), trip(20240203, 8000, 20)]), [
    { month: '202401', distance: 15, battery: 2, rangeTo30: 35, rangeTo20: 5, rangeTo10: 5 },
    { month: '202402', distance: 8, battery: 2.5, rangeTo30: 28, rangeTo20: 4, rangeTo10: 4 },
  ]);
});

test('orders the months by date', () => {
  const stats = monthlyStats([trip(20240301, 1000, 1), trip(20231201, 1000, 1), trip(20240105, 1000, 1)]);
  assert.deepEqual(stats.map(({ month }) => month), ['202312', '202401', '202403']);
});

/** 30 trips of 10 km and 20 points, so the scooter typically uses 2 points per km. */
const ordinary = januaryTrips(30, 10000, 20);
/** The distance of January, in km, with an ordinary month and one more trip. */
const distanceWith = (extra) => monthlyStats([...ordinary, extra])[0].distance;

test('keeps a trip of up to 3 times the battery its distance should take, plus 2 points', () => {
  // 1 km should take 2 points, 1.15 km 2.3 points, and 10 km 20 points.
  assert.equal(distanceWith(trip(20240131, 1000, 8)), 301);
  assert.equal(distanceWith(trip(20240131, 1000, 9)), 300);
  assert.equal(distanceWith(trip(20240131, 1150, 9)), 300);
  assert.equal(distanceWith(trip(20240131, 10000, 62)), 310);
  assert.equal(distanceWith(trip(20240131, 10000, 63)), 300);
});

test('keeps a trip whose distance should take up to 3 times its battery, plus 1 point', () => {
  // 11 km should take 22 points, and 3 times 7 points plus 1 is 22.
  assert.equal(distanceWith(trip(20240131, 11000, 7)), 311);
  assert.equal(distanceWith(trip(20240131, 11000, 6)), 300);
  // 10 km should take 20 points, and 3 times 7 points is already more.
  assert.equal(distanceWith(trip(20240131, 10000, 7)), 310);
  assert.equal(distanceWith(trip(20240131, 10000, 6)), 300);
});

test('leaves out a faulty reading of more than a whole charge', () => {
  const [january] = monthlyStats([...januaryTrips(49, 10000, 20), trip(20240131, 1000, 110)]);
  assert.equal(january.distance, 490);
  assert.equal(january.battery, 2);
});

test('leaves out a long trip that shows hardly any battery use', () => {
  const [january] = monthlyStats([...ordinary, trip(20240120, 80000, 17)]);
  assert.equal(january.distance, 300);
  assert.equal(january.battery, 2);
});

test('leaves out a longer trip without battery use, as a missing reading', () => {
  assert.equal(distanceWith(trip(20240110, 3000, 0)), 300);
  assert.equal(distanceWith(trip(20240110, 510, 0)), 300);
});

test('keeps a short trip without battery use, because Niu reports whole percents', () => {
  assert.equal(distanceWith(trip(20240110, 500, 0)), 300.5);
});

test('keeps a very short trip of a point or two, because Niu reports whole percents', () => {
  assert.equal(distanceWith(trip(20240110, 50, 1)), 300.05);
  assert.equal(distanceWith(trip(20240110, 50, 2)), 300.05);
  assert.equal(distanceWith(trip(20240110, 50, 3)), 300);
});

test('judges a scooter by its own battery use, however high', () => {
  const [january] = monthlyStats(januaryTrips(30, 3000, 18));
  assert.equal(january.distance, 90);
  assert.equal(january.battery, 6);
});

test('takes the typical battery use by distance, not by number of trips', () => {
  // Most trips use 5 points per km, but over only 10 of the 310 km. Counted by trips, they would rule out the long ones.
  const [january] = monthlyStats([...januaryTrips(10, 30000, 30), ...januaryTrips(50, 200, 1)]);
  assert.equal(january.distance, 310);
});

test('takes the typical battery use halfway along the distance, in order of battery use', () => {
  // 40 km at 1 point per km, 20 km at 2 and 30 km at 3: the middle of the 92 km is at 2, so 1 km should take 2 points.
  const [january] = monthlyStats([
    trip(20240101, 30000, 90),
    trip(20240102, 40000, 40),
    trip(20240103, 20000, 40),
    trip(20240104, 1000, 8),
    trip(20240105, 1000, 9),
  ]);
  assert.equal(january.distance, 91);
});

test('takes the typical battery use only from trips that show some', () => {
  // Missing readings over most of the distance would otherwise make the typical use 0.
  const [january] = monthlyStats([...januaryTrips(6, 10000, 0), ...januaryTrips(4, 10000, 20)]);
  assert.equal(january.distance, 40);
  assert.equal(january.battery, 2);
});

test('keeps its judgement when a faulty reading is one of few', () => {
  const [january] = monthlyStats([trip(20240105, 10000, 20), trip(20240106, 8000, 16), trip(20240107, 3000, 60)]);
  assert.equal(january.distance, 18);
});

test('treats a scooter the same at any number of trips', () => {
  const withFaults = (count) => [...januaryTrips(count - 2, 10000, 20), trip(20240130, 3000, 60), trip(20240131, 3000, 60)];
  for (const count of [20, 49, 50, 51, 100]) {
    const [january] = monthlyStats(withFaults(count));
    assert.equal(january.distance, (count - 2) * 10, `${count} trips`);
    assert.equal(january.battery, 2, `${count} trips`);
  }
});

test('leaves out a faulty reading however many very short trips there are', () => {
  // Among the highest values per km, very short trips must not make room for a trip of 3 km and 30 points.
  const [january] = monthlyStats([...januaryTrips(60, 10000, 20), ...januaryTrips(20, 50, 1), trip(20240131, 3000, 30)]);
  assert.equal(january.distance, 601);
});

test('keeps a lone trip, with nothing to compare it to', () => {
  assert.deepEqual(monthlyStats([trip(20240105, 3000, 60)]).map(({ distance }) => distance), [3]);
});

test('has no month when no trip shows battery use', () => {
  assert.deepEqual(monthlyStats([trip(20240105, 500, 0), trip(20240106, 3000, 0)]), []);
});

test('has no month whose kept trips show no battery use, which would make its range endless', () => {
  const stats = monthlyStats([...ordinary, trip(20240205, 500, 0)]);
  assert.deepEqual(stats.map(({ month }) => month), ['202401']);
});

test('leaves out a trip without a distance', () => {
  assert.deepEqual(monthlyStats([trip(20240105, 0, 3)]), []);
  const [january] = monthlyStats([trip(20240105, 0, 3), trip(20240106, 8000, 16)]);
  assert.equal(january.distance, 8);
  assert.equal(january.battery, 2);
});

test('leaves out a trip with a negative distance', () => {
  assert.deepEqual(monthlyStats([trip(20240305, -500, 2)]), []);
});

test('leaves out a trip that gained battery, as it spans a charge', () => {
  assert.equal(distanceWith(trip(20240131, 4000, -60)), 300);
});

const unusableTrips = {
  'no distance and no battery use': { d: 20240205, m: 0, b: 0 },
  'no distance': { d: 20240205, m: 0, b: 3 },
  'a negative distance': { d: 20240205, m: -500, b: 2 },
  'a missing distance': { d: 20240205, b: 3 },
  'a missing battery use': { d: 20240205, m: 5000 },
};

for (const [name, unusable] of Object.entries(unusableTrips)) {
  test(`keeps judging trips among trips with ${name}`, () => {
    // Of 58 usable trips one is left out: the faulty reading of 50% per km.
    const usable = [...januaryTrips(57, 10000, 20), trip(20240131, 1000, 50)];
    const arrangements = {
      'at the end': [...usable, unusable, unusable],
      'at the start': [unusable, unusable, ...usable],
      'in the middle': [...usable.slice(0, 29), unusable, unusable, ...usable.slice(29)],
    };
    for (const [where, trips] of Object.entries(arrangements)) {
      const stats = monthlyStats(trips);
      assert.deepEqual(stats.map(({ month }) => month), ['202401'], where);
      assert.equal(stats[0].distance, 570, where);
      assert.equal(stats[0].battery, 2, where);
    }
  });
}

test('converts the statistics to miles', () => {
  const [km] = monthlyStats([trip(20240105, 10000, 20)]);
  const [mi] = monthlyStats([trip(20240105, 10000, 20)], 'mi');
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} ≉ ${expected}`);
  close(mi.distance, km.distance * 0.621371192);
  close(mi.battery, km.battery / 0.621371192);
  close(mi.rangeTo30, km.rangeTo30 * 0.621371192);
});

test('names a month in English', () => {
  assert.equal(monthLabel('201906'), 'Jun 2019');
  assert.equal(monthLabel('202301'), 'Jan 2023');
  assert.equal(monthLabel('202312'), 'Dec 2023');
});

test('has no months without trips', () => {
  assert.deepEqual(monthlyStats([]), []);
});
