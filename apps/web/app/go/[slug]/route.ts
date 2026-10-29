import { resolveShortLink } from "@/lib/short-link";
import { API_URL, SITE_URL } from "@/lib/site";

/**
 * `mechetshamil.ru/go/<slug>` → 302 на страницу сайта с UTM-метками.
 * Метки дальше подхватит `proxy.ts` уже на целевой странице.
 *
 * `no-store`: редирект из кэша не посчитал бы клик, а выключенная
 * ссылка продолжала бы вести на старую страницу.
 */
export async function GET(request: Request, context: RouteContext<"/go/[slug]">): Promise<Response> {
  const { slug } = await context.params;
  const location = await resolveShortLink({
    slug,
    userAgent: request.headers.get("user-agent"),
    apiUrl: API_URL,
    siteUrl: SITE_URL,
  });

  return new Response(null, {
    status: 302,
    headers: { Location: location, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
