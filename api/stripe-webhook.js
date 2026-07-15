import Stripe from "stripe";
import { supabaseAdmin } from "../lib/supabase-admin.js";

export const config = {
  api: {
    bodyParser: false
  }
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function readRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(
      typeof chunk === "string" ? Buffer.from(chunk) : chunk
    );
  }

  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const event = stripe.webhooks.constructEvent(
      await readRawBody(req),
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.user_id;
      const coins = Number(session.metadata?.coin_amount || 0);

      if (userId && coins > 0) {
        const { error } = await supabaseAdmin.rpc(
          "apply_arcade_wallet_transaction",
          {
            p_user_id: userId,
            p_amount: coins,
            p_type: "coin_purchase",
            p_reference: `stripe_${session.id}`,
            p_metadata: {
              stripe_session_id: session.id,
              amount_total: session.amount_total,
              currency: session.currency,
              pack_id: session.metadata?.pack_id
            }
          }
        );

        if (error) throw error;
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    return res
      .status(400)
      .send(`Webhook error: ${error.message}`);
  }
}
