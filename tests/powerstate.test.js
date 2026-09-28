"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { NotFoundError, OfflineError } = require("../.homeybuild/drivers/philips-jointspace/errors");
const { JointspaceApi } = require("../.homeybuild/drivers/philips-jointspace/jointspace-api");

function createApi(request) {
  const api = new JointspaceApi({ host: "192.0.2.10", apiVersion: 6, secured: true, port: 1926 });
  api.request = request;
  return api;
}

test("falls back to the Standby key when SAPHI has no powerstate endpoint", async () => {
  const calls = [];
  const api = createApi(async (options) => {
    calls.push(options);
    if (options.path === "powerstate") throw new NotFoundError();
    return {};
  });

  await api.setPowerState(false);

  assert.deepEqual(calls, [
    { method: "POST", path: "powerstate", data: { powerstate: "Standby" } },
    { method: "POST", path: "input/key", data: { key: "Standby" } },
  ]);
});

test("does not send Standby after a transient powerstate failure", async () => {
  const calls = [];
  const api = createApi(async (options) => {
    calls.push(options);
    throw new OfflineError();
  });

  await assert.rejects(api.setPowerState(false), OfflineError);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "powerstate");
});

test("does not send Standby when the normal powerstate endpoint succeeds", async () => {
  const calls = [];
  const api = createApi(async (options) => {
    calls.push(options);
    return {};
  });

  await api.setPowerState(false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "powerstate");
});

test("also sends Standby when SAPHI returns success without acting on powerstate", async () => {
  const calls = [];
  const api = createApi(async (options) => {
    calls.push(options);
    return {};
  });

  await api.setPowerState(false, { forceStandbyKey: true });

  assert.deepEqual(calls, [
    { method: "POST", path: "powerstate", data: { powerstate: "Standby" } },
    { method: "POST", path: "input/key", data: { key: "Standby" } },
  ]);
});

test("sends Standby only once when SAPHI powerstate is missing", async () => {
  const calls = [];
  const api = createApi(async (options) => {
    calls.push(options);
    if (options.path === "powerstate") throw new NotFoundError();
    return {};
  });

  await api.setPowerState(false, { forceStandbyKey: true });

  assert.equal(calls.filter((call) => call.path === "input/key").length, 1);
});
