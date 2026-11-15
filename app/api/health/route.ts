// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ status: "ok", service: "meaning-relay", version: "0.1.0" });
}
