import { exampleData } from './example.js';
import { monthLabel, monthlyStats } from './stats.js';
import { loadData, loadUnits, removeData, saveUnits } from './storage.js';
import { minimumLabel, monthRange, scooterSummary } from './summary.js';

const Y_AXIS_WIDTH = 48;
const YEAR_TICKS_FROM = 18;
const YEAR_LABEL_WIDTH = 40;
const BANDS = [
  ['Range from 100% to 30%', 'rangeTo30'],
  ['Range from 30% to 20%', 'rangeTo20'],
  ['Range from 20% to 10%', 'rangeTo10'],
];

Chart.Interaction.modes.monthWithValue = (chart, event, options, useFinalPosition) =>
  Chart.Interaction.modes
    .index(chart, event, options, useFinalPosition)
    .filter(({ datasetIndex, index }) => chart.data.datasets[datasetIndex].data[index] !== null);

const data = loadData();
const unitButtons = document.querySelectorAll('[data-units]');
const removeButton = document.getElementById('remove-data');
let units = loadUnits();
let charts = [];
const distanceShown = new Set();
const tablesOpen = new Set();

document.getElementById('example-note').hidden = data !== exampleData;
removeButton.hidden = data === exampleData;
removeButton.addEventListener('click', () => {
  removeData();
  location.reload();
});

for (const button of unitButtons) {
  button.addEventListener('click', () => {
    units = button.dataset.units;
    saveUnits(units);
    render();
  });
}

document.fonts.ready.then(render);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);

function render() {
  // The page is shorter while it is rebuilt, which would otherwise move the visitor back up.
  const { scrollY } = window;
  for (const chart of charts) chart.destroy();
  charts = [];
  for (const button of unitButtons) button.setAttribute('aria-pressed', String(button.dataset.units === units));

  const t = tokens();
  Chart.defaults.font.family = t.font;
  Chart.defaults.font.size = 12;
  Chart.defaults.color = t.tick;

  const root = document.getElementById('scooters');
  tablesOpen.clear();
  for (const table of root.querySelectorAll('.twin[open]')) tablesOpen.add(table.dataset.sn);
  root.replaceChildren();
  if (Object.keys(data.trips).length === 0) {
    const message = document.createElement('p');
    message.className = 'scooter-empty';
    message.textContent = 'No scooters found in your Niu account.';
    root.append(message);
  }
  for (const [sn, trips] of Object.entries(data.trips)) addScooter(root, sn, data.vehicles[sn], trips, t);
  window.scrollTo(0, scrollY);
}

function tokens() {
  const css = getComputedStyle(document.documentElement);
  const read = (name) => css.getPropertyValue(name).trim();
  return {
    font: read('--font'),
    surface: read('--panel'),
    grid: read('--chart-grid'),
    tick: read('--chart-tick'),
    bands: [read('--band-1'), read('--band-2'), read('--band-3')],
    battery: read('--battery'),
    batteryWash: read('--battery-wash'),
    distance: read('--distance'),
    tipBg: read('--tip-bg'),
    tipText: read('--tip-text'),
    tipMuted: read('--tip-muted'),
    tipBorder: read('--tip-border'),
  };
}

function setText(section, name, text) {
  for (const element of section.querySelectorAll(`[data-stat="${name}"]`)) element.textContent = text;
}

function showNote(section, name) {
  section.querySelector(`[data-note="${name}"]`).hidden = false;
}

