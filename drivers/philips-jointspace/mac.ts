const MAC_ADDRESS_PATTERN = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;

export function normalizeMacAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!MAC_ADDRESS_PATTERN.test(trimmed)) return null;
  return trimmed.replace(/-/g, ":").toLowerCase();
}

export function selectWakeMac(storeMac: unknown, dataMac: unknown): string | null {
  return normalizeMacAddress(storeMac) ?? normalizeMacAddress(dataMac);
}

export async function resolveMacAddress(
  arp: { getMAC(ip: string): Promise<unknown> },
  ip: string,
  timeoutMs = 8_000,
): Promise<string | null> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    const value = await Promise.race([
      arp.getMAC(ip),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`ARP lookup timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
    return normalizeMacAddress(value);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
