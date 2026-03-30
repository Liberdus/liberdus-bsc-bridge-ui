import { assert } from './helpers.js';

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
  const steps = [];
  const stepsById = new Map();

  for (const rawStep of rawSteps) {
    assert(typeof rawStep.id === 'string' && rawStep.id !== '', 'Progress step id is required');
    assert(typeof rawStep.label === 'string' && rawStep.label !== '', 'Progress step label is required');
    assert(!stepsById.has(rawStep.id), `Duplicate progress step id: ${rawStep.id}`);

    const step = {
      id: rawStep.id,
      label: rawStep.label,
      status: rawStep.status || 'pending',
      detail: rawStep.detail == null ? '' : String(rawStep.detail),
    };

    steps.push(step);
    stepsById.set(step.id, step);
  }

  return { steps, stepsById };
}

/** Hide toast = pause UI; terminal phase still runs when async completes. */
export function createTransactionProgressSession(toastApi, options) {
  assert(toastApi, 'toastApi is required');
  assert(typeof toastApi.createTransactionProgress === 'function', 'toastApi.createTransactionProgress is required');
  assert(options && typeof options === 'object', 'Progress options are required');
  assert(Array.isArray(options.steps), 'Progress steps are required');

  let visibilityListener = null;
  const normalizedSteps = normalizeSteps(options.steps);
  const state = {
    toastId: `transaction-progress-${nextSessionToastId++}`,
    title: options.title,
    successTitle: options.successTitle,
    failureTitle: options.failureTitle,
    cancelledTitle: options.cancelledTitle,
    summary: options.summary == null ? '' : String(options.summary),
    steps: normalizedSteps.steps,
    stepsById: normalizedSteps.stepsById,
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
    const wasHidden = state.hidden && state.controller === null;
    applyPhase(controllerOrMount(), phase);
    if (!wasHidden) {
      notifyVisibility();
    }
  }

  mountController();

  return {
    updateStep(stepId, update) {
      const step = state.stepsById.get(stepId);
      assert(step, `Unknown progress step: ${stepId}`);

      if (update.status) {
        step.status = update.status;
      }
      if (Object.prototype.hasOwnProperty.call(update, 'detail')) {
        step.detail = update.detail == null ? '' : String(update.detail);
      }

      state.controller?.updateStep(stepId, update);
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
        if (visibilityListener === listener) {
          visibilityListener = null;
        }
      };
    },
  };
}
