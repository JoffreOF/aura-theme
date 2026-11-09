// Sample portfolio table: adds up the rows (blocks/_portfolio-sample-row.liquid) for the summary of
// blocks/portfolio-sample-table.liquid. Each row carries its weight and its gold value then and today as data attributes,
// worked out from the shop's gold price history. No third-party code.

class PortfolioSample extends HTMLElement {
  connectedCallback() {
    this.#update();
    // the theme editor adds, moves and removes rows inside the table
    this.#observer = new MutationObserver(() => this.#update());
    const body = this.querySelector('tbody');
    if (body) this.#observer.observe(body, { childList: true });
  }

  disconnectedCallback() {
    this.#observer?.disconnect();
  }

  #observer;

  #update() {
    const rows = Array.from(this.querySelectorAll('tr[data-weight]'));
    let fine = 0;
    let now = 0;
    let then = 0;
    for (const row of rows) {
      fine += Number(row.dataset.weight) * 0.75;
      now += Number(row.dataset.now);
      then += Number(row.dataset.then);
    }

    const money = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const set = (name, text) => {
      const el = this.querySelector(`[data-sum="${name}"]`);
      if (el) el.textContent = text;
      return el;
    };
    set('pieces', String(rows.length));
    set('fine', `${fine.toFixed(2)} g`);
    set('value', money(now));

    const diff = now - then;
    const sign = diff >= 0 ? '+' : '−';
    const change = set('change', `${sign}${money(Math.abs(diff))}`);
    const pct = set('change-pct', then ? `${sign}${Math.abs((diff / then) * 100).toFixed(2)}%` : '');
    const direction = diff >= 0 ? 'up' : 'down';
    if (change) change.dataset.direction = direction;
    if (pct) pct.dataset.direction = direction;
  }
}

if (!customElements.get('portfolio-sample')) {
  customElements.define('portfolio-sample', PortfolioSample);
}
