import assert from 'node:assert/strict';
import test from 'node:test';

import { createTransactionProgressSession } from '../js/utils/transaction-progress-session.js';

function makeToastApi() {
  const controllers = [];
  let createCount = 0;

  return {
    controllers,
    get createCount() {
      return createCount;
    },
    createTransactionProgress() {
      createCount += 1;
      let closeHandler = null;
      const controller = {
        terminal: null,
        onClose(callback) {
          closeHandler = callback;
          return () => {
            if (closeHandler === callback) {
              closeHandler = null;
            }
          };
        },
        updateStep() {},
        setSummary() {},
        setTransactionLink() {},
        finishSuccess(message) {
          controller.terminal = { type: 'success', message };
        },
        finishFailure(message) {
          controller.terminal = { type: 'failure', message };
        },
        finishCancelled(message) {
          controller.terminal = { type: 'cancelled', message };
        },
        close() {
          closeHandler?.();
        },
      };
      controllers.push(controller);
      return controller;
    },
  };
}

test('hidden progress session remounts to show its terminal state', () => {
  const toastApi = makeToastApi();
  const session = createTransactionProgressSession(toastApi, {
    title: 'Bridge',
    successTitle: 'Done',
    failureTitle: 'Failed',
    cancelledTitle: 'Cancelled',
    steps: [{ id: 'submit', label: 'Submit' }],
  });
  const visibility = [];
  session.onVisibilityChange((state) => visibility.push(state));

  toastApi.controllers[0].close();
  session.finishSuccess('Bridge confirmed.');

  assert.equal(toastApi.createCount, 2);
  assert.equal(session.isHidden(), false);
  assert.equal(session.isActive(), false);
  assert.deepEqual(toastApi.controllers[1].terminal, {
    type: 'success',
    message: 'Bridge confirmed.',
  });
  assert.deepEqual(visibility, [
    { hidden: true, active: true },
    { hidden: false, active: false },
  ]);
});
