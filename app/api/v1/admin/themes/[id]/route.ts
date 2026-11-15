// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { NextRequest, NextResponse } from "next/server";
import { csrfMatches } from "../../../../../../lib/http/session";
import { relayErrorResponse, storageUnavailableResponse } from "../../../../../../lib/http/errors";
import { invalidBody, parseBody, requireAdminResponse, runtimeWithAdmin, serializeTheme, csrfErrorResponse } from "../../../../../../lib/http/admin-routes";

const fields = ["slug", "title_ru", "title_en", "seed_text_ru", "seed_text_en", "status"] as const;

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminResponse(request);
  if (denied) return denied;
  if (!csrfMatches(request)) return csrfErrorResponse();
  const body = await parseBody(request);
  if (body instanceof NextResponse) return body;
  if (Object.keys(body).length < 1 || Object.keys(body).some((key) => !fields.includes(key as typeof fields[number])) || Object.values(body).some((value) => typeof value !== "string")) return invalidBody();
  if (body.status !== undefined && !["DRAFT", "ACTIVE", "ARCHIVED"].includes(String(body.status))) return invalidBody("status must be DRAFT, ACTIVE or ARCHIVED");
  if (typeof runtimeWithAdmin.updateAdminTheme !== "function") return storageUnavailableResponse();
  const params = await context.params;
  try {
    const theme = await Promise.resolve(runtimeWithAdmin.updateAdminTheme(params.id, {
      ...(body.slug !== undefined ? { slug: body.slug as string } : {}),
      ...(body.title_ru !== undefined ? { titleRu: body.title_ru as string } : {}),
      ...(body.title_en !== undefined ? { titleEn: body.title_en as string } : {}),
      ...(body.seed_text_ru !== undefined ? { seedTextRu: body.seed_text_ru as string } : {}),
      ...(body.seed_text_en !== undefined ? { seedTextEn: body.seed_text_en as string } : {}),
      ...(body.status !== undefined ? { status: body.status as "DRAFT" | "ACTIVE" | "ARCHIVED" } : {}),
    }));
    return NextResponse.json({ theme: serializeTheme(theme) });
  } catch (error) { return relayErrorResponse(error); }
}
