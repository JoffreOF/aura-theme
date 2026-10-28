import { morph } from '@theme/morph';
import { StandardEvents } from '@shopify/events';

/**
 * Wraps server-rendered content that depends on the selected variant (gold breakdown, installments).
 * When a size or option is picked, the theme fetches the updated section; this element takes the
 * matching <variant-live data-block-id="..."> from that HTML and morphs its content in place.
 * Same pattern as <product-inventory>.
 */
class VariantLive extends HTMLElement {
  connectedCallback() {
    this.closest('.shopify-section, dialog')?.addEventListener(StandardEvents.productSelect, this.#handleProductSelect);
  }

  disconnectedCallback() {
    this.closest('.shopify-section, dialog')?.removeEventListener(StandardEvents.productSelect, this.#handleProductSelect);
  }

  /**
   * @param {Event & { promise?: Promise<{ detail?: { html?: Document, newProduct?: { id: string }, productId?: string } }> }} event
   */
  #handleProductSelect = (event) => {
    if (!(event.target instanceof Element) || event.target.closest('product-card')) return;

    event.promise
      ?.then(({ detail }) => {
        if (!detail?.html) return;

        const { html, newProduct } = detail;

        if (newProduct) {
          this.dataset.productId = newProduct.id;
        } else if (detail.productId && detail.productId !== this.dataset.productId) {
          return;
        }

        const next = html.querySelector(`variant-live[data-block-id="${this.dataset.blockId}"]`);
        if (next) morph(this, next, { childrenOnly: true });
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') console.warn('[variant-live] Event promise rejected:', error);
      });
  };
}

if (!customElements.get('variant-live')) {
  customElements.define('variant-live', VariantLive);
}
