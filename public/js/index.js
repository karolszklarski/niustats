// Home page: four charts per scooter of the stored trips, or of the example data.
// Chart.js is loaded as a classic script before this module.
import { monthlyStats } from './stats.js';
import { loadData, loadUnits, removeData, saveUnits } from './storage.js';

const units = loadUnits();
const { vehicles, trips } = loadData();

document.getElementById('change-units').addEventListener('click', () => {
  saveUnits(units === 'mi' ? 'km' : 'mi');
  location.reload();
});

document.getElementById('remove-data').addEventListener('click', () => {
  removeData();
  location.reload();
});

for (const [sn, scooterTrips] of Object.entries(trips)) {
  const stats = monthlyStats(scooterTrips, units);
  for (const { id, title, config } of charts(stats, units)) {
    const canvas = addCard(sn, vehicles[sn], title);
    canvas.id = id + sn;
    new Chart(canvas, config);
  }
}

/** Adds a card for one chart of a scooter and returns its canvas. Names are set as text, never as HTML. */
function addCard(sn, vehicle, title) {
  const card = document.getElementById('chart-card').content.cloneNode(true);
  // Data stored by an earlier version of this site can lack the details of a scooter.
  card.querySelector('.scooter-name').textContent = vehicle ? vehicle.scooter_name : '';
  card.querySelector('.scooter-details').textContent = vehicle ? ` - ${vehicle.sku_name} - ${sn}` : sn;
  card.querySelector('.card-title').textContent = title;
  const canvas = card.querySelector('canvas');
  document.getElementById('charts').append(card);
  return canvas;
}

function charts(stats, units) {
  const labels = stats.map(({ month }) => month);
  const series = (key) => stats.map((month) => month[key]);
  const ranges = [
    { label: 'Range from 100% to 30%', key: 'rangeTo30', color: '#aaffaa', lineColor: '#77ff77' },
    { label: 'Range from 30% to 20%', key: 'rangeTo20', color: '#ffffaa', lineColor: '#ffff77' },
    { label: 'Range from 20% to 10%', key: 'rangeTo10', color: '#ffaaaa', lineColor: '#ff7777' },
  ];
  const batteryLabel = `Battery percent per ${units}`;
  const distanceBars = () => ({
    label: `Distance driven in ${units}`,
    data: series('distance'),
    backgroundColor: '#dddddd',
    yAxisID: 'y2',
  });
  const x = (stacked) => ({ stacked, grid: { drawOnChartArea: false } });
  const y = (color, stacked) => ({ stacked, beginAtZero: true, grid: { z: 100, color } });
  const y2 = { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false } };
  const chart = (datasets, scales) => ({
    type: 'bar',
    data: { labels, datasets },
    options: { maintainAspectRatio: false, scales },
  });

  return [
    {
      id: 'rangeChart',
      title: `Range in ${units}`,
      config: chart(
        ranges.map(({ label, key, color }) => ({ label, data: series(key), backgroundColor: color })),
        { x: x(true), y: y('#44dd44', true) },
      ),
    },
    {
      id: 'rangeDistanceChart',
      title: `Range in ${units} + distance driven`,
      config: chart(
        [
          ...ranges.map(({ label, key, color, lineColor }) => ({
            label,
            data: series(key),
            backgroundColor: color,
            borderColor: lineColor,
            type: 'line',
            yAxisID: 'y',
          })),
          distanceBars(),
        ],
        { x: x(true), y: y('#44dd44', true), y2 },
      ),
    },
    {
      id: 'batteryChart',
      title: batteryLabel,
      config: chart(
        [{ label: batteryLabel, data: series('battery'), backgroundColor: '#ccccff' }],
        { x: x(false), y: y('#aaaaff', false) },
      ),
    },
    {
      id: 'batteryDistanceChart',
      title: `${batteryLabel} + distance driven`,
      config: chart(
        [
          {
            label: batteryLabel,
            data: series('battery'),
            backgroundColor: '#ccccff',
            borderColor: '#9999ff',
            type: 'line',
            yAxisID: 'y',
          },
          distanceBars(),
        ],
        { x: x(false), y: y('#aaaaff', false), y2 },
      ),
    },
  ];
}
