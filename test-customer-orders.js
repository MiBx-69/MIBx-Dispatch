require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  const email = "ridoysk20@gamil.com";
  const { data: customer } = await supabase.from("customers").select("*").eq("email", email).single();
  console.log("Customer record:", customer?.id);

  if (customer) {
    const orConditions = [`customer_id.eq.${customer.id}`];
    if (customer.shopify_customer_id) orConditions.push(`customer_shopify_id.eq.${customer.shopify_customer_id}`);
    if (customer.phone) orConditions.push(`customer_phone.eq.${customer.phone}`);
    if (customer.email) orConditions.push(`customer_email.eq.${customer.email}`);

    console.log("OR conditions:", orConditions.join(","));

    const { data: foundOrders, error } = await supabase
      .from("orders")
      .select("*")
      .or(orConditions.join(","));
      
    console.log("Found via OR:", foundOrders?.length);
    if (error) console.log(error);
  }
}

test();
