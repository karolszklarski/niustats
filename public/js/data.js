// CSV page: the trips the home page charts, one line per trip.
import { loadData } from './storage.js';

const { trips } = loadData();
const lines = ['sn,date,distance,battery'];
for (const [sn, scooterTrips] of Object.entries(trips)) {
  for (const trip of scooterTrips) lines.push(`${sn},${trip.d},${trip.m},${trip.b}`);
}
document.getElementById('csv').textContent = `${lines.join('\n')}\n`;
