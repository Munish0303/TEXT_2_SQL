// One-time loader: reads the Olist CSVs and loads them into your Supabase Postgres.
//
//   1. copy .env.local.example -> .env.local  and set DATABASE_URL
//   2. npm install
//   3. npm run load-data
//
// Safe to re-run: it drops & recreates the tables each time.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse";
import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "Olist_Brazilian_Eccomerce");
const BATCH = 1000;

if (!process.env.DATABASE_URL) {
  console.error("✗ DATABASE_URL is not set. Fill it in .env.local first.");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 20,
});

// [column name, type] — type controls empty-string -> NULL coercion.
const TABLES = [
  {
    file: "olist_customers_dataset.csv",
    table: "customers",
    columns: [
      ["customer_id", "text"], ["customer_unique_id", "text"],
      ["customer_zip_code_prefix", "text"], ["customer_city", "text"], ["customer_state", "text"],
    ],
  },
  {
    file: "olist_sellers_dataset.csv",
    table: "sellers",
    columns: [
      ["seller_id", "text"], ["seller_zip_code_prefix", "text"],
      ["seller_city", "text"], ["seller_state", "text"],
    ],
  },
  {
    file: "olist_products_dataset.csv",
    table: "products",
    columns: [
      ["product_id", "text"], ["product_category_name", "text"],
      ["product_name_lenght", "int"], ["product_description_lenght", "int"],
      ["product_photos_qty", "int"], ["product_weight_g", "int"],
      ["product_length_cm", "int"], ["product_height_cm", "int"], ["product_width_cm", "int"],
    ],
  },
  {
    file: "product_category_name_translation.csv",
    table: "product_category_name_translation",
    columns: [["product_category_name", "text"], ["product_category_name_english", "text"]],
  },
  {
    file: "olist_orders_dataset.csv",
    table: "orders",
    columns: [
      ["order_id", "text"], ["customer_id", "text"], ["order_status", "text"],
      ["order_purchase_timestamp", "ts"], ["order_approved_at", "ts"],
      ["order_delivered_carrier_date", "ts"], ["order_delivered_customer_date", "ts"],
      ["order_estimated_delivery_date", "ts"],
    ],
  },
  {
    file: "olist_order_items_dataset.csv",
    table: "order_items",
    columns: [
      ["order_id", "text"], ["order_item_id", "int"], ["product_id", "text"],
      ["seller_id", "text"], ["shipping_limit_date", "ts"], ["price", "num"], ["freight_value", "num"],
    ],
  },
  {
    file: "olist_order_payments_dataset.csv",
    table: "order_payments",
    columns: [
      ["order_id", "text"], ["payment_sequential", "int"], ["payment_type", "text"],
      ["payment_installments", "int"], ["payment_value", "num"],
    ],
  },
  {
    file: "olist_order_reviews_dataset.csv",
    table: "order_reviews",
    columns: [
      ["review_id", "text"], ["order_id", "text"], ["review_score", "int"],
      ["review_comment_title", "text"], ["review_comment_message", "text"],
      ["review_creation_date", "ts"], ["review_answer_timestamp", "ts"],
    ],
  },
];

function coerce(value, type) {
  if (value === undefined || value === null) return null;
  const v = String(value).trim();
  if (v === "") return null;
  if (type === "int") {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  }
  if (type === "num") {
    const n = parseFloat(v);
    return Number.isNaN(n) ? null : n;
  }
  return v; // text / ts kept as string (Postgres casts timestamps)
}

async function createSchema() {
  const ddl = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  console.log("→ Creating schema (dropping any existing tables)...");
  await sql.unsafe(ddl);
  console.log("✓ Schema ready.\n");
}

function loadTable({ file, table, columns }) {
  return new Promise((resolve, reject) => {
    const fullPath = path.join(DATA_DIR, file);
    if (!fs.existsSync(fullPath)) {
      return reject(new Error(`Missing file: ${fullPath}`));
    }
    const colNames = columns.map((c) => c[0]);
    let batch = [];
    let total = 0;
    let inFlight = Promise.resolve();

    const parser = fs
      .createReadStream(fullPath)
      .pipe(parse({ columns: true, bom: true, skip_empty_lines: true, relax_column_count: true }));

    const flush = (rows) => {
      inFlight = inFlight.then(() =>
        sql`insert into ${sql(table)} ${sql(rows, ...colNames)}`.then(() => {})
      );
      return inFlight;
    };

    parser.on("data", (record) => {
      const row = {};
      for (const [name, type] of columns) row[name] = coerce(record[name], type);
      batch.push(row);
      total += 1;
      if (batch.length >= BATCH) {
        const toSend = batch;
        batch = [];
        parser.pause();
        flush(toSend)
          .then(() => parser.resume())
          .catch(reject);
      }
    });

    parser.on("end", () => {
      const finish = batch.length ? flush(batch) : Promise.resolve();
      finish
        .then(() => inFlight)
        .then(() => {
          console.log(`✓ ${table.padEnd(34)} ${total.toLocaleString()} rows`);
          resolve();
        })
        .catch(reject);
    });

    parser.on("error", reject);
  });
}

async function main() {
  console.log(`Loading Olist data from ${DATA_DIR}\n`);
  await createSchema();
  for (const cfg of TABLES) {
    await loadTable(cfg);
  }
  console.log("\n✓ All tables loaded. You can now run `npm run dev`.");
  await sql.end();
}

main().catch(async (err) => {
  console.error("\n✗ Load failed:", err.message);
  await sql.end().catch(() => {});
  process.exit(1);
});
