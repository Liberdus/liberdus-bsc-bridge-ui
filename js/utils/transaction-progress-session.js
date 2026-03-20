function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function toDisplayText(value) {
  return value == null ? '' : String(value);
}

function copyStep(step) {
  assert(typeof step.id === 'string' && step.id !== '', 'Progress step id is required');
  assert(typeof step.label === 'string' && step.label !== '', 'Progress step label is required');

  return {
    id: step.id,
    label: step.label,
    status: step.status || 'pending',
    detail: toDisplayText(step.detail),
  };
}

function applyPhase(controller, phase) {
  switch (phase.type) {
    case 'active':
      return;
    case 'success':
      controller.finishSuccess(phase.message);
      return;
    case 'failure':
      controller.finishFailure(phase.message);
      return;
    case 'cancelled':
      controller.finishCancelled(phase.message);
      return;
    default:
      throw new Error(`Unknown progress phase: ${phase.type}`);
  }
}

/**
 * Creates a transaction-progress session backed by a toast controller.
 *
 * UX contract:
 * - Closing an active toast hides intermediate progress updates.
 * - Terminal states are surfaced even after dismissal, so users still see the
 *   final success/failure/cancelled outcome when the async flow settles.
 * - `reopen()` is mainly for bringing an in-flight hidden session back on
 *   screen before it reaches a terminal state.
 */
export function createTransactionProgressSession(toastApi, options) {
  assert(toastApi, 'toastApi is required');
  assert(typeof toastApi.createTransactionProgress === 'function', 'toastApi.createTransactionProgress is required');
  assert(options && typeof options === 'object', 'Progress options are required');
  assert(Array.isArray(options.steps), 'Progress steps are required');

  let visibilityListener = null;
  const state = {
    title: options.title,
    successTitle: options.successTitle,
    failureTitle: options.failureTitle,
    cancelledTitle: options.cancelledTitle,
    summary: toDisplayText(options.summary),
    steps: options.steps.map(copyStep),
    transactionLink: null,
    phase: { type: 'active' },
    controller: null,
    hidden: false,
  };

  function notifyVisibility() {
    if (visibilityListener === null) {
      return;
    }

    visibilityListener({
      hidden: state.hidden,
      active: state.phase.type === 'active',
    });
  }

  function createController() {
    const controller = toastApi.createTransactionProgress({
      title: state.title,
      successTitle: state.successTitle,
      failureTitle: state.failureTitle,
      cancelledTitle: state.cancelledTitle,
      summary: state.summary,
      steps: state.steps.map(copyStep),
    });

    controller.onClose(() => {
      state.hidden = true;
      state.controller = null;
      notifyVisibility();
    });

    state.controller = controller;
    state.hidden = false;

    if (state.transactionLink !== null) {
      controller.setTransactionLink(state.transactionLink);
    }

    applyPhase(controller, state.phase);
    notifyVisibility();
    return controller;
  }

  function getController() {
    if (state.controller !== null) {
      return state.controller;
    }
    return createController();
  }

  function getStep(stepId) {
    const step = state.steps.find((item) => item.id === stepId);
    assert(step, `Unknown progress step: ${stepId}`);
    return step;
  }

  createController();

  return {
    updateStep(stepId, update) {
      const step = getStep(stepId);
      if (update.status) {
        step.status = update.status;
      }
      if (Object.prototype.hasOwnProperty.call(update, 'detail')) {
        step.detail = update.detail;
      }
      if (state.controller !== null) {
        state.controller.updateStep(stepId, update);
      }
    },
    setSummary(message) {
      state.summary = toDisplayText(message);
      if (state.controller !== null) {
        state.controller.setSummary(state.summary);
      }
    },
    setTransactionLink(transactionLink) {
      state.transactionLink = transactionLink;
      if (state.controller !== null) {
        state.controller.setTransactionLink(transactionLink);
      }
    },
    finishSuccess(message) {
      state.phase = { type: 'success', message };
      getController().finishSuccess(message);
      notifyVisibility();
    },
    finishFailure(message) {
      state.phase = { type: 'failure', message };
      getController().finishFailure(message);
      notifyVisibility();
    },
    finishCancelled(message) {
      state.phase = { type: 'cancelled', message };
      getController().finishCancelled(message);
      notifyVisibility();
    },
    reopen() {
      getController();
    },
    isHidden() {
      return state.hidden;
    },
    isVisible() {
      return !state.hidden;
    },
    isActive() {
      return state.phase.type === 'active';
    },
    onVisibilityChange(listener) {
      assert(typeof listener === 'function', 'Progress visibility listener is required');
      assert(visibilityListener === null, 'Progress visibility listener already set');
      visibilityListener = listener;
      return () => {
        if (visibilityListener === listener) {
          visibilityListener = null;
        }
      };
    },
  };
}
