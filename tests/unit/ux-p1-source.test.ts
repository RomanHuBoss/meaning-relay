// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const relayApp = readFileSync(path.join(root, "components/relay-app.tsx"), "utf8");
const mapPage = readFileSync(path.join(root, "app/map/page.tsx"), "utf8");
const chainDetail = readFileSync(path.join(root, "components/chain-detail.tsx"), "utf8");
const css = readFileSync(path.join(root, "app/globals.css"), "utf8");

describe("UX and P1 source contracts", () => {
  it("preserves the draft through local storage for reload/offline recovery", () => {
    expect(relayApp).toMatch(/const DRAFT_KEY = "meaning-relay:draft"/u);
    expect(relayApp).toMatch(/storageGet\(window\.localStorage, DRAFT_KEY\)/u);
    expect(relayApp).toMatch(/storageSet\(window\.localStorage, DRAFT_KEY, draft\)/u);
    expect(relayApp).toMatch(/storageRemove\(window\.localStorage, DRAFT_KEY\)/u);
  });

  it("exposes map period controls and a semantic text table", () => {
    expect(mapPage).toMatch(/fetch\(`\/api\/v1\/map\?period=\$\{period\}`\)/u);
    expect(mapPage).toMatch(/aria-pressed=\{period === "24h"\}/u);
    expect(mapPage).toMatch(/className="map-data-table"/u);
    expect(mapPage).toMatch(/<th scope="col">Страна<\/th>/u);
    expect(mapPage).toMatch(/<th scope="row">\{countryLabel\(uiLocale, country\.country_code\)\}<\/th>/u);
    expect(mapPage).toMatch(/OTHER:\s*"ДРУГИЕ"/u);
    expect(mapPage).toMatch(/UNKNOWN:\s*"НЕ УКАЗАНО"/u);
    expect(css).toMatch(/\.map-data-table\s*\{[^}]*border-collapse:\s*collapse/u);
  });

  it("keeps result sharing keyboard-operable and labels metrics", () => {
    expect(chainDetail).toMatch(/navigator\.clipboard\.writeText\(window\.location\.href\)/u);
    expect(chainDetail).toMatch(/navigator\.share\(/u);
    expect(chainDetail).toMatch(/className="metrics-grid" aria-label="Метрики завершённой цепочки"/u);
    expect(chainDetail).toMatch(/<button className="(?:primary|secondary)-button" type="button"/u);
  });

  it("separates the language flow URL and clears it on cancellation", () => {
    expect(relayApp).toMatch(/router\.push\("\/\?join=1"\)/u);
    expect(relayApp).toMatch(/router\.replace\("\/"\)/u);
  });

  it("releases an active claim before switching to another language", () => {
    expect(relayApp).toMatch(/async function cancelClaim\(returnToLanguage = false(?:, navigate = true)?\)/u);
    expect(relayApp).toMatch(/if \(view === "turn" && start\?\.claim\.id\) \{\s*await cancelClaim\(true\)/u);
    expect(relayApp).toMatch(/if \(!cancelled\) return false;/u);
    expect(relayApp).toMatch(/if \(returnToLanguage(?: && navigate)?\) \{[\s\S]*?router\.push\("\/\?join=1"\)/u);
    expect(relayApp).not.toMatch(/const legacyKey = requestedCode \? null : storageGet\(window\.localStorage, START_KEY\)/u);
    expect(relayApp).toMatch(/if \(!hydrated \|\| !didNavigate \|\| pathname !== "\/"/u);
    expect(relayApp).toMatch(/if \(view === "turn" && start\?\.claim\.id\) \{\s*void cancelClaim\(\)/u);
  });

  it("releases a claim before browser navigation leaves the relay flow", () => {
    expect(relayApp).toMatch(/async function navigateFromFlow\(href: string\)/u);
    expect(relayApp).toMatch(/cancelClaim\(false, false\)/u);
    expect(relayApp).toMatch(/onNavigate=\{navigateFromFlow\}/u);
    expect(relayApp).toMatch(/onClick=\{\(\) => void cancelClaim\(\)\}/u);
  });

  it("explains that the invite link is for the next participant", () => {
    expect(relayApp).toMatch(/Скопируй ссылку и отправь её человеку, который продолжит следующий ход/u);
    expect(relayApp).toMatch(/Скопировать ссылку следующему участнику/u);
  });

  it("keeps an active chain status separate from a completed result", () => {
    expect(relayApp).toMatch(/const resultCompleted = result\?\.chain\.status === "COMPLETED"/u);
    expect(relayApp).toMatch(/ЦЕПОЧКА ПРОДОЛЖАЕТСЯ/u);
    expect(relayApp).toMatch(/Следующий участник продолжит/u);
    expect(relayApp).toMatch(/На карте за выбранный период страны с количеством передач менее 5/u);
  });
});
