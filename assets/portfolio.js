/**
 * Portfolio page (sections/portfolio.liquid).
 *
 * The signed-in customer's entries come from the app proxy (GET <proxy>/portfolio), the gold price and its history
 * from the shop metafields printed by Liquid. Everything on screen is computed here:
 *   value today = weight x today's 18k gram price, cost basis = what the entry snapshotted at purchase.
 * Money is exact (BigInt cents); only the chart uses plain numbers.
 * Nothing is stored in the browser. The functions before init() are plain and are tested in Node.
 */

// ---------- exact money ----------

/** "4.10" -> { n: 410n, scale: 2 }. Throws on anything that is not a plain non-negative decimal. */
export function parseDec(text) {
  const s = String(text).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error('bad decimal');
  const [whole, frac = ''] = s.split('.');
  return { n: BigInt(whole + frac), scale: frac.length };
}

/** a x b in whole cents, rounded half up. */
export function productInCents(a, b) {
  const num = a.n * b.n * 100n;
  const den = 10n ** BigInt(a.scale + b.scale);
  return (num * 2n + den) / (2n * den);
}

export function formatMoney(cents, locale = 'en-US') {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const text = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(Number(abs) / 100);
  return negative ? `-${text}` : text;
}

/** "+$41.47" / "-$3.10" */
export function formatSigned(cents, locale = 'en-US') {
  return `${cents >= 0n ? '+' : ''}${formatMoney(cents, locale)}`;
}

export function formatPercent(part, whole) {
  if (whole === 0n) return '0.00%';
  const pct = (Number(part) / Number(whole)) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

/** Price per gram with at least 2 and at most 4 decimals: 100.9 micros -> "$100.90", 96.3629 -> "$96.3629". */
export function formatGramPrice(micros, locale = 'en-US') {
  const value = Number(micros) / 1_000_000;
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
}

/** "4.00" -> "4.0", "0.8" -> "0.8", "4.125" -> "4.125": one decimal at least, trailing zeros trimmed after that. */
export function formatGrams(text) {
  const [whole, frac = ''] = String(text).split('.');
  const trimmed = frac.replace(/0+$/, '');
  return `${whole}.${trimmed === '' ? '0' : trimmed}`;
}

export function sumGrams(weights) {
  let micros = 0n;
  for (const w of weights) {
    const d = parseDec(w);
    micros += (d.n * 1_000_000n) / 10n ** BigInt(d.scale);
  }
  const whole = micros / 1_000_000n;
  const frac = (micros % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return formatGrams(frac ? `${whole}.${frac}` : `${whole}`);
}

// ---------- dates ----------

const LIMA = 'America/Lima';

/** The calendar date (YYYY-MM-DD) of an instant, in Lima time: the zone the store's daily price runs in. */
export function limaDate(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: LIMA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

export function dateMs(date) {
  return Date.parse(`${date}T00:00:00Z`);
}

export function formatDate(date, locale = 'en-US', withYear = true) {
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) }).format(new Date(dateMs(date)));
}

const DAY = 86_400_000;

/** First date shown for a range button, given today. 'all' starts at the first purchase. */
export function rangeStart(range, today, firstPurchase) {
  const days = { '1m': 30, '6m': 182, '1y': 365 }[range];
  if (!days) return firstPurchase;
  const start = new Date(dateMs(today) - days * DAY).toISOString().slice(0, 10);
  return start > firstPurchase ? start : firstPurchase;
}

// ---------- the entries ----------

/** Value today of an entry in cents. */
export function entryValue(entry, gramPrice) {
  return productInCents(parseDec(entry.weightG), parseDec(gramPrice));
}

export function totals(entries, gramPrice) {
  const active = entries.filter((e) => e.status === 'active');
  let value = 0n;
  let cost = 0n;
  for (const e of active) {
    value += entryValue(e, gramPrice);
    cost += BigInt(e.costBasisCents);
  }
  return { count: active.length, grams: sumGrams(active.map((e) => e.weightG)), value, cost, change: value - cost };
}

// ---------- the chart ----------

