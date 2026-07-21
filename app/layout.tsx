import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "maui",
  description: "A minimal canvas for agent-native conversations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
