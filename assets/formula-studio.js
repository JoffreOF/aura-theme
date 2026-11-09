// Formula studio: weight slider + gemstones toggle, and the five-part price formula kept up to date.
// The block (blocks/formula-studio.liquid) prints the shop numbers as JSON; this file only does the arithmetic and the text.
// Price = round(weight x 18k gram price x markup, 2): the same formula and rounding as the price job. The 18k gram price
// already holds the 75% purity. The ounce shown is pure gold: gram price x 31.1035 / 0.75. No third-party code.
//
// Every change of the weight is announced to the page with the event aura:weight ({ detail: { weight } }), which the
// Gold terminal uses to show the gold value of a piece of this weight when hovering its chart.

class FormulaStudio extends HTMLElement {
  #config = {};
  #weight = 8;
  #stones = false;

  connectedCallback() {
    const script = this.querySelector('script[data-config]');
    if (!script) return;
    try {
      this.#config = JSON.parse(script.textContent || '{}');
    } catch {
      return;
    }
    this.#weight = Number(this.#config.weight) || 8;

    const slider = this.querySelector('[data-weight]');
    slider?.addEventListener('input', () => {
      this.#weight = Number(slider.value) || this.#weight;
      this.#render();
    });
    for (const button of this.querySelectorAll('[data-stones]')) {
      button.addEventListener('click', () => {
        this.#stones = button.dataset.stones === '1';
        this.#render();
      });
    }
    this.#render();
  }

  #render() {
    const { gram, markup, markupStones, min = 0.5, max = 30 } = this.#config;
    const m = this.#stones ? markupStones : markup;
    const weight = this.#weight;
    const ounce = (gram * 31.1035) / 0.75;
    const price = Math.round(weight * gram * m * 100) / 100;

    const set = (name, text) => {
      for (const el of this.querySelectorAll(`[data-fx="${name}"]`)) el.textContent = text;
    };
    set('weight', weight.toFixed(1));
    set('weight-big', weight.toFixed(1));
    set('ounce', Math.round(ounce).toLocaleString('en-US'));
    set('markup', m.toFixed(2));
    set('markup-caption', (this.#stones ? this.#config.captionStones : this.#config.captionPlain) || '');
    set('price', price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

    const slider = this.querySelector('[data-weight]');
    if (slider) slider.style.setProperty('--f', `${((weight - min) / (max - min)) * 100}%`);
    for (const button of this.querySelectorAll('[data-stones]')) {
      button.setAttribute('aria-pressed', String((button.dataset.stones === '1') === this.#stones));
    }

    document.dispatchEvent(new CustomEvent('aura:weight', { detail: { weight } }));
  }
}

if (!customElements.get('formula-studio')) {
  customElements.define('formula-studio', FormulaStudio);
}
