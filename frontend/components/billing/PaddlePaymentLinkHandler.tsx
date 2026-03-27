"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { initializePaddle } from "@paddle/paddle-js";
import { useToast } from "@/components/ToastContainer";
import {
  buildOpenedTransactionStorageKey,
  getPaddleCheckoutState,
  getPaddleTransactionId,
} from "@/components/billing/paddlePaymentLink";

export default function PaddlePaymentLinkHandler() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const toast = useToast();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const checkoutState = getPaddleCheckoutState(url.searchParams);
    const transactionId = getPaddleTransactionId(url.searchParams);

    if (checkoutState === "success" || checkoutState === "cancel") {
      if (transactionId) {
        sessionStorage.removeItem(buildOpenedTransactionStorageKey(transactionId));
      }
      return;
    }

    if (!transactionId) return;

    const openedKey = buildOpenedTransactionStorageKey(transactionId);
    const alreadyOpened = sessionStorage.getItem(openedKey) === "1";
    const onCheckoutPage = pathname === "/checkout";
    if (alreadyOpened && !onCheckoutPage) return;
    if (alreadyOpened && onCheckoutPage) {
      // Allow manual refresh on /checkout to retry opening the same transaction modal.
      sessionStorage.removeItem(openedKey);
    }

    const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    const environment =
      process.env.NEXT_PUBLIC_PADDLE_ENV === "sandbox" ? "sandbox" : "production";

    if (!clientToken) {
      toast.showToast("Paddle checkout is not configured for this environment.", "error");
      return;
    }

    sessionStorage.setItem(openedKey, "1");

    let disposed = false;
    let checkoutCompleted = false;

    const openCheckout = async () => {
      try {
        const paddle = await initializePaddle({
          environment,
          token: clientToken,
          eventCallback: (event: { name?: string }) => {
            const eventName = event?.name;
            if (eventName === "checkout.completed") {
              checkoutCompleted = true;
              return;
            }
            if (eventName === "checkout.closed" && !checkoutCompleted && !disposed) {
              sessionStorage.removeItem(openedKey);
              window.location.href = "/settings/billing?checkout=cancel";
            }
          },
        });

        if (!paddle || disposed) {
          sessionStorage.removeItem(openedKey);
          return;
        }

        paddle.Checkout.open({
          transactionId,
          settings: {
            successUrl: `${window.location.origin}/settings/billing?checkout=success`,
          },
        });
      } catch (error) {
        console.error("Failed to open Paddle checkout", error);
        sessionStorage.removeItem(openedKey);
        toast.showToast("Failed to open secure checkout. Please try again.", "error");
      }
    };

    void openCheckout();

    return () => {
      disposed = true;
    };
  }, [pathname, search, toast]);

  return null;
}
