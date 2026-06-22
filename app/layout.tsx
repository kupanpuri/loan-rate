import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Painel Loan",
  description: "Dashboard de taxas, LTV e liquidacao para DeFi e CEXs."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
