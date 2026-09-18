import { parseUnits } from "viem";

export type ParsedUsdcDepositAmount =
  | { readonly assets: bigint }
  | { readonly error: string };

const DECIMAL_AMOUNT = /^\d+(?:\.\d+)?$/;

export function parseUsdcDepositAmount(value: string): ParsedUsdcDepositAmount {
  const trimmed = value.trim();

  if (!DECIMAL_AMOUNT.test(trimmed) || trimmed === "0" || /^0\.0*$/.test(trimmed)) {
    return { error: "Enter an amount greater than 0." };
  }

  const fraction = trimmed.split(".")[1];
  if (fraction && fraction.length > 6) {
    return { error: "Enter up to 6 decimal places." };
  }

  return { assets: parseUnits(trimmed, 6) };
}
