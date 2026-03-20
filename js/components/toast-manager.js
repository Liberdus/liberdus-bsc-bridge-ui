const TYPE_ICONS = {
  success: '\u2713',
  error: '\u2715',
  warning: '\u26A0',
  info: '\u2139',
  loading: '',
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function toDisplayText(value) {
  return value == null ? '' : String(value);
}

function assertUniqueStepIds(steps) {
  const seenStepIds = new Set();
  steps.forEach((step) => {
    assert(typeof step.id === 'string' && step.id !== '', 'Progress step id is required');
    assert(!seenStepIds.has(step.id), `Duplicate progress step id: ${step.id}`);
    seenStepIds.add(step.id);
  });
}

export class ToastManager {
  constructor({ containerId = 'notification-container' } = {}) {
    this.containerId = containerId;
    this.container = null;
    this._toasts = new Map();
    this._nextId = 1;
  }

  load() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = this.containerId;
      const app = document.getElementById('app');
      (app || document.body).appendChild(this.container);
    }

    this.container.classList.add('notification-container');
    this.container.setAttribute('aria-live', 'polite');
    this.container.setAttribute('aria-relevant', 'additions');
  }

  show({
    title,
    message,
    type = 'info',
    timeoutMs,
    id,
    dismissible = true,
    delayMs = 0,
    allowHtml = false,
  } = {}) {
    const toastId = id || `t${this._nextId++}`;
    if (this._toasts.has(toastId)) {
      this.update(toastId, { title, message, type, timeoutMs, dismissible, allowHtml });
      return toastId;
    }

    if (delayMs > 0) {
      const showTimerId = window.setTimeout(() => {
        this._toasts.delete(toastId);
        this._showNow(toastId, { title, message, type, timeoutMs, dismissible, allowHtml });
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

    this._showNow(toastId, { title, message, type, timeoutMs, dismissible, allowHtml });
    return toastId;
  }

  loading(message, { title = 'Loading', id, delayMs = 200, allowHtml = false } = {}) {
    return this.show({
      id,
      title,
      message,
      type: 'loading',
      timeoutMs: 0,
      dismissible: false,
      delayMs,
      allowHtml,
    });
  }

  success(message, { title = 'Done', timeoutMs = 2500, id, allowHtml = false } = {}) {
    return this.show({
      id,
      title,
      message,
      type: 'success',
      timeoutMs,
      dismissible: true,
      allowHtml,
    });
  }

  error(message, { title = 'Error', timeoutMs = 0, id, allowHtml = false } = {}) {
    return this.show({
      id,
      title,
      message,
      type: 'error',
      timeoutMs,
      dismissible: true,
      allowHtml,
    });
  }

  update(id, { title, message, type, timeoutMs, dismissible, allowHtml = false } = {}) {
    const rec = this._toasts.get(id);
    if (!rec) {
      return false;
    }

    if (rec.el === null) {
      window.clearTimeout(rec.showTimerId);
      this._toasts.delete(id);
      this._showNow(id, { title, message, type, timeoutMs, dismissible, allowHtml });
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
    if (this.container.firstChild !== toast) {
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
    assertUniqueStepIds(steps);

    const toastId = id || `t${this._nextId++}`;
    if (this._toasts.has(toastId)) {
      this.dismiss(toastId);
    }
    this._removeLingeringToast(toastId);
    let currentSummary = toDisplayText(summary);
    let closeCallback = null;
    const refs = this._createTransactionToast({
      toastId,
      title,
      summary: currentSummary,
      steps,
    });

    this._mountToast(toastId, refs.toast, {
      timeoutMs: 0,
      onClose() {
        if (closeCallback !== null) {
          closeCallback();
        }
      },
    });

    const setSummary = (message) => {
      currentSummary = toDisplayText(message);
      refs.summary.textContent = currentSummary;
      refs.summary.hidden = currentSummary === '';
    };

    const setTerminalMessage = (message) => {
      refs.terminalMessage.textContent = message;
      refs.terminalMessage.hidden = message === '';
    };

    const finish = (type, nextTitle, nextSummary, terminalMessage) => {
      this._setToastType(refs.toast, type);
      this._setToastTitle(refs.toast, nextTitle);
      setSummary(nextSummary);
      setTerminalMessage(terminalMessage);
    };

    return {
      updateStep: (stepId, update) => {
        const step = refs.steps.get(stepId);
        assert(step, `Unknown transaction step: ${stepId}`);
        const detail = Object.prototype.hasOwnProperty.call(update, 'detail')
          ? update.detail
          : step.detail.textContent;
        this._setStepState(step, update.status || step.item.dataset.stepStatus, detail || '');
      },
      setSummary,
      setTransactionLink: ({ hash, url }) => {
        refs.meta.hidden = false;
        refs.hash.textContent = this._shortHash(hash);
        refs.hash.title = hash;
        refs.link.href = url;
        refs.link.hidden = url === '';
      },
      finishSuccess: (message) => {
        finish('success', successTitle, toDisplayText(message) || currentSummary, '');
      },
      finishFailure: (message) => {
        finish('error', failureTitle, '', message || 'Transaction failed.');
      },
      finishCancelled: (message) => {
        finish('warning', cancelledTitle, '', message || 'Transaction cancelled.');
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
      close: () => {
        this.dismiss(toastId);
      },
    };
  }

  dismiss(id) {
    const rec = this._toasts.get(id);
    if (!rec) {
      return false;
    }

    if (rec.showTimerId) {
      window.clearTimeout(rec.showTimerId);
    }
    if (rec.timeoutId) {
      window.clearTimeout(rec.timeoutId);
    }

    if (!rec.closeHandled && rec.onClose) {
      rec.closeHandled = true;
      rec.onClose();
    }

    if (rec.el) {
      rec.el.classList.add('hide');
      window.setTimeout(() => {
        rec.el.remove();
      }, 400);
    }

    this._toasts.delete(id);
    return true;
  }

  _showNow(toastId, { title, message, type, timeoutMs, dismissible, allowHtml }) {
    const toast = this._createStandardToast({ toastId, title, message, type, dismissible, allowHtml });
    this._mountToast(toastId, toast, {
      timeoutMs,
      onClose: null,
    });
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
    if (!this.container) {
      return;
    }

    this.container.querySelectorAll('.notification').forEach((toast) => {
      if (toast.dataset.toastId === toastId) {
        toast.remove();
      }
    });
  }

  _setTimeout(toastId, rec, timeoutMs) {
    if (rec.timeoutId) {
      window.clearTimeout(rec.timeoutId);
    }
    rec.timeoutId = null;

    if (typeof timeoutMs === 'number' && timeoutMs > 0) {
      rec.timeoutId = window.setTimeout(() => this.dismiss(toastId), timeoutMs);
    }
  }

  _createStandardToast({ toastId, title, message, type, dismissible, allowHtml }) {
    const refs = this._createToastShell({ toastId, title, type, dismissible });
    const body = document.createElement('div');
    body.className = 'notification-message';
    refs.content.appendChild(body);
    this._setToastMessage(refs.toast, message, allowHtml);
    return refs.toast;
  }

  _createTransactionToast({ toastId, title, summary, steps }) {
    const refs = this._createToastShell({
      toastId,
      title,
      type: 'info',
      dismissible: true,
    });

    refs.toast.classList.add('notification-transaction');

    const summaryEl = document.createElement('p');
    summaryEl.className = 'notification-summary';
    summaryEl.textContent = toDisplayText(summary);
    summaryEl.hidden = summaryEl.textContent === '';
    refs.content.appendChild(summaryEl);

    const checklist = document.createElement('ul');
    checklist.className = 'notification-checklist';
    refs.content.appendChild(checklist);

    const stepRefs = new Map();
    steps.forEach((step) => {
      const stepRef = this._createStep(step);
      checklist.appendChild(stepRef.item);
      stepRefs.set(step.id, stepRef);
    });

    const meta = document.createElement('div');
    meta.className = 'notification-transaction-meta';
    meta.hidden = true;

    const hash = document.createElement('code');
    hash.className = 'notification-transaction-hash';

    const link = document.createElement('a');
    link.className = 'notification-transaction-link';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'View on explorer';
    link.hidden = true;

    meta.appendChild(hash);
    meta.appendChild(link);
    refs.content.appendChild(meta);

    const terminalMessage = document.createElement('p');
    terminalMessage.className = 'notification-terminal-message';
    terminalMessage.hidden = true;
    refs.content.appendChild(terminalMessage);

    return {
      toast: refs.toast,
      summary: summaryEl,
      steps: stepRefs,
      meta,
      hash,
      link,
      terminalMessage,
    };
  }

  _createToastShell({ toastId, title, type, dismissible }) {
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

    const titleEl = document.createElement('div');
    titleEl.className = 'notification-title';
    content.appendChild(titleEl);

    this._setToastType(toast, type);
    this._setToastTitle(toast, title);

    if (dismissible) {
      toast.appendChild(this._createCloseButton(toastId));
    }

    return { toast, content };
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

  _createStep(step) {
    const item = document.createElement('li');
    item.className = 'notification-checklist-item';
    item.dataset.stepId = step.id;

    const icon = document.createElement('span');
    icon.className = 'notification-checklist-icon';
    item.appendChild(icon);

    const content = document.createElement('div');
    content.className = 'notification-checklist-content';

    const label = document.createElement('div');
    label.className = 'notification-checklist-label';
    label.textContent = step.label;
    content.appendChild(label);

    const detail = document.createElement('div');
    detail.className = 'notification-checklist-detail';
    content.appendChild(detail);

    item.appendChild(content);
    this._setStepState({ item, icon, detail }, step.status, step.detail);
    return { item, icon, detail };
  }

  _setStepState(step, status, detail) {
    const nextStatus = status || 'pending';
    const detailText = toDisplayText(detail);
    step.item.dataset.stepStatus = nextStatus;
    step.item.classList.remove('is-pending', 'is-active', 'is-completed', 'is-failed', 'is-cancelled');
    step.item.classList.add(`is-${nextStatus}`);
    step.icon.textContent = this._getStepIcon(nextStatus);
    step.detail.textContent = detailText;
    step.detail.hidden = detailText === '';
  }

  _getStepIcon(status) {
    switch (status) {
      case 'pending':
        return '\u25CB';
      case 'active':
        return '\u25CF';
      case 'completed':
        return '\u2714';
      case 'failed':
        return '\u2716';
      case 'cancelled':
        return '\u2212';
      default:
        throw new Error(`Unknown step status: ${status}`);
    }
  }

  _setToastType(toast, type) {
    assert(type in TYPE_ICONS, `Unknown toast type: ${type}`);
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
    titleEl.textContent = String(title || '');
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

    messageEl.textContent = String(message || '');
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

  _shortHash(hash) {
    const text = String(hash);
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
