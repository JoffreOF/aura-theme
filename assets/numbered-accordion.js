// Numbered accordion: with the "Only one row open at a time" setting, opening a row closes the others.
// The opening and closing itself is done by the theme's accordion-custom and the browser's <details>.
class NumberedAccordion extends HTMLElement {
  connectedCallback() {
    // `toggle` does not bubble, so it is listened for in the capture phase
    this.addEventListener('toggle', this.#handleToggle, true);
  }

  disconnectedCallback() {
    this.removeEventListener('toggle', this.#handleToggle, true);
  }

  /**
   * @param {Event} event
   */
  #handleToggle = (event) => {
    if (!this.hasAttribute('data-one-open')) return;

    const opened = event.target;
    if (!(opened instanceof HTMLDetailsElement) || !opened.open) return;

    for (const other of this.querySelectorAll('details[open]')) {
      if (other !== opened) other.open = false;
    }
  };
}

if (!customElements.get('numbered-accordion')) {
  customElements.define('numbered-accordion', NumberedAccordion);
}
