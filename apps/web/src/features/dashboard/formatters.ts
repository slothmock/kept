import { formatUnits } from "viem";

export function formatAccount(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatUsdc(value: bigint): string {
  return Number(formatUnits(value, 6)).toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}
