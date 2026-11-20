/**
 * <stone-picker>: the pill dropdown of blocks/stone-picker.liquid.
 * Opens and closes the list (click, Escape, click outside, arrow keys) and, when a stone is picked, selects the
 * same value in the product's own variant picker (radio buttons, or the dropdown style), so the theme fetches the
 * new variant, updates price, cart and URL, and the surrounding <variant-live> re-renders this block.
 */
const STONE_OPTION_NAMES = ['stone', 'piedra'];

class StonePicker extends HTMLElement {
  connectedCallback() {
    this.addEventListener('click', this.#handleClick);
    this.addEventListener('keydown', this.#handleKeydown);
    document.addEventListener('click', this.#handleOutsideClick);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.#handleClick);
    this.removeEventListener('keydown', this.#handleKeydown);
    document.removeEventListener('click', this.#handleOutsideClick);
  }

  get #toggle() {
    return /** @type {HTMLButtonElement | null} */ (this.querySelector('[data-stone-toggle]'));
  }

  get #options() {
    return /** @type {HTMLButtonElement[]} */ ([...this.querySelectorAll('[data-stone-value]:not(:disabled)')]);
  }

  /** @param {boolean} open */
  #setOpen(open) {
    this.toggleAttribute('open', open);
    this.#toggle?.setAttribute('aria-expanded', String(open));
    if (open) {
      const selected = this.querySelector('[data-stone-value][aria-selected="true"]:not(:disabled)');
      /** @type {HTMLElement | undefined} */ (selected ?? this.#options[0])?.focus();
    }
  }

  /** @param {MouseEvent} event */
  #handleClick = (event) => {
    const target = /** @type {Element} */ (event.target);
    if (target.closest('[data-stone-toggle]')) {
      this.#setOpen(!this.hasAttribute('open'));
      return;
    }
    const option = /** @type {HTMLButtonElement | null} */ (target.closest('[data-stone-value]'));
    if (!option || option.disabled) return;
    this.#setOpen(false);
    this.#toggle?.focus();
    this.#select(option);
  };

  /** @param {MouseEvent} event */
  #handleOutsideClick = (event) => {
    if (this.hasAttribute('open') && !this.contains(/** @type {Node} */ (event.target))) this.#setOpen(false);
  };

  /** @param {KeyboardEvent} event */
  #handleKeydown = (event) => {
    if (event.key === 'Escape' && this.hasAttribute('open')) {
      event.preventDefault();
      this.#setOpen(false);
      this.#toggle?.focus();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (!this.hasAttribute('open')) {
      this.#setOpen(true);
      return;
    }
    const options = this.#options;
    const index = options.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    const next = event.key === 'ArrowDown' ? Math.min(index + 1, options.length - 1) : Math.max(index - 1, 0);
    options[next]?.focus();
  };

  /** Shows the choice right away, then hands it to the theme's variant picker. @param {HTMLButtonElement} option */
  #select(option) {
    const value = option.dataset.stoneValue ?? '';
    const toggle = this.#toggle;
    if (toggle) {
      const swatch = toggle.querySelector('.stone-picker__swatch');
      const optionSwatch = option.querySelector('.stone-picker__swatch');
      if (swatch instanceof HTMLElement && optionSwatch instanceof HTMLElement) swatch.style.cssText = optionSwatch.style.cssText;
      const current = toggle.querySelector('.stone-picker__current');
      if (current) current.textContent = value;
      const price = toggle.querySelector('.stone-picker__current-price');
      if (price) price.textContent = option.querySelector('.stone-picker__price')?.textContent ?? '';
    }
    for (const row of this.querySelectorAll('[data-stone-value]')) row.setAttribute('aria-selected', String(row === option));

    const scope = this.closest('.shopify-section, dialog') ?? document;
    const radios = /** @type {HTMLInputElement[]} */ ([...scope.querySelectorAll('variant-picker input[type="radio"][data-option-name]')]);
    const radio = radios.find(
      (input) => STONE_OPTION_NAMES.includes((input.dataset.optionName ?? '').trim().toLowerCase()) && input.value === value
    );
    if (radio) {
      if (!radio.checked) radio.click();
      return;
    }
    const select = /** @type {HTMLSelectElement | undefined} */ (
      [...scope.querySelectorAll('variant-picker select')].find((el) =>
        STONE_OPTION_NAMES.some((name) => (el.getAttribute('name') ?? '').toLowerCase() === `options[${name}]`)
      )
    );
    if (select && select.value !== value) {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

if (!customElements.get('stone-picker')) customElements.define('stone-picker', StonePicker);
