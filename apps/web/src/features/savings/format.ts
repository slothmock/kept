import {
  formatUsdc as formatDomainUsdc,
  formatUsdcPrecise as formatDomainUsdcPrecise,
} from "@/lib/usdc";

export function formatUsdc(
  value: bigint,
): string {
  return formatDomainUsdc(value);
}

export function formatUsdcPrecise(
  value: bigint,
): string {
  return formatDomainUsdcPrecise(value);
}
