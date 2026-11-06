// Home page: four charts per scooter of the stored trips, or of the example data.
// Chart.js is loaded as a classic script before this module.
import { monthLabel, monthlyStats } from './stats.js';
import { exampleData } from './example.js';
import { loadData, loadUnits, removeData, saveUnits } from './storage.js';

const units = loadUnits();
const data = loadData();
const { vehicles, trips } = data;
let drawn = [];

document.getElementById('example-note').hidden = data !== exampleData;

document.getElementById('change-units').addEventListener('click', () => {
  saveUnits(units === 'mi' ? 'km' : 'mi');
  location.reload();
});

document.getElementById('remove-data').addEventListener('click', () => {
  removeData();
  location.reload();
});

// Text on a canvas doesn't change when the font arrives, so the charts wait for it.
document.fonts.ready.then(drawCharts);
// The charts take their colours from the site's styles, which follow the system's light or dark mode.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawCharts);

function drawCharts() {
  for (const chart of drawn) chart.destroy();
  document.getElementById('charts').replaceChildren();
  const css = getComputedStyle(document.documentElement);
  const token = (name) => css.getPropertyValue(name).trim();
  Chart.defaults.font.family = token('--font');
  Chart.defaults.color = token('--chart-tick');

  drawn = Object.entries(trips).flatMap(([sn, scooterTrips]) =>
    charts(monthlyStats(scooterTrips, units), units, token).map(({ id, title, config }) => {
      const canvas = addCard(sn, vehicles[sn], title);
      canvas.id = id + sn;
      return new Chart(canvas, config);
    }),
  );
}

/** Adds a card for one chart of a scooter and returns its canvas. Names are set as text, never as HTML. */
function addCard(sn, vehicle, title) {
  const card = document.getElementById('chart-card').content.cloneNode(true);
  // Data stored by an earlier version of this site can lack the details of a scooter.
  card.querySelector('.scooter-name').textContent = vehicle ? vehicle.scooter_name : '';
  card.querySelector('.scooter-details').textContent = vehicle ? ` - ${vehicle.sku_name} - ${sn}` : sn;
  card.querySelector('.chart-title').textContent = title;
  const canvas = card.querySelector('canvas');
  document.getElementById('charts').append(card);
  return canvas;
}

function charts(stats, units, token) {
  const labels = stats.map(({ month }) => monthLabel(month));
  const series = (key) => stats.map((month) => month[key]);
  const grid = token('--chart-grid');
  const battery = token('--battery');
  const ranges = [
    { label: 'Range from 100% to 30%', key: 'rangeTo30', color: token('--band-1') },
    { label: 'Range from 30% to 20%', key: 'rangeTo20', color: token('--band-2') },
    { label: 'Range from 20% to 10%', key: 'rangeTo10', color: token('--band-3') },
  ];
  const batteryLabel = `Battery used per ${units} (%)`;
  const distanceBars = () => ({
    label: `Distance ridden (${units})`,
    data: series('distance'),
    backgroundColor: token('--distance'),
    yAxisID: 'y2',
  });
  const x = (stacked) => ({ stacked, grid: { drawOnChartArea: false }, border: { color: grid } });
  const y = (stacked) => ({ stacked, beginAtZero: true, grid: { color: grid }, border: { display: false } });
  const y2 = { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, border: { display: false } };
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
        { x: x(true), y: y(true) },
      ),
    },
    {
      id: 'rangeDistanceChart',
      title: `Range in ${units} and distance ridden`,
      config: chart(
        [
          ...ranges.map(({ label, key, color }) => ({
            label,
            data: series(key),
            backgroundColor: color,
            borderColor: color,
            type: 'line',
            yAxisID: 'y',
          })),
          distanceBars(),
        ],
        { x: x(true), y: y(true), y2 },
      ),
    },
    {
      id: 'batteryChart',
      title: batteryLabel,
      config: chart(
        [{ label: batteryLabel, data: series('battery'), backgroundColor: battery }],
        { x: x(false), y: y(false) },
      ),
    },
    {
      id: 'batteryDistanceChart',
      title: `${batteryLabel} and distance ridden`,
      config: chart(
        [
          {
            label: batteryLabel,
            data: series('battery'),
            backgroundColor: battery,
            borderColor: battery,
            type: 'line',
            yAxisID: 'y',
          },
          distanceBars(),
        ],
        { x: x(false), y: y(false), y2 },
      ),
    },
  ];
}
