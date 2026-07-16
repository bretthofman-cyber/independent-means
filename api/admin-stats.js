import { createClient } from "@supabase/supabase-js";
import {
  gateClicksByFeature,
  funnelStats,
  trialConversionByFeature,
} from "../src/adminStatsQueries.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabaseAuth = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser();
  if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });

  if (user.email !== process.env.ADMIN_EMAIL) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { action, from, to } = req.query;

  // Default date range: last 30 days
  const toDate   = to   ? new Date(to)   : new Date();
  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
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
