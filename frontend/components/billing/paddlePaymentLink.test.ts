import { describe, expect, it } from "vitest";

import {
  buildOpenedTransactionStorageKey,
  getPaddleCheckoutState,
  getPaddleTransactionId,
  stripBillingCheckoutParams,
} from "./paddlePaymentLink";

describe("paddlePaymentLink helpers", () => {
  it("prefers _ptxn over ptxn", () => {
    const params = new URLSearchParams("_ptxn=txn_new&ptxn=txn_old");
    expect(getPaddleTransactionId(params)).toBe("txn_new");
  });

  it("detects supported checkout states only", () => {
    expect(getPaddleCheckoutState(new URLSearchParams("checkout=success"))).toBe("success");
    expect(getPaddleCheckoutState(new URLSearchParams("checkout=cancel"))).toBe("cancel");
    expect(getPaddleCheckoutState(new URLSearchParams("checkout=pending"))).toBeNull();
  });

  it("builds a stable opened-transaction storage key", () => {
    expect(buildOpenedTransactionStorageKey("txn_123")).toBe("pluvianai:paddle:opened:txn_123");
  });

  it("removes billing checkout params but preserves others", () => {
    const url = new URL("https://www.pluvianai.com/settings/billing?checkout=success&_ptxn=txn_1&tab=plans#top");
    expect(stripBillingCheckoutParams(url)).toBe("/settings/billing?tab=plans#top");
  });
});
