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
          {/* Navbar is position:fixed so it has no flow height.
              pt-16 on main pushes all page content below the 64px navbar. */}
          <Navbar />
          <main className="pt-16">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
