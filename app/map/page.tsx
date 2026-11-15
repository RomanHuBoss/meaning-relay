// Эта страница отвечает за отдельный пользовательский сценарий и связывает представление с серверным контуром.
"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { LocalePicker, type UiLocale, useUiLocale } from "../../components/locale-picker";
import { PublicNav } from "../../components/public-nav";
import { SiteBrand } from "../../components/site-brand";
import { SystemStatus } from "../../components/system-status";

type Period = "24h" | "all";
interface CountryActivity { country_code: string; count: number; }
interface MapResponse { period: Period; total_events: number; countries: CountryActivity[]; updated_at: string; enabled?: boolean; }
interface PublicStats { active_chains: number; completed_chains: number; saved_messages: number; }

const mapPointPositions: Record<string, { left: string; top: string }> = {
  US: { left: "27%", top: "42%" },
  BR: { left: "38%", top: "68%" },
  DE: { left: "52%", top: "34%" },
  RU: { left: "61%", top: "24%" },
  IN: { left: "67%", top: "52%" },
  JP: { left: "82%", top: "42%" },
  KZ: { left: "62%", top: "38%" },
};

const countryNames: Record<UiLocale, Record<string, string>> = {
  ru: { RU: "Россия", DE: "Германия", US: "США", GB: "Великобритания", FR: "Франция", KZ: "Казахстан", PL: "Польша", BR: "Бразилия", IN: "Индия", JP: "Япония", CN: "Китай", OTHER: "ДРУГИЕ", UNKNOWN: "НЕ УКАЗАНО" },
  en: { RU: "Russia", DE: "Germany", US: "United States", GB: "United Kingdom", FR: "France", KZ: "Kazakhstan", PL: "Poland", BR: "Brazil", IN: "India", JP: "Japan", CN: "China", OTHER: "OTHER", UNKNOWN: "UNKNOWN" },
  es: { RU: "Rusia", DE: "Alemania", US: "Estados Unidos", GB: "Reino Unido", FR: "Francia", KZ: "Kazajistán", PL: "Polonia", BR: "Brasil", IN: "India", JP: "Japón", CN: "China", OTHER: "OTROS", UNKNOWN: "DESCONOCIDO" },
  zh: { RU: "俄罗斯", DE: "德国", US: "美国", GB: "英国", FR: "法国", KZ: "哈萨克斯坦", PL: "波兰", BR: "巴西", IN: "印度", JP: "日本", CN: "中国", OTHER: "其他", UNKNOWN: "未知" },
  fr: { RU: "Russie", DE: "Allemagne", US: "États-Unis", GB: "Royaume-Uni", FR: "France", KZ: "Kazakhstan", PL: "Pologne", BR: "Brésil", IN: "Inde", JP: "Japon", CN: "Chine", OTHER: "AUTRES", UNKNOWN: "INCONNU" },
  hi: { RU: "रूस", DE: "जर्मनी", US: "अमेरिका", GB: "यूनाइटेड किंगडम", FR: "फ़्रांस", KZ: "कज़ाख़स्तान", PL: "पोलैंड", BR: "ब्राज़ील", IN: "भारत", JP: "जापान", CN: "चीन", OTHER: "अन्य", UNKNOWN: "अज्ञात" },
};

const aggregateSubtitles: Record<UiLocale, Record<"OTHER" | "UNKNOWN", string>> = {
  ru: { OTHER: "малые группы", UNKNOWN: "без страны" },
  en: { OTHER: "small groups", UNKNOWN: "no country" },
  es: { OTHER: "grupos pequeños", UNKNOWN: "sin país" },
  zh: { OTHER: "小型群组", UNKNOWN: "无国家" },
  fr: { OTHER: "petits groupes", UNKNOWN: "sans pays" },
  hi: { OTHER: "छोटे समूह", UNKNOWN: "बिना देश" },
};

function countryLabel(locale: UiLocale, code: string): string {
  return countryNames[locale][code] ?? code;
}

function countrySubtitle(locale: UiLocale, code: string): string {
  return code === "OTHER" || code === "UNKNOWN" ? aggregateSubtitles[locale][code] : code;
}

