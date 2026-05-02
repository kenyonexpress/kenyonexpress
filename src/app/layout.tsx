import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";

const rubik = Rubik({
  subsets: ["latin", "hebrew"],
  variable: "--font-rubik",
  display: "swap",
});

export const metadata: Metadata = {
  title: "קניון אקספרס — קופונים ומבצעים מובילים בישראל",
  description:
    "מצאו קופונים, דילים והנחות מעודכנות ממאות חנויות — מזון, אופנה, טכנולוגיה, בית ונסיעות. חוויית קנייה חכמה בעברית.",
  openGraph: {
    title: "קניון אקספרס",
    description: "שוק הקופונים והדילים של ישראל — מעוצב, מהיר, ומותאם לנייד.",
    locale: "he_IL",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={`${rubik.variable} h-full scroll-smooth antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