function addScooter(root, sn, vehicle, trips, t) {
  const section = document.getElementById('scooter').content.firstElementChild.cloneNode(true);
  root.append(section);
  // Names are set as text, never as HTML. Data stored by an earlier version of this site can lack a name or a model.
  const name = vehicle?.scooter_name || sn;
  section.querySelector('.scooter-name').textContent = name;
  section.querySelector('.scooter-details').textContent = [vehicle?.sku_name, name === sn ? null : sn]
    .filter(Boolean)
    .join(' · ');
  if (trips.length === 0) {
    section.querySelector(`[data-empty="${vehicle?.tripsRefused ? 'refused' : 'no-trips'}"]`).hidden = false;
    section.querySelector('.scooter-body').hidden = true;
    return;
  }

  const stats = monthlyStats(trips, units);
  const summary = scooterSummary(stats, units);
  const { months } = summary;
  setText(section, 'minimum', minimumLabel(units));
  fillStats(section, summary);
  if (stats.length > 0) fillTable(section, sn, summary);
  else section.querySelector('.twin').hidden = true;

  if (!summary.showCharts) {
    for (const figure of section.querySelectorAll('.chart')) figure.hidden = true;
    showNote(section, 'charts-wait');
    return;
  }
  if (summary.shortMonths) showNote(section, 'months-left-out');

  const reliable = (key) => months.map((month) => (month.reliable ? month[key] : null));
  const period = `${monthLabel(months[0].month)} to ${monthLabel(months.at(-1).month)}`;
  addChart(section.querySelector('[data-chart="range"]'), `${sn}:range`, months, t, {
    title: `Range in ${units}`,
    aria: `Stacked bars of the range in ${units} for each month, ${period}. The values are in the monthly numbers table.`,
    legend: BANDS.map(([label], i) => [label, t.bands[i]]),
    config: chartConfig(months, t, {
      stacked: true,
      datasets: BANDS.map(([label, key], i) => ({
        ...barStyle(t),
        label,
        data: reliable(key),
        backgroundColor: t.bands[i],
        keyColor: t.bands[i],
      })),
      value: (y, label) => `${y.toFixed(1)} ${units}  ${label}`,
      footer: (y) => `${y.toFixed(1)} ${units}  Range from 100% to 10%`,
    }),
  });

  const batteryLabel = `Battery used per ${units} (%)`;
  const batteryValues = reliable('battery');
  addChart(section.querySelector('[data-chart="battery"]'), `${sn}:battery`, months, t, {
    title: batteryLabel,
    aria: `Line of the battery percent used per ${units} for each month, ${period}. The values are in the monthly numbers table.`,
    config: chartConfig(months, t, {
      type: 'line',
      datasets: [
        {
          label: batteryLabel,
          data: batteryValues,
          keyColor: t.battery,
          borderColor: t.battery,
          backgroundColor: t.batteryWash,
          borderWidth: 2,
          borderJoinStyle: 'round',
          fill: 'origin',
          pointRadius: ({ dataIndex: i }) => {
            const isolated = batteryValues[i] !== null && batteryValues[i - 1] == null && batteryValues[i + 1] == null;
            return months.length <= 12 || isolated ? 4 : 0;
          },
          pointHoverRadius: 5,
          pointBackgroundColor: t.battery,
          pointBorderColor: t.surface,
          pointBorderWidth: 2,
        },
      ],
      value: (y) => `${y.toFixed(2)}%  per ${units}`,
    }),
  });
}

function fillStats(section, { estimate, best, lowest }) {
  section.querySelector('.stat-hero').dataset.level = !estimate ? 'wait' : estimate.rough ? 'rough' : 'full';
  for (const unit of section.querySelectorAll('.unit')) unit.textContent = units;

  if (best) {
    setText(section, 'best', Math.round(best.range));
    setText(section, 'best-note', monthLabel(best.month));
    setText(section, 'lowest', Math.round(lowest.range));
    setText(section, 'lowest-note', monthLabel(lowest.month));
  } else {
    for (const tile of section.querySelectorAll('[data-extreme]')) tile.hidden = true;
    section.querySelector('.stats').classList.add('stats-single');
  }

  if (!estimate) {
    setText(section, 'range-label', 'Range on a charge');
    return;
  }
  const { from, to } = estimate;
  const period = from === to ? monthLabel(to) : `${monthLabel(from)} – ${monthLabel(to)}`;
  // "Latest", because the 12 months count back from the last trip, not from today: after a break that's not the same.
  setText(section, 'range-label', `Range on a charge, ${estimate.latestYear ? 'latest 12 months' : 'all trips'}`);
  setText(section, 'range', Math.round(estimate.at10));
  setText(section, 'range-note', `From 100% to 10% battery, ${period}`);
  setText(section, 'rough-distance', `${Math.floor(estimate.distance)} ${units}`);
  for (const level of ['at30', 'at20', 'at10']) setText(section, level, `${Math.round(estimate[level])} ${units}`);
}

function fillTable(section, sn, { months, shortMonths }) {
  const headers = section.querySelectorAll('thead th');
  headers[1].textContent = `Range from 100% to 10% (${units})`;
  headers[2].textContent = `Battery used per ${units} (%)`;
  headers[3].textContent = `Distance ridden (${units})`;

  const body = section.querySelector('tbody');
  for (const month of [...months].reverse()) {
    if (month.distance === undefined) continue;
    const row = body.insertRow();
    for (const value of [
      monthLabel(month.month),
      month.reliable ? monthRange(month).toFixed(1) : '–',
      month.reliable ? month.battery.toFixed(2) : '–',
      Math.round(month.distance),
    ]) {
      row.insertCell().textContent = value;
    }
  }
  if (shortMonths) showNote(section, 'table-dash');

  const table = section.querySelector('.twin');
  table.dataset.sn = sn;
  table.open = tablesOpen.has(sn);
}

