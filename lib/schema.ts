// Human-readable schema handed to the LLM so it can write correct SQL.
// Keep this in sync with scripts/schema.sql.

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