/** The 18k price on a date: the latest history point on or before it (the first point if the date is earlier). */
export function priceOn(history, date) {
  let found = null;
  for (const [d, p] of history) {
    if (d <= date) found = p;
    else break;
  }
  return found ?? (history.length ? history[0][1] : null);
}

/**
 * Value of the active entries over time, as points {date, value}. Each day is the sum, over the entries owned that
 * day, of weight x that day's price. A purchase date has two points (before and after) so the line steps up.
 * Markers are the purchases inside the window. Returns null without price history or entries.
 */
export function buildSeries({ entries, history, gramPrice, start, end }) {
  const active = entries.filter((e) => e.status === 'active').map((e) => ({ ...e, date: limaDate(e.addedAt), w: Number(e.weightG) }));
  if (!active.length || !history.length) return null;
  const first = active.map((e) => e.date).sort()[0];
  const from = start > first ? start : first;
  const current = Number(gramPrice);
  const priceAt = (d) => (d >= end ? current : priceOn(history, d));
  const owned = (d, inclusive) => active.filter((e) => (inclusive ? e.date <= d : e.date < d));
  const valueAt = (list, d) => list.reduce((sum, e) => sum + e.w * priceAt(d), 0);

  const purchaseDates = [...new Set(active.map((e) => e.date))].filter((d) => d >= from && d <= end);
  const dates = new Set([from, end, ...purchaseDates, ...history.map(([d]) => d).filter((d) => d > from && d < end)]);
  const points = [];
  for (const d of [...dates].sort()) {
    const before = owned(d, false);
    const after = owned(d, true);
    if (before.length && purchaseDates.includes(d) && d !== from) points.push({ date: d, value: valueAt(before, d) });
    points.push({ date: d, value: valueAt(after, d) });
  }
  const markers = purchaseDates.map((d) => {
    const bought = active.filter((e) => e.date === d);
    return { date: d, value: valueAt(owned(d, true), d), entries: bought }; // on the line, where the step lands
  });
  return { points, markers, from, end };
}

/** y range: from zero for the portfolio (steps are new gold), or tightly around the line for one piece. */
export function yDomain(points, floor = 0) {
  const values = points.map((p) => p.value);
  const max = Math.max(...values);
  if (floor === 0) return { min: 0, max: max * 1.12 || 1 };
  const min = Math.min(...values, floor);
  const pad = Math.max((max - min) * 0.2, max * 0.01, 0.5);
  return { min: Math.max(0, min - pad), max: max + pad };
}

/** Where the points sit as percentages of the chart box, plus an SVG path for the line and the area. */
export function chartGeometry(points, domain, from, end) {
  const span = Math.max(dateMs(end) - dateMs(from), 1);
  const x = (d) => ((dateMs(d) - dateMs(from)) / span) * 100;
  const y = (v) => 100 - ((v - domain.min) / (domain.max - domain.min)) * 100;
  const coords = points.map((p) => [x(p.date), y(p.value)]);
  const line = coords.map(([cx, cy], i) => `${i ? 'L' : 'M'}${cx.toFixed(3)} ${cy.toFixed(3)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1][0].toFixed(3)} 100 L${coords[0][0].toFixed(3)} 100 Z`;
  return { x, y, line, area };
}

/**
 * Axis labels: the first and last date, and the start of each month in between (thinned to about five) when the
 * window is longer than two months; otherwise three evenly spaced days. `at` is a percentage of the width.
 */
export function axisTicks(from, end) {
  const a = dateMs(from);
  const b = dateMs(end);
  const edge = (date, at) => ({ date, at, kind: 'edge' });
  if (b <= a) return [edge(from, 0)];
  const out = [edge(from, 0), edge(end, 100)];
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  if ((b - a) / DAY > 62) {
    const months = [];
    const start = new Date(a);
    let cursor = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
    while (cursor < b) {
      months.push(cursor);
      const next = new Date(cursor);
      cursor = Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 1);
    }
    const stride = Math.max(1, Math.ceil(months.length / 5));
    months.forEach((ms, i) => {
      const at = ((ms - a) / (b - a)) * 100;
      if (i % stride === 0 && at >= 14 && at <= 76) out.push({ date: iso(ms), at, kind: 'month' });
    });
  } else {
    for (const at of [25, 50, 75]) out.push(edge(iso(a + ((b - a) * at) / 100), at));
  }
  return out.sort((x, y) => x.at - y.at);
}