const mapCopy: Record<UiLocale, { home: string; gallery: string; map: string; rules: string; kicker: string; title: string; lede: string; day: string; all: string; activity: string; caption: string; noData: string; rankingKicker: string; rankingTitle: string; selection: string; noMapKicker: string; noMapTitle: string; noCoords: string; noIp: string; noText: string; privacy: string }> = {
  ru: { home: "Главная", gallery: "Галерея", map: "Карта", rules: "Правила", kicker: "СЛЕД КАЖДОГО ХОДА · ТОЛЬКО СТРАНА И КОЛИЧЕСТВО", title: "Сигнал по миру.", lede: "Карта не знает, кто вы. Она считает события и бережно забывает остальное.", day: "24 часа", all: "Всё время", activity: "Активность по странам", caption: "Агрегированные передачи по странам", noData: "За выбранный период пока нет данных.", rankingKicker: "ТОП СТРАН", rankingTitle: "Где цепочка звучит чаще.", selection: "СЕЛЕКЦИЯ · TOP-8", noMapKicker: "ЧЕГО НА КАРТЕ НЕТ", noMapTitle: "Только агрегаты, без следов участника.", noCoords: "координат и геолокации по точке;", noIp: "IP-адресов и идентификаторов сессий;", noText: "текстов и личных данных участников;", privacy: "Страна выбирается добровольно. Малые группы объединяются в «другие», а передачи без страны — в «не указано»." },
  en: { home: "Home", gallery: "Gallery", map: "Map", rules: "Rules", kicker: "TRACE EACH TURN · COUNTRY AND COUNT ONLY", title: "A signal around the world.", lede: "The map does not know who you are. It counts events and forgets the rest.", day: "24 hours", all: "All time", activity: "Activity by country", caption: "Aggregated turns by country", noData: "No data for the selected period yet.", rankingKicker: "TOP COUNTRIES", rankingTitle: "Where the relay is heard most.", selection: "SELECTION · TOP-8", noMapKicker: "NOT ON THE MAP", noMapTitle: "Aggregates only, with no participant trail.", noCoords: "point coordinates or exact locations;", noIp: "IP addresses or session identifiers;", noText: "participant texts or personal data;", privacy: "Country is optional. Small groups are combined into “other”, and turns without a country go to “unknown”." },
  es: { home: "Inicio", gallery: "Galería", map: "Mapa", rules: "Reglas", kicker: "RASTREA CADA TURNO · SOLO PAÍS Y CANTIDAD", title: "Una señal por el mundo.", lede: "El mapa no sabe quién eres. Cuenta eventos y olvida lo demás.", day: "24 horas", all: "Todo el tiempo", activity: "Actividad por país", caption: "Turnos agregados por país", noData: "Todavía no hay datos para este periodo.", rankingKicker: "PAÍSES PRINCIPALES", rankingTitle: "Dónde se escucha más el relevo.", selection: "SELECCIÓN · TOP-8", noMapKicker: "LO QUE NO ESTÁ EN EL MAPA", noMapTitle: "Solo agregados, sin rastro del participante.", noCoords: "coordenadas o ubicaciones exactas;", noIp: "direcciones IP o identificadores de sesión;", noText: "textos ni datos personales;", privacy: "El país es opcional. Los grupos pequeños se unen en «otros» y los turnos sin país pasan a «desconocido»." },
  zh: { home: "主页", gallery: "画廊", map: "地图", rules: "规则", kicker: "追踪每一回合 · 仅显示国家和数量", title: "世界各地的信号。", lede: "地图不知道你是谁。它只统计事件，谨慎忘记其余信息。", day: "24小时", all: "全部时间", activity: "各国活动", caption: "按国家汇总的回合", noData: "所选时间段暂无数据。", rankingKicker: "国家排行", rankingTitle: "接力在哪些地方更响亮。", selection: "筛选 · TOP-8", noMapKicker: "地图上没有的内容", noMapTitle: "只有汇总，没有参与者轨迹。", noCoords: "点位坐标和精确位置；", noIp: "IP地址和会话标识；", noText: "参与者文本和个人信息；", privacy: "国家信息自愿提供。小群组会合并为“其他”，没有国家的回合归入“未知”。" },
  fr: { home: "Accueil", gallery: "Galerie", map: "Carte", rules: "Règles", kicker: "SUIVEZ CHAQUE TOUR · PAYS ET QUANTITÉ SEULEMENT", title: "Un signal autour du monde.", lede: "La carte ne sait pas qui vous êtes. Elle compte les événements et oublie le reste.", day: "24 heures", all: "Tout le temps", activity: "Activité par pays", caption: "Tours agrégés par pays", noData: "Aucune donnée pour cette période.", rankingKicker: "PAYS EN TÊTE", rankingTitle: "Là où le relais résonne le plus.", selection: "SÉLECTION · TOP-8", noMapKicker: "ABSENT DE LA CARTE", noMapTitle: "Des agrégats, sans trace du participant.", noCoords: "coordonnées et géolocalisation précises;", noIp: "adresses IP et identifiants de session;", noText: "textes et données personnelles;", privacy: "Le pays est facultatif. Les petits groupes sont réunis dans « autres » et les tours sans pays dans « inconnu »." },
  hi: { home: "मुखपृष्ठ", gallery: "गैलरी", map: "मानचित्र", rules: "नियम", kicker: "हर चरण का संकेत · केवल देश और संख्या", title: "दुनिया भर का संकेत।", lede: "मानचित्र नहीं जानता कि आप कौन हैं। यह घटनाएँ गिनता है और बाकी भूल जाता है।", day: "24 घंटे", all: "हर समय", activity: "देश के अनुसार गतिविधि", caption: "देश के अनुसार कुल चरण", noData: "चुनी अवधि में अभी डेटा नहीं है।", rankingKicker: "शीर्ष देश", rankingTitle: "रिले कहाँ सबसे ज़्यादा सुनाई देती है।", selection: "चयन · TOP-8", noMapKicker: "मानचित्र पर नहीं", noMapTitle: "केवल कुल आँकड़े, प्रतिभागी का कोई निशान नहीं।", noCoords: "स्थान निर्देशांक या सटीक जगह;", noIp: "IP पते या सत्र पहचान;", noText: "प्रतिभागी का पाठ या निजी डेटा;", privacy: "देश देना वैकल्पिक है। छोटे समूह “अन्य” में जुड़ते हैं और बिना देश वाले चरण “अज्ञात” में जाते हैं।" },
};

