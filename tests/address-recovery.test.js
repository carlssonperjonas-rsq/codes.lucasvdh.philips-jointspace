"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  findAddressByMac,
  findAddressBySystemIdentity,
  findRecoveredAddress,
} = require("../.homeybuild/drivers/philips-jointspace/address-recovery");

const matchingSystem = { serialnumber_encrypted: "stable-encrypted-serial" };
const expectedCanonicalId = "enc-serial-stable-encrypted-serial";

test("recovers only the address whose system identity matches", async () => {
  const candidates = [
    { id: "other-tv", address: "192.0.2.20", source: "mdns" },
    { id: "paired-tv", address: "192.0.2.30", source: "mdns" },
  ];

  const recovered = await findRecoveredAddress({
    candidates,
    currentAddress: "192.0.2.10",
    expectedCanonicalId,
    probeSystem: async (candidate) => candidate.id === "paired-tv"
      ? matchingSystem
      : { serialnumber_encrypted: "different-tv" },
  });

  assert.equal(recovered, "192.0.2.30");
});

test("ignores the current address, duplicate discovery entries, and probe failures", async () => {
  const probed = [];
  const candidates = [
    { id: "current", address: "192.0.2.10", source: "mdns" },
    { id: "stale", address: "192.0.2.20", source: "ssdp" },
    { id: "duplicate", address: "192.0.2.20", source: "mdns" },
  ];

  const recovered = await findRecoveredAddress({
    candidates,
    currentAddress: "192.0.2.10",
    expectedCanonicalId,
    probeSystem: async (candidate) => {
      probed.push(candidate.address);
      throw new Error("offline");
    },
  });

  assert.equal(recovered, null);
  assert.deepEqual(probed, ["192.0.2.20"]);
});

test("supports a stable mDNS identity when firmware exposes no serial", async () => {
  const recovered = await findRecoveredAddress({
    candidates: [{ id: "living-room-tv", address: "192.0.2.40", source: "mdns" }],
    currentAddress: "192.0.2.10",
    expectedCanonicalId: "mdns-living-room-tv",
    probeSystem: async () => ({}),
  });

  assert.equal(recovered, "192.0.2.40");
});

test("finds a changed address by normalized MAC within the same /24", async () => {
  const resolved = [];
  const recovered = await findAddressByMac({
    currentAddress: "192.0.2.10",
    expectedMac: "AA-BB-CC-DD-EE-FF",
    concurrency: 64,
    resolveMac: async (address) => {
      resolved.push(address);
      return address === "192.0.2.58" ? "aa:bb:cc:dd:ee:ff" : null;
    },
  });

  assert.equal(recovered, "192.0.2.58");
  assert.equal(resolved.includes("192.0.2.10"), false);
});

test("finds a nearby DHCP address by anonymous system identity", async () => {
  const probed = [];
  const recovered = await findAddressBySystemIdentity({
    currentAddress: "192.0.2.61",
    expectedCanonicalId,
    concurrency: 8,
    probeSystem: async (address) => {
      probed.push(address);
      if (address === "192.0.2.58") return matchingSystem;
      throw new Error("not a Philips TV");
    },
  });

  assert.equal(recovered, "192.0.2.58");
  assert.equal(probed.includes("192.0.2.61"), false);
  assert.equal(probed.includes("192.0.2.58"), true);
  assert.equal(probed.length, 8, "nearby address should be found in the first bounded batch");
});

test("anonymous subnet recovery ignores other Philips TVs", async () => {
  const recovered = await findAddressBySystemIdentity({
    currentAddress: "192.0.2.61",
    expectedCanonicalId,
    concurrency: 64,
    probeSystem: async () => ({ serialnumber_encrypted: "different-tv" }),
  });

  assert.equal(recovered, null);
});

test("does not scan when the address or expected MAC is invalid", async () => {
  let calls = 0;
  const recovered = await findAddressByMac({
    currentAddress: "not-an-ip",
    expectedMac: "not-a-mac",
    resolveMac: async () => {
      calls += 1;
      return null;
    },
  });

  assert.equal(recovered, null);
  assert.equal(calls, 0);
});

test("does not anonymously scan without a stable identity", async () => {
  let calls = 0;
  const recovered = await findAddressBySystemIdentity({
    currentAddress: "192.0.2.61",
    expectedCanonicalId: "ip-192.0.2.61",
    probeSystem: async () => {
      calls += 1;
      return matchingSystem;
    },
  });

  assert.equal(recovered, null);
  assert.equal(calls, 0);
});
