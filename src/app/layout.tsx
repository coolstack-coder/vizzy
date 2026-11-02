import type { Metadata } from "next";
import { Bangers, Comic_Neue, Fraunces, Inter, Libre_Baskerville, Special_Elite } from "next/font/google";
import "./globals.css";

// Each font exposes a CSS variable; the canvas renderer reads the same
// variables so exported pages are lettered with the exact on-screen fonts.
const inter = Inter({ variable: "--font-ui", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-display", subsets: ["latin"], axes: ["opsz"] });
const comic = Comic_Neue({ variable: "--font-comic", subsets: ["latin"], weight: ["400", "700"] });
const baskerville = Libre_Baskerville({ variable: "--font-serif-lettering", subsets: ["latin"], weight: ["400", "700"] });
const typewriter = Special_Elite({ variable: "--font-typewriter", subsets: ["latin"], weight: "400" });
const sfx = Bangers({ variable: "--font-sfx", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "Vizzy · co-create graphic novels and storyboards",
  description:
    "Chat with an AI creative director to build a graphic novel or storyboard page by page, then play it as a cinematic slideshow.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={[inter, fraunces, comic, baskerville, typewriter, sfx].map((f) => f.variable).join(" ")}
    >
      <body className="h-dvh overflow-hidden antialiased">{children}</body>
    </html>
  );
}
