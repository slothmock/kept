const MOONPAY_RETURN_PARAMS = [
  "moonpayOrderId",
  "transactionId",
  "baseCurrencyCode",
  "baseCurrencyAmount",
  "depositWalletAddress",
] as const;

export interface MoonPayReturnReference {
  readonly orderId: string;
  readonly cleanedPath: string;
}

export function consumeMoonPayReturnUrl(value: string): MoonPayReturnReference | null {
  const url = new URL(value);
  const orderId = url.searchParams.get("moonpayOrderId")?.trim();

  if (!orderId) return null;

  for (const key of MOONPAY_RETURN_PARAMS) {
    url.searchParams.delete(key);
  }

  return {
    orderId,
    cleanedPath: `${url.pathname}${url.search}${url.hash}`,
  };
}
