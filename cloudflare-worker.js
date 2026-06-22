/*
 * 글쓰기 거울 — Cloudflare Worker (AI 피드백 중간 심부름꾼)
 * ──────────────────────────────────────────────────────────
 * Cloudflare Workers AI를 사용합니다. 외부 API 키가 필요 없어요!
 *
 * 설정: Worker Settings → Bindings → Add → Workers AI → Variable name: AI
 *
 * ✅ 무료: 하루 10,000회 — 교실 수업에 충분!
 */

const ALLOWED_ORIGINS = [
  "https://dasooni-jpg.github.io",
  "http://localhost:4173",
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    const cors = {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") {
      return Response.json({ ok: false, reason: "post_only" }, { status: 405, headers: cors });
    }

    try {
      const { text, reader } = await request.json();
      if (!text || text.trim().length < 10) {
        return Response.json({ ok: false, reason: "too_short" }, { headers: cors });
      }
      const readerTxt = reader && reader.trim() ? reader : "이 글을 읽을 사람";

      const system =
        "너는 초등학교 6학년의 글쓰기를 돕는 다정한 글쓰기 친구야.\n" +
        "규칙: (1) 절대 학생의 문장을 대신 고쳐 주거나 완성해 주지 마.\n" +
        "(2) green 에는 잘한 점 1가지를 구체적으로 칭찬해.\n" +
        "(3) yellow 에는 더 생각해 볼 점을 '질문'으로만 쉽게 안내해. 답은 알려주지 마.\n" +
        "(4) blue 에는 읽는 사람을 떠올리게 하는 메타인지 질문을 1가지 써.\n" +
        "(5) 6학년이 이해할 쉬운 말을 쓰고, 각 항목은 한두 문장으로 짧게.\n" +
        "(6) 반드시 JSON만 출력해. 다른 텍스트는 절대 쓰지 마.\n" +
        '출력 형식: {"green":"...","yellow":"...","blue":"..."}';

      const userMsg =
        '학생이 쓴 글:\n"""' + text + '"""\n읽는 사람: ' + readerTxt +
        '\n위 글에 대해 피드백을 JSON으로 만들어 줘. 반드시 {"green":"...","yellow":"...","blue":"..."} 형식으로만 답해.';

      const result = await env.AI.run("@cf/meta/llama-4-scout-17b-16e-instruct", {
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        max_tokens: 512,
        temperature: 0.7,
      });

      const raw = result.response || "";
      let cards;
      if (typeof raw === "object" && raw.green) {
        cards = raw;
      } else {
        try {
          const str = typeof raw === "string" ? raw : JSON.stringify(raw);
          const start = str.indexOf("{");
          if (start === -1) throw new Error("no json");
          let depth = 0, end = -1;
          for (let i = start; i < str.length; i++) {
            if (str[i] === "{") depth++;
            else if (str[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
          }
          if (end === -1) throw new Error("no closing brace");
          cards = JSON.parse(str.substring(start, end + 1));
        } catch {
          return Response.json({ ok: false, reason: "parse_fail", raw }, { headers: cors });
        }
      }
      if (!cards.green || !cards.yellow || !cards.blue) {
        return Response.json({ ok: false, reason: "parse_fail", raw }, { headers: cors });
      }
      return Response.json(
        { ok: true, green: cards.green, yellow: cards.yellow, blue: cards.blue },
        { headers: cors }
      );
    } catch (e) {
      return Response.json({ ok: false, reason: "exception", detail: e.message }, { headers: cors });
    }
  },
};
