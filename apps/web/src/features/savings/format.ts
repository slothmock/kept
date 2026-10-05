import {
  formatUsdc as formatDomainUsdc,
  formatUsdcPrecise as formatDomainUsdcPrecise,
} from "../../domain/money/usdc.js";

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
