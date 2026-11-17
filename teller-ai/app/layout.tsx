import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppAuthProvider } from "../components/Auth0Provider";
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
  title: "Teller AI",
  description: "Teller AI — conversational assistant for research, writing, and coding",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    title: "Teller AI",
    description: "Teller AI — conversational assistant for research, writing, and coding",
    images: "/icon.svg",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Auth0 requires a secure origin; upgrade plain-HTTP visits (except localhost) to HTTPS. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'if(location.protocol==="http:"&&!/^(localhost|127\\.0\\.0\\.1|\\[::1\\])$/.test(location.hostname)){location.replace("https://"+location.host+location.pathname+location.search+location.hash)}',
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <AppAuthProvider>{children}</AppAuthProvider>
      </body>
    </html>
  );
}
