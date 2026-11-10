// Gold education interactions. Each element also starts after an editor redraw.
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class GoldReasons extends HTMLElement {
  connectedCallback() {
    this.lifecycle?.abort();
    this.lifecycle = new AbortController();
    const { signal } = this.lifecycle;
    this.panels = [...this.querySelectorAll('[data-reason]')];
    if (!this.panels.length) return;
    this.duration = Number(this.dataset.duration) || 9000;
    this.remaining = this.duration;
    this.index = 0;
    this.manual = false;
    this.hovered = false;
    this.focused = false;
    this.visible = false;
    this.paused = false;
    this.motionButton = this.querySelector('[data-motion]');
    this.desktop = matchMedia('(min-width: 750px)');
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.select(0);
    this.setAttribute('data-ready', '');
    this.addEventListener('click', (event) => {
      const button = event.target.closest('[data-reason-button]');
      if (button) {
        const index = this.panels.findIndex(panel => panel.contains(button));
        if (index < 0) return;
        this.manual = true;
        this.select(index);
        this.sync();
      } else if (event.target.closest('[data-motion]')) {
        this.paused = !this.paused;
        this.sync();
      }
    }, { signal });
    this.addEventListener('keydown', (event) => {
      if (!event.target.matches('[data-reason-button]')) return;
      const current = this.panels.findIndex(panel => panel.contains(event.target));
      let next;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % this.panels.length;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current + this.panels.length - 1) % this.panels.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = this.panels.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      this.manual = true;
      this.select(next);
      this.panels[next].querySelector('[data-reason-button]').focus();
      this.sync();
    }, { signal });
    this.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      this.hovered = true;
      this.sync();
    }, { signal });
    this.addEventListener('pointerleave', () => { this.hovered = false; this.sync(); }, { signal });
    this.addEventListener('focusin', () => { this.focused = true; this.sync(); }, { signal });
    this.addEventListener('focusout', (event) => {
      this.focused = this.contains(event.relatedTarget);
      this.sync();
    }, { signal });
    this.addEventListener('shopify:block:select', (event) => {
      const panel = event.target.closest('[data-reason]');
      const index = this.panels.indexOf(panel);
      if (index >= 0) { this.manual = true; this.select(index); this.sync(); }
    }, { signal });
    document.addEventListener('visibilitychange', () => this.sync(), { signal });
    this.desktop.addEventListener('change', () => this.sync(), { signal });
    this.motion.addEventListener('change', () => this.sync(), { signal });
    if (typeof window.IntersectionObserver === 'function') {
      this.observer = new IntersectionObserver(entries => {
        this.visible = entries[0].isIntersecting;
        this.sync();
      }, { threshold: 0.35 });
      this.observer.observe(this.querySelector('.ga-reasons__list'));
    } else {
      this.visible = true;
    }
    this.sync();
  }

  select(index) {
    this.stop();
    // Keep focus on a visible control if a panel is closed programmatically.
    const oldBody = this.panels[this.index]?.querySelector('[data-reason-body]');
    if (oldBody?.contains(document.activeElement)) this.panels[this.index].querySelector('[data-reason-button]').focus();
    this.index = index;
    this.remaining = this.duration;
    this.panels.forEach((panel, i) => {
      panel.toggleAttribute('data-active', i === index);
      panel.querySelector('[data-reason-button]').setAttribute('aria-expanded', String(i === index));
      panel.querySelector('[data-reason-body]').hidden = i !== index;
    });
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.remaining = Math.max(0, this.remaining - (performance.now() - this.started));
    }
    this.timer = null;
    this.removeAttribute('data-running');
  }

  sync() {
    const automatic = this.dataset.autoplay === 'true' && !this.manual && this.desktop.matches && !this.motion.matches && this.panels.length > 1;
    const running = automatic && !this.paused && !this.hovered && !this.focused && this.visible && !document.hidden;
    this.toggleAttribute('data-automatic', automatic);
    if (this.motionButton) {
      this.motionButton.hidden = !automatic;
      this.motionButton.textContent = this.paused ? this.motionButton.dataset.resume : this.motionButton.dataset.pause;
    }
    if (!running) { this.stop(); return; }
    if (this.timer) return;
    this.setAttribute('data-running', '');
    this.started = performance.now();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.select((this.index + 1) % this.panels.length);
      this.sync();
    }, this.remaining);
  }

  disconnectedCallback() {
    this.stop();
    this.observer?.disconnect();
    this.lifecycle?.abort();
    this.removeAttribute('data-ready');
    this.removeAttribute('data-automatic');
    this.panels?.forEach(panel => { panel.querySelector('[data-reason-body]').hidden = false; });
  }
}

