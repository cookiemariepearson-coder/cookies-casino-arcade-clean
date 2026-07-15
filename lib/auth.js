import { supabaseAdmin } from "./supabase-admin.js";

export async function requireUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    throw Object.assign(new Error("Please sign in."), { status: 401 });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    throw Object.assign(
      new Error("Your session expired. Please sign in again."),
      { status: 401 }
    );
  }

  return data.user;
}

export function sendError(res, error) {
  return res
    .status(error.status || 500)
    .json({ error: error.message || "Server error" });
}
