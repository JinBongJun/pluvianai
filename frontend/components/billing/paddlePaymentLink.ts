export const OPENED_TXN_KEY_PREFIX = "pluvianai:paddle:opened:";

export function getPaddleTransactionId(searchParams: URLSearchParams): string | null {
  return searchParams.get("_ptxn") || searchParams.get("ptxn");
}

export function getPaddleCheckoutState(
  searchParams: URLSearchParams
): "success" | "cancel" | null {
  const value = searchParams.get("checkout");
  return value === "success" || value === "cancel" ? value : null;
}

export function buildOpenedTransactionStorageKey(transactionId: string): string {
  return `${OPENED_TXN_KEY_PREFIX}${transactionId}`;
}

export function stripBillingCheckoutParams(url: URL): string {
  const next = new URL(url.toString());
  next.searchParams.delete("checkout");
  next.searchParams.delete("_ptxn");
  next.searchParams.delete("ptxn");
  const query = next.searchParams.toString();
  return `${next.pathname}${query ? `?${query}` : ""}${next.hash}`;
}
