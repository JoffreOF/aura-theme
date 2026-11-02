// Pricing calculator (homepage): weight x today's gold price x markup = price.
// The block (blocks/pricing-calculator.liquid) prints the shop's numbers as data attributes; this file only does the arithmetic
// when the visitor types a weight. It uses the same formula as the price job (docs/BRIEF.md section 3):
//   price      = round( weight x 18k gram price x markup , 2 )
//   gold value = round( weight x 18k gram price , 2 )   (what goes into the customer's portfolio)
// The 18k gram price already contains the 75% purity, so purity is shown but not multiplied again.

class PricingCalculator extends HTMLElement {
  #gram = 0;
  #markup = 0;
  #min = 0.1;
  #max = 100;
  #step = 0.1;
  #symbol = '$';
  #fmt;

  connectedCallback() {
    this.#gram = Number(this.dataset.gram);
    this.#markup = Number(this.dataset.markup);
    this.#min = Number(this.dataset.min) || 0.1;
    this.#max = Number(this.dataset.max) || 100;
    this.#step = Number(this.dataset.step) || 0.1;
    this.#symbol = this.dataset.symbol || '$';
    this.#fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const input = this.querySelector('[data-weight]');
    if (!input || !(this.#gram > 0) || !(this.#markup > 0)) return;

    input.addEventListener('input', () => this.#update());
    input.addEventListener('blur', () => {
      // tidy what was typed: clamp and show it the way it is used
      const value = this.#weight(input.value);
      input.value = String(value);
      this.#update();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        this.#nudge(event.key === 'ArrowUp' ? 1 : -1);
      }
    });
    for (const button of this.querySelectorAll('[data-step]')) {
      button.addEventListener('click', () => this.#nudge(Number(button.dataset.step)));
    }

    this.#update();
  }

  /** The typed weight as a number: "4,1" works, nothing readable falls back to the minimum, and it stays between min and max. */
  #weight(text) {
    const value = Number(String(text).replace(',', '.').trim());
    if (!Number.isFinite(value) || value <= 0) return this.#min;
    return Math.min(this.#max, Math.max(this.#min, Math.round(value * 100) / 100));
  }

  #nudge(direction) {
    const input = this.querySelector('[data-weight]');
    const next = this.#weight(input.value) + direction * this.#step;
    input.value = String(Math.round(Math.min(this.#max, Math.max(this.#min, next)) * 100) / 100);
    this.#update();
  }

  #money(cents) {
    return `${this.#symbol}${this.#fmt.format(cents / 100)}`;
  }

  #update() {
    const input = this.querySelector('[data-weight]');
    const weight = this.#weight(input.value);

    // whole cents, so 0.1 g steps never leave a trail of decimals
    const priceCents = Math.round(weight * this.#gram * this.#markup * 100 + 1e-9);
    const goldCents = Math.round(weight * this.#gram * 100 + 1e-9);

    const price = this.querySelector('[data-price]');
    if (price) price.textContent = this.#money(priceCents);

    const note = this.querySelector('[data-note]');
    if (note) {
      const template = note.dataset.template || '';
      note.replaceChildren();
      const parts = template.split('{gold_value}');
      parts.forEach((part, index) => {
        note.append(document.createTextNode(part));
        if (index < parts.length - 1) {
          const strong = document.createElement('strong');
          strong.textContent = this.#money(goldCents);
          note.append(strong);
        }
      });
    }
  }
}

if (!customElements.get('pricing-calculator')) {
  customElements.define('pricing-calculator', PricingCalculator);
}
