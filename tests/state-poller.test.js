"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { NotFoundError } = require("../.homeybuild/drivers/philips-jointspace/errors");
const { StatePoller } = require("../.homeybuild/drivers/philips-jointspace/state-poller");

function createListener(powerChanges) {
  return {
    handlePowerStateChange: (source, state) => powerChanges.push({ source, state }),
    handleAudioChange: () => {},
    handleAmbiHueChange: () => {},
    handleAmbilightChange: () => {},
    handleActivityChange: () => {},
    handleScreenStateChange: () => {},
    handleCurrentSourceChange: () => {},
    onPollFailure: () => {},
    onPollSuccess: () => {},
    isCapabilityPresent: () => false,
  };
}

const immediateTimers = {
  setTimeout(callback) {
    callback();
    return {};
  },
  clearTimeout() {},
};

test("infers power on when SAPHI responds but has no powerstate endpoint", async () => {
  const powerChanges = [];
  const api = {
    getAudioData: async () => ({ current: 10, min: 0, max: 60, muted: false }),
    getAmbiHue: async () => { throw new NotFoundError(); },
    getAmbilight: async () => ({}),
    getPowerState: async () => { throw new NotFoundError(); },
  };
  const poller = new StatePoller(api, createListener(powerChanges), () => {}, immediateTimers, {
    notifyChangeSupported: false,
  });

  await poller.pollOnce();

  assert.deepEqual(powerChanges, [{ source: "poll", state: { powerstate: "On" } }]);
});

test("uses explicit powerstate without adding an inferred state", async () => {
  const powerChanges = [];
  const api = {
    getAudioData: async () => ({ current: 10, min: 0, max: 60, muted: false }),
    getAmbiHue: async () => { throw new NotFoundError(); },
    getAmbilight: async () => ({}),
    getPowerState: async () => ({ powerstate: "Standby" }),
  };
  const poller = new StatePoller(api, createListener(powerChanges), () => {}, immediateTimers, {
    notifyChangeSupported: false,
  });

  await poller.pollOnce();

  assert.deepEqual(powerChanges, [{ source: "poll", state: { powerstate: "Standby" } }]);
});
