import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  // Verify JWT — just need the user_id; anon key is sufficient for getUser()
  const supabaseAuth = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser();
  if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });

  const { event_name, feature = null, context = {} } = req.body ?? {};
  if (!event_name || typeof event_name !== "string") {
    return res.status(400).json({ error: "event_name required" });
  }

  // Sanitise — strip any keys whose values look like financial amounts (numbers > 100)
  // to enforce the privacy rule: no plan financial values in event payloads.
  const safeContext = Object.fromEntries(
    Object.entries(context).filter(([, v]) => typeof v !== "number" || v <= 100)
  );

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { error: insertErr } = await supabaseAdmin.from("events").insert({
    user_id:    user.id,
    event_name: event_name.slice(0, 80),
    feature:    feature ? String(feature).slice(0, 80) : null,
    context:    safeContext,
  });

  if (insertErr) {
    console.error("[track]", insertErr.message);
    return res.status(500).json({ error: "Failed to record event" });
  }

  return res.status(200).json({ ok: true });
}
