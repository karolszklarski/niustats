// The visitor's data in the browser's localStorage: scooters under 'vehicles', trips under 'trips'
// (both JSON, keyed by serial number) and the distance unit under 'units' ('mi', or nothing for km).
import { exampleData } from './example.js';

/**
 * The stored scooters and trips. When either is missing, the example data: stored scooters are never
 * paired with example trips, or the other way round.
 */
export function loadData(storage = localStorage) {
  const vehicles = storage.getItem('vehicles');
  const trips = storage.getItem('trips');
  if (vehicles === null || trips === null) return exampleData;
  return { vehicles: JSON.parse(vehicles), trips: JSON.parse(trips) };
}

/**
 * Stores scooters and trips together, once a download is complete, so a failed download leaves
 * the data stored earlier as it was.
 */
export function saveData({ vehicles, trips }, storage = localStorage) {
  storage.setItem('trips', JSON.stringify(trips));
  storage.setItem('vehicles', JSON.stringify(vehicles));
}

export function removeData(storage = localStorage) {
  storage.removeItem('trips');
  storage.removeItem('vehicles');
}

/** @returns {'km' | 'mi'} */
export function loadUnits(storage = localStorage) {
  return storage.getItem('units') === 'mi' ? 'mi' : 'km';
}

/** @param {'km' | 'mi'} units */
export function saveUnits(units, storage = localStorage) {
  if (units === 'mi') storage.setItem('units', 'mi');
  else storage.removeItem('units');
}
