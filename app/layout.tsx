// Эта страница отвечает за отдельный пользовательский сценарий и связывает представление с серверным контуром.
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Смысловой телефон — передай мысль дальше",
  description: "Двенадцать людей передают одну мысль дальше. Что переживёт смысл?",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <head>
        <link rel="preload" href="/galaxy-nebula.png" as="image" />
      </head>
      <body>
        {/* Декоративный космический слой остаётся скрытым от чтения с экрана и не перехватывает ввод. */}
        <div className="galaxy-backdrop" aria-hidden="true">
          <span className="galaxy-backdrop__stars" />
          <span className="galaxy-backdrop__nebula" />
          <span className="galaxy-backdrop__halo" />
        </div>
        {children}
      </body>
    </html>
  );
}
