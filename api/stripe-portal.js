import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { verifyToken } from "@clerk/backend";

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

  if (!sub?.stripe_customer_id) {
    return res.status(404).json({ error: "No Stripe customer found" });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer:   sub.stripe_customer_id,
      return_url: req.body?.returnUrl ?? process.env.APP_URL,
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("[stripe-portal]", err.message);
    return res.status(500).json({ error: "Failed to create portal session" });
  }
}
