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

test('leaves out trips without battery use', () => {
  const [january] = monthlyStats([trip(20240105, 10000, 20), trip(20240110, 3000, 0)]);
  assert.equal(january.distance, 10);
});

test('leaves out trips above the 98th percentile of battery use per distance', () => {
  const [january] = monthlyStats([...januaryTrips(49, 10000, 20), trip(20240131, 1000, 50)]);
  assert.equal(january.distance, 490);
  assert.equal(january.battery, 2);
});

test('keeps trips of up to 5% per km when there are fewer than 50', () => {
  const [january] = monthlyStats([...januaryTrips(48, 10000, 20), trip(20240131, 1000, 5)]);
  assert.equal(january.distance, 481);
});

test('leaves out trips above 5% per km when there are fewer than 50', () => {
  const [january] = monthlyStats([...januaryTrips(48, 10000, 20), trip(20240131, 1000, 6)]);
  assert.equal(january.distance, 480);
  assert.equal(january.battery, 2);
});

test('goes by the percentile alone from 50 trips', () => {
  const [january] = monthlyStats([...januaryTrips(48, 10000, 20), trip(20240130, 1000, 6), trip(20240131, 1000, 6)]);
  assert.equal(january.distance, 482);
});

test('has no month for a single faulty reading', () => {
  assert.deepEqual(monthlyStats([trip(20240105, 3000, 60)]), []);
});

test('leaves out a trip without a distance', () => {
  assert.deepEqual(monthlyStats([trip(20240105, 0, 3)]), []);
  const [january] = monthlyStats([trip(20240105, 0, 3), trip(20240106, 8000, 16)]);
  assert.equal(january.distance, 8);
  assert.equal(january.battery, 2);
});

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
