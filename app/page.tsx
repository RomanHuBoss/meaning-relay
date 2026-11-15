// Эта страница отвечает за отдельный пользовательский сценарий и связывает представление с серверным контуром.
import { Suspense } from "react";
import { RelayApp } from "../components/relay-app";

export default function HomePage() {
  return <Suspense fallback={null}><RelayApp /></Suspense>;
}