// ---------- sample data for designing the page without orders ----------

function builtInSample() {
  const entry = (id, title, variant, category, weightG, micros, date, handle) => ({
    id, orderName: `#10${id}0`, title, variant, category, handle, image: null, weightG, purity: '18k', pricePerGramMicros: micros,
    costBasisCents: Number(productInCents(parseDec(weightG), parseDec(String(micros / 1_000_000)))),
    addedAt: `${date}T15:00:00Z`, status: 'active', statusUpdatedAt: null,
  });
  const anchors = [['2026-04-01', 97.9], ['2026-04-15', 98.4], ['2026-06-20', 100.9], ['2026-08-30', 102.7], ['2026-10-01', 104.57]];
  const history = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [d0, p0] = anchors[i];
    const [d1, p1] = anchors[i + 1];
    const days = (dateMs(d1) - dateMs(d0)) / DAY;
    for (let k = 0; k < days; k += 7) {
      history.push([new Date(dateMs(d0) + k * DAY).toISOString().slice(0, 10), Math.round((p0 + ((p1 - p0) * k) / days) * 100) / 100]);
    }
  }
  history.push(['2026-10-01', 104.57]);
  return {
    entries: [
      entry(1, 'Rolo chain bracelet', null, 'Bracelets', '4.1', 98_400_000, '2026-04-15', 'rolo-chain-bracelet'),
      entry(2, 'Spiral Marquise Ring', 'Size 6', 'Rings', '4.00', 100_900_000, '2026-06-20', 'spiral-marquise-ring'),
      entry(3, 'Halo studs', null, 'Earrings', '0.8', 102_700_000, '2026-08-30', 'halo-studs'),
    ],
    history,
    gramPrice: '104.57',
    updatedAt: '2026-10-01T15:00:00Z',
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A positive plain decimal, or null. */
function positiveDec(text) {
  try {
    const d = parseDec(String(text ?? ''));
    return d.n > 0n ? d : null;
  } catch {
    return null;
  }
}

/**
 * The sample portfolio for designing the page: the pieces typed into the section's sample blocks in the theme editor
 * (name, category, variant, photo, weight, price per gram, date, order number, status). A block with a missing or
 * unreadable value is ignored; with no usable block the three wireframe pieces are used. The price history is
 * drawn straight from each purchase price to today's sample price, so the chart agrees with the cost basis.
 */
export function sampleData(pieces = [], gramPrice = '104.57', today = limaDate(new Date().toISOString())) {
  const todayPrice = positiveDec(gramPrice) ? String(gramPrice).trim() : '104.57';
  const entries = [];
  for (const piece of pieces || []) {
    const weight = positiveDec(piece.weight);
    const price = positiveDec(piece.price);
    const date = String(piece.date ?? '').trim();
    if (!piece.title || !weight || !price || !DATE.test(date) || Number.isNaN(dateMs(date))) continue;
    entries.push({
      id: entries.length + 1,
      orderName: piece.orderName || null,
      title: piece.title,
      variant: piece.variant || null,
      category: piece.category || null,
      handle: null,
      image: piece.image || null,
      weightG: String(piece.weight).trim(),
      purity: '18k',
      pricePerGramMicros: Number((price.n * 1_000_000n) / 10n ** BigInt(price.scale)),
      costBasisCents: Number(productInCents(weight, price)),
      addedAt: `${date}T15:00:00Z`,
      status: piece.status === 'refunded' ? 'refunded' : 'active',
      statusUpdatedAt: null,
    });
  }
  if (!entries.length) return builtInSample();

  const anchors = new Map();
  for (const e of entries) anchors.set(limaDate(e.addedAt), e.pricePerGramMicros / 1_000_000);
  const sorted = [...anchors.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (sorted[sorted.length - 1][0] < today) sorted.push([today, Number(todayPrice)]);
  const history = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const [d0, p0] = sorted[i];
    const [d1, p1] = sorted[i + 1];
    const days = (dateMs(d1) - dateMs(d0)) / DAY;
    for (let k = 0; k < days; k += 7) {
      history.push([new Date(dateMs(d0) + k * DAY).toISOString().slice(0, 10), Math.round((p0 + ((p1 - p0) * k) / days) * 100) / 100]);
    }
  }
  history.push([sorted[sorted.length - 1][0], sorted[sorted.length - 1][1]]);
  return { entries, history, gramPrice: todayPrice, updatedAt: `${today}T15:00:00Z` };
}

// ---------- the page ----------

const fmt = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => (key in values ? String(values[key]) : `{${key}}`));

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Product images come from Shopify's CDN; anything else is ignored. */
function imageUrl(url, width) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !u.hostname.endsWith('shopify.com')) return null;
    u.searchParams.set('width', String(width));
    return u.toString();
  } catch {
    return null;
  }
}

