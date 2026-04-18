/**
 * Helper types for Supabase queries that join related tables.
 * Use these instead of `as any` to keep type-safety with PostgREST joins.
 */
import type { Tables } from "@/integrations/supabase/types";

export type Profile = Tables<"profiles">;
export type Package = Tables<"packages">;
export type Subscription = Tables<"subscriptions">;
export type SubscriptionRequest = Tables<"subscription_requests">;

/** Subscription with the joined package row (from `select("*, packages(*)")`). */
export type SubscriptionWithPackage = Subscription & {
  packages: Package | null;
};

/** Subscription request with the joined package row. */
export type SubscriptionRequestWithPackage = SubscriptionRequest & {
  packages: Package | null;
};
