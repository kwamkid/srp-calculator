import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import "./globals.css";

const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  variable: "--font-ibm-plex-thai",
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "แอพฯ คำนวนราคาขาย",
  description: "แอพฯ คำนวนราคาขาย",
  icons: {
    icon: "/amgo-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${ibmPlexSansThai.variable} antialiased`}
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
