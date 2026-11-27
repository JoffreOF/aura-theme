/**
 * Optional reference image on the contact form (blocks/contact-form.liquid, "Reference image upload").
 * Shopify contact forms cannot send files, so the picked image is uploaded to the Aura Worker first; the link it
 * returns goes into a hidden field and arrives in the store's contact email as "Reference image".
 * The file input itself has no name, so the file is never posted to Shopify.
 */
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

for (const field of document.querySelectorAll('[data-reference-upload]')) {
  if (field.dataset.ready) continue;
  field.dataset.ready = 'true';

  const input = /** @type {HTMLInputElement} */ (field.querySelector('input[type="file"]'));
  const hidden = /** @type {HTMLInputElement} */ (field.querySelector('input[type="hidden"]'));
  const status = /** @type {HTMLElement} */ (field.querySelector('[data-upload-status]'));
  const name = /** @type {HTMLElement} */ (field.querySelector('[data-upload-name]'));
  const remove = /** @type {HTMLButtonElement} */ (field.querySelector('[data-upload-remove]'));
  const form = field.closest('form');
  const text = JSON.parse(field.dataset.messages || '{}');
  let uploading = null;

  const show = (state, message = '') => {
    field.dataset.state = state;
    status.textContent = message;
  };
  const clear = () => {
    input.value = '';
    hidden.value = '';
    name.textContent = text.choose;
    remove.hidden = true;
    show('idle');
  };

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    hidden.value = '';
    if (!file) return clear();
    name.textContent = file.name;
    remove.hidden = false;
    const heicByName = /\.(heic|heif)$/i.test(file.name);
    if (!TYPES.includes(file.type) && !heicByName) return show('error', text.not_image);
    if (file.size > MAX_BYTES) return show('error', text.too_large);

    show('uploading', text.uploading);
    uploading = (async () => {
      try {
        const res = await fetch(field.dataset.uploadUrl, { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' } });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.url) {
          hidden.value = body.url;
          show('done', text.done);
        } else if (body.error === 'too_large') show('error', text.too_large);
        else if (body.error === 'not_an_image') show('error', text.not_image);
        else if (body.error === 'limit') show('error', text.limit);
        else show('error', text.failed);
      } catch {
        show('error', text.failed);
      } finally {
        uploading = null;
      }
    })();
  });

  remove.addEventListener('click', clear);

  // Do not send the form while the image is still uploading; send it once the upload finishes.
  form?.addEventListener('submit', (event) => {
    if (!uploading) return;
    event.preventDefault();
    show('uploading', text.wait);
    uploading.then(() => form.requestSubmit());
  });
}
