import type { Metadata, Viewport } from "next";
import { handFont, uiFont } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sidecar · a patient tutor for the exact problem you're stuck on",
  description:
    "Upload your assignment, pick the problem you're stuck on, and Teacher, a friendly cloud, finds your missing concept and teaches it on a live whiteboard.",
};

export const viewport: Viewport = { themeColor: "#eef4fb" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${uiFont.variable} ${handFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
