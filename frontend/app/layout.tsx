import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoiceUp — Speak cleaner, sound better",
  description: "Record yourself speaking and hear a cleaned-up version in your own cloned voice.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen antialiased">{children}</body>
    </html>
  );
}
