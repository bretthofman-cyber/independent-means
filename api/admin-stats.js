import { createClient } from "@supabase/supabase-js";
import { verifyToken, createClerkClient } from "@clerk/backend";
import {
  gateClicksByFeature,
  funnelStats,
  trialConversionByFeature,
} from "../src/adminStatsQueries.js";

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

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

  // Look up email to verify admin access
  let userEmail;
  try {
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    userEmail = clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress;
  } catch {
    return res.status(500).json({ error: "Auth lookup failed" });
  }
  if (typeof userEmail !== "string" || !process.env.ADMIN_EMAIL || userEmail !== process.env.ADMIN_EMAIL) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { action, from, to } = req.query;

  const toDate   = to   ? new Date(to)   : new Date();
  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (isNaN(toDate) || isNaN(fromDate)) return res.status(400).json({ error: "Invalid date range" });
  const range = { from: fromDate.toISOString(), to: toDate.toISOString() };

  try {
    if (action === "gate_clicks") {
      const data = await gateClicksByFeature(supabaseAdmin, range);
      return res.status(200).json({ data });
    }
    if (action === "funnel") {
      const data = await funnelStats(supabaseAdmin, range);
      return res.status(200).json({ data });
    }
    if (action === "trial_conversion") {
      const data = await trialConversionByFeature(supabaseAdmin);
      return res.status(200).json({ data });
    }
    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    console.error("[admin-stats]", err.message);
    return res.status(500).json({ error: "Query failed" });
  }
}
