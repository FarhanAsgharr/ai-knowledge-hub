import type { Metadata } from "next";
import { JetBrains_Mono, Newsreader, Space_Grotesk } from "next/font/google";
import "./globals.css";

// Chrome and labels: technical, slightly mechanical.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

// Answers are set like a document — the model's output is reading material.
const newsreader = Newsreader({
  variable: "--font-reading",
  subsets: ["latin"],
});

// Instrument readings: similarity scores, page numbers, chunk counts.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Knowledge Hub — ask your documents",
  description:
    "Upload documents, ask questions, and trace every answer back to the page it came from.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${newsreader.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="h-full">{children}</body>
    </html>
  );
}
