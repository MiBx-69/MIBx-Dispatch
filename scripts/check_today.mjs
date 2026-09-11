import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data, error } = await supabase
    .from('dispatches')
    .select('id, consignment_id, order_id, dispatched_at, is_cancelled, orders(id, shopify_order_number, internal_status, is_archived, created_at)')
    .gte('dispatched_at', '2026-09-10T18:00:00.000Z')
    .lte('dispatched_at', '2026-09-11T17:59:59.999Z')
    .order('dispatched_at', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  const valid = (data || []).filter(d => !d.is_cancelled && !d.orders?.is_archived && d.orders?.internal_status !== 'cancelled');
  console.log(`Total valid dispatches today: ${valid.length}`);
  let count = 0;
  for (const d of valid) {
    count++;
    const { data: ret } = await supabase.from('returns').select('id, return_type').eq('order_id', d.orders?.id);
    const bstTime = new Date(d.dispatched_at).toLocaleTimeString('en-US', { timeZone: 'Asia/Dhaka' });
    console.log(
      `${count}. Order: #${d.orders?.shopify_order_number} | BST Time: ${bstTime} | order_created: ${d.orders?.created_at?.slice(0,10)} | status: ${d.orders?.internal_status} | returns: ${ret?.map(r=>r.return_type).join(',') || 'none'}`
    );
  }
}

main();
