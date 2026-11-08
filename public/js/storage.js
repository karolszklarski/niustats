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

export function saveData({ vehicles, trips }, storage = localStorage) {
  storage.setItem('trips', JSON.stringify(trips));
  storage.setItem('vehicles', JSON.stringify(vehicles));
}

export function removeData(storage = localStorage) {
  storage.removeItem('trips');
  storage.removeItem('vehicles');
}

export function loadUnits(storage = localStorage) {
  return storage.getItem('units') === 'mi' ? 'mi' : 'km';
}

export function saveUnits(units, storage = localStorage) {
  if (units === 'mi') storage.setItem('units', 'mi');
  else storage.removeItem('units');
}
