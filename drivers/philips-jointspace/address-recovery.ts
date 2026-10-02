import { extractCanonicalId } from "./quirks";
import { normalizeMacAddress } from "./mac";
import type { SystemInfo } from "./types";

export interface DiscoveryAddressCandidate {
  id: string;
  address: string;
  source: "ssdp" | "mdns" | "arp";
}

interface FindAddressByMacOptions {
  currentAddress: string;
  expectedMac: string;
  resolveMac(address: string): Promise<unknown>;
  concurrency?: number;
}

interface FindAddressBySystemIdentityOptions {
  currentAddress: string;
  expectedCanonicalId: string;
  probeSystem(address: string): Promise<SystemInfo>;
  concurrency?: number;
}

function ipv4SubnetAddresses(currentAddress: string): string[] | null {
  const octets = currentAddress.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null;
  }

  const prefix = octets.slice(0, 3).join(".");
  const currentHost = octets[3];
  return Array.from({ length: 254 }, (_, index) => index + 1)
    .filter((host) => host !== currentHost)
    // DHCP normally moves a lease only a few addresses. Probe nearby hosts
    // first so the usual recovery completes in the first bounded batch.
    .sort((left, right) => Math.abs(left - currentHost) - Math.abs(right - currentHost) || left - right)
    .map((host) => `${prefix}.${host}`);
}

/**
 * Find the paired TV on the current IPv4 /24 using only an anonymous, short
 * GET /system probe. The caller supplies the transport so this helper stays
 * deterministic in tests. No pairing credentials are sent during the scan.
 */
export async function findAddressBySystemIdentity({
  currentAddress,
  expectedCanonicalId,
  probeSystem,
  concurrency = 24,
}: FindAddressBySystemIdentityOptions): Promise<string | null> {
  const addresses = ipv4SubnetAddresses(currentAddress);
  if (!addresses || !expectedCanonicalId || expectedCanonicalId.startsWith("ip-") || concurrency < 1) {
    return null;
  }

  for (let offset = 0; offset < addresses.length; offset += concurrency) {
    const batch = addresses.slice(offset, offset + concurrency);
    const results = await Promise.all(batch.map(async (address) => {
      try {
        const system = await probeSystem(address);
        const canonicalId = extractCanonicalId(system, { ip: address });
        return canonicalId === expectedCanonicalId ? address : null;
      } catch {
        return null;
      }
    }));
    const match = results.find((address): address is string => Boolean(address));
    if (match) return match;
  }

  return null;
}

/** Resolve the paired MAC within the current IPv4 /24 without credentials. */
export async function findAddressByMac({
  currentAddress,
  expectedMac,
  resolveMac,
  concurrency = 32,
}: FindAddressByMacOptions): Promise<string | null> {
  const addresses = ipv4SubnetAddresses(currentAddress);
  const normalizedExpected = normalizeMacAddress(expectedMac);
  if (!addresses || !normalizedExpected || concurrency < 1) {
    return null;
  }

  for (let offset = 0; offset < addresses.length; offset += concurrency) {
    const batch = addresses.slice(offset, offset + concurrency);
    const results = await Promise.all(batch.map(async (address) => {
      try {
        const mac = normalizeMacAddress(await resolveMac(address));
        return mac === normalizedExpected ? address : null;
      } catch {
        return null;
      }
    }));
    const match = results.find((address): address is string => Boolean(address));
    if (match) return match;
  }

  return null;
}

interface FindRecoveredAddressOptions {
  candidates: DiscoveryAddressCandidate[];
  currentAddress: string;
  expectedCanonicalId: string;
  probeSystem(candidate: DiscoveryAddressCandidate): Promise<SystemInfo>;
}

/**
 * Find the new address of an already-paired TV without trusting its model
 * name or discovery order. Every candidate must answer /system and produce
 * the exact canonical id stored during pairing (normally serial based).
 */
export async function findRecoveredAddress({
  candidates,
  currentAddress,
  expectedCanonicalId,
  probeSystem,
}: FindRecoveredAddressOptions): Promise<string | null> {
  const unique = new Map<string, DiscoveryAddressCandidate>();
  for (const candidate of candidates) {
    if (!candidate.address || candidate.address === currentAddress) continue;
    if (!unique.has(candidate.address)) unique.set(candidate.address, candidate);
  }

  for (const candidate of unique.values()) {
    try {
      const system = await probeSystem(candidate);
      const canonicalId = extractCanonicalId(system, {
        usn: candidate.source === "ssdp" ? candidate.id : undefined,
        mdnsName: candidate.source === "mdns" ? candidate.id : undefined,
        ip: candidate.address,
      });
      if (canonicalId === expectedCanonicalId) return candidate.address;
    } catch {
      // A stale discovery entry or another unreachable Philips TV is not a
      // recovery failure. Continue with the remaining candidates.
    }
  }

  return null;
}
