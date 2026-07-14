import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Olist Text-to-SQL",
  description: "Ask questions in plain English about the Olist Brazilian e-commerce dataset — powered by Groq + Postgres.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
