import { assert } from '../utils/helpers.js';

const TYPE_ICONS = {
  success: '\u2713',
  error: '\u2715',
  warning: '\u26A0',
  info: '\u2139',
  loading: '',
};

const STEP_ICONS = {
  pending: '\u25CB',
  active: '\u25CF',
  completed: '\u2714',
  failed: '\u2716',
  cancelled: '\u2212',
};

function toDisplayText(value) {
  return value == null ? '' : String(value);
}

export class ToastManager {
  constructor({ containerId = 'notification-container' } = {}) {
    this.containerId = containerId;
    this.container = null;
    this._toasts = new Map(); // id -> { el, timeoutId, showTimerId, onClose, closeHandled }
    this._nextId = 1;
  }

  load() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = this.containerId;
      const appContainer = document.getElementById('app');
      (appContainer || document.body).appendChild(this.container);
    }

    this.container.classList.add('notification-container');
    this.container.setAttribute('aria-live', 'polite');
    this.container.setAttribute('aria-relevant', 'additions');
  }

  show({ title, message, type = 'info', timeoutMs, id, dismissible = true, delayMs = 0, allowHtml = false } = {}) {
    const toastId = id || `t${this._nextId++}`;

    if (this._toasts.has(toastId)) {
      this.update(toastId, { title, message, type, timeoutMs, dismissible, allowHtml });
      return toastId;
    }

    if (delayMs && delayMs > 0) {
      const showTimerId = window.setTimeout(() => {
        this._toasts.delete(toastId);
        this._mountStandardToast(toastId, { title, message, type, timeoutMs, dismissible, allowHtml });
      }, delayMs);

      this._toasts.set(toastId, {
        el: null,
        timeoutId: null,
        showTimerId,
        onClose: null,
        closeHandled: false,
      });
      return toastId;
    }

    this._mountStandardToast(toastId, { title, message, type, timeoutMs, dismissible, allowHtml });
    return toastId;
  }

  loading(message, { title = 'Loading', id, delayMs = 200, allowHtml = false } = {}) {
    return this.show({ id, title, message, type: 'loading', timeoutMs: 0, dismissible: false, delayMs, allowHtml });
  }

  success(message, { title = 'Done', timeoutMs = 2500, id, allowHtml = false } = {}) {
    return this.show({ id, title, message, type: 'success', timeoutMs, dismissible: true, allowHtml });
  }

  error(message, { title = 'Error', timeoutMs = 0, id, allowHtml = false } = {}) {
    return this.show({ id, title, message, type: 'error', timeoutMs, dismissible: true, allowHtml });
  }

  update(id, { title, message, type, timeoutMs, dismissible, allowHtml = false } = {}) {
    const rec = this._toasts.get(id);
    if (!rec) return false;

    if (rec.el === null) {
      window.clearTimeout(rec.showTimerId);
      this._toasts.delete(id);
      this._mountStandardToast(id, { title, message, type, timeoutMs, dismissible, allowHtml });
      return true;
    }

    const toast = rec.el;
    if (type) {
      this._setToastType(toast, type);
    }
    if (typeof title === 'string') {
      this._setToastTitle(toast, title);
    }
    if (typeof message === 'string') {
      this._setToastMessage(toast, message, allowHtml);
    }
    if (typeof dismissible === 'boolean') {
      this._setToastDismissible(id, toast, dismissible);
    }

    toast.classList.remove('hide');
    toast.classList.add('show');
    if (this.container && toast.parentElement === this.container && this.container.firstChild !== toast) {
      this.container.prepend(toast);
    }

    this._setTimeout(id, rec, timeoutMs);
    return true;
  }

  createTransactionProgress({
    id,
    title,
    successTitle,
    failureTitle,
    cancelledTitle,
    summary,
    steps,
  }) {
    assert(Array.isArray(steps), 'Transaction steps are required');

    const toastId = id || `t${this._nextId++}`;
    if (this._toasts.has(toastId)) {
      this.dismiss(toastId);
    }
    this._removeLingeringToast(toastId);

    let currentSummary = toDisplayText(summary);
    let closeCallback = null;
    const refs = this._createProgressToast({ toastId, title, summary: currentSummary, steps });

    this._mountToast(toastId, refs.toast, {
      timeoutMs: 0,
      onClose: () => {
        closeCallback?.();
      },
    });

    const setSummary = (message) => {
      currentSummary = toDisplayText(message);
      refs.summary.textContent = currentSummary;
      refs.summary.hidden = currentSummary === '';
    };

    const finish = (type, nextTitle, nextSummary, terminalMessage) => {
      this._setToastType(refs.toast, type);
      this._setToastTitle(refs.toast, nextTitle);
      setSummary(nextSummary);
      refs.terminalMessage.textContent = terminalMessage;
      refs.terminalMessage.hidden = terminalMessage === '';
    };

    return {
      updateStep: (stepId, update) => {
        const step = refs.steps.get(stepId);
        assert(step, `Unknown transaction step: ${stepId}`);

        const detail = Object.prototype.hasOwnProperty.call(update, 'detail')
          ? update.detail
          : step.detail.textContent;

        this._applyProgressStep(step, {
          status: update.status || step.item.dataset.stepStatus || 'pending',
          detail,
        });
      },
      setTransactionLink: ({ hash, url }) => {
        const hashText = toDisplayText(hash);
        const urlText = toDisplayText(url);
        refs.meta.hidden = false;
        refs.hash.textContent = this._shortHash(hashText);
        refs.hash.title = hashText;
        refs.link.href = urlText || '#';
        refs.link.hidden = urlText === '';
      },
      finishSuccess: (message) => {
        finish('success', successTitle, toDisplayText(message) || currentSummary, '');
      },
      finishFailure: (message) => {
        finish('error', failureTitle, '', toDisplayText(message) || 'Transaction failed.');
      },
      finishCancelled: (message) => {
        finish('warning', cancelledTitle, '', toDisplayText(message) || 'Transaction cancelled.');
      },
      onClose: (callback) => {
        assert(typeof callback === 'function', 'Toast close callback is required');
        assert(closeCallback === null, 'Toast close callback already set');
        closeCallback = callback;
        return () => {
          if (closeCallback === callback) {
            closeCallback = null;
          }
        };
      },
    };
  }

  dismiss(id) {
    const rec = this._toasts.get(id);
    if (!rec) return false;

    if (rec.showTimerId) window.clearTimeout(rec.showTimerId);
    if (rec.timeoutId) window.clearTimeout(rec.timeoutId);

    if (!rec.closeHandled && rec.onClose) {
      rec.closeHandled = true;
      rec.onClose();
    }

    const toast = rec.el;
    if (toast) {
      toast.classList.add('hide');
      window.setTimeout(() => {
        toast.remove();
      }, 400);
    }

    this._toasts.delete(id);
    return true;
  }

  _mountStandardToast(toastId, { title, message, type, timeoutMs, dismissible, allowHtml }) {
    const toast = this._createToastShell(toastId);
    this._setToastType(toast, type);
    this._setToastTitle(toast, title);
    this._setToastMessage(toast, message, allowHtml);
    this._setToastDismissible(toastId, toast, dismissible);
    this._mountToast(toastId, toast, { timeoutMs, onClose: null });
  }

  _createProgressToast({ toastId, title, summary, steps }) {
    const toast = this._createToastShell(toastId);
    toast.classList.add('notification-transaction');
    this._setToastType(toast, 'info');
    this._setToastTitle(toast, title);
    this._setToastDismissible(toastId, toast, true);

    const content = toast.querySelector('.notification-content');

    const summaryEl = document.createElement('p');
    summaryEl.className = 'notification-summary';
    summaryEl.textContent = toDisplayText(summary);
    summaryEl.hidden = summaryEl.textContent === '';
    content.appendChild(summaryEl);

    const checklist = document.createElement('ul');
    checklist.className = 'notification-checklist';
    content.appendChild(checklist);

    const stepRefs = new Map();
    steps.forEach((step) => {
      assert(step && typeof step.id === 'string' && step.id !== '', 'Progress step id is required');
      assert(!stepRefs.has(step.id), `Duplicate progress step id: ${step.id}`);
      const stepRef = this._createProgressStep(step);
      checklist.appendChild(stepRef.item);
      stepRefs.set(step.id, stepRef);
    });

    const meta = document.createElement('div');
    meta.className = 'notification-transaction-meta';
    meta.hidden = true;

    const hash = document.createElement('code');
    hash.className = 'notification-transaction-hash';
    meta.appendChild(hash);

    const link = document.createElement('a');
    link.className = 'notification-transaction-link';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'View on explorer';
    link.hidden = true;
    meta.appendChild(link);

    content.appendChild(meta);

    const terminalMessage = document.createElement('p');
    terminalMessage.className = 'notification-terminal-message';
    terminalMessage.hidden = true;
    content.appendChild(terminalMessage);

    return {
      toast,
      summary: summaryEl,
      steps: stepRefs,
      meta,
      hash,
      link,
      terminalMessage,
    };
  }

  _createToastShell(toastId) {
    const toast = document.createElement('div');
    toast.className = 'notification';
    toast.dataset.toastId = toastId;

    const icon = document.createElement('div');
    icon.className = 'notification-icon';
    icon.setAttribute('aria-hidden', 'true');
    toast.appendChild(icon);

    const content = document.createElement('div');
    content.className = 'notification-content';
    toast.appendChild(content);

    const title = document.createElement('div');
    title.className = 'notification-title';
    title.hidden = true;
    content.appendChild(title);

    return toast;
  }

  _createProgressStep(step) {
    const item = document.createElement('li');
    item.className = 'notification-checklist-item';
    item.dataset.stepId = step.id;

    const icon = document.createElement('span');
    icon.className = 'notification-checklist-icon';
    item.appendChild(icon);

    const content = document.createElement('div');
    content.className = 'notification-checklist-content';
    item.appendChild(content);

    const label = document.createElement('div');
    label.className = 'notification-checklist-label';
    label.textContent = toDisplayText(step.label);
    content.appendChild(label);

    const detail = document.createElement('div');
    detail.className = 'notification-checklist-detail';
    content.appendChild(detail);

    const stepRef = { item, icon, detail };
    this._applyProgressStep(stepRef, {
      status: step.status || 'pending',
      detail: step.detail,
    });
    return stepRef;
  }

  _applyProgressStep(step, { status, detail }) {
    const nextStatus = status || 'pending';
    assert(Object.prototype.hasOwnProperty.call(STEP_ICONS, nextStatus), `Unknown step status: ${nextStatus}`);

    const detailText = toDisplayText(detail);
    step.item.dataset.stepStatus = nextStatus;
    step.item.classList.remove('is-pending', 'is-active', 'is-completed', 'is-failed', 'is-cancelled');
    step.item.classList.add(`is-${nextStatus}`);
    step.icon.textContent = STEP_ICONS[nextStatus];
    step.detail.textContent = detailText;
    step.detail.hidden = detailText === '';
  }

  _mountToast(toastId, toast, { timeoutMs, onClose }) {
    if (!this.container) {
      this.load();
    }

    const rec = {
      el: toast,
      timeoutId: null,
      showTimerId: null,
      onClose,
      closeHandled: false,
    };

    this._toasts.set(toastId, rec);
    this.container.prepend(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    this._setTimeout(toastId, rec, timeoutMs);
  }

  _removeLingeringToast(toastId) {
    if (!this.container) return;

    this.container.querySelectorAll('.notification').forEach((toast) => {
      if (toast.dataset.toastId === toastId) {
        toast.remove();
      }
    });
  }

  _setTimeout(toastId, rec, timeoutMs) {
    if (rec.timeoutId) window.clearTimeout(rec.timeoutId);
    rec.timeoutId = null;

    if (typeof timeoutMs === 'number' && timeoutMs > 0) {
      rec.timeoutId = window.setTimeout(() => this.dismiss(toastId), timeoutMs);
    }
  }

  _setToastType(toast, type) {
    assert(Object.prototype.hasOwnProperty.call(TYPE_ICONS, type), `Unknown toast type: ${type}`);
    toast.classList.remove('success', 'error', 'warning', 'info', 'loading');
    toast.classList.add(type);
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const icon = toast.querySelector('.notification-icon');
    if (type === 'loading') {
      icon.innerHTML = '<span class="spinner"></span>';
      return;
    }

    icon.textContent = TYPE_ICONS[type];
  }

  _setToastTitle(toast, title) {
    const titleEl = toast.querySelector('.notification-title');
    titleEl.textContent = toDisplayText(title);
    titleEl.hidden = titleEl.textContent === '';
  }

  _setToastMessage(toast, message, allowHtml) {
    let messageEl = toast.querySelector('.notification-message');
    if (!messageEl) {
      messageEl = document.createElement('div');
      messageEl.className = 'notification-message';
      toast.querySelector('.notification-content').appendChild(messageEl);
    }

    if (allowHtml) {
      messageEl.innerHTML = this._sanitizeMessageHtml(message);
      return;
    }

    messageEl.textContent = toDisplayText(message);
  }

  _setToastDismissible(toastId, toast, dismissible) {
    const closeButton = toast.querySelector('.notification-close');
    if (dismissible) {
      if (!closeButton) {
        toast.appendChild(this._createCloseButton(toastId));
      }
      return;
    }

    if (closeButton) {
      closeButton.remove();
    }
  }

  _createCloseButton(toastId) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'notification-close';
    button.setAttribute('aria-label', 'Dismiss');
    button.textContent = '\u00D7';
    button.addEventListener('click', () => this.dismiss(toastId));
    return button;
  }

  _shortHash(hash) {
    const text = String(hash || '');
    if (text.length <= 14) {
      return text;
    }
    return `${text.slice(0, 8)}...${text.slice(-6)}`;
  }

  _sanitizeMessageHtml(message) {
    const container = document.createElement('div');
    container.innerHTML = String(message || '');

    const fragment = document.createDocumentFragment();
    container.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        fragment.appendChild(document.createTextNode(node.textContent || ''));
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const tag = node.tagName.toLowerCase();
      if (tag === 'br') {
        fragment.appendChild(document.createElement('br'));
        return;
      }

      if (tag !== 'a') {
        fragment.appendChild(document.createTextNode(node.textContent || ''));
        return;
      }

      const anchor = document.createElement('a');
      const href = node.getAttribute('href') || '#';
      anchor.setAttribute('href', /^javascript:/i.test(href) ? '#' : href);
      anchor.setAttribute('rel', 'noopener noreferrer');
      if (node.getAttribute('target') === '_blank') {
        anchor.setAttribute('target', '_blank');
      }
      anchor.textContent = node.textContent || '';
      fragment.appendChild(anchor);
    });

    const wrapper = document.createElement('div');
    wrapper.appendChild(fragment);
    return wrapper.innerHTML;
  }
}
