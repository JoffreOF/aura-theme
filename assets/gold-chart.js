// Gold chart: XAU/USD (pure gold per troy ounce) over time, with range tabs and a hover / drag read-out.
// The block (blocks/gold-chart.liquid) prints the data as JSON: [[ "YYYY-MM-DD", ounce price ], ...], worked out from
// gold.price_history (18k price per gram) as gram price x 31.1035 / 0.75. This file only draws it. No third-party code.
//
// A range tab is shown only when the history really covers it: it must reach back to the start of the window and hold
// enough points (see RANGES), so "1 Week" does not appear with two days of data.

const DAY = 86400000;
const NS = 'http://www.w3.org/2000/svg';

/** key, label key suffix, window in days (null = all history), minimum points inside the window */
const RANGES = [
  { key: 'w1', days: 7, min: 5 },
  { key: 'm1', days: 30, min: 8 },
  { key: 'm3', days: 91, min: 8 },
  { key: 'm6', days: 182, min: 6 },
  { key: 'y1', days: 365, min: 8 },
  { key: 'y5', days: 1826, min: 20 },
  { key: 'max', days: null, min: 12 },
];

/** A round step for the axis (1, 2, 2.5, 5 x 10^n). */
function niceStep(rough) {
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const f = rough / pow;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * pow;
}

class GoldChart extends HTMLElement {
  /** @type {{ t: number, price: number, date: string }[]} */
  #points = [];
  #config = {};
  #range = 'y1';
  #series = [];
  #baseline = 0;
  #hover = -1;
  #observer;
  #fmt;

