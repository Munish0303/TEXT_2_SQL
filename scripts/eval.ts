/**
 * Evaluation harness — measures how often the agent's SQL produces the SAME
 * result as a hand-written reference query ("execution accuracy", the standard
 * text-to-SQL metric).
 *
 *   npm run eval
 *
 * Needs DATABASE_URL and GROQ_API_KEY in .env.local (same as the app).
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { answerQuestion } from "../lib/agent";
import { runReadOnly } from "../lib/db";

type Gold = { q: string; ref: string };

// 25 questions, each with a trusted reference SQL. Phrasing is kept unambiguous
// so the reference is genuinely the "correct" answer.
const GOLD: Gold[] = [
  { q: "What are the top 5 product categories by total revenue? Give the English category name and the revenue.",
    ref: `SELECT t.product_category_name_english, SUM(oi.price) AS revenue
          FROM order_items oi
          JOIN products p ON oi.product_id = p.product_id
          JOIN product_category_name_translation t ON p.product_category_name = t.product_category_name
          GROUP BY t.product_category_name_english ORDER BY revenue DESC LIMIT 5` },
  { q: "How many orders are there for each order_status?",
    ref: `SELECT order_status, COUNT(*) AS n FROM orders GROUP BY order_status` },
  { q: "How many distinct real customers are there (by customer_unique_id)?",
    ref: `SELECT COUNT(DISTINCT customer_unique_id) AS n FROM customers` },
  { q: "What is the overall average review score across all reviews?",
    ref: `SELECT AVG(review_score) AS avg_score FROM order_reviews` },
  { q: "How many orders were purchased in the year 2018?",
    ref: `SELECT COUNT(*) AS n FROM orders WHERE EXTRACT(YEAR FROM order_purchase_timestamp) = 2018` },
  { q: "What are the top 5 customer states by number of unique customers (customer_unique_id)?",
    ref: `SELECT customer_state, COUNT(DISTINCT customer_unique_id) AS n FROM customers GROUP BY customer_state ORDER BY n DESC LIMIT 5` },
  { q: "What is the average payment_value for each payment_type?",
    ref: `SELECT payment_type, AVG(payment_value) AS avg_value FROM order_payments GROUP BY payment_type` },
  { q: "What is the total revenue (sum of order item prices) across all orders?",
    ref: `SELECT SUM(price) AS total_revenue FROM order_items` },
  { q: "How many orders have the status 'delivered'?",
    ref: `SELECT COUNT(*) AS n FROM orders WHERE order_status = 'delivered'` },
  { q: "What is the average freight value across all order items?",
    ref: `SELECT AVG(freight_value) AS avg_freight FROM order_items` },
  { q: "What are the top 5 customer cities by number of customers?",
    ref: `SELECT customer_city, COUNT(*) AS n FROM customers GROUP BY customer_city ORDER BY n DESC LIMIT 5` },
  { q: "How many reviews are there for each review_score from 1 to 5?",
    ref: `SELECT review_score, COUNT(*) AS n FROM order_reviews GROUP BY review_score` },
  { q: "Which payment_type is used most often, and how many payments used it?",
    ref: `SELECT payment_type, COUNT(*) AS n FROM order_payments GROUP BY payment_type ORDER BY n DESC LIMIT 1` },
  { q: "How many sellers are there in each seller_state? Give the top 5 states.",
    ref: `SELECT seller_state, COUNT(*) AS n FROM sellers GROUP BY seller_state ORDER BY n DESC LIMIT 5` },
  { q: "What is the total sum of all payment_value?",
    ref: `SELECT SUM(payment_value) AS total FROM order_payments` },
  { q: "How many distinct products appear in order_items?",
    ref: `SELECT COUNT(DISTINCT product_id) AS n FROM order_items` },
  { q: "What is the maximum number of payment installments?",
    ref: `SELECT MAX(payment_installments) AS max_installments FROM order_payments` },
  { q: "How many orders were canceled (order_status = 'canceled')?",
    ref: `SELECT COUNT(*) AS n FROM orders WHERE order_status = 'canceled'` },
  { q: "What is the average product weight in grams across all products?",
    ref: `SELECT AVG(product_weight_g) AS avg_weight FROM products` },
  { q: "What are the top 5 sellers by total revenue (sum of price)?",
    ref: `SELECT seller_id, SUM(price) AS revenue FROM order_items GROUP BY seller_id ORDER BY revenue DESC LIMIT 5` },
  { q: "How many payments were made with payment_type 'credit_card'?",
    ref: `SELECT COUNT(*) AS n FROM order_payments WHERE payment_type = 'credit_card'` },
  { q: "How many products are in each of the top 5 categories by product count? Use the English category name.",
    ref: `SELECT t.product_category_name_english, COUNT(*) AS n
          FROM products p
          JOIN product_category_name_translation t ON p.product_category_name = t.product_category_name
          GROUP BY t.product_category_name_english ORDER BY n DESC LIMIT 5` },
  { q: "What is the average price of an order item?",
    ref: `SELECT AVG(price) AS avg_price FROM order_items` },
  { q: "How many orders were purchased in each month of 2017? Return month number and count.",
    ref: `SELECT EXTRACT(MONTH FROM order_purchase_timestamp) AS month, COUNT(*) AS n
          FROM orders WHERE EXTRACT(YEAR FROM order_purchase_timestamp) = 2017
          GROUP BY EXTRACT(MONTH FROM order_purchase_timestamp)` },
  { q: "What is the highest single order item price?",
    ref: `SELECT MAX(price) AS max_price FROM order_items` },
];

// Normalize a value so numbers compare with 2-decimal tolerance and text is case-insensitive.
function norm(v: unknown): string {
  if (v === null || v === undefined) return "∅";
  if (typeof v === "number") return (Math.round(v * 100) / 100).toString();
  const s = String(v).trim();
  if (s !== "" && /^-?\d*\.?\d+$/.test(s)) return (Math.round(Number(s) * 100) / 100).toString();
  return s.toLowerCase();
}

// Column-name and column-order independent: compare the multiset of row value-sets.
function fingerprint(rows: Record<string, unknown>[]): string {
  return rows
    .map((r) => Object.values(r).map(norm).sort().join("|"))
    .sort()
    .join("¶");
}

async function main() {
  if (!process.env.DATABASE_URL || !process.env.GROQ_API_KEY) {
    console.error("✗ DATABASE_URL and GROQ_API_KEY must be set in .env.local");
    process.exit(1);
  }

  let pass = 0;
  let selfCorrected = 0;
  const failures: string[] = [];

  console.log(`\nRunning ${GOLD.length} evaluation questions...\n`);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (let i = 0; i < GOLD.length; i++) {
    const { q, ref } = GOLD[i];
    const num = String(i + 1).padStart(2, "0");
    if (i > 0) await sleep(2500); // ease off Groq's free-tier tokens-per-minute limit
    try {
      const expected = await runReadOnly(ref);
      const result = await answerQuestion(q);

      if (!result.ok) {
        failures.push(`#${num} ${q}\n     agent error: ${result.error}`);
        console.log(`✗ ${num}  ${q.slice(0, 62)}  (agent failed)`);
        continue;
      }
      if (result.attempts > 1) selfCorrected++;

      const match = fingerprint(expected) === fingerprint(result.rows);
      if (match) {
        pass++;
        const tag = result.attempts > 1 ? ` [self-corrected x${result.attempts - 1}]` : "";
        console.log(`✓ ${num}  ${q.slice(0, 62)}${tag}`);
      } else {
        failures.push(
          `#${num} ${q}\n     expected ${expected.length} rows, got ${result.rowCount}\n     SQL: ${result.sql.replace(/\s+/g, " ")}`
        );
        console.log(`✗ ${num}  ${q.slice(0, 62)}  (wrong result)`);
      }
    } catch (e) {
      failures.push(`#${num} ${q}\n     reference SQL error: ${(e as Error).message}`);
      console.log(`✗ ${num}  ${q.slice(0, 62)}  (reference error)`);
    }
  }

  const pct = ((pass / GOLD.length) * 100).toFixed(1);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Execution accuracy: ${pass}/${GOLD.length}  (${pct}%)`);
  console.log(`Self-corrected (needed a retry): ${selfCorrected}`);
  console.log(`${"=".repeat(60)}\n`);

  if (failures.length) {
    console.log("Failures:\n");
    for (const f of failures) console.log(f + "\n");
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("Eval crashed:", e);
  process.exit(1);
});
