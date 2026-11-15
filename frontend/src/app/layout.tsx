import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Control de Asistencia",
  description: "Sistema web para gestión académica y asistencia estudiantil",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
