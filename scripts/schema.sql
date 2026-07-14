-- Olist Brazilian E-commerce schema (geolocation table excluded on purpose).
-- Run automatically by scripts/load_data.mjs, but kept here for reference.

DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS order_payments CASCADE;
DROP TABLE IF EXISTS order_reviews CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS sellers CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS product_category_name_translation CASCADE;

CREATE TABLE customers (
  customer_id              TEXT PRIMARY KEY,
  customer_unique_id       TEXT,
  customer_zip_code_prefix TEXT,
  customer_city            TEXT,
  customer_state           TEXT
);

CREATE TABLE sellers (
  seller_id              TEXT PRIMARY KEY,
  seller_zip_code_prefix TEXT,
  seller_city            TEXT,
  seller_state           TEXT
);

CREATE TABLE products (
  product_id                 TEXT PRIMARY KEY,
  product_category_name      TEXT,
  product_name_lenght        INTEGER,
  product_description_lenght INTEGER,
  product_photos_qty         INTEGER,
  product_weight_g           INTEGER,
  product_length_cm          INTEGER,
  product_height_cm          INTEGER,
  product_width_cm           INTEGER
);

CREATE TABLE product_category_name_translation (
  product_category_name         TEXT PRIMARY KEY,
  product_category_name_english TEXT
);

CREATE TABLE orders (
  order_id                      TEXT PRIMARY KEY,
  customer_id                   TEXT,
  order_status                  TEXT,
  order_purchase_timestamp      TIMESTAMP,
  order_approved_at             TIMESTAMP,
  order_delivered_carrier_date  TIMESTAMP,
  order_delivered_customer_date TIMESTAMP,
  order_estimated_delivery_date TIMESTAMP
);

CREATE TABLE order_items (
  order_id            TEXT,
  order_item_id       INTEGER,
  product_id          TEXT,
  seller_id           TEXT,
  shipping_limit_date TIMESTAMP,
  price               NUMERIC,
  freight_value       NUMERIC,
  PRIMARY KEY (order_id, order_item_id)
);

CREATE TABLE order_payments (
  order_id             TEXT,
  payment_sequential   INTEGER,
  payment_type         TEXT,
  payment_installments INTEGER,
  payment_value        NUMERIC
);

CREATE TABLE order_reviews (
  review_id               TEXT,
  order_id                TEXT,
  review_score            INTEGER,
  review_comment_title    TEXT,
  review_comment_message  TEXT,
  review_creation_date    TIMESTAMP,
  review_answer_timestamp TIMESTAMP
);

-- Helpful indexes for join-heavy analytical queries.
CREATE INDEX idx_orders_customer     ON orders (customer_id);
CREATE INDEX idx_order_items_order   ON order_items (order_id);
CREATE INDEX idx_order_items_product ON order_items (product_id);
CREATE INDEX idx_order_items_seller  ON order_items (seller_id);
CREATE INDEX idx_payments_order      ON order_payments (order_id);
CREATE INDEX idx_reviews_order       ON order_reviews (order_id);
CREATE INDEX idx_products_category   ON products (product_category_name);
