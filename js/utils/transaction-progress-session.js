import { assert } from './assert.js';

let nextSessionToastId = 1;

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

function normalizeSteps(rawSteps) {
  const seen = new Set();
  const out = [];
  for (const step of rawSteps) {
    assert(typeof step.id === 'string' && step.id !== '', 'Progress step id is required');
    assert(typeof step.label === 'string' && step.label !== '', 'Progress step label is required');
    assert(!seen.has(step.id), `Duplicate progress step id: ${step.id}`);
    seen.add(step.id);
    out.push({
      id: step.id,
      label: step.label,
      status: step.status || 'pending',
      detail: step.detail == null ? '' : String(step.detail),
    });
  }
  return out;
}

/** Hide toast = pause UI; terminal phase still runs when async completes. */
export function createTransactionProgressSession(toastApi, options) {
  assert(toastApi, 'toastApi is required');
  assert(typeof toastApi.createTransactionProgress === 'function', 'toastApi.createTransactionProgress is required');
  assert(options && typeof options === 'object', 'Progress options are required');
  assert(Array.isArray(options.steps), 'Progress steps are required');

  let visibilityListener = null;
  const state = {
    toastId: `transaction-progress-${nextSessionToastId++}`,
    title: options.title,
    successTitle: options.successTitle,
    failureTitle: options.failureTitle,
    cancelledTitle: options.cancelledTitle,
    summary: options.summary == null ? '' : String(options.summary),
    steps: normalizeSteps(options.steps),
    transactionLink: null,
    phase: { type: 'active' },
    controller: null,
    hidden: false,
  };

  function notifyVisibility() {
    if (!visibilityListener) return;
    visibilityListener({ hidden: state.hidden, active: state.phase.type === 'active' });
  }

  function mountController() {
    const controller = toastApi.createTransactionProgress({
      id: state.toastId,
      title: state.title,
      successTitle: state.successTitle,
      failureTitle: state.failureTitle,
      cancelledTitle: state.cancelledTitle,
      summary: state.summary,
      steps: state.steps,
    });

    controller.onClose(() => {
      state.hidden = true;
      state.controller = null;
      notifyVisibility();
    });

    state.controller = controller;
    state.hidden = false;
    if (state.transactionLink !== null) controller.setTransactionLink(state.transactionLink);
    applyPhase(controller, state.phase);
    notifyVisibility();
    return controller;
  }

  function controllerOrMount() {
    return state.controller ?? mountController();
  }

  function finishPhase(phase) {
    state.phase = phase;
    if (state.hidden && state.controller === null) {
      notifyVisibility();
      return;
    }
    applyPhase(controllerOrMount(), phase);
    notifyVisibility();
  }

  function stepById(stepId) {
    const step = state.steps.find((s) => s.id === stepId);
    assert(step, `Unknown progress step: ${stepId}`);
    return step;
  }

  mountController();

  return {
    updateStep(stepId, update) {
      const step = stepById(stepId);
      if (update.status) step.status = update.status;
      if (Object.prototype.hasOwnProperty.call(update, 'detail')) step.detail = update.detail;
      state.controller?.updateStep(stepId, update);
    },
    setSummary(message) {
      state.summary = message == null ? '' : String(message);
      state.controller?.setSummary(state.summary);
    },
    setTransactionLink(transactionLink) {
      state.transactionLink = transactionLink;
      state.controller?.setTransactionLink(transactionLink);
    },
    finishSuccess(message) {
      finishPhase({ type: 'success', message });
    },
    finishFailure(message) {
      finishPhase({ type: 'failure', message });
    },
    finishCancelled(message) {
      finishPhase({ type: 'cancelled', message });
    },
    reopen() {
      controllerOrMount();
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
        if (visibilityListener === listener) visibilityListener = null;
      };
    },
  };
}
