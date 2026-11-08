class FaqCategories extends HTMLElement {
  connectedCallback() {
    this.panels = Array.from(this.querySelectorAll('[data-faq-panel]'));
    if (!this.panels.length) return;
    this.#buildMenu();
    this.links = Array.from(this.querySelectorAll('[data-faq-link]'));

    this.addEventListener('click', this.#onClick);
    window.addEventListener('hashchange', this.#onHashChange);
    // In the theme editor, selecting a category block shows it.
    this.addEventListener('shopify:block:select', this.#onBlockSelect);

    const fromHash = this.#idFromHash();
    this.#show(fromHash);
    if (fromHash) requestAnimationFrame(() => this.scrollIntoView({ block: 'start' }));
  }

  disconnectedCallback() {
    window.removeEventListener('hashchange', this.#onHashChange);
  }

  // A section cannot read the settings of its theme blocks, so the menu is built here from the category blocks.
  #buildMenu() {
    const list = this.querySelector('[data-faq-list]');
    if (!list) return;
    list.replaceChildren();
    this.panels.forEach((panel) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `#${panel.id}`;
      link.setAttribute('data-faq-link', '');
      link.className = list.dataset.linkClass || '';
      if (list.dataset.linkStyle) link.setAttribute('style', list.dataset.linkStyle);
      link.textContent = panel.dataset.faqTitle || panel.querySelector('h2')?.textContent || panel.id;
      item.append(link);
      list.append(item);
    });
  }

  #idFromHash() {
    try {
      const id = decodeURIComponent(window.location.hash.slice(1));
      return this.panels.some((panel) => panel.id === id) ? id : '';
    } catch {
      return '';
    }
  }

  #show(id) {
    const target = this.panels.find((panel) => panel.id === id) || this.panels[0];
    this.panels.forEach((panel) => {
      panel.hidden = panel !== target;
    });
    this.links.forEach((link) => {
      const active = link.getAttribute('href') === `#${target.id}`;
      if (active) {
        link.setAttribute('aria-current', 'true');
        link.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } else {
        link.removeAttribute('aria-current');
      }
    });
    this.setAttribute('data-faq-ready', '');
  }

  #onClick = (event) => {
    const link = event.target.closest('[data-faq-link]');
    if (!link) return;
    event.preventDefault();
    const id = link.getAttribute('href').slice(1);
    this.#show(id);
    // replaceState does not fire hashchange, and it keeps the browser's Back button for real navigation
    history.replaceState(null, '', `#${id}`);
  };

  #onHashChange = () => {
    const id = this.#idFromHash();
    if (!id) return;
    this.#show(id);
    this.scrollIntoView({ block: 'start' });
  };

  #onBlockSelect = (event) => {
    const panel = event.target.closest?.('[data-faq-panel]');
    if (panel) this.#show(panel.id);
  };
}

if (!customElements.get('faq-categories')) {
  customElements.define('faq-categories', FaqCategories);
}