function init(root) {
  const config = JSON.parse(root.querySelector('script[data-config]').textContent);
  const decode = (text) => {
    const area = document.createElement('textarea');
    area.innerHTML = text;
    return area.value;
  };
  for (const key of Object.keys(config.strings)) config.strings[key] = decode(config.strings[key]);
  const t = config.strings;
  const locale = config.locale || 'en-US';
  const $ = (selector, scope = root) => scope.querySelector(selector);
  const $$ = (selector, scope = root) => [...scope.querySelectorAll(selector)];

  const views = { loading: $('[data-loading]'), error: $('[data-error]'), empty: $('[data-empty]'), dashboard: $('[data-dashboard]'), piece: $('[data-piece]') };
  const show = (name, message) => {
    for (const [key, node] of Object.entries(views)) if (node) node.hidden = key !== name;
    if (name === 'error' && views.error) views.error.textContent = message || t.error;
  };

  const today = limaDate(new Date().toISOString());
  const pieceId = new URLSearchParams(window.location.search).get('piece');
  const pieceUrl = (id) => `${window.location.pathname}?piece=${encodeURIComponent(id)}`;

  async function load() {
    if (config.preview) return { ok: true, ...sampleData(config.sample, config.sampleGramPrice) };
    try {
      const query = pieceId && /^\d+$/.test(pieceId) ? `?piece=${pieceId}` : '';
      const response = await fetch(`${config.proxy}/portfolio${query}`, { headers: { Accept: 'application/json' } });
      if (!response.ok) return { ok: false, reason: 'unavailable' };
      const body = await response.json();
      return body.ok ? { ...body, history: config.history, gramPrice: config.gramPrice, updatedAt: config.updatedAt } : body;
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
  }

  // ---- chart ----
  function drawChart(view, series, { floor = 0, costLine = null } = {}) {
    const box = $('[data-chart]', view);
    const axis = $('[data-axis]', view);
    box.textContent = '';
    axis.textContent = '';
    if (!series) {
      box.append(el('p', 'pf-chart__empty', t.noChart));
      return;
    }
    const domain = yDomain(series.points, costLine !== null ? costLine / 100 : floor);
    const geo = chartGeometry(series.points, domain, series.from, series.end);
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', 'pf-chart__svg');
    svg.setAttribute('aria-hidden', 'true');
    for (const at of [20, 40, 60, 80]) {
      const grid = document.createElementNS(NS, 'line');
      grid.setAttribute('x1', '0'); grid.setAttribute('x2', '100'); grid.setAttribute('y1', String(at)); grid.setAttribute('y2', String(at));
      grid.setAttribute('class', 'pf-chart__grid');
      svg.append(grid);
    }
    const area = document.createElementNS(NS, 'path');
    area.setAttribute('d', geo.area); area.setAttribute('class', 'pf-chart__area');
    const line = document.createElementNS(NS, 'path');
    line.setAttribute('d', geo.line); line.setAttribute('class', 'pf-chart__line');
    svg.append(area, line);
    if (costLine !== null) {
      const cost = document.createElementNS(NS, 'line');
      const cy = geo.y(costLine / 100);
      cost.setAttribute('x1', '0'); cost.setAttribute('x2', '100'); cost.setAttribute('y1', String(cy)); cost.setAttribute('y2', String(cy));
      cost.setAttribute('class', 'pf-chart__cost');
      svg.append(cost);
    }
    box.append(svg);

    const tip = el('div', 'pf-tip');
    tip.hidden = true;
    for (const marker of series.markers) {
      const button = el('a', 'pf-marker');
      const first = marker.entries[0];
      const label = marker.entries.length === 1 ? first.title : fmt(t.piecesMany, { count: marker.entries.length });
      const added = formatMoney(marker.entries.reduce((s, e) => s + BigInt(e.costBasisCents), 0n), locale);
      button.style.left = `${geo.x(marker.date)}%`;
      button.style.top = `${geo.y(marker.value)}%`;
      button.setAttribute('aria-label', `${formatDate(marker.date, locale)} · ${label} · ${fmt(t.goldAdded, { amount: added })}`);
      if (!pieceId) button.href = pieceUrl(first.id);
      const showTip = () => {
        tip.textContent = '';
        const thumb = el('span', 'pf-tip__thumb');
        const src = first.image && imageUrl(first.image, 80);
        if (src) {
          const img = document.createElement('img');
          img.src = src; img.alt = ''; img.width = 40; img.height = 40;
          thumb.append(img);
        }
        const text = el('span', 'pf-tip__text');
        text.append(el('strong', '', `${formatDate(marker.date, locale, false)} · ${label}`), el('span', '', fmt(t.goldAdded, { amount: `+${added}` })));
        tip.append(thumb, text);
        tip.style.left = `${Math.min(Math.max(geo.x(marker.date), 18), 82)}%`;
        tip.style.top = `${geo.y(marker.value)}%`;
        tip.hidden = false;
      };
      button.addEventListener('mouseenter', showTip);
      button.addEventListener('focus', showTip);
      button.addEventListener('mouseleave', () => (tip.hidden = true));
      button.addEventListener('blur', () => (tip.hidden = true));
      box.append(button);
    }
    box.append(tip);

    const long = dateMs(series.end) - dateMs(series.from) > 400 * DAY;
    for (const tick of axisTicks(series.from, series.end)) {
      const text =
        tick.kind === 'month'
          ? new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short', ...(long ? { year: '2-digit' } : {}) }).format(new Date(dateMs(tick.date)))
          : formatDate(tick.date, locale, long);
      const label = el('span', '', text);
      label.style.left = `${tick.at}%`;
      axis.append(label);
    }
  }

  function bindRanges(view, onChange) {
    const buttons = $$('[data-range]', view);
    const select = (range) => {
      for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.range === range));
      onChange(range);
    };
    for (const b of buttons) b.addEventListener('click', () => select(b.dataset.range));
    select(config.defaultRange || 'all');
  }

  // ---- dashboard ----
  function renderDashboard(data) {
    const view = views.dashboard;
    const gram = data.gramPrice;
    const sums = totals(data.entries, gram);
    $('[data-card-value]', view).textContent = formatMoney(sums.value, locale);
    $('[data-card-value-sub]', view).textContent = fmt(sums.count === 1 ? t.cardValueSubOne : t.cardValueSub, { grams: sums.grams, count: sums.count });
    $('[data-card-cost]', view).textContent = formatMoney(sums.cost, locale);
    $('[data-card-change]', view).textContent = formatSigned(sums.change, locale);
    $('[data-card-change-sub]', view).textContent = fmt(t.cardChangeSub, { percent: formatPercent(sums.change, sums.cost) });
    $('[data-card-change]', view).classList.toggle('is-negative', sums.change < 0n);

    const history = data.history || [];
    const active = data.entries.filter((e) => e.status === 'active');
    const firstPurchase = active.map((e) => limaDate(e.addedAt)).sort()[0];
    bindRanges(view, (range) => {
      const series = firstPurchase && history.length ? buildSeries({ entries: data.entries, history, gramPrice: gram, start: rangeStart(range, today, firstPurchase), end: today }) : null;
      drawChart(view, series);
    });

    // table of pieces
    const body = $('[data-pieces]', view);
    body.textContent = '';
    for (const e of [...active].sort((a, b) => b.addedAt.localeCompare(a.addedAt))) {
      const value = entryValue(e, gram);
      const change = value - BigInt(e.costBasisCents);
      const row = el('tr', 'pf-row');
      const piece = el('td', 'pf-cell pf-cell--piece');
      piece.dataset.label = t.thPiece;
      const thumb = el('span', 'pf-thumb');
      const src = e.image && imageUrl(e.image, 160);
      if (src) {
        const img = document.createElement('img');
        img.src = src; img.alt = ''; img.loading = 'lazy'; img.width = 64; img.height = 64;
        thumb.append(img);
      }
      const name = el('span', 'pf-piece-name');
      name.append(el('span', 'pf-piece-title', e.title), el('small', '', [e.category, e.variant].filter(Boolean).join(' · ')));
      piece.append(thumb, name);
      const added = el('td', 'pf-cell');
      added.dataset.label = t.thAdded;
      added.append(el('span', '', formatDate(limaDate(e.addedAt), locale)), el('small', '', [t.purchased, e.orderName].filter(Boolean).join(' · ')));
      const cells = [
        [t.thWeight, `${formatGrams(e.weightG)} g`],
        [t.thCost, formatMoney(BigInt(e.costBasisCents), locale)],
        [t.thValue, formatMoney(value, locale), 'pf-cell--strong'],
        [t.thChange, formatPercent(change, BigInt(e.costBasisCents)), change < 0n ? 'is-negative' : ''],
      ].map(([label, text, extra]) => {
        const td = el('td', `pf-cell ${extra || ''}`.trim(), text);
        td.dataset.label = label;
        return td;
      });
      const actions = el('td', 'pf-cell pf-cell--actions');
      const open = el('a', 'pf-link', t.view);
      open.href = pieceUrl(e.id);
      actions.append(open, ' · ', buybackLink(e));
      row.append(piece, added, ...cells, actions);
      body.append(row);
    }

    // history tab: purchases and refunds, newest first
    const log = $('[data-history]', view);
    log.textContent = '';
    for (const e of [...data.entries].sort((a, b) => b.addedAt.localeCompare(a.addedAt))) {
      const item = el('li', 'pf-log__item');
      item.append(
        el('span', 'pf-log__date', formatDate(limaDate(e.addedAt), locale)),
        el('span', 'pf-log__what', `${t.purchased} · ${e.title}${e.orderName ? ` (${fmt(t.rowOrderValue, { order: e.orderName })})` : ''}`),
        el('span', 'pf-log__amount', formatMoney(BigInt(e.costBasisCents), locale)),
      );
      if (e.status === 'refunded') {
        item.classList.add('is-refunded');
        item.append(el('span', 'pf-log__tag', t.refunded));
      }
      log.append(item);
    }

    for (const tab of $$('[data-tab]', view)) {
      tab.addEventListener('click', () => {
        for (const other of $$('[data-tab]', view)) other.setAttribute('aria-selected', String(other === tab));
        $('[data-panel="pieces"]', view).hidden = tab.dataset.tab !== 'pieces';
        $('[data-panel="history"]', view).hidden = tab.dataset.tab !== 'history';
      });
    }
    footnote(view, data);
    show('dashboard');
  }

  function buybackLink(entry) {
    const link = el('a', 'pf-link', t.requestBuyback);
    const body = fmt(t.buybackBody, { id: entry.id, title: entry.title });
    link.href = `mailto:${config.buybackEmail}?subject=${encodeURIComponent(t.buybackSubject)}&body=${encodeURIComponent(body)}`;
    return link;
  }

  function footnote(view, data) {
    const node = $('[data-source]', view);
    if (!node || !data.gramPrice) return;
    const when = data.updatedAt ? formatDate(limaDate(data.updatedAt), locale) : '';
    const price = formatMoney(productInCents(parseDec(data.gramPrice), parseDec('1')), locale);
    node.textContent = fmt(t.footnoteSource, { date: when, price });
  }

  // ---- one piece ----
  function renderPiece(data) {
    const view = views.piece;
    const head = $('[data-head]');
    if (head) head.hidden = true;
    const entry = data.entries.find((e) => String(e.id) === String(pieceId)) || (config.preview ? data.entries[0] : null);
    if (!entry) return show('error', t.notFound);
    const gram = data.gramPrice;
    const value = entryValue(entry, gram);
    const cost = BigInt(entry.costBasisCents);
    const date = limaDate(entry.addedAt);

    const photo = $('[data-photo]', view);
    photo.textContent = '';
    const src = entry.image && imageUrl(entry.image, 800);
    if (src) {
      const img = document.createElement('img');
      img.src = src; img.alt = entry.title; img.width = 400; img.height = 400;
      photo.append(img);
    }
    $('[data-piece-title]', view).textContent = entry.title;
    $('[data-piece-meta]', view).textContent = [entry.category, entry.variant].filter(Boolean).join(' · ');
    $('[data-piece-value]', view).textContent = formatMoney(value, locale);
    const change = value - cost;
    $('[data-piece-change]', view).textContent = fmt(t.sinceDate, { change: formatSigned(change, locale), percent: formatPercent(change, cost), date: formatDate(date, locale, false) });
    $('[data-piece-change]', view).classList.toggle('is-negative', change < 0n);

    const rows = [
      [t.rowAdded, fmt(t.rowAddedValue, { date: formatDate(date, locale) })],
      ...(entry.orderName ? [[t.rowOrder, entry.orderName]] : []),
      [t.rowWeight, fmt(t.rowWeightValue, { grams: formatGrams(entry.weightG) })],
      [t.rowPriceThen, `${formatGramPrice(entry.pricePerGramMicros, locale)} / g`],
      [t.rowCost, formatMoney(cost, locale)],
      [t.rowPriceNow, `${formatGramPrice(Math.round(Number(gram) * 1_000_000), locale)} / g`],
      [t.rowValue, formatMoney(value, locale)],
    ];
    const list = $('[data-piece-rows]', view);
    list.textContent = '';
    for (const [label, text] of rows) {
      const row = el('div', 'pf-facts__row');
      row.append(el('dt', '', label), el('dd', '', text));
      list.append(row);
    }
    const buyback = $('[data-buyback]', view);
    const link = buybackLink(entry);
    buyback.href = link.href;

    const history = data.history || [];
    $('[data-cost-legend]', view).textContent = fmt(t.costLegend, { amount: formatMoney(cost, locale) });
    bindRanges(view, (range) => {
      const series = history.length && entry.status === 'active' ? buildSeries({ entries: [entry], history, gramPrice: gram, start: rangeStart(range, today, date), end: today }) : null;
      if (series) {
        // The line starts at what was paid in gold, not at an approximate price for that day.
        series.points[0] = { date: series.points[0].date, value: Number(cost) / 100 };
      }
      drawChart(view, series, { costLine: Number(cost) });
    });
    footnote(view, data);
    show('piece');
  }

  // ---- go ----
  show('loading');
  load().then((data) => {
    if (!data.ok) {
      if (data.reason === 'signed_out') return show('error', t.signedOut);
      return show('error', t.error);
    }
    if (!data.entries.length) return pieceId ? show('error', t.notFound) : show('empty');
    if (!data.gramPrice) return show('error', t.noPrice);
    if (pieceId || (config.preview && new URLSearchParams(window.location.search).has('piece'))) return renderPiece(data);
    return renderDashboard(data);
  });
}

if (typeof document !== 'undefined') document.querySelectorAll('[data-portfolio]').forEach(init);
