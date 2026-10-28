/**
 * Pre-checkout page (sections/pre-checkout.liquid).
 *
 * DNI: look the number up through the app proxy (Turnstile first for guests), let the customer review and edit,
 * then ask the Worker to build a Shopify cart with the details already on it and go to its checkout link.
 * Any other document type skips all of this and goes straight to Shopify's checkout.
 * The DNI and the lookup result are only kept in memory on this page; nothing is stored in the browser.
 */
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function init(root) {
  const config = JSON.parse(root.querySelector('script[data-config]').textContent);
  // The messages come through Liquid's json filter, which turns an apostrophe into &#39;. Turn it back into text.
  const decode = (text) => {
    const area = document.createElement('textarea');
    area.innerHTML = text;
    return area.value;
  };
  for (const key of Object.keys(config.messages)) config.messages[key] = decode(config.messages[key]);
  const $ = (selector) => root.querySelector(selector);
  const form = $('[data-form]');
  if (!form) return; // empty bag

  const el = {
    doctype: $('[data-doctype]'),
    dniBlock: $('[data-dni-block]'),
    dni: $('[data-dni]'),
    lookup: $('[data-lookup]'),
    trap: $('[data-trap]'),
    turnstile: $('[data-turnstile]'),
    status: $('[data-status]'),
    found: $('[data-found]'),
    foundText: $('[data-found-text]'),
    edit: $('[data-edit]'),
    manual: $('[data-manual]'),
    fields: $('[data-fields]'),
    otherNote: $('[data-other-note]'),
    error: $('[data-error]'),
    submit: $('[data-submit]'),
  };
  const field = (name) => root.querySelector(`[data-field="${name}"]`);
  const names = ['firstName', 'lastName', 'phone', 'email', 'address', 'region', 'province', 'district', 'reference'];

  // Kept in memory only.
  const state = { ticket: null, proof: null, proofDni: null, token: null, widgetId: null, scriptLoading: null, busy: false };

  const setStatus = (text) => {
    el.status.textContent = text || '';
  };
  const setError = (text) => {
    el.error.textContent = text || '';
    el.error.hidden = !text;
  };
  const showFields = (visible) => {
    el.fields.hidden = !visible;
    el.manual.hidden = visible;
  };
  const value = (name) => (field(name)?.value ?? '').trim();

  // Starting values: a signed-in customer's saved default address.
  const prefill = config.prefill || {};
  for (const name of names) {
    if (field(name) && prefill[name]) field(name).value = prefill[name];
  }
  if (prefill.dni && /^\d{8}$/.test(prefill.dni)) el.dni.value = prefill.dni;
  if (prefill.address && prefill.firstName) showFields(true);

  async function post(path, body) {
    try {
      const response = await fetch(`${config.proxy}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) return { ok: false, reason: 'unavailable' };
      return await response.json();
    } catch (error) {
      return { ok: false, reason: 'unavailable' };
    }
  }

  // ---- Turnstile (guests only) ----
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve();
    if (!state.scriptLoading) {
      state.scriptLoading = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = TURNSTILE_SRC;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('turnstile'));
        document.head.appendChild(script);
      });
    }
    return state.scriptLoading;
  }

  async function ensureToken() {
    if (!config.guest || state.ticket || state.token) return true;
    if (!config.siteKey) return false;
    setStatus(config.messages.verifying);
    try {
      await loadTurnstile();
    } catch (error) {
      return false;
    }
    el.turnstile.hidden = false;
    const options = {
      sitekey: config.siteKey,
      callback: (token) => {
        state.token = token;
        el.turnstile.hidden = true;
        lookup();
      },
      'error-callback': (code) => {
        // The code is not personal data. 110200 means this hostname is not on the widget's list in Cloudflare.
        console.warn('[pre-checkout] Turnstile error', code, '| host:', window.location.hostname);
        el.turnstile.hidden = true;
        setStatus(config.messages.unavailable);
        showFields(true);
      },
      'expired-callback': () => {
        state.token = null;
      },
    };
    if (state.widgetId === null) state.widgetId = window.turnstile.render(el.turnstile, options);
    else window.turnstile.reset(state.widgetId);
    return false; // the callback restarts the lookup
  }

  // ---- DNI lookup ----
  async function lookup() {
    if (state.busy) return;
    setError('');
    const dni = el.dni.value.trim();
    if (!/^\d{8}$/.test(dni)) {
      setStatus(config.messages.invalidDni);
      return;
    }
    if (!(await ensureToken())) return;

    state.busy = true;
    el.lookup.disabled = true;
    setStatus(config.messages.looking);
    const body = { dni, website: el.trap.value };
    if (state.ticket) body.ticket = state.ticket;
    else if (state.token) body.turnstile = state.token;
    const result = await post('dni', body);
    state.token = null; // a Turnstile token works once
    state.busy = false;
    el.lookup.disabled = false;

    if (result.ok) {
      if (result.ticket) state.ticket = result.ticket;
      state.proof = result.proof || null;
      state.proofDni = dni;
      applyPerson(result.person);
      setStatus('');
      return;
    }
    if (result.reason === 'challenge') {
      state.ticket = null;
      await ensureToken();
      return;
    }
    setStatus(result.reason === 'invalid' ? config.messages.invalidDni : config.messages.unavailable);
    showFields(true); // manual entry: the purchase is never blocked
  }

  function applyPerson(person) {
    field('firstName').value = person.firstNames || '';
    field('lastName').value = person.lastNames || '';
    field('address').value = person.address || '';
    field('province').value = person.province || '';
    field('district').value = person.district || '';
    field('region').value = person.region || '';
    el.foundText.textContent = `${config.messages.found} ${person.firstNames} ${person.lastNames}`.trim();
    el.found.hidden = false;
    showFields(true);
    if (!person.hasAddress) setStatus(config.messages.noAddress);
  }

  function resetLookup() {
    state.proof = null;
    state.proofDni = null;
    el.found.hidden = true;
    el.dni.focus();
  }

  // ---- events ----
  el.lookup.addEventListener('click', lookup);
  el.dni.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      lookup();
    }
  });
  el.dni.addEventListener('input', () => {
    el.dni.value = el.dni.value.replace(/\D/g, '').slice(0, 8);
    if (state.proofDni && el.dni.value !== state.proofDni) resetLookup();
  });
  el.edit.addEventListener('click', resetLookup);
  el.manual.addEventListener('click', () => showFields(true));

  el.doctype.addEventListener('change', () => {
    const isDni = el.doctype.value === 'dni';
    el.dniBlock.hidden = !isDni;
    el.otherNote.hidden = isDni;
    setError('');
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (state.busy) return;
    if (el.doctype.value === 'dni') submitDni();
    else submitOther();
  });

  // ---- hand-off ----
  async function submitOther() {
    setError('');
    lock(true);
    try {
      await fetch('/cart/update.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attributes: { document_type: el.doctype.value } }),
      });
    } catch (error) {
      // Not fatal: the order just will not carry the document type.
    }
    window.location.href = config.checkoutUrl;
  }

  function validate() {
    if (!/^\d{8}$/.test(el.dni.value.trim())) return config.messages.invalidDni;
    for (const name of ['firstName', 'lastName', 'address', 'province', 'district']) {
      if (!value(name)) return config.messages.required;
    }
    if (!value('region')) return config.messages.region;
    if (value('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value('email'))) return config.messages.email;
    return '';
  }

  async function submitDni() {
    setError('');
    if (el.fields.hidden) showFields(true);
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    lock(true);
    setStatus(config.messages.continuing);

    let lines = [];
    try {
      const cart = await (await fetch('/cart.js', { headers: { Accept: 'application/json' } })).json();
      lines = cart.items.map((item) => ({ variantId: String(item.variant_id), quantity: item.quantity }));
    } catch (error) {
      lines = [];
    }

    const dni = el.dni.value.trim();
    const details = { dni };
    for (const name of names) details[name] = value(name);
    // The proof only counts for the number that was actually looked up.
    const proof = state.proofDni === dni ? state.proof : undefined;
    const result = await post('checkout', { lines, details, proof });
    if (result.ok && typeof result.url === 'string') {
      window.location.href = result.url;
      return;
    }
    lock(false);
    setStatus('');
    setError(config.messages.submitFailed);
  }

  function lock(locked) {
    el.submit.disabled = locked;
    el.lookup.disabled = locked;
  }
}

document.querySelectorAll('[data-pre-checkout]').forEach(init);
