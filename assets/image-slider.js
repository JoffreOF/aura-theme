/*
 * Photo slider (blocks/image-slider.liquid): shows one photo at a time and moves to the next every few seconds.
 * Dots jump to a photo. It pauses while the mouse is over it, while a dot has keyboard focus and while the tab is
 * hidden, and it never moves by itself for visitors who ask for reduced motion.
 */
class ImageSlider extends HTMLElement {
  #index = 0;
  #timer = null;
  #paused = false;
  #slides = [];
  #dots = [];

  connectedCallback() {
    this.#slides = [...this.querySelectorAll('[data-slide]')];
    if (this.#slides.length < 2) return;

    const dots = this.querySelector('[data-dots]');
    if (dots) {
      dots.replaceChildren();
      this.#dots = this.#slides.map((_, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'img-slider__dot';
        dot.setAttribute('aria-label', `${i + 1} / ${this.#slides.length}`);
        dot.addEventListener('click', () => {
          this.#go(i);
          this.#restart();
        });
        dots.append(dot);
        return dot;
      });
    }
    this.#go(0);

    this.addEventListener('mouseenter', () => this.#pause(true));
    this.addEventListener('mouseleave', () => this.#pause(false));
    this.addEventListener('focusin', () => this.#pause(true));
    this.addEventListener('focusout', () => this.#pause(false));
    document.addEventListener('visibilitychange', this.#onVisibility);
    this.#restart();
  }

  disconnectedCallback() {
    clearInterval(this.#timer);
    document.removeEventListener('visibilitychange', this.#onVisibility);
  }

  #onVisibility = () => this.#restart();

  #pause(paused) {
    this.#paused = paused;
    this.#restart();
  }

  #restart() {
    clearInterval(this.#timer);
    this.#timer = null;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this.#paused || reduced || document.hidden) return;
    const every = Math.max(Number(this.dataset.interval) || 5000, 2000);
    this.#timer = setInterval(() => this.#go(this.#index + 1), every);
  }

  #go(index) {
    this.#index = (index + this.#slides.length) % this.#slides.length;
    this.#slides.forEach((slide, i) => {
      const active = i === this.#index;
      slide.classList.toggle('is-active', active);
      if (active) slide.removeAttribute('aria-hidden');
      else slide.setAttribute('aria-hidden', 'true');
    });
    this.#dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === this.#index)));
  }
}

if (!customElements.get('image-slider')) customElements.define('image-slider', ImageSlider);