class GoldPurity extends HTMLElement {
  connectedCallback() {
    this.lifecycle?.abort();
    this.lifecycle = new AbortController();
    const { signal } = this.lifecycle;
    this.karats = [...this.querySelectorAll('[data-karat]')];
    if (!this.karats.length) return;
    this.select(this.karats.find(karat => karat.hasAttribute('data-default')) || this.karats[0]);
    this.setAttribute('data-ready', '');
    this.addEventListener('click', (event) => {
      const button = event.target.closest('[data-karat-button]');
      if (button) this.select(button.closest('[data-karat]'));
    }, { signal });
    this.addEventListener('keydown', (event) => {
      if (!event.target.matches('[data-karat-button]')) return;
      const index = this.karats.findIndex(karat => karat.contains(event.target));
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % this.karats.length;
      if (event.key === 'ArrowLeft') next = (index + this.karats.length - 1) % this.karats.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = this.karats.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      this.select(this.karats[next]);
      this.karats[next].querySelector('[data-karat-button]').focus();
    }, { signal });
    this.addEventListener('shopify:block:select', (event) => {
      const karat = event.target.closest('[data-karat]');
      if (this.karats.includes(karat)) this.select(karat);
    }, { signal });
    if (reducedMotion() || typeof window.IntersectionObserver !== 'function') this.setAttribute('data-filled', '');
    else {
      this.observer = new IntersectionObserver(entries => {
        if (!entries[0].isIntersecting) return;
        this.setAttribute('data-filled', '');
        this.observer.disconnect();
      }, { threshold: 0.3 });
      this.observer.observe(this);
    }
  }

  select(target) {
    this.karats.forEach(karat => {
      const selected = karat === target;
      karat.querySelector('[data-karat-button]').setAttribute('aria-pressed', String(selected));
      karat.querySelector('[data-karat-detail]').hidden = !selected;
    });
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    this.lifecycle?.abort();
    this.removeAttribute('data-ready');
    this.karats?.forEach(karat => { karat.querySelector('[data-karat-detail]').hidden = false; });
  }
}

class GoldCrossSections extends HTMLElement {
  connectedCallback() {
    this.lifecycle?.abort();
    this.lifecycle = new AbortController();
    const { signal } = this.lifecycle;
    this.rows = [...this.querySelectorAll('[data-cross-row]')];
    this.buttons = [...this.querySelectorAll('[data-wear]')];
    if (!this.rows.length || this.buttons.length !== 2) return;
    this.touched = false;
    this.startedPreview = false;
    this.remaining = Number(this.dataset.delay) || 3000;
    this.visible = false;
    this.hovered = false;
    this.focused = false;
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.setWear(false);
    this.querySelector('[data-wear-controls]').hidden = false;
    this.addEventListener('click', event => {
      const button = event.target.closest('[data-wear]');
      if (!button) return;
      this.touched = true;
      this.stop();
      this.setWear(button.dataset.wear === 'true');
    }, { signal });
    this.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch') return;
      this.hovered = true;
      this.sync();
    }, { signal });
    this.addEventListener('pointerleave', () => { this.hovered = false; this.sync(); }, { signal });
    this.addEventListener('focusin', () => { this.focused = true; this.sync(); }, { signal });
    this.addEventListener('focusout', event => { this.focused = this.contains(event.relatedTarget); this.sync(); }, { signal });
    this.addEventListener('shopify:block:select', () => { this.touched = true; this.stop(); }, { signal });
    document.addEventListener('visibilitychange', () => this.sync(), { signal });
    this.motion.addEventListener('change', () => this.sync(), { signal });
    if (typeof window.IntersectionObserver === 'function') {
      this.observer = new IntersectionObserver(entries => {
        this.visible = entries[0].isIntersecting;
        this.sync();
      }, { threshold: 0.25 });
      this.observer.observe(this.querySelector('.ga-cross__rows'));
    }
  }

  setWear(worn) {
    this.toggleAttribute('data-worn', worn);
    this.buttons.forEach(button => button.setAttribute('aria-pressed', String((button.dataset.wear === 'true') === worn)));
    this.rows.forEach(row => {
      const status = row.querySelector('[data-status]');
      status.textContent = worn ? status.dataset.worn : status.dataset.day;
    });
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.remaining = Math.max(0, this.remaining - (performance.now() - this.started));
    }
    this.timer = null;
  }

  sync() {
    const running = this.dataset.autoWear === 'true' && !this.touched && !this.startedPreview && !this.motion.matches && this.visible && !this.hovered && !this.focused && !document.hidden;
    if (!running) { this.stop(); return; }
    if (this.timer) return;
    this.started = performance.now();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.startedPreview = true;
      this.setWear(true);
    }, this.remaining);
  }

  disconnectedCallback() {
    this.stop();
    this.observer?.disconnect();
    this.lifecycle?.abort();
  }
}

for (const [name, element] of [['gold-reasons', GoldReasons], ['gold-purity', GoldPurity], ['gold-cross-sections', GoldCrossSections]]) {
  if (!customElements.get(name)) customElements.define(name, element);
}
