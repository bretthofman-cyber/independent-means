import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { verifyToken, createClerkClient } from "@clerk/backend";

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  let clerkUserId;
  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    clerkUserId = payload.sub;
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { planType } = req.body ?? {};
  const priceMap = {
    monthly: process.env.STRIPE_PRICE_MONTHLY,
    annual:  process.env.STRIPE_PRICE_ANNUAL,
  };
  const priceId = priceMap[planType];
  if (!priceId) return res.status(400).json({ error: "Invalid plan type" });

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let sub;
  try {
    const { data, error } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", clerkUserId)
      .maybeSingle();
    if (error) throw error;
    sub = data;
  } catch {
    return res.status(500).json({ error: "Failed to look up subscription" });
  }

  let customerEmail;
  if (!sub?.stripe_customer_id) {
    try {
      const clerkUser = await clerkClient.users.getUser(clerkUserId);
      customerEmail = clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress;
    } catch {
      return res.status(500).json({ error: "Failed to look up user" });
    }
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const sessionParams = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.APP_URL}?checkout=success`,
    cancel_url:  `${process.env.APP_URL}?checkout=cancelled`,
    metadata: { user_id: clerkUserId },
    subscription_data: { metadata: { user_id: clerkUserId } },
    allow_promotion_codes: true,
  };

  if (sub?.stripe_customer_id) {
    sessionParams.customer = sub.stripe_customer_id;
  } else if (customerEmail) {
    sessionParams.customer_email = customerEmail;
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionParams);
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("[stripe-checkout]", err.message);
    return res.status(500).json({ error: "Failed to create checkout session" });
  }
}
