import { requireUser, sendError } from "../lib/auth.js";
import { supabaseAdmin } from "../lib/supabase-admin.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const user = await requireUser(req);

    const xp = Math.max(0, Math.min(99, Number(req.body?.xp || 0)));
    const vip = Math.max(1, Math.min(999, Number(req.body?.vip || 1)));
    const inputSettings = req.body?.settings || {};

    const settings = {
      sound: inputSettings.sound !== false,
      music: inputSettings.music !== false,
      voice: inputSettings.voice !== false
    };

    const { data, error } = await supabaseAdmin
      .from("arcade_progress")
      .upsert(
        {
          user_id: user.id,
          xp,
          vip,
          settings,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      )
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ progress: data });
  } catch (error) {
    return sendError(res, error);
  }
}
