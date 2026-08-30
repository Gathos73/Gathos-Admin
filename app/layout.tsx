import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Plus_Jakarta_Sans, Space_Mono } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
});

const instrumentSerif = Instrument_Serif({
  display: "swap",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  weight: "400",
});

const spaceMono = Space_Mono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-space-mono",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Gathos Administration",
    template: "%s · Gathos Administration",
  },
  description: "Internal management console for the Gathos platform.",
  robots: {
    follow: false,
    index: false,
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#faf9f7",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      className={`${plusJakartaSans.variable} ${instrumentSerif.variable} ${spaceMono.variable}`}
      lang="en"
    >
      <body>{children}</body>
    </html>
  );
}
