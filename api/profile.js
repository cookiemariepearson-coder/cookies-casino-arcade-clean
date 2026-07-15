import { requireUser, sendError } from "../lib/auth.js";
import { supabaseAdmin } from "../lib/supabase-admin.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const user = await requireUser(req);
    const username = String(req.body?.username || "").trim().toLowerCase();
    const displayName = String(req.body?.displayName || "").trim();

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      return res.status(400).json({
        error:
          "Player name must use 3–24 letters, numbers, or underscores."
      });
    }

    if (displayName.length < 1 || displayName.length > 40) {
      return res.status(400).json({
        error: "Display name must be 1–40 characters."
      });
    }

    const { data, error } = await supabaseAdmin
      .from("arcade_profiles")
      .update({
        username,
        display_name: displayName,
        updated_at: new Date().toISOString()
      })
      .eq("id", user.id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          error: "That player name is already taken."
        });
      }
      throw error;
    }

    return res.status(200).json({ profile: data });
  } catch (error) {
    return sendError(res, error);
  }
}
