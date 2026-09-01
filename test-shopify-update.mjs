import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envFile = fs.readFileSync(path.join(__dirname, ".env"), "utf-8");
const envVars = envFile.split("\n").reduce((acc, line) => {
  const [key, ...val] = line.split("=");
  if (key && val.length > 0) {
    acc[key.trim()] = val.join("=").trim().replace(/"/g, "").replace(/\r/g, "");
  }
  return acc;
}, {});

const domain = envVars.SHOPIFY_SHOP_DOMAIN;
const token = envVars.SHOPIFY_ACCESS_TOKEN;

async function shopifyFetch(query, variables) {
  const endpoint = `https://${domain}/admin/api/2024-07/graphql.json`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables })
  });
  const json = await response.json();
  if (json.errors) {
    console.error("GRAPHQL ERRORS:", JSON.stringify(json.errors, null, 2));
    throw new Error(json.errors[0]?.message || "Shopify GraphQL error");
  }
  return json;
}

const UPDATE_ORDER_MUTATION = `
  mutation UpdateOrder($input: OrderInput!) {
    orderUpdate(input: $input) {
      order { id name note tags customAttributes { key value } }
      userErrors { field message }
    }
  }
`;

async function run() {
  try {
    // 1. Get first order
    const getRes = await shopifyFetch(`
      query {
        orders(first: 1, sortKey: CREATED_AT, reverse: true) {
          edges { node { id name note customAttributes { key value } } }
        }
      }
    `);
    const order = getRes.data.orders.edges[0].node;
    console.log("Current Order:", order);

    // 2. Update with customAttributes
    console.log("Updating order with customAttributes...");
    const updateRes = await shopifyFetch(UPDATE_ORDER_MUTATION, {
      input: {
        id: order.id,
        customAttributes: [
          { key: "Test Key", value: "Test Value" }
        ]
      }
    });
    
    console.log("Update Result:", JSON.stringify(updateRes.data.orderUpdate, null, 2));

  } catch (err) {
    console.error(err);
  }
}

run();
