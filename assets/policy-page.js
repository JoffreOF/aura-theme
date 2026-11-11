/*
 * Policy page (Settings > Policies in Shopify admin: terms, privacy, shipping, refund).
 * Shopify draws these pages itself (a title and the text you wrote), so there is no section to edit. This script
 * rebuilds that text into the Aura layout, using only the headings of the policy text:
 *   h1 = title of a language version (a second h1 starts the second language and turns on the English / Español switch)
 *   h2 = section (numbered, listed in "On this page" and in the phone dropdown)
 *   h3 = sub-section (numbered 1.1, 1.2 ...)
 * A paragraph that starts with "Last updated" / "Última actualización" is moved under the title.
 * If anything goes wrong the original Shopify page is left exactly as it was.
 * The words around the text (On this page, Other policies ...) come from locales/en.default.json > policy_page.
 */
const DATA = (() => {
  try {
    return JSON.parse(document.getElementById('PolicyPageData')?.textContent || '{}');
  } catch (error) {
    return {};
  }
})();

const slug = (text) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const NUMBER_PREFIX = /^\d+(\.\d+)*\.?\s+/;
const UPDATED = /^\s*(last updated|última actualización|ultima actualizacion|ultima actualización)/i;
const word = (key, index) => (Array.isArray(DATA[key]) ? DATA[key][index] ?? DATA[key][0] : DATA[key]) || '';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Cuts the policy text into language versions, every h1 starts a new one. */
function splitLanguages(nodes, fallbackTitle) {
  const languages = [];
  let current = null;
  for (const node of nodes) {
    if (node.tagName === 'H1') {
      current = { title: node.textContent.trim(), nodes: [] };
      languages.push(current);
    } else {
      if (!current) {
        current = { title: fallbackTitle, nodes: [] };
        languages.push(current);
      }
      current.nodes.push(node);
    }
  }
  return languages;
}

/** Splits one language into intro paragraphs and numbered sections (h2) with numbered sub-sections (h3). */
function structure(language) {
  const intro = [];
  const sections = [];
  let updated = '';
  let section = null;
  let sub = 0;
  const used = new Set();
  const uniqueId = (base) => {
    let id = base || 'section';
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return id;
  };
  for (const node of language.nodes) {
    if (node.tagName === 'H2') {
      const title = node.textContent.replace(NUMBER_PREFIX, '').trim();
      section = { id: uniqueId(slug(title)), title, number: sections.length + 1, nodes: [] };
      sections.push(section);
      sub = 0;
      continue;
    }
    if (node.tagName === 'H3' && section) {
      sub += 1;
      const title = node.textContent.replace(NUMBER_PREFIX, '').trim();
      node.textContent = '';
      const number = el('span', 'policy-page__sub-number', `${section.number}.${sub}.`);
      node.append(number, ` ${title}`);
      node.id = uniqueId(slug(`${section.title}-${title}`));
      section.nodes.push(node);
      continue;
    }
    if (!section && !updated && UPDATED.test(node.textContent)) {
      updated = node.textContent.trim();
      continue;
    }
    (section ? section.nodes : intro).push(node);
  }
  return { intro, sections, updated };
}

function othersNav(index, className) {
  const current = location.pathname.replace(/\/$/, '');
  const links = (DATA.others || []).filter((policy) => policy.url.replace(/\/$/, '') !== current);
  if (!links.length) return null;
  const nav = el('nav', className);
  nav.setAttribute('aria-label', word('other_policies', index));
  nav.append(el('p', 'policy-page__label', word('other_policies', index)));
  const list = el('ul', 'policy-page__others');
  for (const policy of links) {
    const item = el('li');
    const link = el('a', '', policy.title);
    link.href = policy.url;
    item.append(link);
    list.append(item);
  }
  nav.append(list);
  return nav;
}

function buildLanguage(language, index) {
  const { intro, sections, updated } = structure(language);
  const wrapper = el('div', 'policy-page__language');
  wrapper.dataset.language = String(index);
  wrapper.setAttribute('lang', index === 1 ? 'es' : 'en');
  wrapper.dataset.updated = updated;
  wrapper.dataset.title = language.title;

  const layout = el('div', 'policy-page__layout');
  const side = el('aside', 'policy-page__side');

  if (sections.length > 1) {
    const toc = el('nav', 'policy-page__toc');
    toc.setAttribute('aria-label', word('on_this_page', index));
    toc.append(el('p', 'policy-page__label', word('on_this_page', index)));
    const list = el('ol', 'policy-page__toc-list');
    for (const section of sections) {
      const item = el('li');
      const link = el('a', '', `${section.number}. ${section.title}`);
      link.href = `#${section.id}`;
      link.dataset.target = section.id;
      item.append(link);
      list.append(item);
    }
    toc.append(list);
    side.append(toc);

    const jump = el('div', 'policy-page__jump');
    const label = el('label', 'policy-page__label', word('jump_to', index));
    const select = el('select', 'policy-page__select');
    const selectId = `policy-jump-${index}`;
    select.id = selectId;
    label.setAttribute('for', selectId);
    for (const section of sections) {
      const option = el('option', '', `${section.number}. ${section.title}`);
      option.value = section.id;
      select.append(option);
    }
    select.addEventListener('change', () => {
      const target = document.getElementById(select.value);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', `#${select.value}`);
      }
    });
    jump.append(label, select);
    layout.append(jump);
  }

  const sideOthers = othersNav(index, 'policy-page__others-nav policy-page__others-nav--side');
  if (sideOthers) side.append(sideOthers);

  const body = el('div', 'policy-page__body rte');
  if (intro.length) {
    const introBox = el('div', 'policy-page__intro');
    introBox.append(...intro);
    body.append(introBox);
  }
  for (const section of sections) {
    const block = el('section', 'policy-page__section');
    block.setAttribute('aria-labelledby', section.id);
    const heading = el('h2', 'policy-page__heading');
    heading.id = section.id;
    heading.append(el('span', 'policy-page__number', `${section.number}.`), ` ${section.title}`);
    block.append(heading, ...section.nodes);
    body.append(block);
  }

  const note = el('p', 'policy-page__contact');
  note.innerHTML = word('contact_note', index);
  body.append(note);

  layout.prepend(side);
  layout.append(body);
  const bottomOthers = othersNav(index, 'policy-page__others-nav policy-page__others-nav--bottom');
  if (bottomOthers) layout.append(bottomOthers);
  wrapper.append(layout);
  return { wrapper, sections };
}

