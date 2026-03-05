// lib/validate.ts
import { z } from "zod";

export const validateEmail = (email: string): string | null => {
  if (!email) return "Email is required";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return "Invalid email format";
  return null;
};

export const validatePassword = (password: string): string | null => {
  if (!password) return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  return null;
};

export const passwordStrength = (password: string): number => {
  let strength = 0;
  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
  if (/\d/.test(password)) strength++;
  if (/[^a-zA-Z\d]/.test(password)) strength++;
  return strength;
};

/**
 * Validate array response using Zod schema
 * Returns validated array or empty array on validation failure
 */
export const validateArrayResponse = <T>(
  schema: z.ZodType<T>,
  data: any,
  endpoint: string
): T[] => {
  try {
    // Handle different response formats
    let arrayData: any[] = [];

    if (Array.isArray(data)) {
      arrayData = data;
    } else if (data && typeof data === "object") {
      // Try common array wrapper patterns
      if ("data" in data && Array.isArray(data.data)) {
        arrayData = data.data;
      } else if ("items" in data && Array.isArray(data.items)) {
        arrayData = data.items;
      }
    }

    // Validate each item
    const validated: T[] = [];
    for (const item of arrayData) {
      try {
        validated.push(schema.parse(item));
      } catch (error) {
        // Skip invalid items but log in development
        if (process.env.NODE_ENV === "development") {
          console.warn(`[Validation] Skipping invalid item from ${endpoint}:`, error);
        }
      }
    }

    return validated;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error(`[Validation] Failed to validate array response from ${endpoint}:`, error);
    }
    return [];
  }
};
