import Stripe from "stripe";
import { requireUser, sendError } from "../lib/auth.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PACKS = {
  starter: {
    coins: 500,
    priceId: process.env.STRIPE_PRICE_STARTER
  },
  player: {
    coins: 1200,
    priceId: process.env.STRIPE_PRICE_PLAYER
  },
  high_roller: {
    coins: 3000,
    priceId: process.env.STRIPE_PRICE_HIGH_ROLLER
  },
  vip: {
    coins: 7500,
    priceId: process.env.STRIPE_PRICE_VIP
  }
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const user = await requireUser(req);
    const packId = String(req.body?.packId || "");
    const pack = PACKS[packId];

    if (!pack?.priceId) {
      return res.status(400).json({
        error: "Coin pack is not configured."
      });
    }

    const baseUrl = process.env.PUBLIC_SITE_URL;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      line_items: [{ price: pack.priceId, quantity: 1 }],
      success_url:
        `${baseUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?checkout=cancelled`,
      client_reference_id: user.id,
      metadata: {
        user_id: user.id,
        coin_amount: String(pack.coins),
        pack_id: packId
      }
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    return sendError(res, error);
  }
}
