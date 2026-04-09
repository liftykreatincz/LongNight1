import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Long Night — Meta Ads Creative Analysis",
  description: "AI-powered analysis of Meta Ads creatives across your eshops",
};

// Pin Next.js Server Component rendering + Route Handlers to Frankfurt so
// that Supabase calls (DB in AWS eu-west-1, Ireland) aren't a transatlantic
// hop. Was defaulting to iad1 (Washington DC) → ~80 ms RTT per call, making
// every dashboard navigation ~1 s. Frankfurt → Dublin is ~15 ms RTT.
export const preferredRegion = ["fra1", "dub1", "cdg1"];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="cs"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
