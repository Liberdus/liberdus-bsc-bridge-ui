export const MIN_REFRESH_SPIN_MS = 1000;
export const REFRESH_ICON = `
  <span class="refresh-button__icon" data-refresh-icon aria-hidden="true">
    <svg
      class="refresh-button__icon-svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  </span>
`;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderAttributes(attributes) {
  return Object.entries(attributes)
    .flatMap(([name, value]) => {
      if (value == null || value === false) return [];
      if (value === true || value === '') return [name];
      return [`${name}="${escapeHtml(value)}"`];
    })
    .join(' ');
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RefreshButton {
  constructor({
    label = 'Refresh',
    title = null,
    ariaLabel = null,
    buttonClassName = 'btn btn--icon refresh-button',
    attributes = {},
    iconOnly = true,
    minSpinMs = MIN_REFRESH_SPIN_MS,
    onRefresh = null,
  } = {}) {
    this.label = String(label || 'Refresh');
    this.title = title == null ? this.label : String(title);
    this.ariaLabel = ariaLabel == null ? this.label : String(ariaLabel);
    this.buttonClassName = String(buttonClassName || 'btn btn--icon refresh-button');
    this.attributes = attributes && typeof attributes === 'object' ? { ...attributes } : {};
    this.iconOnly = !!iconOnly;
    this.minSpinMs = Math.max(0, Number(minSpinMs) || 0);
    this.onRefresh = typeof onRefresh === 'function' ? onRefresh : null;

    this.button = null;
    this._loading = false;
    this._runPromise = null;
    this._handleClick = this._handleClick.bind(this);
  }

  render() {
    const attrs = renderAttributes({
      type: 'button',
      class: this.buttonClassName,
      title: this.title,
      'aria-label': this.ariaLabel,
      'aria-busy': 'false',
      ...this.attributes,
    });

    const label = this.iconOnly ? '' : `<span class="refresh-button__label">${escapeHtml(this.label)}</span>`;
    return `<button ${attrs}>${REFRESH_ICON}${label}</button>`;
  }

  mount(button) {
    if (!(button instanceof HTMLButtonElement)) return null;
    if (this.button && this.button !== button) this.destroy();

    this.button = button;
    this.button.addEventListener('click', this._handleClick);
    this._applyState();
    return this.button;
  }

  destroy() {
    if (this.button) {
      this.button.removeEventListener('click', this._handleClick);
    }
    this.button = null;
  }

  run() {
    if (this._runPromise) return this._runPromise;

    this._runPromise = this._run().finally(() => {
      this._runPromise = null;
    });

    return this._runPromise;
  }

  async _run() {
    const startedAt = Date.now();
    this._setLoading(true);

    try {
      await this.onRefresh?.();
    } finally {
      const remaining = this.minSpinMs - (Date.now() - startedAt);
      if (remaining > 0) {
        await wait(remaining);
      }
      this._setLoading(false);
    }
  }

  _handleClick() {
    this.run().catch(() => {});
  }

  _setLoading(isLoading) {
    this._loading = !!isLoading;
    this._applyState();
  }

  _applyState() {
    if (!this.button) return;

    this.button.disabled = this._loading;
    this.button.classList.toggle('is-loading', this._loading);
    if (this._loading) {
      this.button.setAttribute('aria-busy', 'true');
      return;
    }
    this.button.removeAttribute('aria-busy');
  }
}
