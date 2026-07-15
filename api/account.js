import { requireUser, sendError } from "../lib/auth.js";
import { supabaseAdmin } from "../lib/supabase-admin.js";

async function ensureStarterCoins(userId){
  const {data:wallet,error:walletError}=await supabaseAdmin
    .from("arcade_wallets").select("coins").eq("user_id",userId).maybeSingle();
  if(walletError)throw walletError;

  const {count,error:countError}=await supabaseAdmin
    .from("arcade_wallet_transactions")
    .select("id",{count:"exact",head:true})
    .eq("user_id",userId);
  if(countError)throw countError;

  if(Number(wallet?.coins||0)===0&&Number(count||0)===0){
    const {error}=await supabaseAdmin.rpc("apply_arcade_wallet_transaction",{
      p_user_id:userId,
      p_amount:10000,
      p_type:"starter_bonus",
      p_reference:"starter_bonus_v1",
      p_metadata:{description:"New player starter Cookie Coins"}
    });
    if(error)throw error;
  }
}

export default async function handler(req,res){
  try{
    const user=await requireUser(req);
    await ensureStarterCoins(user.id);

    const [p,w,g,t]=await Promise.all([
      supabaseAdmin.from("arcade_profiles").select("*").eq("id",user.id).maybeSingle(),
      supabaseAdmin.from("arcade_wallets").select("*").eq("user_id",user.id).maybeSingle(),
      supabaseAdmin.from("arcade_progress").select("*").eq("user_id",user.id).maybeSingle(),
      supabaseAdmin.from("arcade_wallet_transactions")
        .select("amount,type,reference,created_at,metadata")
        .eq("user_id",user.id)
        .order("created_at",{ascending:false})
        .limit(25)
    ]);

    const error=p.error||w.error||g.error||t.error;
    if(error)throw error;

    return res.status(200).json({
      profile:p.data,
      wallet:w.data||{coins:0},
      progress:g.data||{xp:0,vip:1,settings:{}},
      transactions:t.data||[]
    });
  }catch(error){
    return sendError(res,error);
  }
}
