const USDC_DECIMALS = 6n;
const USDC_SCALE = 10n ** USDC_DECIMALS;

export function formatUsdc(value: bigint): string {
  const whole = value / USDC_SCALE;
  const fractional = value % USDC_SCALE;
  const cents = (fractional * 100n) / USDC_SCALE;
  return `${whole.toString()}.${cents.toString().padStart(2, "0")}`;
}
