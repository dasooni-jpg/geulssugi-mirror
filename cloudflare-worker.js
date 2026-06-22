/*
 * 글쓰기 거울 — Cloudflare Worker (AI 피드백 중간 심부름꾼)
 * ──────────────────────────────────────────────────────────
 * 이 코드를 Cloudflare Workers에 붙여넣고 배포하면,
 * 웹(GitHub Pages)에서도 진짜 AI 피드백이 작동합니다.
 *
 * 설정에서 넣어야 할 값(Cloudflare 대시보드 → Settings → Variables and Secrets):
 *   - GEMINI_API_KEY : (필수, Secret) Google AI Studio에서 받은 API 키
 *   - MODEL          : (선택) 모델 이름. 안 넣으면 gemini-2.0-flash 사용(무료)
 *
 * ✅ Google Gemini 무료 티어: 분당 15회, 하루 1,500회 — 교실 수업에 충분!
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

      const systemInstruction =
        "너는 초등학교 6학년의 글쓰기를 돕는 다정한 글쓰기 친구야.\n" +
        "규칙: (1) 절대 학생의 문장을 대신 고쳐 주거나 완성해 주지 마.\n" +
        "(2) green 에는 잘한 점 1가지를 구체적으로 칭찬해.\n" +
        "(3) yellow 에는 더 생각해 볼 점을 '질문'으로만 쉽게 안내해. 답은 알려주지 마.\n" +
        "(4) blue 에는 읽는 사람을 떠올리게 하는 메타인지 질문을 1가지 써.\n" +
        "(5) 6학년이 이해할 쉬운 말을 쓰고, 각 항목은 한두 문장으로 짧게.";

      const userMsg =
        '학생이 쓴 글:\n"""' + text + '"""\n읽는 사람: ' + readerTxt +
        "\n위 글에 대해 green/yellow/blue 피드백을 JSON으로 만들어 줘.";

      const model = env.MODEL || "gemini-2.0-flash";
      const body = {
        system_instruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: [{
          parts: [{ text: userMsg }],
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              green:  { type: "STRING" },
              yellow: { type: "STRING" },
              blue:   { type: "STRING" },
            },
            required: ["green", "yellow", "blue"],
          },
        },
      };

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        return Response.json({ ok: false, reason: "api_" + r.status }, { headers: cors });
      }
      const data = await r.json();
      const cardText = data.candidates[0].content.parts[0].text;
      const cards = JSON.parse(cardText);
      return Response.json(
        { ok: true, green: cards.green, yellow: cards.yellow, blue: cards.blue },
        { headers: cors }
      );
    } catch (e) {
      return Response.json({ ok: false, reason: "exception" }, { headers: cors });
    }
  },
};