function addChart(figure, key, months, t, { title, aria, legend, config }) {
  figure.querySelector('.chart-title').textContent = title;
  const list = figure.querySelector('.legend');
  if (legend) {
    for (const [label, color] of legend) {
      const item = document.createElement('li');
      const swatch = document.createElement('i');
      swatch.className = 'key';
      swatch.style.background = color;
      item.append(swatch, label);
      list.append(item);
    }
  } else {
    list.remove();
  }
  const canvas = figure.querySelector('.plot canvas');
  canvas.setAttribute('aria-label', aria);
  const main = new Chart(canvas, config);
  charts.push(main);

  const toggle = figure.querySelector('.switch input');
  const strip = figure.querySelector('.strip');
  let stripChart = null;
  const apply = () => {
    const on = toggle.checked;
    if (on) distanceShown.add(key);
    else distanceShown.delete(key);
    strip.hidden = !on;
    main.options.scales.x.ticks.display = !on;
    main.update('none');
    if (on && !stripChart) {
      const label = `Distance ridden (${units})`;
      strip.querySelector('.strip-title').textContent = label;
      const stripCanvas = strip.querySelector('canvas');
      stripCanvas.setAttribute(
        'aria-label',
        `Bars of the distance ridden in ${units} for each month. The values are in the monthly numbers table.`,
      );
      stripChart = new Chart(
        stripCanvas,
        chartConfig(months, t, {
          datasets: [
            {
              ...barStyle(t),
              label,
              data: months.map((month) => month.distance ?? null),
              backgroundColor: t.distance,
              keyColor: t.distance,
            },
          ],
          value: (y) => `${Math.round(y)} ${units}  ridden`,
          yTicks: 3,
        }),
      );
      charts.push(stripChart);
    }
  };
  toggle.checked = distanceShown.has(key);
  toggle.addEventListener('change', apply);
  if (toggle.checked) apply();
}

function barStyle(t) {
  return {
    borderColor: t.surface,
    borderWidth: { top: 2 },
    borderRadius: 3,
    borderSkipped: 'start',
    inflateAmount: 0,
    categoryPercentage: 1,
    barPercentage: 0.74,
    maxBarThickness: 24,
  };
}

function chartConfig(months, t, { type = 'bar', datasets, stacked = false, value, footer, yTicks = 6 }) {
  return {
    type,
    data: { labels: months.map(({ month }) => monthLabel(month)), datasets },
    options: {
      locale: 'en',
      maintainAspectRatio: false,
      animation: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? false
        : {
            duration: 300,
            onComplete: ({ chart }) => chart.draw(),
          },
      interaction: { mode: 'monthWithValue', intersect: false },
      scales: {
        x: {
          stacked,
          offset: true,
          grid: { display: false },
          border: { color: t.grid },
          ticks: timeTicks(months),
        },
        y: {
          stacked,
          beginAtZero: true,
          grid: { color: t.grid, drawTicks: false },
          border: { display: false },
          ticks: {
            maxTicksLimit: yTicks,
            padding: 8,
            callback(tick, index, ticks) {
              if (tick >= 10000) return `${Math.round(tick / 1000)}K`;
              return Chart.Ticks.formatters.numeric.call(this, tick, index, ticks);
            },
          },
          afterFit: (axis) => {
            axis.width = Y_AXIS_WIDTH;
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: t.tipBg,
          titleColor: t.tipMuted,
          bodyColor: t.tipText,
          footerColor: t.tipText,
          borderColor: t.tipBorder,
          borderWidth: 1,
          padding: 10,
          cornerRadius: 4,
          boxWidth: 12,
          boxHeight: 2,
          boxPadding: 6,
          multiKeyBackground: 'transparent',
          titleFont: { weight: '500' },
          bodyFont: { weight: '500' },
          footerFont: { weight: '600' },
          callbacks: {
            label: (context) => value(context.parsed.y, context.dataset.label),
            labelColor: (context) => ({
              borderColor: context.dataset.keyColor,
              backgroundColor: context.dataset.keyColor,
              borderWidth: 2,
            }),
            footer: footer ? (items) => footer(items.reduce((sum, item) => sum + item.parsed.y, 0)) : undefined,
          },
        },
      },
    },
  };
}

function timeTicks(months) {
  if (months.length <= YEAR_TICKS_FROM) {
    return { maxRotation: 0, autoSkip: true, callback: (_, index) => monthLabel(months[index].month) };
  }
  // Worked out at each layout, because turning a phone changes the width of the chart.
  let measuredWidth = null;
  let named = new Set();
  return {
    maxRotation: 0,
    autoSkip: false,
    callback(_, index) {
      if (this.width !== measuredWidth) {
        measuredWidth = this.width;
        named = namedYears(months, this.width / months.length);
      }
      return named.has(index) ? months[index].month.slice(0, 4) : null;
    },
  };
}

function namedYears(months, pixelsPerMonth) {
  const yearStep = Math.ceil(YEAR_LABEL_WIDTH / (12 * pixelsPerMonth));
  const named = new Set();
  months.forEach(({ month }, index) => {
    if (month.endsWith('01') && Number(month.slice(0, 4)) % yearStep === 0) named.add(index);
  });
  if (Math.min(...named) * pixelsPerMonth >= YEAR_LABEL_WIDTH) named.add(0);
  return named;
}
