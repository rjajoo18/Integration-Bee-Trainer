// src/app/layout.tsx
import "./globals.css";
import Providers from "./providers";

// ✅ adjust this import path to your project
import Navbar from "@/components/Navbar"; // or: import Navbar from "./components/Navbar";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">
        <Providers>
          {/* Navbar */}
          <header className="sticky top-0 z-50">
            <Navbar />
          </header>

          {/* Page content */}
          <main className="min-h-[calc(100vh-64px)]">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
