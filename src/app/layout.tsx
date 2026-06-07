import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import GlobalShell from "./components/layout/GlobalShell";
import { getCurrentUser } from "./actions/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Allerac One",
  description: "Private-first AI agent platform. Self-hosted, local LLM, memory & RAG.",
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d0d0d",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  let user = null;
  try { user = await getCurrentUser(); } catch {}

  return (
    <html lang={locale}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col h-dvh`}
      >
        <NextIntlClientProvider messages={messages}>
          <GlobalShell user={user}>
            {children}
          </GlobalShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