export default function MapPage() {
  const [uiLocale] = useUiLocale();
  const copy = mapCopy[uiLocale];
  const [period, setPeriod] = useState<Period>("24h");
  const [map, setMap] = useState<MapResponse | null>(null);
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    Promise.all([
      fetch(`/api/v1/map?period=${period}`).then((response) => response.json().then((body) => ({ response, body }))),
      fetch("/api/v1/stats/public").then((response) => response.json()),
    ]).then(([mapResult, statsResult]) => {
      if (cancelled) return;
      if (!mapResult.response.ok) throw new Error(mapResult.body?.error?.message ?? "Карта временно недоступна");
      setMap(mapResult.body as MapResponse);
      setStats(statsResult as PublicStats);
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Карта временно недоступна");
    });
    return () => { cancelled = true; };
  }, [period]);

  const maxCountryCount = Math.max(1, ...(map?.countries ?? []).map((country) => country.count));

  return (
    <main className="site-shell public-page map-page">
      <div className="system-bar"><SiteBrand /><SystemStatus kind="period" /><div className="system-bar-right"><LocalePicker /></div></div>
      <PublicNav active="map" />
      <section className="public-heading map-heading"><p className="kicker">{copy.kicker}</p><h1>{copy.title}</h1><p>{copy.lede}</p></section>
      <section className="map-toolbar"><div className="period-switch" role="group" aria-label={uiLocale === "ru" ? "Период карты" : "Map period"}><button type="button" className={period === "24h" ? "active" : ""} aria-pressed={period === "24h"} onClick={() => setPeriod("24h")}>{copy.day}</button><button type="button" className={period === "all" ? "active" : ""} aria-pressed={period === "all"} onClick={() => setPeriod("all")}>{copy.all}</button></div><span role="status" aria-live="polite">{map ? `${map.total_events} ${uiLocale === "ru" ? "передач" : "events"}` : "…"}</span></section>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {map?.enabled === false && <section className="empty-state"><span className="kicker">КАРТА ОТКЛЮЧЕНА</span><h2>Карта временно недоступна.</h2><p>Основной эксперимент продолжается, а агрегированные счётчики остаются доступны ниже.</p></section>}
      {map?.enabled !== false && <section className="map-layout">
        <div className="world-map-placeholder" role="img" aria-label="Агрегированная карта активности по странам"><Image className="world-map-art" src="/world-map.svg" alt="Агрегированная карта активности по странам" fill sizes="(max-width: 760px) 100vw, 60vw" aria-hidden="true" /><div className="map-visual-layer"><div className="map-dots-layer" aria-hidden="true" />{Object.entries(mapPointPositions).map(([code, position]) => { const country = map?.countries.find((item) => item.country_code === code); return <span className={`map-point map-point-${code}`} style={position} key={code}><b>{code}</b><strong>{country?.count ?? "—"}</strong></span>; })}<div className="map-pulse pulse-one" aria-hidden="true" /><div className="map-pulse pulse-two" aria-hidden="true" /></div><span aria-hidden="true">AGGREGATED ACTIVITY</span></div>
        <div className="map-side-panel"><h2>{copy.activity}</h2><table className="map-data-table"><caption>{copy.caption}</caption><thead><tr>{uiLocale === "ru" ? <th scope="col">Страна</th> : <th scope="col">Country</th>}{uiLocale === "ru" ? <th scope="col">Передачи</th> : <th scope="col">Turns</th>}</tr></thead><tbody>{(map?.countries ?? []).map((country) => <tr key={country.country_code}><th scope="row">{countryLabel(uiLocale, country.country_code)}</th><td><span>{country.count}</span><i aria-hidden="true"><b style={{ width: `${Math.max(8, (country.count / maxCountryCount) * 100)}%` }} /></i></td></tr>)}{map && map.countries.length === 0 && <tr><td className="muted-copy" colSpan={2}>{copy.noData}</td></tr>}</tbody></table></div>
      </section>}
      <section className="map-rankings" aria-label={copy.rankingTitle}><article className="ranking-panel"><div className="ranking-heading"><div><p className="kicker">{copy.rankingKicker} · {period === "24h" ? copy.day : copy.all}</p><h2>{copy.rankingTitle}</h2></div><span>{copy.selection}</span></div><div className="ranking-list">{(map?.countries ?? []).slice(0, 8).map((country) => <div className="ranking-row" key={country.country_code}><div><strong>{countryLabel(uiLocale, country.country_code)}</strong><small>{countrySubtitle(uiLocale, country.country_code)}</small></div><i aria-hidden="true"><b style={{ width: `${Math.max(8, (country.count / maxCountryCount) * 100)}%` }} /></i><strong>{country.count}</strong></div>)}{map && map.countries.length === 0 && <p className="muted-copy">{copy.noData}</p>}</div></article><article className="ranking-panel ranking-note"><p className="kicker">{copy.noMapKicker}</p><h2>{copy.noMapTitle}</h2><ul><li>{copy.noCoords}</li><li>{copy.noIp}</li><li>{copy.noText}</li></ul><p>{copy.privacy}</p></article></section>
      <section className="stats-row map-stats"><div><strong>{stats?.active_chains ?? "—"}</strong><span>{uiLocale === "ru" ? "активных цепочек" : "active chains"}</span></div><div><strong>{stats?.completed_chains ?? "—"}</strong><span>{uiLocale === "ru" ? "завершённых цепочек" : "completed chains"}</span></div><div><strong>{stats?.saved_messages ?? "—"}</strong><span>{uiLocale === "ru" ? "сохранённых ходов" : "saved turns"}</span></div></section>
      <p className="privacy-note">{copy.privacy}</p>
      <footer><span>СМЫСЛОВОЙ ТЕЛЕФОН</span><span>Читай · Пересказывай · Передавай</span></footer>
    </main>
  );
}
