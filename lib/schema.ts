// Human-readable schema handed to the LLM so it can write correct SQL.
// Keep this in sync with scripts/schema.sql.

// Structured version rendered in the on-site "Database schema" viewer.
export type SchemaColumn = { name: string; type: string; note?: string };
export type SchemaTable = { name: string; note: string; columns: SchemaColumn[] };

export const SCHEMA_TABLES: SchemaTable[] = [
  {
    name: "customers",
    note: "One row per order's customer. Use customer_unique_id for real people.",
    columns: [
      { name: "customer_id", type: "text", note: "PK · joins to orders" },
      { name: "customer_unique_id", type: "text", note: "stable id per real person" },
      { name: "customer_zip_code_prefix", type: "text" },
      { name: "customer_city", type: "text", note: "lower-case Portuguese" },
      { name: "customer_state", type: "text", note: "2-letter, e.g. SP" },
    ],
  },
  {
    name: "sellers",
    note: "Marketplace sellers.",
    columns: [
      { name: "seller_id", type: "text", note: "PK" },
      { name: "seller_zip_code_prefix", type: "text" },
      { name: "seller_city", type: "text" },
      { name: "seller_state", type: "text", note: "2-letter" },
    ],
  },
  {
    name: "products",
    note: "Product catalog. Category is Portuguese.",
    columns: [
      { name: "product_id", type: "text", note: "PK" },
      { name: "product_category_name", type: "text", note: "join translation for English" },
      { name: "product_name_lenght", type: "int", note: "sic — misspelled" },
      { name: "product_description_lenght", type: "int", note: "sic — misspelled" },
      { name: "product_photos_qty", type: "int" },
      { name: "product_weight_g", type: "int" },
      { name: "product_length_cm", type: "int" },
      { name: "product_height_cm", type: "int" },
      { name: "product_width_cm", type: "int" },
    ],
  },
  {
    name: "product_category_name_translation",
    note: "Portuguese → English category names.",
    columns: [
      { name: "product_category_name", type: "text", note: "PK" },
      { name: "product_category_name_english", type: "text" },
    ],
  },
  {
    name: "orders",
    note: "One row per order. Delivery dates can be NULL.",
    columns: [
      { name: "order_id", type: "text", note: "PK" },
      { name: "customer_id", type: "text", note: "→ customers" },
      { name: "order_status", type: "text", note: "delivered, shipped, canceled…" },
      { name: "order_purchase_timestamp", type: "timestamp" },
      { name: "order_approved_at", type: "timestamp" },
      { name: "order_delivered_carrier_date", type: "timestamp" },
      { name: "order_delivered_customer_date", type: "timestamp", note: "NULL if not delivered" },
      { name: "order_estimated_delivery_date", type: "timestamp" },
    ],
  },
  {
    name: "order_items",
    note: "One row per item line in an order. Revenue = SUM(price).",
    columns: [
      { name: "order_id", type: "text", note: "→ orders" },
      { name: "order_item_id", type: "int", note: "line number 1..N" },
      { name: "product_id", type: "text", note: "→ products" },
      { name: "seller_id", type: "text", note: "→ sellers" },
      { name: "shipping_limit_date", type: "timestamp" },
      { name: "price", type: "numeric", note: "item price (BRL)" },
      { name: "freight_value", type: "numeric", note: "shipping cost (BRL)" },
    ],
  },
  {
    name: "order_payments",
    note: "Payments per order (can be multiple).",
    columns: [
      { name: "order_id", type: "text", note: "→ orders" },
      { name: "payment_sequential", type: "int" },
      { name: "payment_type", type: "text", note: "credit_card, boleto, voucher…" },
      { name: "payment_installments", type: "int" },
      { name: "payment_value", type: "numeric", note: "amount paid (BRL)" },
    ],
  },
  {
    name: "order_reviews",
    note: "Customer reviews, score 1–5.",
    columns: [
      { name: "review_id", type: "text" },
      { name: "order_id", type: "text", note: "→ orders" },
      { name: "review_score", type: "int", note: "1..5" },
      { name: "review_comment_title", type: "text" },
      { name: "review_comment_message", type: "text" },
      { name: "review_creation_date", type: "timestamp" },
      { name: "review_answer_timestamp", type: "timestamp" },
    ],
  },
];

