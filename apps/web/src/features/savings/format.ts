const USDC_DECIMALS = 6n;
const USDC_SCALE = 10n ** USDC_DECIMALS;

export function formatUsdc(value: bigint): string {
  const whole = value / USDC_SCALE;
  const fractional = value % USDC_SCALE;
  const cents = (fractional * 100n) / USDC_SCALE;
  return `${whole.toString()}.${cents.toString().padStart(2, "0")}`;
}

export function formatUsdcPrecise(value: bigint): string {
  const whole = value / USDC_SCALE;
  const fractional = (value % USDC_SCALE).toString().padStart(Number(USDC_DECIMALS), "0");
  let visibleFraction = fractional;
  while (visibleFraction.length > 2 && visibleFraction.endsWith("0")) {
    visibleFraction = visibleFraction.slice(0, -1);
  }
  return `${whole.toString()}.${visibleFraction}`;
}
