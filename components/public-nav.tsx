// Единая навигация публичных экранов с одинаковым порядком пунктов и CTA.
"use client";

import Link from "next/link";
import { useUiLocale, type UiLocale } from "./locale-picker";

type PublicPage = "home" | "gallery" | "map" | "rules";

const labels: Record<UiLocale, { home: string; gallery: string; map: string; rules: string; join: string }> = {
  ru: { home: "Главная", gallery: "Галерея", map: "Карта", rules: "Правила", join: "Вступить" },
  en: { home: "Home", gallery: "Gallery", map: "Map", rules: "Rules", join: "Join" },
  es: { home: "Inicio", gallery: "Galería", map: "Mapa", rules: "Reglas", join: "Entrar" },
  zh: { home: "主页", gallery: "画廊", map: "地图", rules: "规则", join: "加入" },
  fr: { home: "Accueil", gallery: "Galerie", map: "Carte", rules: "Règles", join: "Participer" },
  hi: { home: "मुखपृष्ठ", gallery: "गैलरी", map: "मानचित्र", rules: "नियम", join: "शामिल हों" },
};

interface PublicNavProps {
  active?: PublicPage;
  onJoin?: () => void;
}

export function PublicNav({ active, onJoin }: PublicNavProps) {
  const [locale] = useUiLocale();
  const copy = labels[locale];
  const linkClass = (page: PublicPage) => page === active ? "active" : undefined;

  return (
    <header className="topbar">
      <nav className="nav-links" aria-label={locale === "ru" ? "Основная навигация" : "Primary navigation"}>
        <Link className={linkClass("home")} href="/" aria-current={active === "home" ? "page" : undefined}>{copy.home}</Link>
        <Link className={linkClass("gallery")} href="/chains" aria-current={active === "gallery" ? "page" : undefined}>{copy.gallery}</Link>
        <Link className={linkClass("map")} href="/map" aria-current={active === "map" ? "page" : undefined}>{copy.map}</Link>
        <Link className={linkClass("rules")} href="/about" aria-current={active === "rules" ? "page" : undefined}>{copy.rules}</Link>
        {onJoin ? <button className="nav-join" type="button" onClick={onJoin}>{copy.join}</button> : <Link className="nav-join" href="/?join=1">{copy.join}</Link>}
      </nav>
    </header>
  );
}
