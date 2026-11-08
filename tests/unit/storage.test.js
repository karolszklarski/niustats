import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exampleData } from '../../public/js/example.js';
import { loadData, loadUnits, removeData, saveData, saveUnits } from '../../public/js/storage.js';

class MemoryStorage {
  #items = new Map();

  constructor(items = {}) {
    for (const [key, value] of Object.entries(items)) this.setItem(key, value);
  }

  getItem(key) {
    return this.#items.has(key) ? this.#items.get(key) : null;
  }

  setItem(key, value) {
    this.#items.set(key, String(value));
  }

  removeItem(key) {
    this.#items.delete(key);
  }

  get keys() {
    return [...this.#items.keys()].sort();
  }
}

const vehicles = { SN1: { sn_id: 'SN1', scooter_name: 'Blue', sku_name: 'NQi GTS' } };
const trips = { SN1: [{ d: 20240105, m: 10000, b: 20 }] };

test('loads the stored scooters and trips', () => {
  const storage = new MemoryStorage({ vehicles: JSON.stringify(vehicles), trips: JSON.stringify(trips) });
  assert.deepEqual(loadData(storage), { vehicles, trips });
});

test('loads the example data unless scooters and trips are both stored', () => {
  for (const items of [{}, { vehicles: JSON.stringify(vehicles) }, { trips: JSON.stringify(trips) }]) {
    assert.equal(loadData(new MemoryStorage(items)), exampleData, Object.keys(items).join() || 'nothing stored');
  }
});

test('stores scooters and trips for the next visit', () => {
  const storage = new MemoryStorage();
  saveData({ vehicles, trips }, storage);
  assert.deepEqual(loadData(storage), { vehicles, trips });
});

test('removes the scooters and trips but keeps the units', () => {
  const storage = new MemoryStorage({ vehicles: '{}', trips: '{}', units: 'mi' });
  removeData(storage);
  assert.deepEqual(storage.keys, ['units']);
});

test('uses kilometres unless miles were chosen', () => {
  assert.equal(loadUnits(new MemoryStorage()), 'km');
  assert.equal(loadUnits(new MemoryStorage({ units: 'mi' })), 'mi');
});

test('stores only the choice of miles', () => {
  const storage = new MemoryStorage();
  saveUnits('mi', storage);
  assert.equal(storage.getItem('units'), 'mi');
  saveUnits('km', storage);
  assert.deepEqual(storage.keys, []);
});