  connectedCallback() {
    const script = this.querySelector('script[data-config]');
    if (!script) return;

    try {
      this.#config = JSON.parse(script.textContent || '{}');
    } catch {
      return;
    }

    this.#points = (this.#config.points || [])
      .map(([date, price]) => ({ date, price: Number(price), t: Date.parse(`${date}T00:00:00Z`) }))
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.price))
      .sort((a, b) => a.t - b.t);

    if (this.#points.length < 2) return;

    this.#fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    this.#buildTabs();
    this.#selectRange(this.#config.defaultRange || 'y1');

    this.#observer = new ResizeObserver(() => this.#draw());
    this.#observer.observe(this.querySelector('[data-plot]'));
  }

  disconnectedCallback() {
    this.#observer?.disconnect();
  }

  /** Which ranges the history can really show. */
  #availableRanges() {
    const end = this.#points[this.#points.length - 1].t;
    const first = this.#points[0].t;
    return RANGES.filter((r) => {
      if (!this.#config.hideShort) return true;
      const start = r.days === null ? first : end - r.days * DAY;
      // the history must reach back to the start of the window (a few days of slack: old points are monthly)
      if (r.days !== null && first > start + 3 * DAY) return false;
      const inside = this.#points.filter((p) => p.t >= start).length;
      return inside >= r.min;
    });
  }

  #windowOf(range) {
    const end = this.#points[this.#points.length - 1].t;
    const start = range.days === null ? this.#points[0].t : end - range.days * DAY;
    return { start, end };
  }

  /** Price on a date: the last point on or before it (the first point if the date is earlier). */
  #priceOn(t) {
    let found = this.#points[0].price;
    for (const p of this.#points) {
      if (p.t <= t) found = p.price;
      else break;
    }
    return found;
  }

  #buildTabs() {
    const tabs = this.querySelector('[data-tabs]');
    const strings = this.#config.strings || {};
    tabs.textContent = '';

    for (const range of this.#availableRanges()) {
      const { start } = this.#windowOf(range);
      const last = this.#points[this.#points.length - 1].price;
      const base = range.days === null ? this.#points[0].price : this.#priceOn(start);
      const change = base ? ((last - base) / base) * 100 : 0;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gold-chart__tab';
      button.dataset.range = range.key;
      button.setAttribute('aria-pressed', 'false');

      const long = document.createElement('span');
      long.className = 'gold-chart__tab-long';
      long.textContent = strings[`long_${range.key}`] || range.key;
      const short = document.createElement('span');
      short.className = 'gold-chart__tab-short';
      short.textContent = strings[`short_${range.key}`] || range.key;
      const chg = document.createElement('span');
      chg.className = 'gold-chart__tab-change';
      chg.textContent = `${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%`;

      button.append(long, short, chg);
      button.addEventListener('click', () => this.#selectRange(range.key));
      tabs.append(button);
    }
  }

  #selectRange(key) {
    const available = this.#availableRanges().map((r) => r.key);
    if (!available.length) return;
    this.#range = available.includes(key) ? key : available.includes('y1') ? 'y1' : available[available.length - 1];

    for (const button of this.querySelectorAll('.gold-chart__tab')) {
      button.setAttribute('aria-pressed', String(button.dataset.range === this.#range));
    }

    const range = RANGES.find((r) => r.key === this.#range);
    const { start, end } = this.#windowOf(range);
    this.#baseline = range.days === null ? this.#points[0].price : this.#priceOn(start);
    this.#series = [{ t: start, price: this.#baseline, date: '' }, ...this.#points.filter((p) => p.t > start && p.t <= end)];
    if (range.days === null) this.#series = this.#points.slice();
    this.#hover = -1;
    this.#draw();
  }

  #money(value) {
    return `${this.#config.symbol || '$'}${this.#fmt.format(value)}`;
  }

  #dateLabel(t, withYear = false) {
    return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
  }

  /** The big price and the line under it (shown on mobile; the hovered day replaces the latest one). */
  #updateHeader() {
    const strings = this.#config.strings || {};
    const price = this.querySelector('[data-price]');
    const sub = this.querySelector('[data-sub]');
    if (!price || !sub) return;

    const index = this.#hover >= 0 ? this.#hover : this.#series.length - 1;
    const point = this.#series[index];
    const change = this.#baseline ? ((point.price - this.#baseline) / this.#baseline) * 100 : 0;
    price.textContent = this.#money(point.price);
    const arrow = change >= 0 ? '▲' : '▼';
    const when = this.#hover >= 0 && point.date ? this.#dateLabel(point.t, true) : strings[`past_${this.#range}`] || '';
    sub.textContent = `${arrow} ${Math.abs(change).toFixed(2)}% · ${when}`;
  }

  #draw() {
    const plot = this.querySelector('[data-plot]');
    if (!plot || !this.#series.length) return;

    const width = Math.max(240, Math.round(plot.clientWidth));
    const height = Math.max(120, Math.round(plot.clientHeight));
    const compact = width < 560;
    const axis = compact ? 0 : 64;
    const bottom = 26;
    const top = 10;
    const plotW = width - axis - 4;
    const plotH = height - bottom - top;

    const series = this.#series;
    const t0 = series[0].t;
    const t1 = series[series.length - 1].t;
    const span = Math.max(1, t1 - t0);

    let lo = Math.min(...series.map((p) => p.price));
    let hi = Math.max(...series.map((p) => p.price));
    const pad = (hi - lo || hi * 0.02) * 0.08;
    lo -= pad;
    hi += pad;
    const step = niceStep((hi - lo) / 4);
    const yMin = Math.floor(lo / step) * step;
    const yMax = Math.ceil(hi / step) * step;

    const x = (t) => 2 + ((t - t0) / span) * plotW;
    const y = (price) => top + (1 - (price - yMin) / (yMax - yMin)) * plotH;

    // today's price: the dashed line and the tag on the right (worked out first so the axis can leave room for the tag)
    const latest = series[series.length - 1].price;
    const ly = y(latest);

    // grid and axis labels
    let grid = '';
    for (let v = yMin; v <= yMax + step / 2; v += step) {
      const yy = y(v).toFixed(1);
      grid += `<line class="gc-grid" x1="2" x2="${width - axis - 2}" y1="${yy}" y2="${yy}"/>`;
      // an axis label the tag would cover is left out
      if (!compact && Math.abs(Number(yy) - ly) >= 13) grid += `<text class="gc-axis" x="${width - axis + 8}" y="${(Number(yy) + 4).toFixed(1)}">${Math.round(v).toLocaleString('en-US')}</text>`;
    }

    // x labels
    const days = span / DAY;
    const count = compact ? 5 : 6;
    let labels = '';
    for (let i = 0; i < count; i++) {
      const t = t0 + (span * i) / (count - 1);
      const date = new Date(t);
      let text;
      if (days <= 100) text = this.#dateLabel(t);
      else if (days <= 800) text = date.getUTCMonth() === 0 ? String(date.getUTCFullYear()) : date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
      else text = String(date.getUTCFullYear());
      const anchor = i === 0 ? 'start' : i === count - 1 ? 'end' : 'middle';
      labels += `<text class="gc-axis" text-anchor="${anchor}" x="${x(t).toFixed(1)}" y="${height - 6}">${text}</text>`;
    }

    // line and area
    const coords = series.map((p) => `${x(p.t).toFixed(1)} ${y(p.price).toFixed(1)}`);
    const line = `M${coords.join(' L')}`;
    const area = `${line} L${x(t1).toFixed(1)} ${(top + plotH).toFixed(1)} L${x(t0).toFixed(1)} ${(top + plotH).toFixed(1)} Z`;

    let dash = `<line class="gc-dash" x1="2" x2="${width - axis - 2}" y1="${ly.toFixed(1)}" y2="${ly.toFixed(1)}"/>`;
    if (!compact) {
      const label = this.#fmt.format(latest);
      dash += `<rect class="gc-tag" x="${width - axis + 2}" y="${(ly - 10).toFixed(1)}" width="60" height="20" rx="1"/>` +
        `<text class="gc-tag-text" x="${width - axis + 32}" y="${(ly + 4).toFixed(1)}" text-anchor="middle">${label}</text>`;
    }

    plot.querySelector('svg')?.remove();
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', (this.#config.strings || {}).label || 'Gold price chart');
    svg.innerHTML = `${grid}<path class="gc-area" d="${area}"/><path class="gc-line" d="${line}"/>${dash}${labels}` +
      `<line class="gc-cursor" data-cursor y1="${top}" y2="${top + plotH}" hidden/><circle class="gc-dot" data-dot r="4.5" hidden/>`;
    plot.prepend(svg);

    // hover / drag: the nearest point to the pointer
    const cursor = svg.querySelector('[data-cursor]');
    const dot = svg.querySelector('[data-dot]');
    const tooltip = plot.querySelector('[data-tooltip]');

    const show = (index) => {
      this.#hover = index;
      const p = series[index];
      const px = x(p.t);
      const py = y(p.price);
      cursor.setAttribute('x1', px.toFixed(1));
      cursor.setAttribute('x2', px.toFixed(1));
      cursor.hidden = false;
      dot.setAttribute('cx', px.toFixed(1));
      dot.setAttribute('cy', py.toFixed(1));
      dot.hidden = false;
      if (tooltip) {
        tooltip.textContent = `${p.date ? this.#dateLabel(p.t, true) : this.#dateLabel(p.t)} · ${this.#money(p.price)}`;
        tooltip.hidden = false;
        const w = tooltip.offsetWidth;
        tooltip.style.left = `${Math.min(Math.max(px - w / 2, 0), width - w)}px`;
        tooltip.style.top = `${Math.max(py - 42, 0)}px`;
      }
      this.#updateHeader();
    };
    const hide = () => {
      this.#hover = -1;
      cursor.hidden = true;
      dot.hidden = true;
      if (tooltip) tooltip.hidden = true;
      this.#updateHeader();
    };
    const nearest = (clientX) => {
      const rect = svg.getBoundingClientRect();
      const t = t0 + ((clientX - rect.left - 2) / plotW) * span;
      let best = 0;
      let bestDistance = Infinity;
      series.forEach((p, i) => {
        const d = Math.abs(p.t - t);
        if (d < bestDistance) {
          bestDistance = d;
          best = i;
        }
      });
      return best;
    };

    const surface = document.createElementNS(NS, 'rect');
    surface.setAttribute('class', 'gc-surface');
    surface.setAttribute('x', '0');
    surface.setAttribute('y', '0');
    surface.setAttribute('width', String(width - axis));
    surface.setAttribute('height', String(height));
    svg.append(surface);
    surface.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
    surface.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
    surface.addEventListener('pointerleave', hide);
    surface.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') hide();
    });
    surface.addEventListener('pointercancel', hide);

    if (this.#hover >= 0 && this.#hover < series.length) show(this.#hover);
    else this.#updateHeader();
  }
}

if (!customElements.get('gold-chart')) {
  customElements.define('gold-chart', GoldChart);
}
