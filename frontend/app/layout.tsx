import type { Metadata } from "next";
import "./alive.css";   // first: globals.css maps this console's palette onto it
import "./globals.css";
import Header from "./components/Header";
import { Rail } from "./components/Rail";

export const metadata: Metadata = {
  title: "Genesis OS — Signal Intelligence",
  description: "External Intelligence for Convergence Studios (Parallel track).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Studio-OS shell: fixed masthead, persistent rail, scrolling work
            area. The signal desk keeps its own palette and type — the structure
            changed, the identity did not. */}
        <div className="shell alive-ambient">
          <Header />
          <div className="deck">
            <Rail />
            <div className="work">{children}</div>
          </div>
        </div>
      </body>
    </html>
  );
}
