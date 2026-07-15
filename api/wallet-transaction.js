import { requireUser, sendError } from "../lib/auth.js";
import { supabaseAdmin } from "../lib/supabase-admin.js";

const GAME_COSTS = {
  spades: 75,
  solitaire: 40,
  uno: 60,
  crush: 50,
  bingo: 45,
  word: 35,
  chess: 60,
  dominoes: 50
};

const MAX_REWARD_BY_GAME = {
  spades: 700,
  solitaire: 500,
  uno: 500,
  crush: 700,
  bingo: 350,
  word: 700,
  chess: 400,
  dominoes: 350,
  arcade: 100
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const user = await requireUser(req);
    const action = String(req.body?.action || "");
    const gameKey = String(req.body?.gameKey || "");
    const requestId = String(req.body?.requestId || "");

    if (!/^[a-z0-9_-]{12,120}$/i.test(requestId)) {
      return res.status(400).json({
        error: "Invalid transaction request."
      });
    }

    let amount;
    let type;

    if (action === "game_entry") {
      const cost = GAME_COSTS[gameKey];

      if (!cost) {
        return res.status(400).json({ error: "Unknown game." });
      }

      amount = -cost;
      type = "game_entry";
    } else if (action === "game_reward") {
      const requested = Math.floor(Number(req.body?.coins || 0));
      const maximum = MAX_REWARD_BY_GAME[gameKey] || 0;

      if (requested < 1 || requested > maximum) {
        return res.status(400).json({
          error: "Reward is outside the allowed range."
        });
      }

      amount = requested;
      type = "game_reward";
    } else {
      return res.status(400).json({
        error: "Unknown wallet action."
      });
    }

    const { data, error } = await supabaseAdmin.rpc(
      "apply_arcade_wallet_transaction",
      {
        p_user_id: user.id,
        p_amount: amount,
        p_type: type,
        p_reference: requestId,
        p_metadata: { game_key: gameKey }
      }
    );

    if (error) throw error;

    return res.status(200).json({
      wallet: data.wallet,
      transaction: data.transaction
    });
  } catch (error) {
    if (/insufficient/i.test(error.message || "")) {
      error.status = 402;
    }

    return sendError(res, error);
  }
}
