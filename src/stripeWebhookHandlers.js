/**
 * Pure webhook handler logic — no Stripe/Supabase imports so Vitest can test
 * this directly. The Vercel function (api/stripe-webhook.js) imports from here.
 */

export function mapStripeStatus(stripeStatus) {
  if (stripeStatus === "active" || stripeStatus === "trialing") return "active";
  if (stripeStatus === "past_due")                               return "past_due";
  return "canceled";
}

/**
 * Process a verified Stripe event and update the subscriptions table.
 * @param {object} event   - Stripe event object (already verified)
 * @param {object} supabase - Supabase client with service_role key
 * @returns {{ ok: boolean, reason?: string }}
 */
export async function handleWebhookEvent(event, supabase) {
  const now = new Date().toISOString();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId  = session.metadata?.user_id;
      if (!userId) return { ok: false, reason: "no user_id in metadata" };

      const { error: e1 } = await supabase.from("subscriptions").upsert(
        {
          user_id:                 userId,
          stripe_customer_id:      session.customer,
          stripe_subscription_id:  session.subscription,
          status:                  "active",
          trial_started_at:        null,
          trial_ends_at:           null,
          current_period_end:      null,
          updated_at:              now,
        },
        { onConflict: "user_id" }
      );
      if (e1) { console.error("[webhook] checkout.session.completed DB error:", e1.message); return { ok: false, reason: e1.message }; }
      return { ok: true };
    }

    case "customer.subscription.updated": {
      const sub    = event.data.object;
      const userId = sub.metadata?.user_id;
      if (!userId) return { ok: false, reason: "no user_id in metadata" };

      const { error: e2 } = await supabase.from("subscriptions").upsert(
        {
          user_id:                userId,
          stripe_subscription_id: sub.id,
          stripe_customer_id:     sub.customer,
          status:                 mapStripeStatus(sub.status),
          current_period_end:     new Date(sub.current_period_end * 1000).toISOString(),
          updated_at:             now,
        },
        { onConflict: "user_id" }
      );
      if (e2) { console.error("[webhook] customer.subscription.updated DB error:", e2.message); return { ok: false, reason: e2.message }; }
      return { ok: true };
    }

    case "customer.subscription.deleted": {
      const sub    = event.data.object;
      const userId = sub.metadata?.user_id;
      if (!userId) return { ok: false, reason: "no user_id in metadata" };

      const { error: e3 } = await supabase.from("subscriptions")
        .update({ status: "canceled", updated_at: now })
        .eq("user_id", userId);
      if (e3) { console.error("[webhook] customer.subscription.deleted DB error:", e3.message); return { ok: false, reason: e3.message }; }
      return { ok: true };
    }

    case "invoice.payment_failed": {
      const invoice        = event.data.object;
      const subscriptionId = invoice.subscription;
      if (!subscriptionId) return { ok: false, reason: "no subscription on invoice" };

      const { error: e4 } = await supabase.from("subscriptions")
        .update({ status: "past_due", updated_at: now })
        .eq("stripe_subscription_id", subscriptionId);
      if (e4) { console.error("[webhook] invoice.payment_failed DB error:", e4.message); return { ok: false, reason: e4.message }; }
      return { ok: true };
    }

    default:
      return { ok: true, reason: "event type not handled" };
  }
}
