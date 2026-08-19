/*
 * 매일 영단어 — AI 중계기 (Cloudflare Worker + Durable Object)
 * ──────────────────────────────────────────────────────────
 * 하는 일은 하나뿐입니다: engword 워커가 부탁한 Gemini 호출을 '북미'에서 대신 내보냅니다.
 *
 * 왜 필요한가:
 *   한국 통신망 일부가 Cloudflare 홍콩(HKG) 데이터센터로 붙는데, 홍콩은 Gemini 미지원
 *   지역이라 Worker→Google 요청이 400 "User location is not supported" 로 막힙니다.
 *   Durable Object 는 만들어진 지역에 계속 머물고 그 안에서 부른 fetch 도 그 지역에서
 *   나가므로, 북미에 고정된 객체를 한 번 거치면 이 문제가 사라집니다.
 *   (어느 지역에 고정할지는 부르는 쪽 engword-worker.js 의 AI_PROXY_REGION 이 정합니다.)
 *
 * 배포 (한 번만):
 *   npx wrangler login
 *   npx wrangler deploy          ← 이 폴더(engword-ai-proxy)에서 실행
 *   그다음 engword 워커 대시보드에서
 *     Settings → Bindings → Add → Durable Object
 *       Variable name: AI_PROXY
 *       Durable Object: AIProxy  (engword-ai-proxy 에서 옴)
 *
 * ※ Gemini API 키는 engword 워커가 호출할 때 같이 넘겨 줍니다.
 *   이 워커에는 키를 따로 넣지 않아도 됩니다.
 * ※ 이 클래스는 engword-worker.template.js 안의 AIProxy 와 같은 내용입니다.
 *   한쪽을 고치면 다른 쪽도 같이 고쳐 주세요.
 */

export class AIProxy {
  constructor(state, env) { this.env = env; }
  async fetch(request) {
    let call;
    try { call = await request.json(); } catch (e) { call = null; }
    if (!call || !call.endpoint)
      return new Response(JSON.stringify({ error: { message: "중계 요청이 잘못됐어요." } }), { status: 400 });
    const res = await fetch(call.endpoint, {
      method: "POST",
      // 키는 부르는 쪽이 같이 넘겨 준다. (이 워커에 GEMINI_API_KEY 를 또 넣지 않아도 되게)
      headers: { "Content-Type": "application/json", "x-goog-api-key": call.apiKey || this.env.GEMINI_API_KEY || "" },
      body: JSON.stringify(call.payload),
    });
    return new Response(res.body, { status: res.status, headers: { "Content-Type": "application/json; charset=utf-8" } });
  }
}

// 이 워커는 바깥에서 직접 부를 일이 없다. (바인딩으로만 쓰인다)
export default {
  async fetch() {
    return new Response("Not found", { status: 404 });
  },
};
