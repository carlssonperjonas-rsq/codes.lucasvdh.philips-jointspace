"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  normalizeMacAddress,
  resolveMacAddress,
  selectWakeMac,
} = require("../.homeybuild/drivers/philips-jointspace/mac");

test("normalizes valid MAC addresses for wol", () => {
  assert.equal(normalizeMacAddress("02-00-00-00-00-01"), "02:00:00:00:00:01");
  assert.equal(normalizeMacAddress("invalid"), null);
});

test("prefers a stored MAC over immutable device data", () => {
  assert.equal(
    selectWakeMac("11:22:33:44:55:66", "aa:bb:cc:dd:ee:ff"),
    "11:22:33:44:55:66",
  );
  assert.equal(selectWakeMac(null, "AA-BB-CC-DD-EE-FF"), "aa:bb:cc:dd:ee:ff");
});

test("resolves and normalizes a MAC through Homey ARP", async () => {
  const arp = { getMAC: async () => "02-00-00-00-00-01" };
  assert.equal(await resolveMacAddress(arp, "192.0.2.10"), "02:00:00:00:00:01");
});