export const SCHEMA_PROMPT = `
DATABASE: PostgreSQL. Olist Brazilian E-commerce (public dataset).

TABLES AND COLUMNS

customers(
  customer_id TEXT PK,            -- unique per order; use to join to orders
  customer_unique_id TEXT,        -- stable id for the same real person across orders
  customer_zip_code_prefix TEXT,
  customer_city TEXT,             -- lower-case, Portuguese (e.g. 'sao paulo')
  customer_state TEXT             -- 2-letter Brazilian state (e.g. 'SP', 'RJ')
)

sellers(
  seller_id TEXT PK,
  seller_zip_code_prefix TEXT,
  seller_city TEXT,
  seller_state TEXT               -- 2-letter state
)

products(
  product_id TEXT PK,
  product_category_name TEXT,     -- Portuguese category (join translation for English)
  product_name_lenght INTEGER,    -- note the original misspelling 'lenght'
  product_description_lenght INTEGER,
  product_photos_qty INTEGER,
  product_weight_g INTEGER,
  product_length_cm INTEGER,
  product_height_cm INTEGER,
  product_width_cm INTEGER
)

product_category_name_translation(
  product_category_name TEXT PK,          -- Portuguese
  product_category_name_english TEXT      -- English label
)

orders(
  order_id TEXT PK,
  customer_id TEXT,               -- -> customers.customer_id
  order_status TEXT,              -- delivered, shipped, canceled, unavailable, invoiced, processing, created, approved
  order_purchase_timestamp TIMESTAMP,
  order_approved_at TIMESTAMP,
  order_delivered_carrier_date TIMESTAMP,
  order_delivered_customer_date TIMESTAMP,   -- can be NULL when not yet delivered
  order_estimated_delivery_date TIMESTAMP
)

order_items(
  order_id TEXT,                  -- -> orders.order_id
  order_item_id INTEGER,          -- 1..N line number within an order
  product_id TEXT,                -- -> products.product_id
  seller_id TEXT,                 -- -> sellers.seller_id
  shipping_limit_date TIMESTAMP,
  price NUMERIC,                  -- item price (BRL)
  freight_value NUMERIC           -- shipping cost for this item (BRL)
)

order_payments(
  order_id TEXT,                  -- -> orders.order_id
  payment_sequential INTEGER,
  payment_type TEXT,              -- credit_card, boleto, voucher, debit_card, not_defined
  payment_installments INTEGER,
  payment_value NUMERIC           -- amount paid (BRL)
)

order_reviews(
  review_id TEXT,
  order_id TEXT,                  -- -> orders.order_id
  review_score INTEGER,           -- 1..5
  review_comment_title TEXT,
  review_comment_message TEXT,
  review_creation_date TIMESTAMP,
  review_answer_timestamp TIMESTAMP
)

RELATIONSHIPS
- orders.customer_id  = customers.customer_id
- order_items.order_id = orders.order_id
- order_items.product_id = products.product_id
- order_items.seller_id = sellers.seller_id
- order_payments.order_id = orders.order_id
- order_reviews.order_id = orders.order_id
- products.product_category_name = product_category_name_translation.product_category_name

IMPORTANT NOTES
- Revenue = SUM(order_items.price). "Total paid" incl. installments = SUM(order_payments.payment_value).
- For per-customer analysis of real people use customers.customer_unique_id, not customer_id.
- City names are lower-case Portuguese; compare with LOWER() to be safe.
- To show English category names, JOIN product_category_name_translation.
- Column names product_name_lenght / product_description_lenght are intentionally misspelled.
- Dates range roughly 2016-09 to 2018-10.
`.trim();
