const USDC_DECIMALS = 6n;
const USDC_SCALE = 10n ** USDC_DECIMALS;

function splitUsdc(value: bigint): {
  readonly negative: boolean;
  readonly whole: bigint;
  readonly fractional: bigint;
} {
  const negative = value < 0n;
  const absolute = negative ? -value : value;

  return {
    negative,
    whole: absolute / USDC_SCALE,
    fractional: absolute % USDC_SCALE,
  };
}

export function formatUsdc(value: bigint): string {
  const { negative, whole, fractional } = splitUsdc(value);

  const cents = (fractional * 100n) / USDC_SCALE;

  return `${negative ? "-" : ""}${whole.toString()}.${cents
    .toString()
    .padStart(2, "0")}`;
}

export function formatUsdcPrecise(value: bigint): string {
  const { negative, whole, fractional } = splitUsdc(value);

  let visibleFraction = fractional
    .toString()
    .padStart(Number(USDC_DECIMALS), "0");

  while (visibleFraction.length > 2 && visibleFraction.endsWith("0")) {
    visibleFraction = visibleFraction.slice(0, -1);
  }

  return `${negative ? "-" : ""}${whole.toString()}.${visibleFraction}`;
}
