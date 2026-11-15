import type { Metadata } from "next";
import { Fraunces, Public_Sans } from "next/font/google";
import "./globals.css";
import { BOOT_SCRIPT } from "./boot";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const publicSans = Public_Sans({
  variable: "--font-public",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ORCHID · Orbital Rotation & Crop Health Intelligent Decision Platform",
  description: "ORCHID (Orbital Rotation & Crop Health Intelligent Decision Platform). Rotaciones de cultivo con datos NASA para suelo y agua más resilientes. Hecho por Orbital Farmers para el NASA Space Apps Challenge 2026.",
  applicationName: "ORCHID",
  authors: [{ name: "Orbital Farmers" }],
  creator: "Orbital Farmers",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${fraunces.variable} ${publicSans.variable} h-full antialiased`}
    >
      <head>
        {/* Idioma del navegador y tema del sistema (o lo que el usuario eligió), antes de pintar. */}
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