function build() {
  const container = document.querySelector('.shopify-policy__container');
  const source = container?.querySelector('.shopify-policy__body');
  if (!container || !source || container.dataset.policyReady) return;

  const richText = source.querySelector('.rte') || source;
  const nodes = [...richText.children];
  if (!nodes.length) return;
  const fallbackTitle = container.querySelector('.shopify-policy__title')?.textContent.trim() || document.title;
  const languages = splitLanguages(nodes, fallbackTitle);
  if (!languages.length) return;

  const page = el('div', 'policy-page');
  const header = el('header', 'policy-page__header');
  const titles = el('div', 'policy-page__titles');
  const eyebrow = el('p', 'policy-page__eyebrow', word('eyebrow', 0));
  const title = el('h1', 'policy-page__title');
  const updatedLine = el('p', 'policy-page__updated');
  titles.append(eyebrow, title, updatedLine);
  header.append(titles);

  const built = languages.map((language, index) => buildLanguage(language, index));
  const switcher = el('div', 'policy-page__switch');
  const buttons = [];
  if (languages.length > 1) {
    switcher.setAttribute('role', 'group');
    switcher.setAttribute('aria-label', word('language', 0));
    languages.forEach((language, index) => {
      const button = el('button', 'policy-page__switch-button', word('language_names', index));
      button.type = 'button';
      button.dataset.language = String(index);
      button.addEventListener('click', () => show(index, true));
      switcher.append(button);
      buttons.push(button);
    });
    header.append(switcher);
  }
  page.append(header);
  built.forEach(({ wrapper }) => page.append(wrapper));

  let observer = null;
  function show(index, remember) {
    built.forEach(({ wrapper }, i) => {
      wrapper.hidden = i !== index;
    });
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    const wrapper = built[index].wrapper;
    title.textContent = wrapper.dataset.title;
    eyebrow.textContent = word('eyebrow', index);
    updatedLine.textContent = wrapper.dataset.updated;
    updatedLine.hidden = !wrapper.dataset.updated;
    document.title = `${wrapper.dataset.title} | ${DATA.shop || ''}`.replace(/ \| $/, '');
    if (remember) {
      try {
        localStorage.setItem('aura-policy-language', String(index));
      } catch (error) {
        /* private window: the choice just is not remembered */
      }
    }
    watchSections(index);
  }

  function watchSections(index) {
    observer?.disconnect();
    if (typeof IntersectionObserver !== 'function') return;
    const wrapper = built[index].wrapper;
    const links = new Map([...wrapper.querySelectorAll('.policy-page__toc-list a')].map((link) => [link.dataset.target, link]));
    if (!links.size) return;
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          links.forEach((link) => link.removeAttribute('aria-current'));
          links.get(entry.target.id)?.setAttribute('aria-current', 'true');
        }
      },
      { rootMargin: '-15% 0px -75% 0px' }
    );
    built[index].sections.forEach((section) => {
      const heading = document.getElementById(section.id);
      if (heading) observer.observe(heading);
    });
  }

  let first = 0;
  try {
    const params = new URLSearchParams(location.search).get('lang');
    const saved = localStorage.getItem('aura-policy-language');
    if (params === 'es') first = 1;
    else if (params === 'en') first = 0;
    else if (saved === '1' || saved === '0') first = Number(saved);
    else if (document.documentElement.lang.startsWith('es')) first = 1;
  } catch (error) {
    /* keep English */
  }
  if (first >= languages.length) first = 0;

  container.replaceChildren(page);
  container.dataset.policyReady = '';
  show(first, false);

  // A link such as /policies/terms-of-service#buyback-program: open the right language, then scroll to it.
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash) {
    const target = document.getElementById(hash);
    const owner = target?.closest('.policy-page__language');
    if (owner) {
      show(Number(owner.dataset.language), false);
      // Fonts and the sticky header settle after the first paint, so scroll again once the page has loaded.
      const jump = () => target.scrollIntoView({ block: 'start' });
      requestAnimationFrame(jump);
      window.addEventListener('load', () => setTimeout(jump, 150), { once: true });
      if (document.readyState === 'complete') setTimeout(jump, 150);
    }
  }
}

function start() {
  try {
    build();
  } catch (error) {
    console.error('Policy page layout failed, showing the original page.', error);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
