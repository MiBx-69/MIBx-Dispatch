import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: rep } = await supabase
    .from('orders')
    .select('id, internal_status, shopify_created_at')
    .gte('shopify_created_at', '2026-08-31T18:00:00.000Z')
    .lte('shopify_created_at', '2026-09-01T17:59:59.999Z')
    .neq('internal_status', 'cancelled');
    
  const { data: dash } = await supabase
    .from('orders')
    .select('id, internal_status, shopify_created_at')
    .gte('shopify_created_at', '2026-08-31T18:00:00.000Z')
    .lte('shopify_created_at', '2026-09-01T17:59:59.999Z');

  const dashFiltered = dash.filter(o => o.internal_status !== 'cancelled');

  console.log('Reports:', rep.length);
  console.log('Dashboard (pre-filter):', dash.length);
  console.log('Dashboard (post-filter):', dashFiltered.length);
}

run();
