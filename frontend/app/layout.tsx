import type { Metadata } from "next";
import "./alive.css";   // first: globals.css maps this console's palette onto it
import "./globals.css";
import Header from "./components/Header";

export const metadata: Metadata = {
  title: "Genesis OS — Signal Intelligence",
  description: "External Intelligence for Convergence Studios (Parallel track).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Header />
          {children}
        </div>
      </body>
    </html>
  );
}
