/*
 * 다람쌤 e북 공방 — 온라인 주소로 열기 (Cloudflare Worker)
 * ──────────────────────────────────────────────────────────
 * 화면 하나짜리 정적 앱이라 서버가 하는 일은 index.html 을 내려 주는 것뿐임.
 * 데이터베이스·비밀키·설정이 필요 없음.
 *
 *   - 주소: https://<워커주소>/
 *
 * ※ 이 파일은 build-ebook-worker.mjs 가 만든 자동 생성본임.
 *    화면(ebook/index.html)을 고친 뒤에는 빌드 스크립트를 다시 실행할 것.
 *
 * 올리는 법 (Cloudflare 대시보드에서 한 번만):
 *  1. Workers & Pages → Create → Worker 만들기 (이름 예: ebook)
 *  2. 이 파일(ebook-worker.js) 내용을 그대로 붙여넣고 Deploy
 *  3. 끝. 주소는 https://ebook.<계정이름>.workers.dev
 */

const APP_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>e북 공방 — 무료 전자책 만들기</title>
<meta name="description" content="글을 쓰고 표지를 디자인해 EPUB·PDF·웹 책으로 내보내는 무료 전자책 제작 도구">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Do+Hyeon&family=Gaegu:wght@400;700&family=Gowun+Batang:wght@400;700&family=Jua&family=Nanum+Pen+Script&family=Noto+Sans+KR:wght@400;500;700&family=Noto+Serif+KR:wght@400;700&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#f4f3ef; --surface:#ffffff; --surface2:#faf9f6;
  --ink:#1c1f24; --ink2:#3f444c; --muted:#787d86; --faint:#a9adb4;
  --line:#e4e1da; --line2:#eeece7;
  --accent:#3651b8; --accent-h:#2a4297; --accent-bg:#eef1fb; --accent-line:#c9d2f2;
  --danger:#c92a2a; --danger-bg:#fdecec; --ok:#2b8a3e; --ok-bg:#ebf7ee; --warn:#b26b00; --warn-bg:#fff5e1;
  --r:10px; --shadow:0 1px 2px rgba(16,24,40,.05),0 1px 3px rgba(16,24,40,.08);
  --shadow-lg:0 12px 32px rgba(16,24,40,.14),0 4px 8px rgba(16,24,40,.06);
  --ui:'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;
  --serif:'Noto Serif KR','Nanum Myeongjo',Batang,serif;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{font-family:var(--ui);background:var(--bg);color:var(--ink);font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased}
button,input,textarea,select{font:inherit;color:inherit}
button{cursor:pointer;background:none;border:none}
[hidden]{display:none!important}
.ic{width:18px;height:18px;flex:none;vertical-align:middle}
.ic.s{width:15px;height:15px}

/* ── 공통 단추·입력 ── */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 14px;border-radius:8px;border:1px solid var(--line);background:var(--surface);font-weight:500;white-space:nowrap;transition:background .12s,border-color .12s,box-shadow .12s}
.btn:hover{border-color:#cfcbc2;background:var(--surface2)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.btn.primary:hover{background:var(--accent-h);border-color:var(--accent-h)}
.btn.ghost{border-color:transparent;background:transparent}
.btn.ghost:hover{background:rgba(0,0,0,.05)}
.btn.danger{color:var(--danger)}
.btn.danger:hover{background:var(--danger-bg);border-color:#f3c4c4}
.btn.sm{height:30px;padding:0 10px;font-size:13px}
.btn.lg{height:44px;padding:0 20px;font-size:15px}
.btn.block{width:100%}
.btn:disabled{opacity:.55;cursor:default}
.iconbtn{width:30px;height:30px;border-radius:7px;display:inline-grid;place-items:center;color:var(--muted)}
.iconbtn:hover{background:rgba(0,0,0,.06);color:var(--ink)}
.field{margin-bottom:16px}
.field>label,.lbl{display:block;font-size:12.5px;font-weight:700;color:var(--ink2);margin-bottom:6px}
.field>label small{font-weight:400;color:var(--muted);margin-left:4px}
.input,.textarea,.select{width:100%;height:40px;border:1px solid var(--line);background:var(--surface);border-radius:8px;padding:0 12px;outline:none;transition:border-color .12s,box-shadow .12s}
.textarea{height:auto;padding:10px 12px;resize:vertical;line-height:1.7}
.input:focus,.textarea:focus,.select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(54,81,184,.14)}
.help{font-size:12px;color:var(--muted);margin-top:6px;line-height:1.55}
.seg{display:inline-flex;background:var(--line2);border-radius:9px;padding:3px;gap:2px;flex-wrap:wrap}
.seg button{height:30px;padding:0 12px;border-radius:7px;font-size:13px;color:var(--ink2);font-weight:500}
.seg button.on{background:var(--surface);color:var(--ink);box-shadow:var(--shadow)}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--surface);font-size:13px}
.chip:hover{border-color:#cfcbc2}
.chip.on{background:var(--ink);border-color:var(--ink);color:#fff}
.swatches{display:flex;flex-wrap:wrap;gap:8px}
.sw{width:34px;height:34px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12);position:relative}
.sw.on::after{content:"";position:absolute;inset:-4px;border-radius:50%;border:2px solid var(--ink)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow)}
.card-h{padding:16px 20px;border-bottom:1px solid var(--line2);display:flex;align-items:center;gap:10px}
.card-h h3{font-size:15px}
.card-h p{font-size:12.5px;color:var(--muted)}
.card-b{padding:20px}
.range{width:100%;accent-color:var(--accent)}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.spacer{flex:1}
.badge{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:999px;font-size:11px;font-weight:700;background:var(--line2);color:var(--ink2)}

/* ── 위쪽 띠 ── */
.appbar{height:56px;background:var(--surface);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px;padding:0 16px;position:sticky;top:0;z-index:40}
.brand{display:flex;align-items:center;gap:9px;cursor:pointer;user-select:none}
.brand .logo{width:30px;height:30px;border-radius:8px;background:var(--accent);display:grid;place-items:center;color:#fff}
.brand b{font-size:16px;letter-spacing:-.02em}
.brand em{font-style:normal;font-size:12px;color:var(--muted)}
.bar-ed{display:none;align-items:center;gap:8px;min-width:0}
body[data-view=editor] .bar-ed{display:flex}
body[data-view=editor] .brand em{display:none}
.vsep{width:1px;height:22px;background:var(--line);margin:0 4px}
.bookname{font-weight:700;max-width:34vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.save{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);white-space:nowrap}
.save i{width:7px;height:7px;border-radius:50%;background:var(--ok)}
.save.busy i{background:var(--warn)}
.save.err i{background:var(--danger)}

.view{display:none}
body[data-view=library] #viewLibrary,body[data-view=editor] #viewEditor,body[data-view=anth] #viewAnth{display:block}
body[data-view=editor] #viewEditor{display:grid}

/* ── 서재 ── */
.wrap{max-width:1180px;margin:0 auto;padding:32px 24px 60px}
.pagehead{display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:24px}
.pagehead h1{font-size:26px;letter-spacing:-.03em}
.pagehead p{color:var(--muted);margin-top:4px}
.lib-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:28px 22px}
.bk{position:relative}
.bk .cv{position:relative;aspect-ratio:1000/1414;border-radius:4px 8px 8px 4px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,.08),0 10px 24px rgba(16,24,40,.14);cursor:pointer;transition:transform .18s,box-shadow .18s;background:#ddd}
.bk .cv:hover{transform:translateY(-4px);box-shadow:0 4px 8px rgba(0,0,0,.08),0 18px 34px rgba(16,24,40,.2)}
.bk canvas{width:100%;height:100%;display:block}
.bk .nm{font-weight:700;margin-top:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bk .mt{font-size:12px;color:var(--muted)}
.bk .acts{display:flex;gap:2px;margin-top:4px}
.bk.new .cv{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:transparent;border:2px dashed #cfcac0;box-shadow:none;color:var(--muted);font-weight:700}
.bk.new .cv:hover{border-color:var(--accent);color:var(--accent);transform:none}
.bk.new .plus{width:46px;height:46px;border-radius:50%;background:var(--surface);display:grid;place-items:center;box-shadow:var(--shadow)}
.lib-note{margin-top:40px;padding:14px 18px;border-radius:10px;background:var(--surface);border:1px solid var(--line);color:var(--muted);font-size:13px;display:flex;gap:10px;align-items:flex-start}

/* ── 편집기 ── */
#viewEditor{grid-template-columns:256px minmax(0,1fr) minmax(340px,36%);height:calc(100vh - 56px)}
body.nopv #viewEditor,body.pane-cover #viewEditor{grid-template-columns:256px minmax(0,1fr)}
body.nopv .pv,body.pane-cover .pv{display:none}
.side{background:var(--surface);border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0}
.side-book{display:flex;gap:12px;align-items:center;padding:16px;border-bottom:1px solid var(--line2)}
.side-book canvas{width:44px;height:62px;border-radius:2px 4px 4px 2px;box-shadow:0 2px 6px rgba(0,0,0,.2);flex:none}
.side-book b{display:block;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.side-book small{color:var(--muted);font-size:12px}
.side-book>div{min-width:0}
.side-nav{padding:10px 8px 4px}
.nav-i{display:flex;align-items:center;gap:10px;width:100%;height:36px;padding:0 10px;border-radius:7px;color:var(--ink2);font-weight:500;text-align:left}
.nav-i:hover{background:var(--line2)}
.nav-i.on{background:var(--accent-bg);color:var(--accent)}
.side-sec{display:flex;align-items:center;padding:14px 16px 6px;font-size:11.5px;font-weight:700;letter-spacing:.06em;color:var(--muted)}
.side-sec .spacer{flex:1}
.side-sec button{height:24px;padding:0 8px;border-radius:6px;font-size:12px;font-weight:700;color:var(--accent);display:inline-flex;align-items:center;gap:3px}
.side-sec button:hover{background:var(--accent-bg)}
.chs{list-style:none;overflow:auto;flex:1;padding:0 8px 8px}
.chs li{display:flex;align-items:center;gap:8px;min-height:34px;padding:4px 6px 4px 10px;border-radius:7px;cursor:pointer;color:var(--ink2)}
.chs li:hover{background:var(--line2)}
.chs li.on{background:var(--accent-bg);color:var(--accent)}
.chs li .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px}
.chs li .n{font-size:11px;color:var(--faint);font-variant-numeric:tabular-nums}
.chs li.part{margin-top:6px;font-weight:700;color:var(--ink)}
.chs li.part .t::before{content:"";display:inline-block;width:3px;height:12px;background:var(--accent);border-radius:2px;margin-right:7px;vertical-align:-1px}
.chs li.sub{padding-left:22px}
.chs li .ops{display:none;gap:0}
.chs li:hover .ops,.chs li.on .ops{display:flex}
.chs li .ops button{width:22px;height:22px;border-radius:5px;display:grid;place-items:center;color:var(--muted)}
.chs li .ops button:hover{background:rgba(0,0,0,.08);color:var(--ink)}
.side-foot{padding:12px;border-top:1px solid var(--line2)}

.work{overflow:auto;min-height:0;position:relative}
.pane{display:none}
.pane.on{display:block}
.pane-in{max-width:760px;margin:0 auto;padding:28px 28px 60px}
.pane-title{display:flex;align-items:center;gap:10px;margin-bottom:20px}
.pane-title h2{font-size:20px;letter-spacing:-.02em}
.pane-title p{color:var(--muted);font-size:13px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
.stack>*+*{margin-top:16px}

/* 원고 */
.ms-bar{position:sticky;top:0;z-index:5;background:rgba(244,243,239,.92);backdrop-filter:blur(6px);border-bottom:1px solid var(--line);padding:8px 16px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.ms-bar .grp{display:flex;gap:2px;padding-right:6px;margin-right:2px;border-right:1px solid var(--line)}
.ms-bar .grp:last-child{border-right:none}
.tb{height:30px;min-width:30px;padding:0 8px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;gap:5px;color:var(--ink2);font-size:13px}
.tb:hover{background:rgba(0,0,0,.06);color:var(--ink)}
.tb.on{background:var(--ink);color:#fff}
.paper{max-width:720px;margin:28px auto 0;background:var(--surface);border:1px solid var(--line);border-radius:4px;box-shadow:var(--shadow);padding:56px 64px 80px;min-height:70vh}
.kind{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;letter-spacing:.06em;color:var(--accent);margin-bottom:10px}
.ms-title{width:100%;border:none;outline:none;font-family:var(--serif);font-size:28px;font-weight:700;letter-spacing:-.02em;background:transparent}
.ms-sub{width:100%;border:none;outline:none;font-size:14px;color:var(--ink2);margin-top:8px;background:transparent;border-bottom:1px dashed transparent}
.ms-sub:focus{border-bottom-color:var(--line)}
.ms-img{margin:24px 0 6px;position:relative;text-align:center}
.ms-img img{max-width:100%;max-height:340px;border-radius:4px}
.ms-img .ops{position:absolute;top:8px;right:8px;display:flex;gap:4px}
.ms-img .ops .btn{background:rgba(255,255,255,.95)}
.ms-addimg{margin:20px 0 4px;width:100%;height:86px;border:1.5px dashed var(--line);border-radius:8px;color:var(--muted);display:flex;align-items:center;justify-content:center;gap:8px}
.ms-addimg:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-bg)}
.ms-rule{height:1px;background:var(--line2);margin:22px 0}
.ms-body{width:100%;border:none;outline:none;resize:none;font-family:var(--serif);font-size:17px;line-height:1.95;min-height:340px;background:transparent;overflow:hidden}
.ms-body::placeholder,.ms-title::placeholder,.ms-sub::placeholder{color:#bfc2c7}
.ms-status{position:sticky;bottom:0;display:flex;gap:18px;justify-content:center;padding:8px;font-size:12px;color:var(--muted);background:linear-gradient(transparent,var(--bg) 40%)}
.ms-status b{color:var(--ink2);font-weight:700}
.ms-help{max-width:720px;margin:12px auto 0;font-size:12px;color:var(--muted);text-align:center}
.ms-help code{background:var(--line2);padding:1px 5px;border-radius:4px;font-size:11.5px}

/* 본문 스타일 */
.styles{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.sty{border:1.5px solid var(--line);border-radius:12px;background:var(--surface);padding:0;text-align:left;overflow:hidden;transition:border-color .12s,box-shadow .12s}
.sty:hover{border-color:#cfcbc2}
.sty.on{border-color:var(--accent);box-shadow:0 0 0 3px rgba(54,81,184,.14)}
.sty .smp{height:150px;background:#fdfcf8;padding:20px 22px;font-family:var(--serif);font-size:11.5px;line-height:1.8;color:#3b342e;overflow:hidden;border-bottom:1px solid var(--line2)}
.sty .meta{padding:12px 16px}
.sty .meta b{display:block}
.sty .meta span{font-size:12px;color:var(--muted)}

/* 표지 디자인 */
.cd{display:grid;grid-template-columns:300px minmax(0,1fr);height:100%;min-height:calc(100vh - 56px)}
.cd-tools{background:var(--surface);border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0}
.cd-tabs{display:grid;grid-template-columns:repeat(6,1fr);border-bottom:1px solid var(--line)}
.cd-tabs button{display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 0 8px;font-size:11.5px;color:var(--muted);border-bottom:2px solid transparent}
.cd-tabs button.on{color:var(--accent);border-bottom-color:var(--accent)}
.cd-body{padding:16px;overflow:auto;flex:1}
.cd-sec{display:none}.cd-sec.on{display:block}
.lays{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.lay{text-align:center;font-size:11.5px;color:var(--ink2)}
.lay canvas{width:100%;aspect-ratio:1000/1414;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,.18);display:block;margin-bottom:5px;outline:2px solid transparent;outline-offset:2px}
.lay.on canvas{outline-color:var(--accent)}
.fonts{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.fnt{height:54px;border:1.5px solid var(--line);border-radius:8px;background:var(--surface);font-size:19px;line-height:1.1;display:flex;flex-direction:column;align-items:center;justify-content:center}
.fnt small{font-family:var(--ui);font-size:10.5px;color:var(--muted);margin-top:2px}
.fnt.on{border-color:var(--accent);box-shadow:0 0 0 2px rgba(54,81,184,.15)}
.pats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.pat{aspect-ratio:1;border-radius:8px;border:1.5px solid var(--line);font-size:11px;color:var(--muted);display:flex;align-items:flex-end;justify-content:center;padding-bottom:4px;background-size:cover}
.pat.on{border-color:var(--accent);color:var(--accent);font-weight:700}
.stk-cat{font-size:12px;font-weight:700;color:var(--ink2);margin:14px 0 6px}
.stk-cat:first-child{margin-top:0}
.emojis{display:grid;grid-template-columns:repeat(6,1fr);gap:4px}
.emojis button{aspect-ratio:1;font-size:24px;border-radius:8px;font-family:'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif}
.emojis button:hover{background:var(--line2)}
.badges{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
.badges button{height:34px;border-radius:8px;color:#fff;font-weight:700;font-size:12.5px}
.cd-stage{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;background:radial-gradient(circle at 50% 40%,#eceae4,#dedad2)}
.stage-wrap{position:relative;height:min(78vh,860px);aspect-ratio:1000/1414;max-width:100%}
#coverStage{width:100%;height:100%;display:block;border-radius:3px 6px 6px 3px;box-shadow:0 6px 14px rgba(0,0,0,.14),0 24px 50px rgba(30,25,15,.25);touch-action:none;cursor:default}
.stage-hint{margin-top:14px;font-size:12px;color:var(--muted);text-align:center}
.cd-stage.drawing #coverStage{cursor:crosshair}
.cd-stage.dropping .stage-wrap::after{content:"여기에 놓으면 사진이 들어감";position:absolute;inset:0;display:grid;place-items:center;background:rgba(54,81,184,.18);border:3px dashed var(--accent);border-radius:6px;color:var(--accent);font-weight:700;font-size:16px}
.pens{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.pen{height:62px;border:1.5px solid var(--line);border-radius:9px;background:var(--surface);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:11.5px;color:var(--ink2)}
.pen i{display:block;width:34px;border-radius:9px;background:var(--ink)}
.pen.on{border-color:var(--accent);box-shadow:0 0 0 2px rgba(54,81,184,.15);color:var(--accent)}
.sw.pick{overflow:hidden;background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red)}
.sw.pick input{opacity:0;width:100%;height:100%;cursor:pointer}
.sizedot{display:inline-block;border-radius:50%;background:var(--ink);vertical-align:middle;margin-left:6px}
.pens.sh{grid-template-columns:repeat(3,1fr)}
.pen svg{width:22px;height:22px}
.studio{position:fixed;inset:0;z-index:95;background:var(--bg);display:flex;flex-direction:column}
.st-h{height:58px;flex:none;display:flex;align-items:center;gap:10px;padding:0 16px;background:var(--surface);border-bottom:1px solid var(--line);overflow-x:auto}
.st-h b{font-size:15px;white-space:nowrap}
.st-h .nm{color:var(--muted);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:26vw}
.st-b{flex:1;display:grid;grid-template-columns:288px minmax(0,1fr);min-height:0}
.st-tools{background:var(--surface);border-right:1px solid var(--line);padding:16px;overflow:auto}
.st-stage{display:flex;align-items:center;justify-content:center;padding:20px;min-height:0;background:radial-gradient(circle at 50% 40%,#eceae4,#dedad2)}
#stCanvas{display:block;max-width:100%;max-height:100%;background:#fff;box-shadow:0 6px 14px rgba(0,0,0,.12),0 20px 44px rgba(30,25,15,.22);touch-action:none;cursor:crosshair;border-radius:3px}
@media (max-width:820px){.st-b{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}.st-tools{max-height:36vh;border-right:none;border-bottom:1px solid var(--line)}}
.bigpick{flex-direction:column!important;gap:4px!important;height:118px!important;margin-top:0!important}
.bigpick b{font-size:14px;color:var(--ink)}
.bigpick small{font-size:12px}
.selbar{position:absolute;top:16px;left:50%;transform:translateX(-50%);background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-lg);border-radius:10px;padding:6px 8px;display:flex;align-items:center;gap:8px;z-index:4;white-space:nowrap;max-width:calc(100% - 24px);overflow-x:auto}
.selbar label{font-size:11.5px;color:var(--muted);display:flex;align-items:center;gap:6px}
.selbar input[type=range]{width:90px;accent-color:var(--accent)}
.selbar input[type=text]{height:28px;width:120px;border:1px solid var(--line);border-radius:6px;padding:0 8px}
.selbar .sw{width:22px;height:22px}
.selbar .seg{flex-wrap:nowrap;flex:none}
.selbar .seg button{height:26px;padding:0 9px;font-size:12px}
.selbar .sw.on::after{inset:-3px}

/* 미리보기 */
.pv{background:#2c2a27;display:flex;flex-direction:column;min-height:0;border-left:1px solid var(--line)}
.pv-h{height:44px;display:flex;align-items:center;gap:8px;padding:0 10px 0 16px;color:#d9d4cc;font-size:12.5px;border-bottom:1px solid rgba(255,255,255,.08)}
.pv-h .iconbtn{color:#bdb6ac}
.pv-h .iconbtn:hover{background:rgba(255,255,255,.1);color:#fff}
.pv iframe{flex:1;width:100%;border:none;display:block}
.pv.full{position:fixed;inset:0;z-index:70}

/* ── 문집 엮기 ── */
.anth{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px;align-items:start}
.drop{border:2px dashed #cdc8be;border-radius:12px;padding:28px;text-align:center;background:var(--surface);transition:border-color .12s,background .12s}
.drop.over{border-color:var(--accent);background:var(--accent-bg)}
.drop .big{width:48px;height:48px;border-radius:50%;background:var(--accent-bg);color:var(--accent);display:grid;place-items:center;margin:0 auto 10px}
.drop b{display:block;font-size:15px}
.drop p{color:var(--muted);font-size:13px;margin:4px 0 14px}
.tbl{width:100%;border-collapse:collapse}
.tbl th{font-size:11.5px;font-weight:700;color:var(--muted);text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);background:var(--surface2);white-space:nowrap}
.tbl td{padding:8px 12px;border-bottom:1px solid var(--line2);vertical-align:middle}
.tbl tr:last-child td{border-bottom:none}
.tbl .cvs{width:34px;height:48px;border-radius:2px 3px 3px 2px;box-shadow:0 1px 4px rgba(0,0,0,.2);display:block}
.tbl .no{width:28px;color:var(--faint);font-variant-numeric:tabular-nums;text-align:center}
.tbl .num{font-variant-numeric:tabular-nums;color:var(--ink2);white-space:nowrap}
.tbl .tt{font-weight:700}
.tbl .au{font-size:12px;color:var(--muted)}
.empty-row{padding:36px;text-align:center;color:var(--muted)}
.sticky{position:sticky;top:76px}
.check{display:flex;align-items:flex-start;gap:9px;padding:7px 0;font-size:13.5px;cursor:pointer}
.check input{margin-top:3px;accent-color:var(--accent);width:16px;height:16px}
.check small{display:block;color:var(--muted);font-size:12px}
.sumline{display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:var(--ink2)}
.sumline b{font-variant-numeric:tabular-nums}

/* ── 창(모달) ── */
.modal{position:fixed;inset:0;background:rgba(20,22,28,.5);display:none;align-items:center;justify-content:center;z-index:90;padding:20px;backdrop-filter:blur(2px)}
.modal.on{display:flex}
.mbox{background:var(--surface);border-radius:14px;width:100%;max-width:820px;max-height:90vh;overflow:auto;box-shadow:var(--shadow-lg)}
.mbox-h{display:flex;align-items:center;padding:20px 24px 4px}
.mbox-h h2{font-size:19px;letter-spacing:-.02em}
.mbox-sub{padding:0 24px 16px;color:var(--muted);font-size:13px}
.mbox-b{padding:0 24px 24px}
.tpls{display:grid;grid-template-columns:repeat(auto-fill,minmax(178px,1fr));gap:12px}
.tpl{border:1.5px solid var(--line);border-radius:12px;text-align:left;overflow:hidden;background:var(--surface);transition:border-color .12s,transform .12s}
.tpl:hover{border-color:var(--accent);transform:translateY(-2px)}
.tpl canvas{width:100%;aspect-ratio:1000/700;object-fit:cover;display:block;background:#eee}
.tpl .m{padding:10px 12px 12px}
.tpl b{display:block;font-size:14px}
.tpl span{font-size:12px;color:var(--muted);line-height:1.5}
.exp-grid{display:grid;grid-template-columns:240px 1fr;gap:20px}
.exp-check{background:var(--surface2);border:1px solid var(--line2);border-radius:10px;padding:14px;font-size:13px}
.exp-check h4{font-size:12px;color:var(--muted);letter-spacing:.05em;margin-bottom:8px}
.ck{display:flex;gap:8px;padding:5px 0;align-items:flex-start;line-height:1.45}
.ck .d{width:18px;height:18px;border-radius:50%;flex:none;display:grid;place-items:center;font-size:11px;font-weight:700;margin-top:1px}
.ck.ok .d{background:var(--ok-bg);color:var(--ok)}
.ck.warn .d{background:var(--warn-bg);color:var(--warn)}
.fmts{display:grid;gap:10px}
.fmt{display:grid;grid-template-columns:48px 1fr auto;gap:14px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.fmt .fi{width:48px;height:48px;border-radius:10px;display:grid;place-items:center;font-weight:800;font-size:12px;color:#fff;letter-spacing:.02em}
.fmt b{display:block;font-size:14.5px}
.fmt span{font-size:12.5px;color:var(--muted);line-height:1.5;display:block}
.fmt .opts{margin-top:8px}

.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(16px);background:var(--ink);color:#fff;padding:11px 18px;border-radius:10px;font-size:13.5px;opacity:0;transition:.22s;z-index:100;pointer-events:none;max-width:90vw;text-align:center;box-shadow:var(--shadow-lg)}
.toast.on{opacity:1;transform:translateX(-50%) translateY(0)}

@media (max-width:1180px){
  #viewEditor{grid-template-columns:220px minmax(0,1fr)}
  .pv{position:fixed;top:56px;right:0;bottom:0;width:min(520px,100%);z-index:60;box-shadow:var(--shadow-lg)}
  body.nopv .pv{display:none}
  .cd{grid-template-columns:270px minmax(0,1fr)}
}
@media (max-width:820px){
  body[data-view=editor] #viewEditor{display:block;height:auto}
  .side{border-right:none;border-bottom:1px solid var(--line)}
  .side-nav{display:flex;overflow-x:auto}
  .nav-i{width:auto;flex:none}
  .chs{max-height:200px}
  .paper{padding:32px 22px 60px;margin:16px 10px 0}
  .cd{grid-template-columns:1fr}
  .stage-wrap{height:auto;width:min(100%,420px)}
  .anth,.exp-grid{grid-template-columns:1fr}
  .lib-grid{grid-template-columns:repeat(2,1fr);gap:22px 14px}
  .wrap{padding:22px 16px 48px}
  .tpl canvas{object-position:center 20%}
  .grid2,.styles{grid-template-columns:1fr}
  .bookname{max-width:30vw}
  .sticky{position:static}
  .pv{top:0}
}
</style>
</head>
<body data-view="library">

<header class="appbar">
  <div class="brand" id="brandHome" title="서재로">
    <span class="logo"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></span>
    <b>e북 공방</b><em>무료 전자책 만들기</em>
  </div>
  <div class="bar-ed">
    <span class="vsep"></span>
    <span class="bookname" id="barTitle"></span>
    <span class="save" id="saveStatus"><i></i><span>저장됨</span></span>
  </div>
  <div class="spacer"></div>
  <div class="bar-ed">
    <button class="btn ghost" id="btnPv" data-i="eye">미리보기</button>
    <button class="btn primary" id="btnExport" data-i="download">내보내기</button>
  </div>
</header>

<!-- ════════ 서재 ════════ -->
<div class="view" id="viewLibrary">
  <div class="wrap">
    <div class="pagehead">
      <div>
        <h1>내 서재</h1>
        <p id="libMeta"></p>
      </div>
      <div class="spacer"></div>
      <button class="btn" id="btnImport" data-i="upload">책 파일 불러오기</button>
      <button class="btn" id="btnAnth" data-i="users">학급 문집 엮기</button>
      <button class="btn primary" id="btnNew" data-i="plus">새 책 만들기</button>
    </div>
    <div class="lib-grid" id="libGrid"></div>
    <div class="lib-note"><span data-i="info"></span><div>책은 <b>이 기기의 브라우저에만</b> 저장되며 서버로 보내지 않음. 브라우저 기록을 지우면 책도 지워지므로, 중요한 책은 <b>내보내기 → 책 파일(.ebook.json)</b>로 따로 보관함.</div></div>
  </div>
  <input type="file" id="fileImport" accept=".json,application/json" multiple hidden>
</div>

<!-- ════════ 편집기 ════════ -->
<div class="view" id="viewEditor">
  <aside class="side">
    <div class="side-book">
      <canvas id="sideThumb" width="132" height="186"></canvas>
      <div><b id="sideTitle"></b><small id="sideMeta"></small></div>
    </div>
    <nav class="side-nav">
      <button class="nav-i" data-pane="info"><span data-i="info"></span>책 정보</button>
      <button class="nav-i" data-pane="cover"><span data-i="image"></span>표지 디자인</button>
      <button class="nav-i" data-pane="style"><span data-i="type"></span>본문 스타일</button>
    </nav>
    <div class="side-sec">원고<span class="spacer"></span>
      <button id="btnAddPart" title="여러 장을 묶는 구분 쪽(부)을 추가함">＋ 부</button>
      <button id="btnAddCh" title="새 장 추가">＋ 장</button>
    </div>
    <ul class="chs" id="chList"></ul>
    <div class="side-foot"><button class="btn block" id="btnLib" data-i="arrowLeft">서재로 돌아가기</button></div>
  </aside>

  <section class="work" id="work">
    <!-- 책 정보 -->
    <div class="pane" id="pane-info"><div class="pane-in">
      <div class="pane-title"><div><h2>책 정보</h2><p>표지·속표지·판권 면과 전자책 정보(메타데이터)에 쓰임.</p></div></div>
      <div class="stack">
        <div class="card"><div class="card-b">
          <div class="field"><label for="fTitle">책 제목</label><input class="input" id="fTitle" maxlength="60" placeholder="예: 우리 반 이야기 숲"></div>
          <div class="field"><label for="fSub">부제목 <small>선택</small></label><input class="input" id="fSub" maxlength="80" placeholder="예: 6학년 3반이 함께 쓴 1년"></div>
          <div class="grid2">
            <div class="field"><label for="fAuthor">지은이</label><input class="input" id="fAuthor" maxlength="40" placeholder="별명 권장"><div class="help">실명 대신 별명 사용을 권장함.</div></div>
            <div class="field"><label for="fPub">펴낸 곳 <small>선택</small></label><input class="input" id="fPub" maxlength="40" placeholder="예: 다람 출판사"></div>
          </div>
          <div class="field" style="margin-bottom:0"><label for="fGenre">갈래</label>
            <select class="select" id="fGenre"><option value="">선택 안 함</option><option>동화</option><option>소설</option><option>그림책</option><option>시</option><option>수필</option><option>보고서</option><option>문집</option><option>일기</option><option>기타</option></select>
          </div>
        </div></div>
        <div class="card"><div class="card-b">
          <div class="field" style="margin-bottom:0"><label for="fBlurb">책 소개 <small>뒤표지와 전자책 설명에 들어감</small></label>
            <textarea class="textarea" id="fBlurb" rows="5" maxlength="500" placeholder="이 책은 어떤 이야기인지, 누구에게 권하고 싶은지 3~5문장으로 소개함."></textarea>
            <div class="help" id="blurbCount"></div></div>
        </div></div>
        <div class="card"><div class="card-h"><div><h3>책 관리</h3><p>복제본을 만들거나 책을 지울 수 있음.</p></div></div>
          <div class="card-b row"><button class="btn" id="btnDup" data-i="copy">복제본 만들기</button><button class="btn danger" id="btnDelBook" data-i="trash">이 책 지우기</button></div></div>
      </div>
    </div></div>

    <!-- 표지 디자인 -->
    <div class="pane" id="pane-cover">
      <div class="cd">
        <div class="cd-tools">
          <div class="cd-tabs" id="cdTabs">
            <button data-cd="layout" class="on"><span data-i="grid"></span>레이아웃</button>
            <button data-cd="bg"><span data-i="droplet"></span>배경</button>
            <button data-cd="text"><span data-i="type"></span>글자</button>
            <button data-cd="img"><span data-i="camera"></span>사진</button>
            <button data-cd="draw"><span data-i="pen"></span>그리기</button>
            <button data-cd="stk"><span data-i="smile"></span>스티커</button>
          </div>
          <div class="cd-body">
            <div class="cd-sec on" id="cd-layout"><div class="lays" id="lays"></div></div>
            <div class="cd-sec" id="cd-bg">
              <div class="lbl">색 테마 <small style="font-weight:400;color:var(--muted)">본문 강조색도 함께 바뀜</small></div>
              <div class="swatches" id="themeSw"></div>
              <div class="lbl" style="margin-top:20px">무늬</div>
              <div class="pats" id="pats"></div>
            </div>
            <div class="cd-sec" id="cd-text">
              <div class="field"><label for="cTitle">제목</label><input class="input" id="cTitle" maxlength="60"></div>
              <div class="field"><label for="cSub">부제목</label><input class="input" id="cSub" maxlength="80"></div>
              <div class="field"><label for="cAuthor">지은이</label><input class="input" id="cAuthor" maxlength="40"></div>
              <div class="lbl">제목 글꼴</div>
              <div class="fonts" id="fontGrid"></div>
              <div class="field" style="margin-top:16px"><label>제목 크기 <small id="sizeVal"></small></label><input type="range" class="range" id="cSize" min="0.6" max="1.5" step="0.05"></div>
              <div class="field"><label>정렬</label><div class="seg" id="alignSeg"></div></div>
              <div class="field"><label>글자 색</label><div class="swatches" id="colorSw"></div></div>
              <label class="check"><input type="checkbox" id="cShadow"><span>글자 그림자<small>사진 위 글자가 잘 안 보일 때 켬</small></span></label>
              <button class="btn sm" id="btnResetPos" data-i="reset" style="margin-top:8px">글자 위치 처음으로</button>
              <div class="help">표지에서 제목·지은이를 직접 끌어 옮길 수 있음.</div>
            </div>
            <div class="cd-sec" id="cd-img">
              <div class="lbl">사진·그림 붙이기 <small style="font-weight:400;color:var(--muted)">자유롭게 옮기고 꾸밈</small></div>
              <button class="ms-addimg bigpick" id="btnPhoto"><span data-i="camera"></span><b>패드·컴퓨터에서 사진 고르기</b><small>여러 장을 한꺼번에 고를 수 있음</small></button>
              <div class="help">패드에서 누르면 <b>사진 보관함</b>(앨범) · <b>사진 찍기</b>(카메라) · <b>파일 선택</b>이 나옴. 표지 위로 그림 파일을 끌어다 놓거나 붙여넣기(Ctrl+V)해도 들어감.</div>
              <div class="help">붙인 사진을 누르면 크기·회전·테두리(폴라로이드·동그라미 등)를 바꿀 수 있음. 🔒 얼굴이 나온 사진은 넣지 않음.</div>
              <input type="file" id="filePhoto" accept="image/*" multiple hidden>
              <div class="ms-rule" style="margin:18px 0"></div>
              <div class="lbl">배경 그림 <small style="font-weight:400;color:var(--muted)">레이아웃의 그림 칸을 가득 채움</small></div>
              <div id="imgNone">
                <button class="ms-addimg" id="btnCoverImg" style="margin-top:0;height:64px"><span data-i="upload"></span>배경 그림 고르기</button>
              </div>
              <div id="imgSome">
                <div class="row" style="margin-bottom:16px"><button class="btn sm" id="btnCoverImg2" data-i="upload">바꾸기</button><button class="btn sm danger" id="btnCoverImgDel" data-i="trash">지우기</button></div>
                <div class="field"><label>확대</label><input type="range" class="range" id="cZoom" min="1" max="2.5" step="0.05"></div>
                <div class="field"><label>가로 위치</label><input type="range" class="range" id="cFx" min="-1" max="1" step="0.05"></div>
                <div class="field"><label>세로 위치</label><input type="range" class="range" id="cFy" min="-1" max="1" step="0.05"></div>
                <div class="help">그림이 잘려 보이면 확대·위치를 조절함. '그림 가득' 레이아웃이 그림을 가장 크게 보여 줌.</div>
              </div>
              <input type="file" id="fileCover" accept="image/*" hidden>
            </div>
            <div class="cd-sec" id="cd-draw">
              <div id="coverTools"></div>
              <label class="check" style="margin-top:12px"><input type="checkbox" id="drawTop"><span>제목·스티커 위에 그리기<small>끄면 그림이 글자 뒤로 들어감</small></span></label>
              <div class="help">이 탭이 열려 있는 동안 표지 위에 손가락이나 펜슬로 그림. 펜슬을 쓰면 손바닥이 화면에 닿아도 선이 그어지지 않음. 넓게 그리려면 레이아웃에서 <b>도화지</b>를 고름.</div>
            </div>
            <div class="cd-sec" id="cd-stk"><div id="stkPanel"></div></div>
          </div>
        </div>
        <div class="cd-stage">
          <div class="selbar" id="selbar" hidden></div>
          <div class="stage-wrap" id="stageWrap"><canvas id="coverStage" width="1000" height="1414"></canvas></div>
          <div class="stage-hint" id="stageHint"></div>
        </div>
      </div>
    </div>

    <!-- 본문 스타일 -->
    <div class="pane" id="pane-style"><div class="pane-in">
      <div class="pane-title"><div><h2>본문 스타일</h2><p>장 제목과 문단 모양을 한 번에 정함. 모든 내보내기 형식에 똑같이 적용됨.</p></div></div>
      <div class="styles" id="styleGrid"></div>
      <div class="card" style="margin-top:16px"><div class="card-b">
        <div class="field"><label>본문 글꼴</label><div class="seg" id="bodyFontSeg"></div><div class="help">EPUB은 독자가 쓰는 전자책 앱의 글꼴 설정이 우선함.</div></div>
        <div class="field" style="margin-bottom:0"><label>강조 색 (표지 색 테마와 같음)</label><div class="swatches" id="themeSw2"></div></div>
      </div></div>
    </div></div>

    <!-- 원고 -->
    <div class="pane" id="pane-write">
      <div class="ms-bar" id="msBar">
        <div class="grp" id="layGrp"></div>
        <div class="grp">
          <button class="tb" data-fmt="bold" title="굵게 (Ctrl+B)"><b>가</b></button>
          <button class="tb" data-fmt="italic" title="기울임 (Ctrl+I)"><i style="font-family:serif">가</i></button>
          <button class="tb" data-fmt="h" title="소제목">소제목</button>
          <button class="tb" data-fmt="quote" title="인용">인용</button>
          <button class="tb" data-fmt="hr" title="장면 나눔">✱✱✱</button>
        </div>
        <div class="grp"><button class="tb" id="tbImg" data-i="image" title="그림 넣기">그림</button><button class="tb" id="tbDraw" data-i="pen" title="이 장의 그림을 직접 그리기">그리기</button></div>
      </div>
      <div class="paper">
        <div class="kind" id="msKind"></div>
        <input class="ms-title" id="chTitle" maxlength="80" placeholder="제목">
        <input class="ms-sub" id="chAuthor" maxlength="40" placeholder="지은이 (문집처럼 여러 사람이 쓴 책일 때만, 없어도 됨)">
        <div id="msImgBox"></div>
        <div class="ms-rule"></div>
        <textarea class="ms-body" id="chBody"></textarea>
      </div>
      <div class="ms-help">빈 줄 = 새 문단 · <code>**굵게**</code> · <code>*기울임*</code> · 줄 앞 <code># </code>소제목 · <code>&gt; </code>인용 · <code>---</code> 장면 나눔</div>
      <div class="ms-status" id="msStatus"></div>
      <input type="file" id="fileCh" accept="image/*" hidden>
    </div>
  </section>

  <section class="pv" id="pvBox">
    <div class="pv-h"><span data-i="eye"></span>미리보기 <span style="opacity:.6">· 웹 책과 같은 모양</span><span class="spacer"></span>
      <button class="iconbtn" id="btnPvFull" title="크게 보기" data-i="maximize"></button>
      <button class="iconbtn" id="btnPvClose" title="닫기" data-i="x"></button></div>
    <iframe id="pvFrame" title="e북 미리보기"></iframe>
  </section>
</div>

<!-- ════════ 학급 문집 엮기 ════════ -->
<div class="view" id="viewAnth">
  <div class="wrap">
    <div class="pagehead">
      <div>
        <button class="btn ghost sm" id="btnAnthBack" data-i="arrowLeft" style="margin:0 0 8px -8px">서재</button>
        <h1>학급 문집 엮기</h1>
        <p>학생들이 제출한 책 파일(.ebook.json)을 모아 한 권의 문집으로 엮음. 모든 처리는 이 기기 안에서만 이루어짐.</p>
      </div>
    </div>
    <div class="anth">
      <div class="stack">
        <div class="drop" id="drop">
          <div class="big" data-i="upload"></div>
          <b>학생 책 파일을 여기에 끌어다 놓음</b>
          <p>여러 개를 한꺼번에 넣을 수 있음 · 같은 책은 한 번만 들어감</p>
          <div class="row" style="justify-content:center">
            <button class="btn primary" id="btnAnthFiles" data-i="upload">파일 고르기</button>
            <button class="btn" id="btnAnthShelf" data-i="book">내 서재에서 고르기</button>
          </div>
          <input type="file" id="fileAnth" accept=".json,application/json" multiple hidden>
        </div>
        <div class="card">
          <div class="card-h"><h3>실릴 작품 <span class="badge" id="anthCount">0</span></h3><span class="spacer"></span>
            <select class="select" id="anthSort" style="width:auto;height:32px;font-size:13px"><option value="">순서 바꾸기…</option><option value="author">지은이 가나다순</option><option value="title">제목 가나다순</option><option value="reverse">거꾸로</option></select>
            <button class="btn sm danger" id="btnAnthClear">모두 빼기</button></div>
          <div style="overflow-x:auto"><table class="tbl"><thead><tr><th class="no">#</th><th></th><th>작품</th><th>장</th><th>글자</th><th></th></tr></thead><tbody id="anthRows"></tbody></table></div>
        </div>
      </div>
      <div class="card sticky">
        <div class="card-h"><h3>문집 정보</h3></div>
        <div class="card-b">
          <div class="field"><label for="aTitle">문집 제목</label><input class="input" id="aTitle" placeholder="예: 우리들의 이야기 숲"></div>
          <div class="field"><label for="aSub">부제목 <small>선택</small></label><input class="input" id="aSub" placeholder="예: 2026 6학년 3반 문집"></div>
          <div class="field"><label for="aEditor">엮은이</label><input class="input" id="aEditor" placeholder="예: 6학년 3반"></div>
          <div class="field"><label>색 테마</label><div class="swatches" id="aTheme"></div></div>
          <div class="lbl">구성</div>
          <label class="check"><input type="checkbox" id="oDivider" checked><span>작품마다 구분 쪽 넣기<small>학생 책 표지·제목·지은이가 들어간 쪽</small></span></label>
          <label class="check"><input type="checkbox" id="oMosaic" checked><span>학생 표지로 모자이크 표지 만들기</span></label>
          <label class="check"><input type="checkbox" id="oPreface" checked><span>머리말 장 넣기</span></label>
          <label class="check"><input type="checkbox" id="oAfter" checked><span>맺음말 장 넣기</span></label>
          <div class="ms-rule" style="margin:14px 0"></div>
          <div class="sumline"><span>작품</span><b id="sumWorks">0편</b></div>
          <div class="sumline"><span>장</span><b id="sumChs">0개</b></div>
          <div class="sumline"><span>글자 (공백 제외)</span><b id="sumChars">0자</b></div>
          <div class="sumline"><span>그림</span><b id="sumImgs">0장</b></div>
          <button class="btn primary lg block" id="btnMakeAnth" style="margin-top:16px" data-i="book">문집 만들기</button>
          <div class="help">만든 문집은 서재에 새 책으로 들어가며, 편집기에서 머리말을 쓰고 EPUB·PDF로 내보내면 됨.</div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ════════ 창들 ════════ -->
<div class="modal" id="mTpl"><div class="mbox">
  <div class="mbox-h"><h2>새 책 만들기</h2><span class="spacer"></span><button class="iconbtn" data-close data-i="x"></button></div>
  <p class="mbox-sub">틀을 고르면 차례·표지·본문 스타일이 미리 맞춰짐. 나중에 모두 바꿀 수 있음.</p>
  <div class="mbox-b"><div class="tpls" id="tplGrid"></div></div>
</div></div>

<div class="modal" id="mExport"><div class="mbox">
  <div class="mbox-h"><h2>내보내기</h2><span class="spacer"></span><button class="iconbtn" data-close data-i="x"></button></div>
  <p class="mbox-sub">같은 원고로 여러 형식을 만들 수 있음. 모든 파일은 이 기기에서 바로 만들어짐.</p>
  <div class="mbox-b exp-grid">
    <div class="exp-check" id="expCheck"></div>
    <div class="fmts">
      <div class="fmt"><div class="fi" style="background:#2f7a4d">EPUB</div><div><b>전자책 (EPUB 3)</b><span>리디·교보·밀리의 서재·애플 북스·구글 플레이 북 등 전자책 앱용 표준 형식. 독자가 글자 크기를 바꿀 수 있음.</span></div><button class="btn primary" id="xEpub">내려받기</button></div>
      <div class="fmt"><div class="fi" style="background:#c92a2a">PDF</div><div><b>인쇄용 PDF</b><span>인쇄 창의 대상을 <b>"PDF로 저장"</b>으로 바꿔 저장함. 앞·뒤표지와 쪽 번호가 들어감.</span>
        <div class="opts seg" id="pdfSeg"><button data-v="a5" class="on">A5</button><button data-v="b6">B6 문고본</button><button data-v="a4">A4</button></div></div><button class="btn primary" id="xPdf">만들기</button></div>
      <div class="fmt"><div class="fi" style="background:#3651b8">WEB</div><div><b>웹 책 (HTML 한 파일)</b><span>더블클릭하면 책장 넘기듯 읽힘. 클래스룸·밴드·패들렛에 올려 공유하기 좋음.</span></div><button class="btn primary" id="xHtml">내려받기</button></div>
      <div class="fmt"><div class="fi" style="background:#5f6670">FILE</div><div><b>책 파일 (.ebook.json)</b><span>다른 기기에서 이어 쓰거나 선생님께 제출할 때 씀. 학급 문집 엮기에 넣는 파일도 이것임.</span></div><button class="btn" id="xJson">저장</button></div>
    </div>
  </div>
</div></div>

<div class="modal" id="mPick"><div class="mbox" style="max-width:560px">
  <div class="mbox-h"><h2>내 서재에서 고르기</h2><span class="spacer"></span><button class="iconbtn" data-close data-i="x"></button></div>
  <p class="mbox-sub">이 기기에서 만든 책을 문집에 넣음.</p>
  <div class="mbox-b"><div id="pickList"></div><div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn primary" id="btnPickOk">넣기</button></div></div>
</div></div>

<!-- 그림판: 본문 장 그림을 직접 그림 -->
<div class="studio" id="studio" hidden>
  <div class="st-h">
    <b>그림판</b><span class="nm" id="stName"></span><span class="spacer"></span>
    <div class="seg" id="stSize"><button data-sz="land">가로</button><button data-sz="port">세로</button><button data-sz="sq">정사각</button></div>
    <button class="btn" id="stPhoto" data-i="camera">사진 깔기</button>
    <button class="btn danger" id="stPhotoDel" hidden>사진 빼기</button>
    <button class="btn" id="stCancel">취소</button>
    <button class="btn primary" id="stSave" data-i="download">그림 넣기</button>
  </div>
  <div class="st-b">
    <aside class="st-tools"><div id="studioTools"></div>
      <div class="help" style="margin-top:12px">손가락·펜슬·마우스로 그림. <b>사진 깔기</b>로 패드 사진을 밑그림으로 깔고 그 위에 그릴 수 있음. 다 그리면 <b>그림 넣기</b>를 누름. 나중에 다시 열어 고칠 수 있음.</div></aside>
    <div class="st-stage"><canvas id="stCanvas" width="1200" height="900"></canvas></div>
  </div>
  <input type="file" id="stFile" accept="image/*" hidden>
</div>

<div class="toast" id="toast"></div>
<iframe id="printFrame" style="position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden" title="인쇄용"></iframe>

<!-- ══════════ 웹 책(읽기 화면) 틀: 미리보기와 HTML 내보내기가 함께 씀 ══════════ -->
<script type="text/plain" id="readerCSS">
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
body{background:__DESK__;color:#2b2420;-webkit-user-select:none;user-select:none;touch-action:pan-y}
#stage{position:absolute;inset:0 0 56px 0;display:flex;align-items:center;justify-content:center}
#viewport{position:relative;overflow:hidden;background:__PAPER__;box-shadow:0 10px 30px rgba(0,0,0,.35);border-radius:3px}
#viewport.spread::after{content:"";position:absolute;top:0;bottom:0;left:50%;width:46px;margin-left:-23px;background:linear-gradient(90deg,rgba(0,0,0,0),rgba(0,0,0,.09) 45%,rgba(0,0,0,.14) 50%,rgba(0,0,0,.09) 55%,rgba(0,0,0,0));pointer-events:none}
#flow{position:absolute;column-fill:auto;font-size:var(--fs,17px);transition:transform .35s ease}
#flow.noanim{transition:none}
.pno{position:absolute;bottom:8px;font-size:12px;color:#a0948a;width:50%;text-align:center;pointer-events:none;font-family:sans-serif}
#flow>section{break-before:column;-webkit-column-break-before:always}
#flow>section:first-child{break-before:auto;-webkit-column-break-before:auto}
.cover{height:100%;display:flex;align-items:center;justify-content:center}
.cover img{max-width:100%;max-height:100%;box-shadow:0 2px 10px rgba(0,0,0,.25)}
.part .pt-img img{max-height:var(--imgmax,45vh)}
#bar{position:fixed;left:0;right:0;bottom:0;height:56px;background:rgba(30,28,25,.95);color:#fff;display:flex;align-items:center;justify-content:center;gap:6px;font-family:'Noto Sans KR','Malgun Gothic',sans-serif;font-size:14px}
#bar button{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;border-radius:8px;padding:7px 12px;font-size:14px;cursor:pointer}
#bar button:hover{background:rgba(255,255,255,.22)}
#bar .pg{min-width:84px;text-align:center;font-variant-numeric:tabular-nums}
#prog{position:fixed;left:0;bottom:56px;height:3px;background:__ACCENT__;transition:width .3s}
.zone{position:absolute;top:0;bottom:0;width:22%;z-index:3;cursor:pointer}
.zone.l{left:0}.zone.r{right:0}
</script>

<script type="text/plain" id="readerJS">
(function(){
  var flow=document.getElementById('flow'),vp=document.getElementById('viewport'),
      pg=document.getElementById('pg'),prog=document.getElementById('prog'),
      pnoL=document.getElementById('pnoL'),pnoR=document.getElementById('pnoR');
  var page=0,total=1,spread=false,pw=300,P=24,fs=17;
  try{var s=parseFloat(localStorage.getItem('ebook-fs'));if(s>=12&&s<=30)fs=s;}catch(e){}
  function layout(keep){
    var ratio=total>1?page/total:0;
    var W=innerWidth,H=innerHeight-56;
    spread=W>=860&&W>H*1.15;
    var h=H-28,w=h*0.7;
    if(spread){if(2*w>W-32){w=(W-32)/2;h=Math.min(h,w/0.7);}}
    else if(w>W-16){w=W-16;h=Math.min(H-16,w/0.62);}
    pw=Math.floor(w);var ph=Math.floor(h);
    P=Math.round(Math.max(18,pw*0.09));
    vp.className=spread?'spread':'';
    vp.style.width=(spread?2*pw:pw)+'px';vp.style.height=ph+'px';
    flow.style.left=P+'px';flow.style.top=P+'px';
    flow.style.width=(spread?2*pw-2*P:pw-2*P)+'px';
    flow.style.height=(ph-2*P-14)+'px';
    flow.style.columnWidth=(pw-2*P)+'px';flow.style.columnGap=(2*P)+'px';
    flow.style.columnCount=spread?2:1;
    flow.style.setProperty('--fs',fs+'px');
    flow.style.setProperty('--imgmax',Math.floor((ph-2*P)*0.55)+'px');
    flow.style.setProperty('--imgfull',Math.floor((ph-2*P)*0.78)+'px');
    pnoL.style.left='0';pnoR.style.left='50%';pnoR.style.display=spread?'':'none';
    pnoL.style.width=spread?'50%':'100%';
    total=Math.max(1,Math.round((flow.scrollWidth+2*P)/pw));
    flow.classList.add('noanim');
    go(keep?Math.round(ratio*total):page);
    flow.offsetWidth;flow.classList.remove('noanim');
  }
  function go(p){
    var step=spread?2:1;
    p=Math.max(0,Math.min(p,total-1));
    if(spread)p-=p%2;
    page=p;
    flow.style.transform='translateX('+(-page*pw)+'px)';
    pnoL.textContent=page>0?page:'';
    pnoR.textContent=(spread&&page+1<total)?page+1:'';
    var last=Math.min(total,page+step);
    pg.textContent=(spread&&last>page+1?(page+1)+'-'+last:(page+1))+' / '+total;
    prog.style.width=(total>1?last/total*100:100)+'%';
  }
  function next(){go(page+(spread?2:1));}
  function prev(){go(page-(spread?2:1));}
  function goEl(el){if(el)go(Math.floor((el.offsetLeft+4)/pw));}
  function setFs(d){fs=Math.max(12,Math.min(30,fs+d));try{localStorage.setItem('ebook-fs',fs);}catch(e){}layout(true);}
  document.getElementById('bPrev').onclick=prev;
  document.getElementById('bNext').onclick=next;
  document.getElementById('zL').onclick=prev;
  document.getElementById('zR').onclick=next;
  document.getElementById('bToc').onclick=function(){goEl(document.getElementById('toc'));};
  document.getElementById('bSm').onclick=function(){setFs(-1);};
  document.getElementById('bLg').onclick=function(){setFs(1);};
  document.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('a[data-go]');
    if(a){e.preventDefault();goEl(document.getElementById(a.getAttribute('data-go')));}
  });
  addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' '){e.preventDefault();next();}
    else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();prev();}
    else if(e.key==='Home')go(0);else if(e.key==='End')go(total-1);
  });
  var sx=null;
  addEventListener('touchstart',function(e){sx=e.touches[0].clientX;},{passive:true});
  addEventListener('touchend',function(e){if(sx===null)return;var dx=e.changedTouches[0].clientX-sx;sx=null;if(Math.abs(dx)>45){dx<0?next():prev();}});
  var rt;addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(function(){layout(true);},120);});
  addEventListener('message',function(e){if(e.data&&e.data.ebookGoto){goEl(document.getElementById(e.data.ebookGoto));}});
  Array.prototype.forEach.call(document.images,function(im){if(!im.complete)im.addEventListener('load',function(){layout(true);});});
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){layout(true);});
  layout(false);
  var start=location.hash.slice(1);if(start)goEl(document.getElementById(start));
})();
</script>

<script>
'use strict';
/* ═══════════════════════════════════════════════════════════════
   e북 공방 — 화면 한 개짜리 무료 전자책 제작 도구
   · 서버·외부 라이브러리 없음. 모든 작업은 이 기기 안에서 처리함.
   · 책은 브라우저 저장소(IndexedDB)에만 보관함.
   · EPUB 압축(zip)도 직접 만듦(무압축 방식).
   ═══════════════════════════════════════════════════════════════ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ─── 아이콘 (선 그림) ─── */
const ICONS = {
  book:'<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  type:'<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>',
  info:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  plus:'<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  arrowLeft:'<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  eye:'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  trash:'<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  copy:'<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  users:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  up:'<polyline points="18 15 12 9 6 15"/>', down:'<polyline points="6 9 12 15 18 9"/>',
  x:'<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  grid:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  droplet:'<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
  smile:'<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
  reset:'<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
  maximize:'<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
  rotate:'<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  pen:'<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  undo:'<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
  redo:'<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>',
  camera:'<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  layers:'<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>'
};
const icon = (n, cls = '') => \`<svg class="ic \${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\${ICONS[n] || ''}</svg>\`;
function paintIcons(root = document) {
  $$('[data-i]', root).forEach(el => { if (el.dataset.iDone) return; el.dataset.iDone = 1; el.insertAdjacentHTML('afterbegin', icon(el.dataset.i)); });
}

/* ─── 기본 설정값 ─── */
const THEMES = {
  sky:    { name:'하늘',  c1:'#4a90d9', c2:'#1f4f86', ink:'#ffffff', accent:'#2a6db0', paper:'#fdfcf8', desk:'#3b4a5c' },
  forest: { name:'숲',    c1:'#4f9a6a', c2:'#22573a', ink:'#ffffff', accent:'#2f7a4d', paper:'#fbfcf7', desk:'#3c4a40' },
  sunset: { name:'노을',  c1:'#f0925a', c2:'#b8452e', ink:'#ffffff', accent:'#c9572f', paper:'#fffaf4', desk:'#5b4236' },
  night:  { name:'밤하늘', c1:'#3a3f7a', c2:'#141633', ink:'#fff3c4', accent:'#4b4fa0', paper:'#fbfaf6', desk:'#26283d' },
  cherry: { name:'벚꽃',  c1:'#f2a9c0', c2:'#c9637f', ink:'#ffffff', accent:'#c2537a', paper:'#fffafb', desk:'#5a3e47' },
  paper:  { name:'한지',  c1:'#f3e7cf', c2:'#d9c39b', ink:'#4a3424', accent:'#8b4513', paper:'#fdf9f0', desk:'#5b4a3c', light:true },
  mint:   { name:'민트',  c1:'#7fd1c3', c2:'#2d8f81', ink:'#ffffff', accent:'#25796d', paper:'#f9fdfc', desk:'#34504b' },
  gold:   { name:'금빛',  c1:'#e7c062', c2:'#a5761f', ink:'#3a2a0c', accent:'#9a6b14', paper:'#fffcf3', desk:'#4d3f25', light:true },
  ink:    { name:'먹색',  c1:'#3b3f46', c2:'#16181c', ink:'#f4efe6', accent:'#33373e', paper:'#fbfaf7', desk:'#2a2c30' },
  berry:  { name:'자두',  c1:'#9b4f96', c2:'#4e2155', ink:'#ffffff', accent:'#7c3a7a', paper:'#fdfafd', desk:'#3e2a40' }
};
const LAYOUTS = { band:'그림 + 띠', full:'그림 가득', frame:'액자', split:'위아래 나눔', minimal:'미니멀', plain:'글자만', paper:'도화지' };
const TOOLS = {
  pencil:{ name:'연필', kind:'free', w:5, a:.9 }, pen:{ name:'펜', kind:'free', w:12, a:1 },
  marker:{ name:'마커', kind:'free', w:40, a:.45 }, eraser:{ name:'지우개', kind:'free', w:44, a:1 },
  fill:{ name:'채우기', kind:'fill' }, line:{ name:'직선', kind:'shape', w:10 }, rect:{ name:'네모', kind:'shape', w:10 },
  ellipse:{ name:'동그라미', kind:'shape', w:10 }, star:{ name:'별', kind:'shape', w:10 }, heart:{ name:'하트', kind:'shape', w:10 }
};
const TOOL_SVG = {
  fill:'<path d="M19 11l-8-8-8.5 8.5a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0L19 11z"/><path d="M20 15s2 2.2 2 3.5a2 2 0 0 1-4 0c0-1.3 2-3.5 2-3.5z"/>',
  line:'<line x1="4" y1="20" x2="20" y2="4"/>', rect:'<rect x="4" y="6" width="16" height="12" rx="1"/>',
  ellipse:'<ellipse cx="12" cy="12" rx="9" ry="7"/>',
  star:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  heart:'<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>'
};
const STUDIO_SIZES = { land:[1200, 900], port:[900, 1200], sq:[1000, 1000] };
const PEN_COLORS = ['#1c1f24','#ffffff','#868e96','#8b4513','#c92a2a','#e8590c','#f59f00','#ffd43b','#2b8a3e','#82c91e','#1c7ed6','#4dabf7','#7048e8','#d6336c','#f783ac','#e9c46a'];
const PHOTO_FRAMES = { none:'그대로', round:'둥근', white:'흰 테두리', polaroid:'폴라로이드', circle:'동그라미' };
const PATTERNS = { none:'없음', dots:'물방울', stripes:'사선', grid:'모눈', waves:'물결', confetti:'색종이', stars:'별' };
const TITLE_FONTS = {
  serif:  { name:'명조',     css:"'Noto Serif KR',serif", w:700 },
  sans:   { name:'고딕',     css:"'Noto Sans KR',sans-serif", w:700 },
  gowun:  { name:'고운바탕', css:"'Gowun Batang',serif", w:700 },
  black:  { name:'검은고딕', css:"'Black Han Sans',sans-serif", w:400 },
  dohyeon:{ name:'도현',     css:"'Do Hyeon',sans-serif", w:400 },
  jua:    { name:'주아',     css:"'Jua',sans-serif", w:400 },
  gaegu:  { name:'개구',     css:"'Gaegu',cursive", w:700 },
  pen:    { name:'손글씨 펜', css:"'Nanum Pen Script',cursive", w:400 }
};
const BODY_FONTS = {
  serif: { name:'명조', css:"'Noto Serif KR','Nanum Myeongjo','Batang',serif" },
  gowun: { name:'고운바탕', css:"'Gowun Batang','Noto Serif KR',serif" },
  sans:  { name:'고딕', css:"'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif" }
};
const BODY_STYLES = {
  classic:{ name:'클래식', desc:'가운데 제목과 꽃무늬 장식. 소설·동화에 어울림.' },
  modern: { name:'모던', desc:'왼쪽 정렬 굵은 제목과 위쪽 굵은 선. 보고서·문집에 어울림.' },
  story:  { name:'동화책', desc:'큰 글자, 넉넉한 줄 간격, 둥근 제목 띠. 저학년 독자용.' },
  essay:  { name:'에세이', desc:'짧은 선 장식과 여백 많은 문단. 수필·일기에 어울림.' }
};
const CH_LAYOUTS = { normal:'보통 글', picture:'그림책', poem:'시' };
const PAGE_SIZES = { a5:['148mm','210mm'], a4:['210mm','297mm'], b6:['128mm','182mm'] };
const EMOJI_FONT = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
const STICKERS = {
  '자연': ['🌳','🌸','🌻','🍀','🌙','⭐','☀️','🌈','❄️','🌊','🔥','🍂'],
  '동물': ['🐿️','🐶','🐱','🐰','🦊','🐻','🐼','🦁','🐧','🦋','🐟','🐞'],
  '사물': ['📚','✏️','🎨','🎈','🎁','⚽','🚀','🏠','🔍','💡','🎵','🧸'],
  '표정·모양': ['😊','😆','🥰','😎','🤔','😮','❤️','💛','💚','💙','✨','💫']
};
const BADGES = [
  { type:'badge', v:'나의 첫 책', color:'#c92a2a' }, { type:'badge', v:'우리 반 추천', color:'#2b8a3e' },
  { type:'badge', v:'글·그림 직접', color:'#3651b8' }, { type:'badge', v:'2026 작품', color:'#9a6b14' },
  { type:'tag', v:'NEW', color:'#e8590c' }, { type:'tag', v:'완결', color:'#1c1f24' },
  { type:'tag', v:'시리즈 1권', color:'#7c3a7a' }, { type:'tag', v:'그림책', color:'#25796d' }
];
const TEXT_COLORS = ['auto', '#ffffff', '#1c1f24', '#fff3c4', '#ffd43b', '#c92a2a', '#2a6db0', '#2f7a4d'];

const TEMPLATES = [
  { id:'blank', name:'빈 책', desc:'장 하나로 시작해 자유롭게 구성함.', theme:'sky', layout:'plain', font:'serif', style:'classic',
    chapters:[{ title:'1장', hint:'여기에 이야기를 씀.' }] },
  { id:'picture', name:'그림책', desc:'장면마다 그림 한 장과 짧은 글.', theme:'sunset', layout:'band', font:'jua', style:'story', chLayout:'picture', pattern:'dots',
    chapters:[1,2,3,4,5,6].map(n => ({ title:'장면 '+n, hint:'이 장면의 그림을 넣고, 한두 문장으로 무슨 일이 일어나는지 씀.' })) },
  { id:'story', name:'동화·소설', desc:'발단-전개-위기-절정-결말 다섯 장.', theme:'night', layout:'frame', font:'gowun', style:'classic',
    chapters:[
      { title:'1장. 발단', hint:'인물과 배경을 소개함. 누가, 언제, 어디에 있는지 보여 줌.' },
      { title:'2장. 전개', hint:'사건이 시작됨. 인물이 원하는 것은 무엇인지 씀.' },
      { title:'3장. 위기', hint:'일이 꼬이기 시작함. 어떤 어려움이 생기는지 씀.' },
      { title:'4장. 절정', hint:'갈등이 가장 커지는 장면. 인물은 어떤 선택을 하는지 씀.' },
      { title:'5장. 결말', hint:'사건이 어떻게 마무리되는지, 인물은 어떻게 달라졌는지 씀.' } ] },
  { id:'poem', name:'시집', desc:'시 한 편이 한 장. 가운데 정렬.', theme:'cherry', layout:'minimal', font:'pen', style:'essay', chLayout:'poem',
    chapters:[1,2,3,4].map(n => ({ title:'시 '+n, hint:'한 줄씩 엔터로 행을 나눔.\\n빈 줄 한 번으로 연을 나눔.' })) },
  { id:'class', name:'학급 문집', desc:'머리말부터 작품, 맺음말까지.', theme:'forest', layout:'split', font:'black', style:'modern', pattern:'confetti',
    chapters:[
      { title:'머리말', hint:'이 문집을 만든 까닭과 담긴 내용을 소개함.' },
      { title:'우리 반을 소개합니다', hint:'우리 반의 자랑, 규칙, 기억에 남는 일을 씀.' },
      { title:'작품 1', hint:'' }, { title:'작품 2', hint:'' }, { title:'작품 3', hint:'' },
      { title:'맺음말', hint:'1년을 돌아보며 하고 싶은 말을 씀.' } ] },
  { id:'report', name:'탐구·체험 보고서', desc:'동기-과정-결과-느낀 점.', theme:'mint', layout:'minimal', font:'sans', style:'modern',
    chapters:[
      { title:'1. 탐구 동기', hint:'왜 이 주제를 골랐는지, 궁금했던 점을 씀.' },
      { title:'2. 탐구 방법과 과정', hint:'준비물, 순서, 한 일을 차례대로 씀. 사진이나 그림을 넣으면 좋음.' },
      { title:'3. 결과', hint:'알게 된 사실을 정리함. 표나 그래프를 그림으로 넣어도 됨.' },
      { title:'4. 느낀 점과 더 알고 싶은 점', hint:'새롭게 알게 된 것과 다음에 해 보고 싶은 것을 씀.' } ] },
  { id:'diary', name:'나의 성장 일기', desc:'한 달에 한 장씩, 1년 기록.', theme:'gold', layout:'frame', font:'gaegu', style:'essay', pattern:'stars',
    chapters:['3월','4월','5월','6월','7월','9월','10월','11월','12월'].map(m => ({ title:m+' 이야기', hint:m+'에 가장 기억에 남는 일과 그때의 마음을 씀.' })) }
];

/* ─── 작은 도구들 ─── */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c === 'x' ? r : (r&3|8)).toString(16); }));
const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const safeName = (s) => (String(s || '').trim() || '나의 e북').replace(/[\\\\/:*?"<>|\\n\\r\\t]/g, '_').slice(0, 60);
const today = () => { const d = new Date(); return \`\${d.getFullYear()}. \${d.getMonth()+1}. \${d.getDate()}.\`; };
const clone = (o) => JSON.parse(JSON.stringify(o));
const nchar = (s) => String(s || '').replace(/\\s/g, '').length;
const fmtN = (n) => n.toLocaleString('ko-KR');
const themeOf = (b) => THEMES[b.theme] || THEMES.sky;
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), ms);
}
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function bookStats(b) {
  return {
    chs: b.chapters.filter(c => c.kind !== 'part').length,
    chars: b.chapters.reduce((s, c) => s + nchar(c.body), 0),
    imgs: b.chapters.filter(c => c.image).length + (b.cover.image ? 1 : 0)
  };
}

/* ─── 저장소 (IndexedDB, 안 되면 localStorage) ─── */
const store = (() => {
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('ebook-gongbang', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  return {
    async get(k) {
      try { const d = await db(); return await new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
      catch (e) { try { return JSON.parse(localStorage.getItem('ebook-' + k)); } catch (e2) { return null; } }
    },
    async set(k, v) {
      try { const d = await db(); await new Promise((res, rej) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
      catch (e) { localStorage.setItem('ebook-' + k, JSON.stringify(v)); }
    }
  };
})();

/* ─── 책 자료 구조 ─── */
const defaultCover = () => ({ layout:'band', pattern:'none', titleFont:'serif', titleSize:1, titleColor:'auto', titleAlign:'auto', titleShadow:false,
  tx:0, ty:0, ax:0, ay:0, image:null, zoom:1, fx:0, fy:0, stickers:[], drawing:{ strokes:[], top:false } });
const newChapter = (o = {}) => Object.assign({ id: uid(), kind: 'chapter', title: '', author: '', body: '', hint: '', image: null, layout: 'normal' }, o);
function newBook(tplId = 'blank') {
  const t = TEMPLATES.find(x => x.id === tplId) || TEMPLATES[0];
  const cover = Object.assign(defaultCover(), { layout: t.layout, titleFont: t.font, pattern: t.pattern || 'none' });
  return {
    v: 2, id: uid(), uuid: uuid(), created: Date.now(), updated: Date.now(),
    title: '', subtitle: '', author: '', publisher: '', genre: '', blurb: '',
    theme: t.theme, font: 'serif', bodyStyle: t.style, cover,
    chapters: t.chapters.map(c => newChapter({ title: c.title, hint: c.hint || '', layout: t.chLayout || 'normal' }))
  };
}
/* 예전 형식(1판) 책 파일도 그대로 읽을 수 있게 맞춤 */
function migrate(b) {
  b = Object.assign({ title:'', subtitle:'', author:'', publisher:'', genre:'', blurb:'', theme:'sky', font:'serif', bodyStyle:'classic' }, b);
  if (!b.id) b.id = uid();
  if (!b.uuid) b.uuid = uuid();
  if (!b.created) b.created = Date.now();
  if (!b.updated) b.updated = Date.now();
  if (!b.cover) b.cover = { layout: ({ band:'band', full:'full', frame:'frame', plain:'plain' })[b.coverStyle] || 'band', image: b.coverImage || null };
  b.cover = Object.assign(defaultCover(), b.cover);
  if (!Array.isArray(b.cover.stickers)) b.cover.stickers = [];
  if (!b.cover.drawing || !Array.isArray(b.cover.drawing.strokes)) b.cover.drawing = { strokes: [], top: false };
  if (!BODY_FONTS[b.font]) b.font = 'serif';
  delete b.coverImage; delete b.coverStyle;
  b.chapters = (Array.isArray(b.chapters) && b.chapters.length ? b.chapters : [{ title: '1장' }]).map(c => newChapter(Object.assign({}, c, { id: c.id || uid() })));
  b.v = 2;
  return b;
}

/* ─── 상태 ─── */
let shelf = { books: [], currentId: null };
let book = null;
let curCh = 0;
let pane = 'write';

let saveTimer = null;
function setSave(state) {
  const el = $('#saveStatus'); el.className = 'save ' + (state === 'ok' ? '' : state);
  $('span', el).textContent = state === 'busy' ? '저장 중…' : state === 'err' ? '저장 실패' : '저장됨';
}
function persist() {
  clearTimeout(saveTimer); setSave('busy');
  saveTimer = setTimeout(async () => {
    try { await store.set('shelf', shelf); setSave('ok'); }
    catch (e) { setSave('err'); toast('기기 저장 공간이 부족함. 내보내기 → 책 파일로 따로 보관할 것.', 5000); }
  }, 450);
}
function touch(opts = {}) {
  if (book) book.updated = Date.now();
  persist();
  if (opts.cover !== false) scheduleThumbs();
  if (opts.preview !== false) schedulePreview();
  updateHeader();
}

/* ═══════════ 본문 서식 → HTML(XHTML 호환) ═══════════ */
function inline(s) {
  return esc(s).replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>').replace(/\\*(.+?)\\*/g, '<em>$1</em>');
}
function formatBody(text) {
  const out = [];
  const blocks = String(text || '').replace(/\\r/g, '').split(/\\n[ \\t]*\\n/);
  for (const b of blocks) {
    let lines = b.split('\\n').map(l => l.replace(/\\s+$/, ''));
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (!lines.length) continue;
    if (lines.length === 1 && /^\\s*(-{3,}|\\*{3,}|✱+)\\s*$/.test(lines[0])) { out.push('<p class="scene">✱ ✱ ✱</p>'); continue; }
    while (lines.length && /^#{1,3}\\s+/.test(lines[0])) out.push('<h3>' + inline(lines.shift().replace(/^#{1,3}\\s+/, '')) + '</h3>');
    if (!lines.length) continue;
    if (lines.every(l => /^>\\s?/.test(l))) out.push('<blockquote><p>' + lines.map(l => inline(l.replace(/^>\\s?/, ''))).join('<br/>') + '</p></blockquote>');
    else out.push('<p>' + lines.map(inline).join('<br/>') + '</p>');
  }
  return out.join('\\n');
}
const chLabel = (c, i) => c.title || (c.kind === 'part' ? '제목 없는 부' : (i + 1) + '장');
/* 장·부 하나를 HTML 조각으로. imgSrc: 그림 주소(미리보기는 data URL, EPUB은 파일 경로) */
function chapterHTML(ch, idx, imgSrc, emptyNote, epub) {
  const body = formatBody(ch.body);
  const et = (t) => epub ? \` epub:type="\${t}"\` : '';
  if (ch.kind === 'part') {
    return \`<section class="part"\${et('part')} id="ch\${idx + 1}">
\${imgSrc ? \`<div class="pt-img"><img src="\${esc(imgSrc)}" alt="\${esc(chLabel(ch, idx))}"/></div>\` : ''}
<h2 class="pt-title">\${esc(chLabel(ch, idx))}</h2>
\${ch.author ? \`<p class="pt-au">\${esc(ch.author)}</p>\` : ''}
\${body ? \`<div class="pt-body">\${body}</div>\` : ''}
</section>\`;
  }
  const img = imgSrc ? \`<div class="fig"><img src="\${esc(imgSrc)}" alt="\${esc(chLabel(ch, idx))} 그림"/></div>\` : '';
  const empty = (!body && !img && emptyNote) ? \`<p class="empty">(아직 내용이 없음)</p>\` : '';
  return \`<section class="chapter lay-\${ch.layout || 'normal'}"\${et('chapter')} id="ch\${idx + 1}">
<h2>\${esc(chLabel(ch, idx))}</h2>
\${ch.author ? \`<p class="byline">\${esc(ch.author)}</p>\` : ''}
\${img}
\${body}\${empty}
</section>\`;
}
function titlePageHTML(b) {
  return \`<section class="titlepage" id="titlepage">
<h1>\${esc(b.title || '제목 없는 책')}</h1>
\${b.subtitle ? \`<p class="subtitle">\${esc(b.subtitle)}</p>\` : ''}
<p class="author">\${esc(b.author || '지은이')}</p>
\${b.publisher ? \`<p class="publisher">\${esc(b.publisher)}</p>\` : ''}
</section>\`;
}
/* 부(part) 아래에 장을 묶은 차례 나무 */
function navTree(b) {
  const out = []; let cur = null;
  b.chapters.forEach((c, i) => {
    const n = { c, i, kids: [] };
    if (c.kind === 'part') { cur = n; out.push(n); } else if (cur) cur.kids.push(n); else out.push(n);
  });
  return out;
}
function tocHTML(b, linkFn) {
  const items = [];
  for (const n of navTree(b)) {
    const lab = (c, i) => esc(chLabel(c, i)) + (c.author ? \`<span class="ta">\${esc(c.author)}</span>\` : '');
    items.push(\`<li class="\${n.c.kind === 'part' ? 'tp' : 'tc'}">\${linkFn(n.i, lab(n.c, n.i))}</li>\`);
    n.kids.forEach(k => items.push(\`<li class="tc sub">\${linkFn(k.i, lab(k.c, k.i))}</li>\`));
  }
  return \`<section class="toc" id="toc">
<h2 class="toc-h">차례</h2>
<ol>
\${items.join('\\n')}
</ol>
</section>\`;
}
function colophonHTML(b) {
  return \`<section class="colophon" id="colophon">
<div class="colo">
<p class="ct">\${esc(b.title || '제목 없는 책')}</p>
\${b.subtitle ? \`<p>\${esc(b.subtitle)}</p>\` : ''}
<p>만든 날 \${esc(today())}</p>
<p>지은이 \${esc(b.author || '-')}</p>
\${b.publisher ? \`<p>펴낸 곳 \${esc(b.publisher)}</p>\` : ''}
<p class="made">e북 공방에서 만듦</p>
</div>
</section>\`;
}
/* 본문 꾸밈(미리보기·EPUB·PDF 공통). CSS 변수 없이 실제 색을 넣어 전자책 앱 호환성을 높임 */
function contentCSS(b, mode) {
  const th = themeOf(b);
  const font = (BODY_FONTS[b.font] || BODY_FONTS.serif).css;
  const reader = mode === 'reader';
  const A = th.accent;
  const imgmax = reader ? 'var(--imgmax,60vh)' : '60vh', imgfull = reader ? 'var(--imgfull,75vh)' : '75vh';
  const base = \`
body{font-family:\${font};line-height:1.85;color:#2b2420;word-break:keep-all;overflow-wrap:break-word}
#flow{font-family:\${font};line-height:1.85;word-break:keep-all;overflow-wrap:break-word}
h1{font-size:1.9em;line-height:1.35;color:\${A};margin:0 0 .5em}
h2{font-size:1.4em;line-height:1.4;color:\${A};margin:\${reader ? '.2em' : '1.2em'} 0 1.1em}
h3{font-size:1.08em;color:\${A};margin:1.2em 0 .5em}
p{margin:0 0 .85em;text-indent:1em;text-align:justify}
p.scene{text-indent:0;text-align:center;color:\${A};letter-spacing:.4em;margin:1.3em 0}
p.byline{text-indent:0;text-align:right;color:#7a6f66;font-size:.92em;margin:-.6em 0 1.4em}
blockquote{margin:1em 0;padding:.5em 1em;border-left:4px solid \${A}66;background:\${A}0d}
blockquote p{text-indent:0;margin:0}
strong{color:\${A}}
.fig{text-align:center;margin:0 0 1em;break-inside:avoid;page-break-inside:avoid}
.fig img{max-width:100%;max-height:\${imgmax};border-radius:4px}
.lay-picture h2{text-align:center}
.lay-picture .fig img{max-height:\${imgfull}}
.lay-picture p{text-indent:0;text-align:center;font-size:1.08em}
.lay-poem h2{text-align:center}
.lay-poem p{text-indent:0;text-align:center;line-height:2;margin-bottom:1.4em}
.empty{color:#b8aca2;text-indent:0;text-align:center;margin-top:2em}
.titlepage{text-align:center;padding-top:28%}
.titlepage h1{text-align:center}
.titlepage .subtitle{text-indent:0;text-align:center;font-size:1.05em;color:#6d625a}
.titlepage .author{text-indent:0;text-align:center;margin-top:3em;font-size:1.1em}
.titlepage .publisher{text-indent:0;text-align:center;margin-top:5em;font-size:.9em;color:#8a7f76}
h2.toc-h{text-align:left}
.toc ol{list-style:none;padding:0;margin:0}
.toc li{padding:.45em 0;border-bottom:1px dotted #d6cdc4}
.toc li.tp{font-weight:bold;color:\${A};border-bottom:1px solid \${A}55;margin-top:.6em}
.toc li.sub{padding-left:1.2em;font-size:.95em}
.toc a{color:inherit;text-decoration:none}
.toc .ta{float:right;color:#8a7f76;font-weight:normal;font-size:.88em;margin-left:1em}
.part{text-align:center;padding-top:10%}
.part .pt-img{margin:0 auto 1.4em;text-align:center}
.part .pt-img img{max-width:70%;max-height:\${imgmax};box-shadow:0 2px 10px rgba(0,0,0,.2)}
h2.pt-title{text-align:center;font-size:1.7em;border:none;background:none;margin:.4em 0 .3em;padding:0}
h2.pt-title::before,h2.pt-title::after{display:none;content:none}
.pt-au{text-indent:0;text-align:center;color:#6d625a}
.pt-body{margin-top:2em;text-align:left;font-size:.95em}
.colophon .colo{margin-top:55%;border-top:1px solid #cfc5bb;padding-top:1em;font-size:.9em}
.colophon p{text-indent:0;margin:0 0 .3em;color:#6d625a}
.colophon .ct{font-weight:bold;color:#2b2420;font-size:1.1em;margin-bottom:.6em}
.colophon .made{margin-top:1em;color:#a0948a;font-size:.85em}
.back{height:100%;display:flex;align-items:center;justify-content:center}
.back img{max-width:100%;max-height:100%}
\`;
  const styles = {
    classic: \`
.chapter h2{text-align:center;font-weight:normal;font-size:1.45em;margin-bottom:1.5em}
.chapter h2::after{content:"❦";display:block;font-size:.62em;color:\${A};margin-top:.5em}
.chapter h2+p,.chapter .fig+p,.chapter .byline+p{text-indent:0}\`,
    modern: \`
.chapter h2{text-align:left;font-weight:bold;font-size:1.55em;border-top:5px solid \${A};padding-top:.55em;margin-bottom:1.2em}
.chapter p{text-indent:0;margin-bottom:1em}
.lay-picture h2,.lay-poem h2{text-align:center}\`,
    story: \`
#flow,body{font-size:1.08em;line-height:2}
.chapter h2{text-align:center;background:\${A}1a;border-radius:2em;padding:.35em 1em;font-size:1.3em}
.chapter p{text-indent:0}\`,
    essay: \`
.chapter h2{text-align:left;font-weight:bold;font-size:1.25em;color:#2b2420;margin-bottom:1.6em}
.chapter h2::before{content:"";display:block;width:2em;height:2px;background:\${A};margin-bottom:.8em}
.chapter p{text-indent:0;margin-bottom:1.15em}
.lay-poem h2,.lay-picture h2{text-align:center}
.lay-poem h2::before,.lay-picture h2::before{margin-left:auto;margin-right:auto}\`
  };
  return base + (styles[b.bodyStyle] || styles.classic);
}

/* ═══════════ 표지 그리기 (캔버스) ═══════════ */
const imgCache = new Map();
function loadImg(src) {
  if (!src) return Promise.resolve(null);
  if (imgCache.has(src)) return imgCache.get(src);
  const p = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  imgCache.set(src, p);
  if (imgCache.size > 80) imgCache.delete(imgCache.keys().next().value);
  return p;
}
const fontReady = new Map();
function ensureFont(f) {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const key = f.w + ' ' + f.css;
  if (!fontReady.has(key)) fontReady.set(key, Promise.race([document.fonts.load(\`\${f.w} 60px \${f.css}\`, '가나다ABC').catch(() => {}), new Promise(r => setTimeout(r, 1800))]));
  return fontReady.get(key);
}
function wrapLines(ctx, text, maxW) {
  const words = String(text).split(/\\s+/).filter(Boolean);
  const lines = []; let cur = '';
  const pushLong = (w) => { let s = ''; for (const ch of w) { if (ctx.measureText(s + ch).width > maxW && s) { lines.push(s); s = ch; } else s += ch; } return s; };
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width <= maxW) cur = t;
    else { if (cur) lines.push(cur); cur = ctx.measureText(w).width > maxW ? pushLong(w) : w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function fitText(ctx, text, maxW, maxLines, size, minSize, weight, family) {
  let lines;
  for (let s = size; s >= minSize; s -= 4) {
    ctx.font = \`\${weight} \${Math.round(s)}px \${family}\`;
    lines = wrapLines(ctx, text, maxW);
    if (lines.length <= maxLines) return { lines, size: s };
  }
  return { lines: lines.slice(0, maxLines), size: minSize };
}
function coverFit(ctx, im, x, y, w, h, cv) {
  const z = (cv && cv.zoom) || 1, fx = (cv && cv.fx) || 0, fy = (cv && cv.fy) || 0;
  const r = Math.max(w / im.width, h / im.height) * z;
  const sw = w / r, sh = h / r;
  ctx.drawImage(im, (im.width - sw) * (0.5 + fx / 2), (im.height - sh) * (0.5 + fy / 2), sw, sh, x, y, w, h);
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function starPath(ctx, x, y, R, r, n) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = Math.PI * i / n - Math.PI / 2, d = i % 2 ? r : R; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * d, y + Math.sin(a) * d); }
  ctx.closePath();
}
function drawPattern(ctx, kind, x, y, w, h, color) {
  if (!kind || kind === 'none') return;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = color; ctx.strokeStyle = color;
  const R = rng(7);
  if (kind === 'dots') { for (let j = 0, yy = y + 28; yy < y + h + 40; yy += 58, j++) for (let xx = x + (j % 2 ? 29 : 0); xx < x + w + 40; xx += 58) { ctx.beginPath(); ctx.arc(xx, yy, 8, 0, 7); ctx.fill(); } }
  else if (kind === 'stripes') { ctx.lineWidth = 20; for (let d = -h; d < w + h; d += 64) { ctx.beginPath(); ctx.moveTo(x + d, y); ctx.lineTo(x + d + h, y + h); ctx.stroke(); } }
  else if (kind === 'grid') { ctx.lineWidth = 3; for (let xx = x; xx < x + w; xx += 70) { ctx.beginPath(); ctx.moveTo(xx, y); ctx.lineTo(xx, y + h); ctx.stroke(); } for (let yy = y; yy < y + h; yy += 70) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); } }
  else if (kind === 'waves') { ctx.lineWidth = 8; for (let yy = y + 30; yy < y + h + 40; yy += 76) { ctx.beginPath(); for (let xx = x - 10; xx <= x + w + 10; xx += 10) ctx.lineTo(xx, yy + Math.sin(xx / 46) * 16); ctx.stroke(); } }
  else if (kind === 'confetti') { for (let i = 0; i < 120; i++) { const cx = x + R() * w, cy = y + R() * h, s = 10 + R() * 18; ctx.save(); ctx.translate(cx, cy); ctx.rotate(R() * 6.3); if (i % 3) ctx.fillRect(-s / 2, -s / 5, s, s / 2.5); else { ctx.beginPath(); ctx.arc(0, 0, s / 2.6, 0, 7); ctx.fill(); } ctx.restore(); } }
  else if (kind === 'stars') { for (let i = 0; i < 70; i++) { const s = 6 + R() * 18; starPath(ctx, x + R() * w, y + R() * h, s, s * .42, 4 + (i % 2)); ctx.fill(); } }
  ctx.restore();
}
function stickerFont(s) { return s.type === 'tag' ? \`700 \${Math.round(s.s * 0.32)}px 'Noto Sans KR',sans-serif\` : \`\${Math.round(s.s)}px \${EMOJI_FONT}\`; }
/* 사진 스티커의 바깥 크기와 안쪽 사진 칸 */
function photoGeom(s) {
  const a = s.a || 0.75, f = s.frame || 'none';
  if (f === 'circle') return { W: s.s, H: s.s };
  if (f === 'polaroid') { const p = s.s * 0.05, iw = s.s - 2 * p, ih = iw * a; return { W: s.s, H: p + ih + s.s * 0.2, p, iw, ih }; }
  if (f === 'white') { const p = s.s * 0.035, iw = s.s - 2 * p, ih = iw * a; return { W: s.s, H: ih + 2 * p, p, iw, ih }; }
  return { W: s.s, H: s.s * a };
}
function stickerBox(ctx, s) {
  if (s.type === 'photo') { const g = photoGeom(s); return { x: s.x - g.W / 2, y: s.y - g.H / 2, w: g.W, h: g.H }; }
  if (s.type === 'tag') { ctx.font = stickerFont(s); const w = ctx.measureText(s.v).width + s.s * 0.5, h = s.s * 0.62; return { x: s.x - w / 2, y: s.y - h / 2, w, h }; }
  return { x: s.x - s.s / 2, y: s.y - s.s / 2, w: s.s, h: s.s };
}
function drawSticker(ctx, s, im) {
  ctx.save(); ctx.translate(s.x, s.y); ctx.rotate((s.r || 0) * Math.PI / 180);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (s.type === 'emoji') { ctx.font = stickerFont(s); ctx.fillText(s.v, 0, s.s * 0.06); }
  else if (s.type === 'photo') {
    const g = photoGeom(s), f = s.frame || 'none', x0 = -g.W / 2, y0 = -g.H / 2;
    ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 7;
    if (f === 'circle') {
      const r = s.s / 2; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r * 0.93, 0, 7); ctx.clip();
      if (im) coverFit(ctx, im, -r, -r, 2 * r, 2 * r); ctx.restore();
    } else if (f === 'polaroid' || f === 'white') {
      ctx.fillStyle = '#fff'; ctx.fillRect(x0, y0, g.W, g.H); ctx.shadowColor = 'transparent';
      if (im) ctx.drawImage(im, x0 + g.p, y0 + g.p, g.iw, g.ih);
    } else if (f === 'round') {
      ctx.fillStyle = '#fff'; roundRect(ctx, x0, y0, g.W, g.H, g.W * 0.08); ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.save(); roundRect(ctx, x0, y0, g.W, g.H, g.W * 0.08); ctx.clip(); if (im) ctx.drawImage(im, x0, y0, g.W, g.H); ctx.restore();
    } else if (im) { ctx.shadowBlur = 12; ctx.shadowOffsetY = 4; ctx.drawImage(im, x0, y0, g.W, g.H); }
    ctx.shadowColor = 'transparent';
  }
  else if (s.type === 'badge') {
    const R = s.s / 2;
    ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
    ctx.fillStyle = s.color; starPath(ctx, 0, 0, R, R * 0.9, 22); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(2, s.s * 0.018); ctx.setLineDash([s.s * .03, s.s * .025]);
    ctx.beginPath(); ctx.arc(0, 0, R * 0.74, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    let fs = s.s * 0.2; ctx.font = \`700 \${Math.round(fs)}px 'Noto Sans KR',sans-serif\`;
    let lines = wrapLines(ctx, s.v, R * 1.25);
    if (lines.length > 2) { fs *= 0.8; ctx.font = \`700 \${Math.round(fs)}px 'Noto Sans KR',sans-serif\`; lines = wrapLines(ctx, s.v, R * 1.3).slice(0, 3); }
    const lh = fs * 1.15;
    lines.forEach((l, i) => ctx.fillText(l, 0, (i - (lines.length - 1) / 2) * lh));
  } else if (s.type === 'tag') {
    ctx.font = stickerFont(s);
    const w = ctx.measureText(s.v).width + s.s * 0.5, h = s.s * 0.62;
    ctx.shadowColor = 'rgba(0,0,0,.22)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    ctx.fillStyle = s.color; roundRect(ctx, -w / 2, -h / 2, w, h, h * 0.22); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.fillStyle = '#fff'; ctx.fillText(s.v, 0, h * 0.04);
  }
  ctx.restore();
}

/* 표지 한 장 그리기. opt.edit: 고르기 표시, opt.layout: 레이아웃 미리보기용 */
async function drawCover(b, canvas, opt = {}) {
  const W = 1000, H = 1414;
  canvas = canvas || document.createElement('canvas');
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext('2d');
  const cv = b.cover, th = themeOf(b);
  const tf = TITLE_FONTS[cv.titleFont] || TITLE_FONTS.serif;
  await ensureFont(tf);
  const im = await loadImg(cv.image);
  const photoIms = new Map();
  for (const s of cv.stickers) if (s.type === 'photo') photoIms.set(s.id, await loadImg(s.v));
  const dr = cv.drawing || { strokes: [], top: false };
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
  ctx.shadowColor = 'transparent';
  let lay = opt.layout || cv.layout;
  if (lay === 'full' && !im) lay = 'plain';
  const patColor = th.light ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.15)';
  const grad = (x, y, w, h) => { const g = ctx.createLinearGradient(x, y, x + w * .4, y + h); g.addColorStop(0, th.c1); g.addColorStop(1, th.c2); ctx.fillStyle = g; ctx.fillRect(x, y, w, h); };
  const pic = (x, y, w, h, r) => { ctx.save(); roundRect(ctx, x, y, w, h, r || 0.01); ctx.clip(); coverFit(ctx, im, x, y, w, h, cv); ctx.restore(); };
  const placeholder = (x, y, w, h, r) => { ctx.save(); ctx.globalAlpha = th.light ? .08 : .14; ctx.fillStyle = th.light ? '#000' : '#fff'; roundRect(ctx, x, y, w, h, r); ctx.fill(); ctx.restore(); };
  let T, A;
  switch (lay) {
    case 'full': {
      pic(0, 0, W, H);
      const sh = ctx.createLinearGradient(0, H * 0.42, 0, H); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.8)');
      ctx.fillStyle = sh; ctx.fillRect(0, 0, W, H);
      T = { x: W / 2, y: H - 500, align: 'center', maxW: W - 160, size: 104, lines: 3, color: '#ffffff', shadow: true };
      A = { x: W / 2, y: H - 130, align: 'center', color: '#ffffff', shadow: true };
      break;
    }
    case 'frame': {
      ctx.fillStyle = th.paper; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = th.accent; ctx.lineWidth = 10; ctx.strokeRect(50, 50, W - 100, H - 100);
      ctx.lineWidth = 3; ctx.strokeRect(74, 74, W - 148, H - 148);
      if (im) pic(170, 620, W - 340, 500, 24);
      else { ctx.save(); ctx.globalAlpha = .28; ctx.fillStyle = th.c1; ctx.beginPath(); ctx.arc(W / 2, 870, 210, 0, 7); ctx.fill(); ctx.globalAlpha = .5; ctx.fillStyle = th.c2; ctx.beginPath(); ctx.arc(W / 2 + 120, 790, 70, 0, 7); ctx.fill(); ctx.restore(); }
      T = { x: W / 2, y: 190, align: 'center', maxW: W - 280, size: 92, lines: 3, color: th.accent };
      A = { x: W / 2, y: 1190, align: 'center', color: '#4a3c32' };
      break;
    }
    case 'split': {
      if (im) pic(0, 0, W, 820); else { grad(0, 0, W, 820); drawPattern(ctx, cv.pattern, 0, 0, W, 820, patColor); }
      ctx.fillStyle = th.paper; ctx.fillRect(0, 820, W, H - 820);
      ctx.fillStyle = th.accent; ctx.fillRect(0, 820, W, 14);
      T = { x: 90, y: 900, align: 'left', maxW: W - 180, size: 88, lines: 2, color: th.accent };
      A = { x: 90, y: H - 150, align: 'left', color: '#40444c' };
      break;
    }
    case 'minimal': {
      ctx.fillStyle = th.paper; ctx.fillRect(0, 0, W, H);
      drawPattern(ctx, cv.pattern, 0, 0, W, H, 'rgba(0,0,0,.05)');
      ctx.fillStyle = th.accent; ctx.fillRect(90, 110, 120, 10);
      if (im) pic(90, 780, W - 180, 420, 8);
      else { ctx.save(); ctx.globalAlpha = .9; ctx.fillStyle = th.c1; ctx.beginPath(); ctx.arc(W - 230, H - 380, 230, 0, 7); ctx.fill(); ctx.fillStyle = th.c2; ctx.beginPath(); ctx.arc(W - 420, H - 250, 90, 0, 7); ctx.fill(); ctx.restore(); }
      T = { x: 90, y: 170, align: 'left', maxW: W - 180, size: 120, lines: 4, color: '#1c1f24' };
      A = { x: 90, y: H - 130, align: 'left', color: '#40444c' };
      break;
    }
    case 'plain': {
      grad(0, 0, W, H); drawPattern(ctx, cv.pattern, 0, 0, W, H, patColor);
      T = { x: W / 2, y: 430, align: 'center', maxW: W - 200, size: 120, lines: 4, color: th.ink, rule: true };
      A = { x: W / 2, y: H - 230, align: 'center', color: th.ink };
      break;
    }
    case 'paper': {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
      if (im) pic(0, 0, W, H);
      drawPattern(ctx, cv.pattern, 0, 0, W, H, 'rgba(0,0,0,.05)');
      T = { x: W / 2, y: 110, align: 'center', maxW: W - 200, size: 96, lines: 2, color: th.accent };
      A = { x: W / 2, y: H - 120, align: 'center', color: '#40444c' };
      break;
    }
    default: { // band
      grad(0, 0, W, H); drawPattern(ctx, cv.pattern, 0, 0, W, H, patColor);
      if (im) pic(60, 60, W - 120, 820, 18); else placeholder(60, 60, W - 120, 820, 18);
      T = { x: W / 2, y: 950, align: 'center', maxW: W - 160, size: 96, lines: 2, color: th.ink };
      A = { x: W / 2, y: H - 120, align: 'center', color: th.ink };
    }
  }
  if (!dr.top) renderDrawing(ctx, dr, opt.live, W, H);
  // 사용자 설정 덮어쓰기
  const al = cv.titleAlign;
  if (al && al !== 'auto') {
    const ax = al === 'left' ? 90 : al === 'right' ? W - 90 : W / 2;
    T.x = ax; T.align = al; A.x = ax; A.align = al;
  }
  if (cv.titleColor && cv.titleColor !== 'auto') { T.color = cv.titleColor; A.color = cv.titleColor; }
  if (cv.titleShadow) { T.shadow = true; A.shadow = true; }
  const shadowOn = (on) => { ctx.shadowColor = on ? 'rgba(0,0,0,.55)' : 'transparent'; ctx.shadowBlur = on ? 14 : 0; ctx.shadowOffsetY = on ? 2 : 0; };
  const boxOf = (x, align, w) => align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  const subFam = (cv.titleFont === 'serif' || cv.titleFont === 'gowun') ? "'Noto Serif KR',serif" : "'Noto Sans KR',sans-serif";

  // 제목 묶음(제목+부제)
  const k = cv.titleSize || 1;
  const tx = T.x + (cv.tx || 0), ty = T.y + (cv.ty || 0);
  ctx.textAlign = T.align; ctx.textBaseline = 'top';
  const fit = fitText(ctx, b.title || '제목 없는 책', T.maxW, T.lines, T.size * k, T.size * k * 0.45, tf.w, tf.css);
  const lh = fit.size * 1.2;
  ctx.font = \`\${tf.w} \${Math.round(fit.size)}px \${tf.css}\`;
  let bw = Math.max(...fit.lines.map(l => ctx.measureText(l).width)), bh = fit.lines.length * lh;
  shadowOn(T.shadow); ctx.fillStyle = T.color;
  fit.lines.forEach((l, i) => ctx.fillText(l, tx, ty + i * lh));
  if (T.rule) { ctx.fillRect(boxOf(tx, T.align, 120), ty + bh + 18, 120, 6); bh += 40; }
  if (b.subtitle) {
    ctx.font = \`400 \${Math.round(40 * Math.sqrt(k))}px \${subFam}\`;
    const sl = wrapLines(ctx, b.subtitle, T.maxW)[0] || '';
    ctx.globalAlpha = .9; ctx.fillText(sl, tx, ty + bh + 20); ctx.globalAlpha = 1;
    bw = Math.max(bw, ctx.measureText(sl).width); bh += 20 + 50 * Math.sqrt(k);
  }
  const titleBox = { x: boxOf(tx, T.align, bw), y: ty, w: bw, h: bh };

  // 지은이 묶음(지은이+펴낸 곳)
  const ax = A.x + (cv.ax || 0), ay = A.y + (cv.ay || 0);
  ctx.textAlign = A.align; shadowOn(A.shadow); ctx.fillStyle = A.color;
  ctx.font = \`500 42px \${subFam}\`;
  const at = b.author ? b.author + ' 지음' : '';
  let aw = at ? ctx.measureText(at).width : 0, ah = at ? 50 : 0;
  if (at) ctx.fillText(at, ax, ay);
  if (b.publisher) { ctx.font = \`400 28px \${subFam}\`; ctx.globalAlpha = .8; ctx.fillText(b.publisher, ax, ay + ah + 10); ctx.globalAlpha = 1; aw = Math.max(aw, ctx.measureText(b.publisher).width); ah += 46; }
  const authorBox = ah ? { x: boxOf(ax, A.align, aw), y: ay, w: aw, h: ah } : null;
  shadowOn(false);

  // 스티커
  for (const s of cv.stickers) drawSticker(ctx, s, photoIms.get(s.id));
  if (dr.top) renderDrawing(ctx, dr, opt.live, W, H);
  // 책등 그림자
  const sp = ctx.createLinearGradient(0, 0, 36, 0); sp.addColorStop(0, 'rgba(0,0,0,.22)'); sp.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sp; ctx.fillRect(0, 0, 36, H);

  const hits = { title: titleBox, author: authorBox, stickers: cv.stickers.map(s => ({ id: s.id, box: stickerBox(ctx, s) })) };
  if (opt.edit && opt.sel) {
    const bx = opt.sel.type === 'sticker' ? (hits.stickers.find(h => h.id === opt.sel.id) || {}).box : hits[opt.sel.type];
    if (bx) {
      const s = opt.sel.type === 'sticker' ? cv.stickers.find(x => x.id === opt.sel.id) : null;
      ctx.save();
      if (s) { ctx.translate(s.x, s.y); ctx.rotate((s.r || 0) * Math.PI / 180); ctx.translate(-s.x, -s.y); }
      ctx.strokeStyle = '#3651b8'; ctx.lineWidth = 4; ctx.setLineDash([14, 10]);
      ctx.strokeRect(bx.x - 14, bx.y - 14, bx.w + 28, bx.h + 28);
      ctx.setLineDash([]); ctx.fillStyle = '#fff';
      [[bx.x - 14, bx.y - 14], [bx.x + bx.w + 14, bx.y - 14], [bx.x - 14, bx.y + bx.h + 14], [bx.x + bx.w + 14, bx.y + bx.h + 14]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill(); ctx.stroke(); });
      ctx.restore();
    }
  }
  canvas._hits = hits;
  return canvas;
}
/* ═══ 그리기 엔진 (표지·그림판 공용) ═══
   획 종류: 자유선(연필·펜·마커·지우개) / 도형(shape) / 채우기(fill)
   지우개가 배경을 지우지 않도록 그림은 따로 된 층에 그린 뒤 얹음 */
const drawLayer = document.createElement('canvas');
const layerCache = [];
function freePath(x, p) {
  const n = p.length / 2;
  x.beginPath();
  if (n === 1) { x.arc(p[0], p[1], x.lineWidth / 2, 0, 7); return true; }
  x.moveTo(p[0], p[1]);
  for (let i = 1; i < n - 1; i++) x.quadraticCurveTo(p[2 * i], p[2 * i + 1], (p[2 * i] + p[2 * i + 2]) / 2, (p[2 * i + 1] + p[2 * i + 3]) / 2);
  x.lineTo(p[2 * n - 2], p[2 * n - 1]);
  return false;
}
function shapePath(x, s) {
  const [x1, y1, x2, y2] = s.a, cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  const rx = Math.max(1, Math.abs(x2 - x1) / 2), ry = Math.max(1, Math.abs(y2 - y1) / 2);
  x.beginPath();
  if (s.k === 'line') { x.moveTo(x1, y1); x.lineTo(x2, y2); return; }
  if (s.k === 'rect') { x.rect(Math.min(x1, x2), Math.min(y1, y2), rx * 2, ry * 2); return; }
  if (s.k === 'ellipse') { x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); return; }
  x.save(); x.translate(cx, cy); x.scale(rx, ry);
  if (s.k === 'star') { x.translate(0, 0.1); starPath(x, 0, 0, 1.05, 0.45, 5); }
  else { // heart
    x.moveTo(0, 1); x.bezierCurveTo(-0.15, 0.82, -1, 0.3, -1, -0.3); x.bezierCurveTo(-1, -0.85, -0.35, -1.05, 0, -0.55);
    x.bezierCurveTo(0.35, -1.05, 1, -0.85, 1, -0.3); x.bezierCurveTo(1, 0.3, 0.15, 0.82, 0, 1); x.closePath();
  }
  x.restore();
}
/* 채우기 통: 그린 선으로 둘러싸인 곳을 칠함(그림 층 기준) */
function floodFill(x, sx, sy, hex, W, H) {
  sx = Math.round(sx); sy = Math.round(sy);
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return;
  const img = x.getImageData(0, 0, W, H), d = img.data;
  const n = parseInt(hex.slice(1), 16), R = n >> 16 & 255, G = n >> 8 & 255, B = n & 255;
  const i0 = (sy * W + sx) * 4, tr = d[i0], tg = d[i0 + 1], tb = d[i0 + 2], ta = d[i0 + 3];
  if (ta > 250 && Math.abs(tr - R) + Math.abs(tg - G) + Math.abs(tb - B) < 6) return;
  const clear = ta < 128;
  const ok = (q) => { const i = q * 4, a = d[i + 3]; return clear ? a < 128 : (a >= 128 && Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb) < 100); };
  const mark = new Uint8Array(W * H), stack = [sy * W + sx];
  while (stack.length) {
    const q = stack.pop(); if (mark[q] || !ok(q)) continue;
    const y = (q / W) | 0, row = y * W; let l = q, r = q;
    while (l > row && !mark[l - 1] && ok(l - 1)) l--;
    while (r < row + W - 1 && !mark[r + 1] && ok(r + 1)) r++;
    for (let k = l; k <= r; k++) {
      mark[k] = 1;
      if (y > 0 && !mark[k - W] && ok(k - W)) stack.push(k - W);
      if (y < H - 1 && !mark[k + W] && ok(k + W)) stack.push(k + W);
    }
  }
  for (let q = 0; q < W * H; q++) if (mark[q] === 1) { const i = q * 4; d[i] = R; d[i + 1] = G; d[i + 2] = B; d[i + 3] = 255; }
  // 선 가장자리(반투명 테두리)와 칠 사이 빈틈을 메움
  for (let q = 0; q < W * H; q++) {
    if (mark[q] !== 1) continue;
    for (const v of [q - 1, q + 1, q - W, q + W]) {
      if (v < 0 || v >= W * H || mark[v]) continue;
      const i = v * 4, a = d[i + 3] / 255; if (a >= 1) continue;
      d[i] = d[i] * a + R * (1 - a); d[i + 1] = d[i + 1] * a + G * (1 - a); d[i + 2] = d[i + 2] * a + B * (1 - a); d[i + 3] = 255; mark[v] = 2;
    }
  }
  x.putImageData(img, 0, 0);
}
function drawStroke(x, s, W, H) {
  if (s.t === 'fill') return floodFill(x, s.x, s.y, s.c, W, H);
  x.save(); x.lineCap = 'round'; x.lineJoin = 'round';
  x.globalCompositeOperation = s.t === 'eraser' ? 'destination-out' : 'source-over';
  x.globalAlpha = s.t === 'shape' ? 1 : (TOOLS[s.t] || TOOLS.pen).a;
  x.strokeStyle = x.fillStyle = s.c; x.lineWidth = s.w;
  if (s.t === 'shape') { shapePath(x, s); if (s.f && s.k !== 'line') x.fill(); x.stroke(); }
  else if (s.p && s.p.length) { if (freePath(x, s.p)) x.fill(); else x.stroke(); }
  x.restore();
}
/* 다 그린 획은 한 번만 그려 두고(캐시) 다시 씀 — 채우기가 많아도 빠르게 */
function committedLayer(dr, W, H) {
  const arr = dr.strokes, n = arr.length, last = arr[n - 1];
  let e = layerCache.find(c => c.dr === dr);
  if (e && e.arr === arr && e.n === n && e.last === last && e.W === W && e.H === H) return e.cv;
  if (!e) { e = { dr, cv: document.createElement('canvas') }; layerCache.unshift(e); if (layerCache.length > 3) layerCache.pop(); }
  e.cv.width = W; e.cv.height = H;
  const x = e.cv.getContext('2d', { willReadFrequently: true });
  for (const st of arr) drawStroke(x, st, W, H);
  Object.assign(e, { arr, n, last, W, H });
  return e.cv;
}
function renderDrawing(ctx, dr, live, W = 1000, H = 1414) {
  if (!dr || (!dr.strokes.length && !live)) return;
  const L = committedLayer(dr, W, H);
  if (!live) { ctx.drawImage(L, 0, 0); return; }
  drawLayer.width = W; drawLayer.height = H;
  const x = drawLayer.getContext('2d'); x.drawImage(L, 0, 0); drawStroke(x, live, W, H);
  ctx.drawImage(drawLayer, 0, 0);
}
/* 뒤표지: 책 소개 */
async function drawBackCover(b) {
  const W = 1000, H = 1414, c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'), th = themeOf(b), cv = b.cover;
  const tf = TITLE_FONTS[cv.titleFont] || TITLE_FONTS.serif;
  await ensureFont(tf);
  const g = ctx.createLinearGradient(0, 0, W * .4, H); g.addColorStop(0, th.c1); g.addColorStop(1, th.c2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  drawPattern(ctx, cv.pattern, 0, 0, W, H, th.light ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.15)');
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = th.ink;
  const ft = fitText(ctx, b.title || '제목 없는 책', W - 240, 2, 60, 36, tf.w, tf.css);
  ft.lines.forEach((l, i) => ctx.fillText(l, W / 2, 170 + i * ft.size * 1.2));
  ctx.fillStyle = 'rgba(255,255,255,.94)'; roundRect(ctx, 110, 330, W - 220, 760, 18); ctx.fill();
  ctx.fillStyle = '#2b2420'; ctx.textAlign = 'left';
  const blurb = (b.blurb || '').trim() || \`\${b.author || '지은이'}이(가) 쓴 책임.\`;
  let fs = 38, lines;
  for (; fs >= 26; fs -= 2) { ctx.font = \`400 \${fs}px 'Noto Serif KR',serif\`; lines = blurb.split('\\n').flatMap(p => wrapLines(ctx, p, W - 360)); if (lines.length * fs * 1.7 <= 640) break; }
  ctx.font = \`400 \${fs}px 'Noto Serif KR',serif\`;
  lines.slice(0, Math.floor(640 / (fs * 1.7))).forEach((l, i) => ctx.fillText(l, 180, 400 + i * fs * 1.7));
  ctx.fillStyle = th.ink; ctx.textAlign = 'center'; ctx.font = \`500 34px 'Noto Sans KR',sans-serif\`;
  ctx.fillText([b.author && b.author + ' 지음', b.publisher].filter(Boolean).join(' · '), W / 2, 1170);
  ctx.globalAlpha = .7; ctx.font = \`400 24px 'Noto Sans KR',sans-serif\`; ctx.fillText('e북 공방에서 만듦', W / 2, H - 110); ctx.globalAlpha = 1;
  return c;
}
async function coverJPEG(b, w = 1000, q = 0.9) {
  const c = await drawCover(b);
  if (w >= 1000) return c.toDataURL('image/jpeg', q);
  const s = document.createElement('canvas'); s.width = w; s.height = Math.round(w * 1.414);
  s.getContext('2d').drawImage(c, 0, 0, s.width, s.height);
  return s.toDataURL('image/jpeg', q);
}
/* 큰 표지 캔버스를 작은 캔버스에 옮겨 그림 */
function blit(src, dst) { const x = dst.getContext('2d'); x.clearRect(0, 0, dst.width, dst.height); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, dst.width, dst.height); }
const offCover = document.createElement('canvas');
let thumbTimer = null;
function scheduleThumbs() {
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(async () => {
    if (!book) return;
    await drawCover(book, offCover);
    blit(offCover, $('#sideThumb'));
    if (pane === 'cover') { drawStage(); if ($('#cd-layout').classList.contains('on')) drawLayoutThumbs(); }
  }, 120);
}

/* ═══════════ 웹 책(읽기 화면) HTML 만들기 ═══════════ */
async function buildReaderHTML(b, preview) {
  const th = themeOf(b);
  const cover = await coverJPEG(b, preview ? 700 : 1000, preview ? 0.82 : 0.9);
  const back = preview ? null : (await drawBackCover(b)).toDataURL('image/jpeg', 0.88);
  const css = $('#readerCSS').textContent
    .replace('__DESK__', th.desk).replace('__PAPER__', th.paper).replace('__ACCENT__', th.accent) + contentCSS(b, 'reader');
  const sections = [
    \`<section class="cover" id="cover"><img src="\${cover}" alt="표지"/></section>\`,
    titlePageHTML(b),
    tocHTML(b, (i, t) => \`<a href="#ch\${i + 1}" data-go="ch\${i + 1}">\${t}</a>\`),
    ...b.chapters.map((c, i) => chapterHTML(c, i, c.image, preview)),
    colophonHTML(b),
    back ? \`<section class="back" id="back"><img src="\${back}" alt="뒤표지"/></section>\` : ''
  ].join('\\n');
  return \`<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>\${esc(b.title || '나의 e북')}</title>
<link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Noto+Sans+KR:wght@400;700&family=Noto+Serif+KR:wght@400;700&display=swap" rel="stylesheet">
<style>\${css}</style></head>
<body>
<div id="stage"><div id="viewport"><div id="flow">
\${sections}
</div><div class="pno" id="pnoL"></div><div class="pno" id="pnoR"></div>
<div class="zone l" id="zL" title="앞쪽"></div><div class="zone r" id="zR" title="뒤쪽"></div></div></div>
<div id="prog"></div>
<div id="bar"><button id="bPrev" title="앞쪽">◀</button><button id="bToc">☰ 차례</button><span class="pg" id="pg"></span><button id="bSm" title="글자 작게">가-</button><button id="bLg" title="글자 크게">가+</button><button id="bNext" title="뒤쪽">▶</button></div>
<script>\${$('#readerJS').textContent}<\\/script>
</body></html>\`;
}
let previewTimer = null, previewSeq = 0;
function schedulePreview(delay = 700) { clearTimeout(previewTimer); previewTimer = setTimeout(refreshPreview, delay); }
async function refreshPreview() {
  if (!book || document.body.dataset.view !== 'editor') return;
  const seq = ++previewSeq;
  const html = await buildReaderHTML(book, true);
  if (seq !== previewSeq) return;
  const fr = $('#pvFrame');
  fr.onload = () => { const t = previewTarget(); if (t) fr.contentWindow.postMessage({ ebookGoto: t }, '*'); };
  fr.srcdoc = html;
}
function previewTarget() { return pane === 'write' ? 'ch' + (curCh + 1) : pane === 'info' ? 'titlepage' : pane === 'style' ? 'ch' + (curCh + 1) : 'cover'; }
function pvGoto() { const fr = $('#pvFrame'); if (fr.contentWindow) fr.contentWindow.postMessage({ ebookGoto: previewTarget() }, '*'); }

/* ═══════════ ZIP (무압축) — EPUB 용 ═══════════ */
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files) {
  const enc = new TextEncoder();
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const parts = [], central = []; let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((s, a) => s + a.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/epub+zip' });
}
function dataURLtoBytes(url) {
  const bin = atob(url.split(',')[1]); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function imgExt(url) { return /^data:image\\/png/.test(url) ? ['png', 'image/png'] : ['jpg', 'image/jpeg']; }

/* ═══════════ EPUB 3 만들기 ═══════════ */
async function buildEPUB(b) {
  const title = b.title || '제목 없는 책';
  const xhtml = (t, body) => \`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="ko" xml:lang="ko">
<head><meta charset="UTF-8"/><title>\${esc(t)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
\${body}
</body>
</html>\`;
  const files = [{ name: 'mimetype', data: 'application/epub+zip' }];
  files.push({ name: 'META-INF/container.xml', data: \`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>\` });
  const manifest = [], spine = [];
  const add = (id, href, type, props) => manifest.push(\`<item id="\${id}" href="\${href}" media-type="\${type}"\${props ? \` properties="\${props}"\` : ''}/>\`);

  files.push({ name: 'OEBPS/images/cover.jpg', data: dataURLtoBytes(await coverJPEG(b, 1000, 0.9)) });
  add('cover-image', 'images/cover.jpg', 'image/jpeg', 'cover-image');
  files.push({ name: 'OEBPS/cover.xhtml', data: xhtml(title, \`<section epub:type="cover" class="coverpage"><img src="images/cover.jpg" alt="표지"/></section>\`) });
  add('cover', 'cover.xhtml', 'application/xhtml+xml'); spine.push('<itemref idref="cover" linear="yes"/>');

  files.push({ name: 'OEBPS/style.css', data: contentCSS(b, 'epub') + \`
.coverpage{text-align:center;margin:0;padding:0;height:100%}
.coverpage img{max-width:100%;max-height:100%}
section{page-break-before:always}\` });
  add('css', 'style.css', 'text/css');

  files.push({ name: 'OEBPS/title.xhtml', data: xhtml(title, titlePageHTML(b)) });
  add('titlepage', 'title.xhtml', 'application/xhtml+xml'); spine.push('<itemref idref="titlepage"/>');

  const tree = navTree(b);
  const label = (c, i) => esc(chLabel(c, i)) + (c.author ? \` — \${esc(c.author)}\` : '');
  const navOl = (nodes) => \`<ol>\\n\${nodes.map(n => \`<li><a href="ch\${n.i + 1}.xhtml">\${label(n.c, n.i)}</a>\${n.kids.length ? navOl(n.kids) : ''}</li>\`).join('\\n')}\\n</ol>\`;
  files.push({ name: 'OEBPS/nav.xhtml', data: xhtml('차례', \`<nav epub:type="toc" id="toc" class="toc"><h2 class="toc-h">차례</h2>\\n\${navOl(tree)}\\n</nav>\`) });
  add('nav', 'nav.xhtml', 'application/xhtml+xml', 'nav'); spine.push('<itemref idref="nav"/>');

  b.chapters.forEach((c, i) => {
    let src = null;
    if (c.image) {
      const [ext, mime] = imgExt(c.image);
      src = \`images/ch\${i + 1}.\${ext}\`;
      files.push({ name: 'OEBPS/' + src, data: dataURLtoBytes(c.image) });
      add(\`img\${i + 1}\`, src, mime);
    }
    files.push({ name: \`OEBPS/ch\${i + 1}.xhtml\`, data: xhtml(chLabel(c, i), chapterHTML(c, i, src, false, true)) });
    add(\`ch\${i + 1}\`, \`ch\${i + 1}.xhtml\`, 'application/xhtml+xml'); spine.push(\`<itemref idref="ch\${i + 1}"/>\`);
  });

  files.push({ name: 'OEBPS/colophon.xhtml', data: xhtml('판권', colophonHTML(b)) });
  add('colophon', 'colophon.xhtml', 'application/xhtml+xml'); spine.push('<itemref idref="colophon"/>');

  // 옛 전자책 앱용 차례(toc.ncx)
  let order = 0;
  const ncxPts = (nodes) => nodes.map(n => \`<navPoint id="np\${n.i + 1}" playOrder="\${++order}"><navLabel><text>\${label(n.c, n.i)}</text></navLabel><content src="ch\${n.i + 1}.xhtml"/>\${n.kids.length ? '\\n' + ncxPts(n.kids) : ''}</navPoint>\`).join('\\n');
  const depth = tree.some(n => n.kids.length) ? 2 : 1;
  files.push({ name: 'OEBPS/toc.ncx', data: \`<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="ko">
<head><meta name="dtb:uid" content="urn:uuid:\${b.uuid}"/><meta name="dtb:depth" content="\${depth}"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>\${esc(title)}</text></docTitle>
<navMap>
\${ncxPts(tree)}
</navMap>
</ncx>\` });
  add('ncx', 'toc.ncx', 'application/x-dtbncx+xml');

  const modified = new Date().toISOString().replace(/\\.\\d+Z$/, 'Z');
  const desc = [b.subtitle, b.blurb].filter(Boolean).join(' — ');
  files.push({ name: 'OEBPS/content.opf', data: \`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="ko">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">urn:uuid:\${b.uuid}</dc:identifier>
<dc:title>\${esc(title)}</dc:title>
<dc:creator>\${esc(b.author || '지은이')}</dc:creator>
<dc:language>ko</dc:language>
\${b.publisher ? \`<dc:publisher>\${esc(b.publisher)}</dc:publisher>\` : ''}
\${desc ? \`<dc:description>\${esc(desc)}</dc:description>\` : ''}
\${b.genre ? \`<dc:subject>\${esc(b.genre)}</dc:subject>\` : ''}
<meta property="dcterms:modified">\${modified}</meta>
<meta name="cover" content="cover-image"/>
</metadata>
<manifest>
\${manifest.join('\\n')}
</manifest>
<spine toc="ncx">
\${spine.join('\\n')}
</spine>
</package>\` });
  return makeZip(files);
}

/* ═══════════ PDF (인쇄 창) ═══════════ */
function buildPrintHTML(b, sizeKey, cover, back) {
  const [pw, ph] = PAGE_SIZES[sizeKey] || PAGE_SIZES.a5;
  const base = sizeKey === 'a4' ? '12.5pt' : sizeKey === 'b6' ? '10pt' : '11pt';
  return \`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>\${esc(b.title || '나의 e북')}</title>
<link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Noto+Sans+KR:wght@400;700&family=Noto+Serif+KR:wght@400;700&display=swap" rel="stylesheet">
<style>
@page{size:\${pw} \${ph};margin:18mm 16mm 20mm;@bottom-center{content:counter(page);font-size:9pt;color:#999}}
@page full{margin:0;@bottom-center{content:none}}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;padding:0;font-size:\${base}}
\${contentCSS(b, 'print')}
.coverpg,.backpg{page:full;width:\${pw};height:\${ph};overflow:hidden;break-after:page;page-break-after:always}
.backpg{break-before:page;page-break-before:always;break-after:auto}
.coverpg img,.backpg img{width:100%;height:100%;object-fit:cover;display:block}
section{break-before:page;page-break-before:always}
.titlepage{padding-top:35%}
.colophon .colo{margin-top:80%}
.fig img{max-height:115mm}
.lay-picture .fig img{max-height:140mm}
.part .pt-img img{max-height:100mm}
</style></head><body>
<div class="coverpg"><img src="\${cover}" alt="표지"></div>
\${titlePageHTML(b)}
\${tocHTML(b, (i, t) => t)}
\${b.chapters.map((c, i) => chapterHTML(c, i, c.image, false)).join('\\n')}
\${colophonHTML(b)}
<div class="backpg"><img src="\${back}" alt="뒤표지"></div>
</body></html>\`;
}
async function printPDF(b, sizeKey) {
  const cover = await coverJPEG(b, 1000, 0.92);
  const back = (await drawBackCover(b)).toDataURL('image/jpeg', 0.9);
  const fr = $('#printFrame');
  await new Promise(res => { fr.onload = res; fr.srcdoc = buildPrintHTML(b, sizeKey, cover, back); });
  const doc = fr.contentDocument;
  await Promise.all(Array.from(doc.images).map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
  try { if (doc.fonts) await Promise.race([doc.fonts.ready, new Promise(r => setTimeout(r, 2500))]); } catch (e) {}
  fr.contentWindow.focus();
  fr.contentWindow.print();
}

/* ═══════════ 그림 올리기 (크기 줄여서 저장) ═══════════ */
async function readImage(file, maxSide = 1400) { return (await readImageInfo(file, maxSide)).url; }
/* keepAlpha: PNG·GIF·WEBP 처럼 투명한 부분이 있는 그림은 투명함을 살려 저장함 */
function readImageInfo(file, maxSide = 1400, keepAlpha = false) {
  return new Promise((res, rej) => {
    if (!file || !/^image\\//.test(file.type)) return rej(new Error('그림 파일이 아님'));
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const r = Math.min(1, maxSide / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * r); c.height = Math.round(im.height * r);
        const alpha = keepAlpha && /png|gif|webp/i.test(file.type);
        const x = c.getContext('2d');
        if (!alpha) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
        x.drawImage(im, 0, 0, c.width, c.height);
        res({ url: alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.86), w: c.width, h: c.height });
      };
      im.onerror = () => rej(new Error('그림을 열 수 없음'));
      im.src = fr.result;
    };
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
}

/* ═══════════ 화면 전환 ═══════════ */
function setView(v) {
  document.body.dataset.view = v;
  window.scrollTo(0, 0);
  if (v === 'library') renderLibrary();
  if (v === 'anth') renderAnth();
}
function openBook(id, toPane) {
  const b = shelf.books.find(x => x.id === id); if (!b) return;
  book = b; shelf.currentId = id; curCh = 0; sel = null;
  persist();
  setView('editor');
  renderEditorAll();
  setPane(toPane || 'write');
  schedulePreview(30);
}
function setPane(p) {
  pane = p;
  $$('.nav-i').forEach(x => x.classList.toggle('on', x.dataset.pane === p));
  $$('.pane').forEach(x => x.classList.toggle('on', x.id === 'pane-' + p));
  document.body.classList.toggle('pane-cover', p === 'cover');
  renderChList();
  if (p === 'cover') { coverCtl.redo = []; renderCoverTools(); setCdTab(cdTab); }
  if (p === 'write') renderWriter();
  if (p === 'style') renderStyle();
  if (p === 'info') renderInfo();
  $('#work').scrollTop = 0;
  pvGoto();
}
function updateHeader() {
  if (!book) return;
  $('#barTitle').textContent = book.title || '제목 없는 책';
  $('#sideTitle').textContent = book.title || '제목 없는 책';
  const st = bookStats(book);
  $('#sideMeta').textContent = \`\${st.chs}장 · \${fmtN(st.chars)}자\`;
}
function renderEditorAll() { updateHeader(); scheduleThumbs(); renderChList(); }

/* ═══════════ 서재 ═══════════ */
async function renderLibrary() {
  const grid = $('#libGrid');
  const books = [...shelf.books].sort((a, b) => b.updated - a.updated);
  $('#libMeta').textContent = \`\${books.length}권 · 이 기기에 저장됨\`;
  grid.innerHTML = \`<div class="bk new"><div class="cv" id="tileNew"><span class="plus">\${icon('plus')}</span>새 책 만들기</div></div>\` +
    books.map(b => {
      const st = bookStats(b);
      return \`<div class="bk" data-id="\${b.id}">
<div class="cv" data-open="\${b.id}"><canvas width="1000" height="1414"></canvas></div>
<div class="nm">\${esc(b.title || '제목 없는 책')}</div>
<div class="mt">\${esc(b.author || '지은이 없음')} · \${st.chs}장 · \${fmtN(st.chars)}자</div>
<div class="mt">\${new Date(b.updated).toLocaleDateString('ko-KR')} 수정</div>
<div class="acts"><button class="iconbtn" data-act="dup" title="복제">\${icon('copy', 's')}</button><button class="iconbtn" data-act="save" title="책 파일 저장">\${icon('download', 's')}</button><button class="iconbtn" data-act="del" title="지우기">\${icon('trash', 's')}</button></div>
</div>\`;
    }).join('');
  for (const el of $$('.bk[data-id]', grid)) {
    const b = shelf.books.find(x => x.id === el.dataset.id);
    if (b) await drawCover(b, $('canvas', el));
  }
}
$('#libGrid').addEventListener('click', e => {
  if (e.target.closest('#tileNew')) return openTpl();
  const o = e.target.closest('[data-open]'); if (o) return openBook(o.dataset.open);
  const a = e.target.closest('[data-act]'); if (!a) return;
  const id = a.closest('.bk').dataset.id, b = shelf.books.find(x => x.id === id);
  if (a.dataset.act === 'dup') dupBook(b);
  if (a.dataset.act === 'save') saveBookFile(b);
  if (a.dataset.act === 'del') deleteBook(b);
});
function dupBook(b) {
  const nb = clone(b); nb.id = uid(); nb.uuid = uuid(); nb.title = (b.title || '제목 없는 책') + ' (사본)'; nb.created = nb.updated = Date.now();
  shelf.books.push(nb); persist(); toast('복제본을 만듦');
  if (document.body.dataset.view === 'library') renderLibrary(); else openBook(nb.id, 'info');
}
function deleteBook(b) {
  if (!confirm(\`"\${b.title || '제목 없는 책'}"을 지울까요? 되돌릴 수 없음.\\n(필요하면 먼저 책 파일로 저장할 것)\`)) return;
  shelf.books = shelf.books.filter(x => x.id !== b.id);
  if (shelf.currentId === b.id) shelf.currentId = null;
  persist(); toast('책을 지움'); setView('library');
}
function saveBookFile(b) {
  download(new Blob([JSON.stringify({ app: 'daram-ebook', version: 2, book: b })], { type: 'application/json' }), safeName(b.title) + '.ebook.json');
  toast('책 파일을 저장함');
}
async function parseBookFile(file) {
  const j = JSON.parse(await file.text());
  const b = j && (j.book || j);
  if (!b || !Array.isArray(b.chapters)) throw new Error(\`\${file.name}: e북 공방 책 파일이 아님\`);
  return migrate(clone(b));
}
$('#btnImport').onclick = () => $('#fileImport').click();
$('#fileImport').onchange = async e => {
  const fs = Array.from(e.target.files); e.target.value = '';
  let n = 0;
  for (const f of fs) {
    try { const b = await parseBookFile(f); b.id = uid(); b.updated = Date.now(); shelf.books.push(b); n++; }
    catch (err) { toast('불러오기 실패: ' + err.message, 4000); }
  }
  if (n) { persist(); renderLibrary(); toast(\`\${n}권을 서재에 넣음\`); }
};

/* 새 책: 틀 고르기 */
async function openTpl() {
  $('#tplGrid').innerHTML = TEMPLATES.map(t => \`<button class="tpl" data-tpl="\${t.id}"><canvas width="1000" height="1414"></canvas><div class="m"><b>\${t.name}</b><span>\${t.desc}</span></div></button>\`).join('');
  $('#mTpl').classList.add('on');
  for (const el of $$('.tpl', $('#tplGrid'))) {
    const b = newBook(el.dataset.tpl); b.title = TEMPLATES.find(t => t.id === el.dataset.tpl).name; b.author = '지은이';
    await drawCover(b, $('canvas', el));
  }
}
$('#tplGrid').addEventListener('click', e => {
  const t = e.target.closest('[data-tpl]'); if (!t) return;
  const nb = newBook(t.dataset.tpl); shelf.books.push(nb);
  $('#mTpl').classList.remove('on');
  openBook(nb.id, 'info');
  setTimeout(() => $('#fTitle').focus(), 50);
  toast('새 책을 만듦. 먼저 제목과 지은이를 정함');
});
$('#btnNew').onclick = openTpl;

/* ═══════════ 원고 목록(사이드바) ═══════════ */
function renderChList() {
  if (!book) return;
  let inPart = false;
  $('#chList').innerHTML = book.chapters.map((c, i) => {
    if (c.kind === 'part') inPart = true;
    const cls = [c.kind === 'part' ? 'part' : (inPart ? 'sub' : ''), (pane === 'write' && i === curCh) ? 'on' : ''].join(' ');
    return \`<li data-i="\${i}" class="\${cls}"><span class="t">\${esc(c.title || (c.kind === 'part' ? '제목 없는 부' : '제목 없는 장'))}</span>
<span class="n">\${c.kind === 'part' ? '' : fmtN(nchar(c.body))}</span>
<span class="ops"><button data-op="up" title="위로">\${icon('up', 's')}</button><button data-op="down" title="아래로">\${icon('down', 's')}</button><button data-op="del" title="지우기">\${icon('x', 's')}</button></span></li>\`;
  }).join('');
}
$('#chList').addEventListener('click', e => {
  const li = e.target.closest('li'); if (!li) return;
  const i = +li.dataset.i, op = e.target.closest('[data-op]')?.dataset.op, cs = book.chapters;
  if (op === 'up' && i > 0) { [cs[i - 1], cs[i]] = [cs[i], cs[i - 1]]; curCh = i - 1; touch({ cover: false }); }
  else if (op === 'down' && i < cs.length - 1) { [cs[i + 1], cs[i]] = [cs[i], cs[i + 1]]; curCh = i + 1; touch({ cover: false }); }
  else if (op === 'del') {
    if (cs.length === 1) return toast('장은 최소 1개가 있어야 함');
    const c = cs[i];
    if ((c.body.trim() || c.image) && !confirm(\`"\${c.title || '제목 없음'}"을 지울까요? 쓴 글이 사라짐.\`)) return;
    cs.splice(i, 1); curCh = Math.min(curCh, cs.length - 1); touch({ cover: false });
  } else if (op) return;
  else curCh = i;
  if (pane !== 'write') setPane('write'); else { renderChList(); renderWriter(); pvGoto(); }
});
function addChapter(kind) {
  const last = book.chapters[book.chapters.length - 1];
  const n = book.chapters.filter(c => c.kind === kind).length + 1;
  book.chapters.splice(curCh + 1, 0, newChapter(kind === 'part'
    ? { kind: 'part', title: \`제\${n}부\`, hint: '이 부를 여는 짧은 글 (없어도 됨)' }
    : { title: \`\${n}장\`, layout: last && last.kind !== 'part' ? last.layout : 'normal' }));
  curCh = curCh + 1;
  touch({ cover: false });
  setPane('write');
  $('#chTitle').focus(); $('#chTitle').select();
}
$('#btnAddCh').onclick = () => addChapter('chapter');
$('#btnAddPart').onclick = () => addChapter('part');

/* ═══════════ 원고 쓰기 ═══════════ */
function autosize() { const t = $('#chBody'); t.style.height = 'auto'; t.style.height = Math.max(340, t.scrollHeight) + 'px'; }
function renderWriter() {
  const c = book.chapters[curCh]; if (!c) return;
  const isPart = c.kind === 'part';
  $('#msKind').innerHTML = isPart ? \`\${icon('layers', 's')} 부 나눔 쪽\` : \`\${icon('book', 's')} \${curCh + 1}번째 원고\`;
  $('#chTitle').value = c.title; $('#chTitle').placeholder = isPart ? '부 제목 (예: 제1부 봄)' : '장 제목';
  $('#chAuthor').value = c.author || '';
  $('#chAuthor').placeholder = isPart ? '지은이 (예: 다람이) — 문집에서 작품 주인 표시' : '지은이 (여러 사람이 함께 쓴 책일 때만, 없어도 됨)';
  $('#chBody').value = c.body;
  $('#chBody').placeholder = c.hint || (isPart ? '이 부를 여는 짧은 글 (없어도 됨)' : '여기에 글을 씀.');
  $('#layGrp').innerHTML = isPart ? '<span class="tb" style="cursor:default;color:var(--muted)">구분 쪽</span>' :
    Object.entries(CH_LAYOUTS).map(([k, n]) => \`<button class="tb \${(c.layout || 'normal') === k ? 'on' : ''}" data-lay="\${k}">\${n}</button>\`).join('');
  $('#msImgBox').innerHTML = c.image
    ? \`<div class="ms-img"><img src="\${c.image}" alt=""><div class="ops"><button class="btn sm" data-img="draw">\${icon('pen', 's')}\${c.drawing ? '그림 고치기' : '위에 그리기'}</button><button class="btn sm" data-img="change">바꾸기</button><button class="btn sm danger" data-img="del">지우기</button></div></div>\`
    : \`<div class="row" style="flex-wrap:nowrap;gap:10px"><button class="ms-addimg" data-img="add">\${icon('image')} \${isPart ? '구분 쪽 그림 넣기' : '사진·그림 넣기'}</button><button class="ms-addimg" data-img="draw">\${icon('pen')} 직접 그리기</button></div>\`;
  updateStatus(); autosize();
}
function updateStatus() {
  const c = book.chapters[curCh]; if (!c) return;
  const st = bookStats(book);
  const pages = Math.max(1, Math.round(st.chars / 520 + st.imgs * 0.6 + book.chapters.length * 0.4 + 4));
  $('#msStatus').innerHTML = \`<span>이 원고 <b>\${fmtN(nchar(c.body))}</b>자</span><span>책 전체 <b>\${fmtN(st.chars)}</b>자</span><span>그림 <b>\${st.imgs}</b>장</span><span>A5 약 <b>\${pages}</b>쪽</span>\`;
}
$('#chTitle').addEventListener('input', e => { book.chapters[curCh].title = e.target.value; renderChList(); touch({ cover: false }); });
$('#chAuthor').addEventListener('input', e => { book.chapters[curCh].author = e.target.value; touch({ cover: false }); });
let chlT;
$('#chBody').addEventListener('input', e => { book.chapters[curCh].body = e.target.value; autosize(); updateStatus(); clearTimeout(chlT); chlT = setTimeout(() => { renderChList(); updateHeader(); }, 400); touch({ cover: false }); });
$('#layGrp').addEventListener('click', e => { const b = e.target.closest('[data-lay]'); if (!b) return; book.chapters[curCh].layout = b.dataset.lay; renderWriter(); touch({ cover: false }); });
$('#msImgBox').addEventListener('click', e => {
  const b = e.target.closest('[data-img]'); if (!b) return;
  if (b.dataset.img === 'del') { const c = book.chapters[curCh]; c.image = null; delete c.drawing; renderWriter(); touch({ cover: false }); }
  else if (b.dataset.img === 'draw') openStudio(curCh);
  else $('#fileCh').click();
});
$('#tbImg').onclick = () => $('#fileCh').click();
$('#tbDraw').onclick = () => openStudio(curCh);

/* ═══════════ 그림판 (본문 장 그림 직접 그리기) ═══════════ */
const st = { i: -1, dr: null, dirty: false };
const stCanvas = $('#stCanvas');
const stSize = () => [st.dr.w, st.dr.h];
let stRaf = 0;
function stDraw() {
  if (stRaf) return;
  stRaf = requestAnimationFrame(async () => { stRaf = 0; await paintStudio(stCanvas, studioCtl.live); });
}
async function paintStudio(cv, live) {
  const { w: W, h: H, bg } = st.dr;
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const x = cv.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  const im = await loadImg(bg);
  if (im) { const r = Math.min(W / im.width, H / im.height); x.drawImage(im, (W - im.width * r) / 2, (H - im.height * r) / 2, im.width * r, im.height * r); }
  renderDrawing(x, st.dr, live, W, H);
  return cv;
}
const studioCtl = makeDrawCtl({
  root: $('#studioTools'), canvas: stCanvas, size: stSize, dr: () => st.dr,
  live: stDraw, commit: () => { st.dirty = true; stDraw(); }
});
function renderStudioBar() {
  const k = Object.entries(STUDIO_SIZES).find(([, v]) => v[0] === st.dr.w && v[1] === st.dr.h);
  $$('#stSize button').forEach(b => b.classList.toggle('on', k && b.dataset.sz === k[0]));
  $('#stPhotoDel').hidden = !st.dr.bg;
  $('#stPhoto').lastChild.textContent = st.dr.bg ? '사진 바꾸기' : '사진 깔기';
}
async function openStudio(i) {
  const c = book.chapters[i]; if (!c) return;
  st.i = i; st.dirty = false; studioCtl.redo = []; studioCtl.live = null;
  if (c.drawing && Array.isArray(c.drawing.strokes)) st.dr = clone(c.drawing);
  else {
    st.dr = { w: 1200, h: 900, bg: c.image || null, strokes: [] };
    const im = await loadImg(c.image);
    if (im) { const r = im.width / im.height; [st.dr.w, st.dr.h] = STUDIO_SIZES[r > 1.15 ? 'land' : r < 0.87 ? 'port' : 'sq']; }
    else if (c.layout === 'picture') [st.dr.w, st.dr.h] = STUDIO_SIZES.land;
  }
  if (pen.t === 'eraser' || pen.t === 'fill') pen.t = 'pen';
  $('#stName').textContent = '· ' + chLabel(c, i);
  $('#studio').hidden = false;
  renderStudioBar(); studioCtl.render(); stDraw();
}
function closeStudio(force) {
  if (!force && st.dirty && !confirm('그린 그림을 넣지 않고 닫을까요?')) return;
  $('#studio').hidden = true; st.i = -1;
}
$('#stCancel').onclick = () => closeStudio(false);
$('#stSave').onclick = async () => {
  const c = book.chapters[st.i]; if (!c) return closeStudio(true);
  if (!st.dr.strokes.length && !st.dr.bg) { toast('아직 그린 것이 없음'); return; }
  const out = await paintStudio(document.createElement('canvas'), null);
  c.image = out.toDataURL('image/jpeg', 0.9);
  c.drawing = clone(st.dr);
  closeStudio(true); renderWriter(); touch({ cover: false });
  toast('그림을 이 장에 넣음. "그림 고치기"로 다시 열 수 있음');
};
$('#stSize').addEventListener('click', e => {
  const b = e.target.closest('[data-sz]'); if (!b) return;
  if (st.dr.strokes.length) return toast('그린 것이 있으면 크기를 바꿀 수 없음 (모두 지운 뒤 가능)');
  [st.dr.w, st.dr.h] = STUDIO_SIZES[b.dataset.sz]; renderStudioBar(); stDraw();
});
$('#stPhoto').onclick = () => $('#stFile').click();
$('#stFile').onchange = async e => {
  try { st.dr.bg = await readImage(e.target.files[0], 1600); st.dirty = true; renderStudioBar(); stDraw(); }
  catch (err) { toast(err.message); }
  e.target.value = '';
};
$('#stPhotoDel').onclick = () => { st.dr.bg = null; st.dirty = true; renderStudioBar(); stDraw(); };
stCanvas.addEventListener('pointerdown', e => { e.preventDefault(); studioCtl.down(e); });
stCanvas.addEventListener('pointermove', e => studioCtl.move(e));
stCanvas.addEventListener('pointerup', () => studioCtl.up());
stCanvas.addEventListener('pointercancel', () => studioCtl.up());
addEventListener('keydown', e => {
  if ($('#studio').hidden) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? studioCtl.redoOne() : studioCtl.undo(); }
  else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); studioCtl.redoOne(); }
  else if (e.key === 'Escape') { e.stopImmediatePropagation(); closeStudio(false); }
}, true);
$('#fileCh').onchange = async e => {
  try { const c = book.chapters[curCh]; c.image = await readImage(e.target.files[0]); delete c.drawing; renderWriter(); touch({ cover: false }); }
  catch (err) { toast(err.message); }
  e.target.value = '';
};
function applyFmt(kind) {
  const ta = $('#chBody'); const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
  const selTxt = v.slice(s, e);
  let cs, ce;
  const lineStart = v.lastIndexOf('\\n', s - 1) + 1;
  if (kind === 'bold' || kind === 'italic') {
    const m = kind === 'bold' ? '**' : '*'; const t = selTxt || (kind === 'bold' ? '굵은 글자' : '기울인 글자');
    ta.setRangeText(m + t + m, s, e); cs = s + m.length; ce = cs + t.length;
  } else if (kind === 'h' || kind === 'quote') {
    const m = kind === 'h' ? '# ' : '> ';
    ta.setRangeText(m, lineStart, lineStart); cs = s + m.length; ce = e + m.length;
  } else {
    const ins = (s > 0 && v[s - 1] !== '\\n' ? '\\n' : '') + '\\n---\\n\\n';
    ta.setRangeText(ins, s, e); cs = ce = s + ins.length;
  }
  ta.focus(); ta.setSelectionRange(cs, ce);
  ta.dispatchEvent(new Event('input'));
}
$('#msBar').addEventListener('click', e => { const b = e.target.closest('[data-fmt]'); if (b) applyFmt(b.dataset.fmt); });
$('#chBody').addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); applyFmt('bold'); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); applyFmt('italic'); }
});

/* ═══════════ 책 정보 ═══════════ */
function renderInfo() {
  $('#fTitle').value = book.title; $('#fSub').value = book.subtitle; $('#fAuthor').value = book.author;
  $('#fPub').value = book.publisher; $('#fGenre').value = book.genre || ''; $('#fBlurb').value = book.blurb || '';
  $('#blurbCount').textContent = \`\${(book.blurb || '').length} / 500자\`;
}
const bindField = (sel, key, also) => $(sel).addEventListener('input', e => { book[key] = e.target.value; if (also) also(); touch(); });
bindField('#fTitle', 'title'); bindField('#fSub', 'subtitle'); bindField('#fAuthor', 'author'); bindField('#fPub', 'publisher');
bindField('#fGenre', 'genre');
bindField('#fBlurb', 'blurb', () => $('#blurbCount').textContent = \`\${book.blurb.length} / 500자\`);
$('#btnDup').onclick = () => dupBook(book);
$('#btnDelBook').onclick = () => deleteBook(book);

/* ═══════════ 본문 스타일 ═══════════ */
function themeSwatches(el, cur) { el.innerHTML = Object.entries(THEMES).map(([k, t]) => \`<button class="sw \${cur === k ? 'on' : ''}" data-theme="\${k}" title="\${t.name}" style="background:linear-gradient(135deg,\${t.c1},\${t.c2})"></button>\`).join(''); }
function renderStyle() {
  const A = themeOf(book).accent;
  const smp = {
    classic: \`<div style="text-align:center;color:\${A};font-size:15px">1장. 숲의 아침<div style="font-size:10px">❦</div></div><p style="margin-top:8px">다람이는 해가 뜨기도 전에 눈을 떴다. 오늘은 처음으로 혼자 숲을 건너는 날이었다.</p><p style="text-indent:1em">바람이 나뭇잎을 흔들며 길을 열어 주었다.</p>\`,
    modern: \`<div style="border-top:4px solid \${A};padding-top:6px;color:\${A};font-weight:700;font-size:15px">1. 탐구 동기</div><p style="margin-top:8px">학교 화단의 개미가 줄지어 다니는 까닭이 궁금했다.</p><p style="margin-top:6px">그래서 일주일 동안 개미의 길을 관찰하기로 했다.</p>\`,
    story: \`<div style="text-align:center"><span style="background:\${A}1a;color:\${A};border-radius:20px;padding:3px 14px;font-size:14px">장면 1</span></div><p style="margin-top:10px;font-size:13px;line-height:2">해님이 들판 위로 솟아올랐어요. 아침이 밝았어요.</p>\`,
    essay: \`<div style="width:24px;height:2px;background:\${A}"></div><div style="font-weight:700;font-size:14px;margin-top:6px;color:#2b2420">3월 이야기</div><p style="margin-top:10px">새 교실의 창문은 생각보다 컸다.</p><p style="margin-top:8px">나는 그 창문 옆자리가 마음에 들었다.</p>\`
  };
  $('#styleGrid').innerHTML = Object.entries(BODY_STYLES).map(([k, s]) => \`<button class="sty \${book.bodyStyle === k ? 'on' : ''}" data-sty="\${k}"><div class="smp" style="font-family:\${BODY_FONTS[book.font].css}">\${smp[k]}</div><div class="meta"><b>\${s.name}</b><span>\${s.desc}</span></div></button>\`).join('');
  $('#bodyFontSeg').innerHTML = Object.entries(BODY_FONTS).map(([k, f]) => \`<button data-bf="\${k}" class="\${book.font === k ? 'on' : ''}">\${f.name}</button>\`).join('');
  themeSwatches($('#themeSw2'), book.theme);
}
$('#styleGrid').addEventListener('click', e => { const b = e.target.closest('[data-sty]'); if (!b) return; book.bodyStyle = b.dataset.sty; renderStyle(); touch({ cover: false }); });
$('#bodyFontSeg').addEventListener('click', e => { const b = e.target.closest('[data-bf]'); if (!b) return; book.font = b.dataset.bf; renderStyle(); touch({ cover: false }); });
$('#themeSw2').addEventListener('click', e => { const b = e.target.closest('[data-theme]'); if (!b) return; book.theme = b.dataset.theme; renderStyle(); touch(); });

/* ═══════════ 표지 디자인 ═══════════ */
let sel = null, drag = null, stageRaf = 0;
function drawStage() {
  if (stageRaf) return;
  stageRaf = requestAnimationFrame(async () => { stageRaf = 0; if (book) await drawCover(book, $('#coverStage'), { edit: true, sel, live: coverCtl.live }); });
}
let layoutThumbSeq = 0;
async function drawLayoutThumbs() {
  const seq = ++layoutThumbSeq;
  for (const el of $$('.lay', $('#lays'))) {
    if (seq !== layoutThumbSeq) return;
    await drawCover(book, $('canvas', el), { layout: el.dataset.lay });
  }
}
function renderCoverTools() {
  const cv = book.cover;
  if (!$('#lays').children.length) $('#lays').innerHTML = Object.entries(LAYOUTS).map(([k, n]) => \`<button class="lay" data-lay="\${k}"><canvas width="1000" height="1414"></canvas>\${n}</button>\`).join('');
  $$('.lay').forEach(x => x.classList.toggle('on', x.dataset.lay === cv.layout));
  themeSwatches($('#themeSw'), book.theme);
  $('#pats').innerHTML = Object.entries(PATTERNS).map(([k, n]) => \`<button class="pat \${cv.pattern === k ? 'on' : ''}" data-pat="\${k}" style="\${patPreview(k)}">\${n}</button>\`).join('');
  $('#cTitle').value = book.title; $('#cSub').value = book.subtitle; $('#cAuthor').value = book.author;
  $('#fontGrid').innerHTML = Object.entries(TITLE_FONTS).map(([k, f]) => \`<button class="fnt \${cv.titleFont === k ? 'on' : ''}" data-tf="\${k}" style="font-family:\${f.css};font-weight:\${f.w}">가나다<small>\${f.name}</small></button>\`).join('');
  $('#cSize').value = cv.titleSize; $('#sizeVal').textContent = Math.round(cv.titleSize * 100) + '%';
  $('#alignSeg').innerHTML = [['auto', '자동'], ['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']].map(([k, n]) => \`<button data-al="\${k}" class="\${cv.titleAlign === k ? 'on' : ''}">\${n}</button>\`).join('');
  $('#colorSw').innerHTML = TEXT_COLORS.map(c => c === 'auto'
    ? \`<button class="sw \${cv.titleColor === 'auto' ? 'on' : ''}" data-tc="auto" title="자동" style="background:conic-gradient(#fff 0 25%,#1c1f24 0 50%,#fff 0 75%,#1c1f24 0)"></button>\`
    : \`<button class="sw \${cv.titleColor === c ? 'on' : ''}" data-tc="\${c}" style="background:\${c}"></button>\`).join('');
  $('#cShadow').checked = !!cv.titleShadow;
  $('#imgNone').hidden = !!cv.image; $('#imgSome').hidden = !cv.image;
  $('#cZoom').value = cv.zoom; $('#cFx').value = cv.fx; $('#cFy').value = cv.fy;
  if (!$('#stkPanel').children.length) {
    $('#stkPanel').innerHTML = Object.entries(STICKERS).map(([cat, arr]) => \`<div class="stk-cat">\${cat}</div><div class="emojis">\${arr.map(e => \`<button data-emoji="\${e}">\${e}</button>\`).join('')}</div>\`).join('') +
      \`<div class="stk-cat">배지·꼬리표</div><div class="badges">\${BADGES.map((b, i) => \`<button data-badge="\${i}" style="background:\${b.color};border-radius:\${b.type === 'badge' ? '999px' : '6px'}">\${esc(b.v)}</button>\`).join('')}</div><div class="help">배지 글자는 표지에서 배지를 누른 뒤 바꿀 수 있음.</div>\`;
  }
  if ($('#cd-layout').classList.contains('on')) drawLayoutThumbs();
  renderSelbar();
}
function patPreview(k) {
  const th = themeOf(book);
  const c = document.createElement('canvas'); c.width = c.height = 160;
  const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 160, 160); g.addColorStop(0, th.c1); g.addColorStop(1, th.c2);
  x.fillStyle = g; x.fillRect(0, 0, 160, 160); x.scale(.5, .5);
  drawPattern(x, k, 0, 0, 320, 320, th.light ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.3)');
  return \`background-image:url(\${c.toDataURL()});color:\${th.ink}\`;
}
$('#cdTabs').addEventListener('click', e => {
  const b = e.target.closest('[data-cd]'); if (!b) return;
  $$('#cdTabs button').forEach(x => x.classList.toggle('on', x === b));
  $$('.cd-sec').forEach(x => x.classList.toggle('on', x.id === 'cd-' + b.dataset.cd));
  setCdTab(b.dataset.cd);
});
let cdTab = 'layout';
function setCdTab(t) {
  cdTab = t;
  if (t === 'layout') drawLayoutThumbs();
  if (t === 'draw') { sel = null; renderSelbar(); coverCtl.render(); }
  $('.cd-stage').classList.toggle('drawing', t === 'draw');
  $('#stageHint').textContent = t === 'draw'
    ? '표지 위에 손가락·펜슬·마우스로 그림 · Ctrl+Z 되돌리기'
    : '제목·지은이·스티커·사진을 끌어서 옮김 · 누르면 크기·회전 조절 · Delete 키로 지움';
  drawStage();
}
function coverChanged(redrawTools) { if (redrawTools) renderCoverTools(); drawStage(); touch(); }
$('#lays').addEventListener('click', e => { const b = e.target.closest('[data-lay]'); if (!b) return; book.cover.layout = b.dataset.lay; book.cover.tx = book.cover.ty = book.cover.ax = book.cover.ay = 0; $$('.lay').forEach(x => x.classList.toggle('on', x === b)); drawStage(); touch(); });
$('#themeSw').addEventListener('click', e => { const b = e.target.closest('[data-theme]'); if (!b) return; book.theme = b.dataset.theme; coverChanged(true); });
$('#pats').addEventListener('click', e => { const b = e.target.closest('[data-pat]'); if (!b) return; book.cover.pattern = b.dataset.pat; $$('.pat').forEach(x => x.classList.toggle('on', x === b)); drawStage(); touch(); });
[['#cTitle', 'title'], ['#cSub', 'subtitle'], ['#cAuthor', 'author']].forEach(([s, k]) => $(s).addEventListener('input', e => { book[k] = e.target.value; drawStage(); touch(); }));
$('#fontGrid').addEventListener('click', async e => { const b = e.target.closest('[data-tf]'); if (!b) return; book.cover.titleFont = b.dataset.tf; $$('.fnt').forEach(x => x.classList.toggle('on', x === b)); await ensureFont(TITLE_FONTS[b.dataset.tf]); drawStage(); touch(); });
$('#cSize').addEventListener('input', e => { book.cover.titleSize = +e.target.value; $('#sizeVal').textContent = Math.round(book.cover.titleSize * 100) + '%'; drawStage(); touch({ preview: false }); });
$('#cSize').addEventListener('change', () => touch());
$('#alignSeg').addEventListener('click', e => { const b = e.target.closest('[data-al]'); if (!b) return; book.cover.titleAlign = b.dataset.al; book.cover.tx = book.cover.ax = 0; coverChanged(true); });
$('#colorSw').addEventListener('click', e => { const b = e.target.closest('[data-tc]'); if (!b) return; book.cover.titleColor = b.dataset.tc; coverChanged(true); });
$('#cShadow').addEventListener('change', e => { book.cover.titleShadow = e.target.checked; coverChanged(); });
$('#btnResetPos').onclick = () => { Object.assign(book.cover, { tx: 0, ty: 0, ax: 0, ay: 0 }); coverChanged(); toast('글자 위치를 처음으로 되돌림'); };
[['#cZoom', 'zoom'], ['#cFx', 'fx'], ['#cFy', 'fy']].forEach(([s, k]) => { $(s).addEventListener('input', e => { book.cover[k] = +e.target.value; drawStage(); touch({ preview: false }); }); $(s).addEventListener('change', () => touch()); });
['#btnCoverImg', '#btnCoverImg2'].forEach(s => $(s).onclick = () => $('#fileCover').click());
$('#fileCover').onchange = async e => {
  try { book.cover.image = await readImage(e.target.files[0], 1600); Object.assign(book.cover, { zoom: 1, fx: 0, fy: 0 }); coverChanged(true); toast('표지 그림을 넣음'); }
  catch (err) { toast(err.message); }
  e.target.value = '';
};
$('#btnCoverImgDel').onclick = () => { book.cover.image = null; coverChanged(true); };
/* ── 패드·컴퓨터 사진 붙이기 ── */
async function addPhotos(files) {
  const imgs = Array.from(files || []).filter(f => /^image\\//.test(f.type));
  if (!imgs.length) return toast('그림 파일이 아님');
  let n = 0, last = null;
  for (const f of imgs) {
    try {
      const info = await readImageInfo(f, 1200, true);
      const k = book.cover.stickers.filter(s => s.type === 'photo').length;
      last = { id: uid(), type: 'photo', v: info.url, a: info.h / info.w, frame: /^data:image\\/png/.test(info.url) ? 'none' : 'white', s: 460, r: (k % 2 ? 4 : -4), x: 500 + (k % 4) * 40 - 60, y: 640 + (k % 4) * 40 - 60 };
      book.cover.stickers.push(last); n++;
    } catch (err) { toast(err.message); }
  }
  if (last) { sel = { type: 'sticker', id: last.id }; renderSelbar(); coverChanged(); toast(\`사진 \${n}장을 붙임. 끌어서 옮길 수 있음\`); }
}
$('#btnPhoto').onclick = () => $('#filePhoto').click();
$('#filePhoto').onchange = e => { const f = Array.from(e.target.files); e.target.value = ''; addPhotos(f); };
const cdStage = $('.cd-stage');
['dragenter', 'dragover'].forEach(t => cdStage.addEventListener(t, e => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); cdStage.classList.add('dropping'); } }));
cdStage.addEventListener('dragleave', e => { if (e.target === cdStage || !cdStage.contains(e.relatedTarget)) cdStage.classList.remove('dropping'); });
cdStage.addEventListener('drop', e => { e.preventDefault(); cdStage.classList.remove('dropping'); addPhotos(e.dataTransfer.files); });
addEventListener('paste', e => {
  if (pane !== 'cover' || document.body.dataset.view !== 'editor' || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  const fs = Array.from((e.clipboardData && e.clipboardData.files) || []).filter(f => /^image\\//.test(f.type));
  if (fs.length) { e.preventDefault(); addPhotos(fs); }
});

/* ── 그리기 조종기 (표지·그림판 공용) ── */
const pen = { t: 'pen', c: '#1c1f24', f: false, w: { pencil: 5, pen: 12, marker: 40, eraser: 44, line: 10, rect: 10, ellipse: 10, star: 10, heart: 10 } };
let penSeenAt = 0;
function toolPanelHTML() {
  return \`<div class="lbl">그리기</div><div class="pens" data-role="free"></div>
<div class="lbl" style="margin-top:12px">도형 · 채우기</div><div class="pens sh" data-role="shapes"></div>
<label class="check" style="padding-top:8px"><input type="checkbox" data-role="sfill"><span>도형 속 채우기<small>Shift를 누른 채 그리면 반듯한 정사각형·원</small></span></label>
<div class="lbl" style="margin-top:12px">색</div><div class="swatches" data-role="colors"></div>
<div class="field" style="margin-top:14px" data-role="sizebox"><label>굵기 <span class="sizedot" data-role="dot"></span></label><input type="range" class="range" data-role="size" min="2" max="120"></div>
<div class="row"><button class="btn sm" data-role="undo">\${icon('undo', 's')}되돌리기</button><button class="btn sm" data-role="redo">\${icon('redo', 's')}다시</button><button class="btn sm danger" data-role="clear">\${icon('trash', 's')}모두 지우기</button></div>\`;
}
/* opts: root(도구판), canvas, size()→[W,H], dr()→그림 자료, live(), commit(), extra() */
function makeDrawCtl(opts) {
  const ctl = { live: null, redo: [] };
  const root = opts.root; root.innerHTML = toolPanelHTML();
  const q = (r) => root.querySelector(\`[data-role=\${r}]\`);
  ctl.render = () => {
    const tb = (k, t) => \`<button class="pen \${pen.t === k ? 'on' : ''}" data-pen="\${k}">\${t.kind === 'free'
      ? \`<i style="height:\${Math.max(2, Math.min(14, t.w / 3))}px;\${k === 'eraser' ? 'background:repeating-linear-gradient(45deg,#ccc 0 4px,#fff 4px 8px);border:1px solid #ccc' : k === 'marker' ? 'opacity:.45' : ''}"></i>\`
      : \`<svg viewBox="0 0 24 24" fill="\${k === 'fill' ? 'none' : (pen.f && k !== 'line' ? 'currentColor' : 'none')}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\${TOOL_SVG[k]}</svg>\`}\${t.name}</button>\`;
    q('free').innerHTML = Object.entries(TOOLS).filter(([, t]) => t.kind === 'free').map(([k, t]) => tb(k, t)).join('');
    q('shapes').innerHTML = Object.entries(TOOLS).filter(([, t]) => t.kind !== 'free').map(([k, t]) => tb(k, t)).join('');
    q('sfill').checked = pen.f;
    q('colors').innerHTML = PEN_COLORS.map(c => \`<button class="sw \${pen.c === c ? 'on' : ''}" data-pc="\${c}" style="background:\${c}"></button>\`).join('') +
      \`<label class="sw pick \${PEN_COLORS.includes(pen.c) ? '' : 'on'}" title="다른 색"><input type="color" data-role="pick" value="\${pen.c}"></label>\`;
    const hasW = pen.t !== 'fill';
    q('sizebox').style.display = hasW ? '' : 'none';
    if (hasW) { q('size').value = pen.w[pen.t]; const d = Math.max(4, Math.min(30, pen.w[pen.t] / 2)); q('dot').style.cssText = \`width:\${d}px;height:\${d}px;background:\${pen.t === 'eraser' ? '#ccc' : pen.c}\`; }
    q('undo').disabled = !opts.dr().strokes.length; q('redo').disabled = !ctl.redo.length;
    if (opts.extra) opts.extra();
  };
  root.addEventListener('click', e => {
    const pb = e.target.closest('[data-pen]'); if (pb) { pen.t = pb.dataset.pen; return ctl.render(); }
    const cb = e.target.closest('[data-pc]'); if (cb) { pen.c = cb.dataset.pc; if (pen.t === 'eraser') pen.t = 'pen'; return ctl.render(); }
    const rb = e.target.closest('[data-role]'); if (!rb) return;
    if (rb.dataset.role === 'undo') ctl.undo(); else if (rb.dataset.role === 'redo') ctl.redoOne(); else if (rb.dataset.role === 'clear') ctl.clear();
  });
  root.addEventListener('input', e => {
    const r = e.target.dataset.role;
    if (r === 'pick') { pen.c = e.target.value; if (pen.t === 'eraser') pen.t = 'pen'; q('dot').style.background = pen.c; }
    if (r === 'size') { pen.w[pen.t] = +e.target.value; const d = Math.max(4, Math.min(30, pen.w[pen.t] / 2)); Object.assign(q('dot').style, { width: d + 'px', height: d + 'px' }); }
  });
  root.addEventListener('change', e => { const r = e.target.dataset.role; if (r === 'pick') ctl.render(); if (r === 'sfill') { pen.f = e.target.checked; ctl.render(); } });
  const pt = (e) => { const r = opts.canvas.getBoundingClientRect(), [W, H] = opts.size(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };
  ctl.down = (e) => {
    if (e.pointerType === 'pen') penSeenAt = Date.now();
    else if (e.pointerType === 'touch' && Date.now() - penSeenAt < 4000) return; // 펜슬 쓰는 중 손바닥 닿음 무시
    const p = pt(e), kind = TOOLS[pen.t].kind;
    if (kind === 'fill') { opts.dr().strokes.push({ t: 'fill', c: pen.c, x: Math.round(p.x), y: Math.round(p.y) }); ctl.redo = []; ctl.render(); opts.commit(); return; }
    ctl.live = kind === 'shape'
      ? { t: 'shape', k: pen.t, c: pen.c, w: pen.w[pen.t], f: pen.f, a: [p.x, p.y, p.x, p.y].map(Math.round) }
      : { t: pen.t, c: pen.c, w: pen.w[pen.t], p: [Math.round(p.x), Math.round(p.y)] };
    try { opts.canvas.setPointerCapture(e.pointerId); } catch (err) {}
    opts.live();
  };
  ctl.move = (e) => {
    const L = ctl.live; if (!L) return false;
    if (L.t === 'shape') {
      const p = pt(e); let dx = p.x - L.a[0], dy = p.y - L.a[1];
      if (e.shiftKey && L.k !== 'line') { const m = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m; }
      L.a[2] = Math.round(L.a[0] + dx); L.a[3] = Math.round(L.a[1] + dy);
    } else {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      for (const ev of (evs.length ? evs : [e])) {
        const p = pt(ev), a = L.p, lx = a[a.length - 2], ly = a[a.length - 1];
        if (Math.hypot(p.x - lx, p.y - ly) > 1.5) a.push(Math.round(p.x), Math.round(p.y));
      }
    }
    opts.live(); return true;
  };
  ctl.up = () => {
    const L = ctl.live; if (!L) return false;
    ctl.live = null;
    if (!(L.t === 'shape' && Math.abs(L.a[2] - L.a[0]) + Math.abs(L.a[3] - L.a[1]) < 6)) { opts.dr().strokes.push(L); ctl.redo = []; }
    ctl.render(); opts.commit(); return true;
  };
  ctl.undo = () => { const st = opts.dr().strokes.pop(); if (st) { ctl.redo.push(st); ctl.render(); opts.commit(); } };
  ctl.redoOne = () => { const st = ctl.redo.pop(); if (st) { opts.dr().strokes.push(st); ctl.render(); opts.commit(); } };
  ctl.clear = () => {
    const dr = opts.dr(); if (!dr.strokes.length || !confirm('그린 그림을 모두 지울까요?')) return;
    ctl.redo = dr.strokes.slice().reverse(); dr.strokes = []; ctl.render(); opts.commit();
    toast('모두 지움 ("다시"를 누르면 되살아남)');
  };
  return ctl;
}
const coverCtl = makeDrawCtl({
  root: $('#coverTools'), canvas: $('#coverStage'), size: () => [1000, 1414], dr: () => book.cover.drawing,
  live: () => drawStage(), commit: () => { drawStage(); touch(); },
  extra: () => { $('#drawTop').checked = !!book.cover.drawing.top; }
});
$('#drawTop').addEventListener('change', e => { book.cover.drawing.top = e.target.checked; coverChanged(); });
function addSticker(s) {
  const st = Object.assign({ id: uid(), x: 500 + (Math.random() - .5) * 200, y: 560 + (Math.random() - .5) * 200, s: s.type === 'emoji' ? 150 : 210, r: s.type === 'badge' ? -12 : 0 }, s);
  book.cover.stickers.push(st); sel = { type: 'sticker', id: st.id };
  renderSelbar(); coverChanged();
}
$('#stkPanel').addEventListener('click', e => {
  const em = e.target.closest('[data-emoji]'); if (em) return addSticker({ type: 'emoji', v: em.dataset.emoji });
  const bd = e.target.closest('[data-badge]'); if (bd) return addSticker(clone(BADGES[+bd.dataset.badge]));
});
/* 고른 것 조절 막대 */
function selSticker() { return sel && sel.type === 'sticker' ? book.cover.stickers.find(s => s.id === sel.id) : null; }
function renderSelbar() {
  const bar = $('#selbar');
  if (!sel) { bar.hidden = true; return; }
  bar.hidden = false;
  if (sel.type !== 'sticker') {
    bar.innerHTML = \`<span style="font-size:12.5px;font-weight:700">\${sel.type === 'title' ? '제목' : '지은이'}</span><span style="font-size:12px;color:var(--muted)">끌어서 옮김 · 글꼴·색은 '글자' 탭</span><button class="btn sm" data-sb="reset">\${icon('reset', 's')}제자리</button>\`;
    return;
  }
  const s = selSticker(); if (!s) { sel = null; bar.hidden = true; return; }
  const isTxt = s.type === 'badge' || s.type === 'tag', isPh = s.type === 'photo';
  bar.innerHTML = \`\${isPh ? \`<div class="seg">\${Object.entries(PHOTO_FRAMES).map(([k, n]) => \`<button data-sbf="\${k}" class="\${(s.frame || 'none') === k ? 'on' : ''}">\${n}</button>\`).join('')}</div><button class="btn sm" data-sb="asbg" title="이 사진을 배경 그림으로">배경으로</button>\` : ''}
\${isTxt ? \`<input type="text" data-sb="text" value="\${esc(s.v)}" maxlength="14">\` : ''}
\${isTxt ? ['#c92a2a', '#e8590c', '#2b8a3e', '#3651b8', '#7c3a7a', '#9a6b14', '#1c1f24'].map(c => \`<button class="sw \${s.color === c ? 'on' : ''}" data-sbc="\${c}" style="background:\${c}"></button>\`).join('') : ''}
<label>크기<input type="range" data-sb="size" min="\${isPh ? 80 : 50}" max="\${isPh ? 1000 : 520}" value="\${s.s}"></label>
<label>회전<input type="range" data-sb="rot" min="-180" max="180" value="\${s.r || 0}"></label>
<button class="iconbtn" data-sb="front" title="맨 앞으로">\${icon('layers', 's')}</button>
<button class="iconbtn" data-sb="dup" title="복제">\${icon('copy', 's')}</button>
<button class="iconbtn" data-sb="del" title="지우기" style="color:var(--danger)">\${icon('trash', 's')}</button>\`;
}
$('#selbar').addEventListener('input', e => {
  const s = selSticker(); if (!s) return;
  const k = e.target.dataset.sb;
  if (k === 'size') s.s = +e.target.value; else if (k === 'rot') s.r = +e.target.value; else if (k === 'text') s.v = e.target.value;
  drawStage(); touch({ preview: false });
});
$('#selbar').addEventListener('change', () => touch());
$('#selbar').addEventListener('click', e => {
  const c = e.target.closest('[data-sbc]'); const s = selSticker();
  if (c && s) { s.color = c.dataset.sbc; renderSelbar(); return coverChanged(); }
  const fb = e.target.closest('[data-sbf]');
  if (fb && s) { s.frame = fb.dataset.sbf; renderSelbar(); return coverChanged(); }
  const b = e.target.closest('button[data-sb]'); if (!b) return;
  const k = b.dataset.sb, arr = book.cover.stickers;
  if (k === 'reset') { if (sel.type === 'title') book.cover.tx = book.cover.ty = 0; else book.cover.ax = book.cover.ay = 0; }
  else if (k === 'front' && s) { arr.splice(arr.indexOf(s), 1); arr.push(s); }
  else if (k === 'dup' && s) { const n = Object.assign(clone(s), { id: uid(), x: s.x + 40, y: s.y + 40 }); arr.push(n); sel = { type: 'sticker', id: n.id }; renderSelbar(); }
  else if (k === 'del' && s) { arr.splice(arr.indexOf(s), 1); sel = null; renderSelbar(); }
  else if (k === 'asbg' && s) { book.cover.image = s.v; Object.assign(book.cover, { zoom: 1, fx: 0, fy: 0 }); arr.splice(arr.indexOf(s), 1); sel = null; renderSelbar(); renderCoverTools(); toast('배경 그림으로 바꿈. 레이아웃에 따라 그림 칸이 달라짐'); }
  coverChanged();
});
/* 표지 위에서 끌기 */
const stage = $('#coverStage');
function stagePt(e) { const r = stage.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * 1000, y: (e.clientY - r.top) / r.height * 1414 }; }
const inBox = (p, b, pad = 16) => b && p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
stage.addEventListener('pointerdown', e => {
  if (cdTab === 'draw') return coverCtl.down(e);
  const p = stagePt(e), h = stage._hits || {};
  let hit = null;
  for (let i = (h.stickers || []).length - 1; i >= 0; i--) if (inBox(p, h.stickers[i].box)) { hit = { type: 'sticker', id: h.stickers[i].id }; break; }
  if (!hit && inBox(p, h.title)) hit = { type: 'title' };
  if (!hit && inBox(p, h.author)) hit = { type: 'author' };
  sel = hit; renderSelbar(); drawStage();
  if (!hit) return;
  const cv = book.cover, s = selSticker();
  drag = { p, moved: false, o: s ? { x: s.x, y: s.y } : hit.type === 'title' ? { x: cv.tx, y: cv.ty } : { x: cv.ax, y: cv.ay } };
  stage.setPointerCapture(e.pointerId); stage.style.cursor = 'grabbing';
});
stage.addEventListener('pointermove', e => {
  if (coverCtl.move(e)) return;
  if (cdTab === 'draw') return;
  const p = stagePt(e), h = stage._hits || {};
  if (!drag) {
    const over = (h.stickers || []).some(x => inBox(p, x.box)) || inBox(p, h.title) || inBox(p, h.author);
    stage.style.cursor = over ? 'grab' : ''; return;
  }
  const dx = p.x - drag.p.x, dy = p.y - drag.p.y, cv = book.cover;
  if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
  const s = selSticker();
  if (s) { s.x = Math.round(drag.o.x + dx); s.y = Math.round(drag.o.y + dy); }
  else if (sel.type === 'title') { cv.tx = Math.round(drag.o.x + dx); cv.ty = Math.round(drag.o.y + dy); }
  else { cv.ax = Math.round(drag.o.x + dx); cv.ay = Math.round(drag.o.y + dy); }
  drawStage();
});
const endDrag = () => { if (coverCtl.up()) return; if (drag && drag.moved) touch(); drag = null; stage.style.cursor = ''; };
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
addEventListener('keydown', e => {
  if (!$('#studio').hidden || pane !== 'cover' || cdTab !== 'draw' || document.body.dataset.view !== 'editor' || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? coverCtl.redoOne() : coverCtl.undo(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); coverCtl.redoOne(); }
});
addEventListener('keydown', e => {
  if (pane !== 'cover' || !sel || document.body.dataset.view !== 'editor' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const s = selSticker(), cv = book.cover;
  if ((e.key === 'Delete' || e.key === 'Backspace') && s) { e.preventDefault(); cv.stickers.splice(cv.stickers.indexOf(s), 1); sel = null; renderSelbar(); coverChanged(); return; }
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d) return;
  e.preventDefault(); const m = e.shiftKey ? 40 : 8;
  if (s) { s.x += d[0] * m; s.y += d[1] * m; } else if (sel.type === 'title') { cv.tx += d[0] * m; cv.ty += d[1] * m; } else { cv.ax += d[0] * m; cv.ay += d[1] * m; }
  coverChanged();
});

/* ═══════════ 미리보기·내보내기 ═══════════ */
$('#btnPv').onclick = () => { document.body.classList.toggle('nopv'); if (!document.body.classList.contains('nopv')) { if (pane === 'cover') setPane('write'); schedulePreview(10); } };
$('#btnPvClose').onclick = () => document.body.classList.add('nopv');
$('#btnPvFull').onclick = () => $('#pvBox').classList.toggle('full');
$$('.nav-i').forEach(b => b.onclick = () => setPane(b.dataset.pane));
$('#btnLib').onclick = () => setView('library');
$('#brandHome').onclick = () => setView('library');

function renderExportCheck() {
  const st = bookStats(book), out = [];
  const ck = (ok, t) => out.push(\`<div class="ck \${ok ? 'ok' : 'warn'}"><span class="d">\${ok ? '✓' : '!'}</span><span>\${t}</span></div>\`);
  ck(!!book.title.trim(), book.title.trim() ? '책 제목 있음' : '책 제목이 비어 있음');
  ck(!!book.author.trim(), book.author.trim() ? '지은이 있음' : '지은이가 비어 있음');
  const empty = book.chapters.filter(c => c.kind !== 'part' && !c.body.trim() && !c.image);
  ck(!empty.length, empty.length ? \`빈 장 \${empty.length}개: \${esc(empty.slice(0, 3).map(c => c.title || '제목 없음').join(', '))}\${empty.length > 3 ? ' …' : ''}\` : '빈 장 없음');
  ck(!!book.blurb.trim(), book.blurb.trim() ? '책 소개 있음' : '책 소개가 없음 (뒤표지에 기본 문구가 들어감)');
  $('#expCheck').innerHTML = \`<h4>내보내기 전 점검</h4>\${out.join('')}<div class="ms-rule" style="margin:12px 0"></div>
<div class="sumline"><span>장</span><b>\${st.chs}개</b></div><div class="sumline"><span>글자</span><b>\${fmtN(st.chars)}자</b></div><div class="sumline"><span>그림</span><b>\${st.imgs}장</b></div>\`;
}
$('#btnExport').onclick = () => { renderExportCheck(); $('#mExport').classList.add('on'); };
let pdfSize = 'a5';
$('#pdfSeg').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; pdfSize = b.dataset.v; $$('#pdfSeg button').forEach(x => x.classList.toggle('on', x === b)); });
async function busy(btn, fn) {
  const t = btn.innerHTML; btn.disabled = true; btn.textContent = '만드는 중…';
  try { await fn(); } catch (err) { console.error(err); toast('문제가 생김: ' + err.message, 4000); }
  finally { btn.disabled = false; btn.innerHTML = t; }
}
$('#xEpub').onclick = e => busy(e.currentTarget, async () => { download(await buildEPUB(book), safeName(book.title) + '.epub'); toast('EPUB을 내려받음'); });
$('#xHtml').onclick = e => busy(e.currentTarget, async () => { download(new Blob([await buildReaderHTML(book, false)], { type: 'text/html' }), safeName(book.title) + '.html'); toast('웹 책을 내려받음'); });
$('#xPdf').onclick = e => busy(e.currentTarget, async () => { toast('인쇄 창에서 대상을 "PDF로 저장"으로 고름', 4000); await printPDF(book, pdfSize); });
$('#xJson').onclick = () => saveBookFile(book);

/* ═══════════ 학급 문집 엮기 ═══════════ */
let anth = { items: [], title: '', subtitle: '', editor: '', theme: 'forest' };
const anthThumbs = new Map();
function saveAnth() { store.set('anth', anth).catch(() => {}); }
async function renderAnth() {
  $('#aTitle').value = anth.title; $('#aSub').value = anth.subtitle; $('#aEditor').value = anth.editor;
  themeSwatches($('#aTheme'), anth.theme);
  const rows = $('#anthRows');
  $('#anthCount').textContent = anth.items.length;
  if (!anth.items.length) rows.innerHTML = \`<tr><td colspan="6" class="empty-row">아직 넣은 작품이 없음. 위에서 학생 책 파일을 넣음.</td></tr>\`;
  else rows.innerHTML = anth.items.map((it, i) => {
    const b = it.book, st = bookStats(b);
    return \`<tr data-i="\${i}"><td class="no">\${i + 1}</td><td><canvas class="cvs" width="102" height="144" data-k="\${b.uuid}"></canvas></td>
<td><div class="tt">\${esc(b.title || '제목 없는 책')}</div><div class="au">\${esc(b.author || '지은이 없음')} · \${it.src === 'shelf' ? '내 서재' : '파일'}</div></td>
<td class="num">\${st.chs}</td><td class="num">\${fmtN(st.chars)}</td>
<td style="white-space:nowrap"><button class="iconbtn" data-a="up">\${icon('up', 's')}</button><button class="iconbtn" data-a="down">\${icon('down', 's')}</button><button class="iconbtn" data-a="del" title="빼기">\${icon('x', 's')}</button></td></tr>\`;
  }).join('');
  const tot = anth.items.reduce((a, it) => { const s = bookStats(it.book); a.c += s.chs; a.n += s.chars; a.g += s.imgs; return a; }, { c: 0, n: 0, g: 0 });
  $('#sumWorks').textContent = anth.items.length + '편'; $('#sumChs').textContent = tot.c + '개';
  $('#sumChars').textContent = fmtN(tot.n) + '자'; $('#sumImgs').textContent = tot.g + '장';
  $('#btnMakeAnth').disabled = !anth.items.length;
  for (const cvs of $$('canvas[data-k]', rows)) {
    const it = anth.items.find(x => x.book.uuid === cvs.dataset.k);
    let src = anthThumbs.get(cvs.dataset.k);
    if (!src) { src = await coverJPEG(it.book, 240, 0.8); anthThumbs.set(cvs.dataset.k, src); }
    const im = await loadImg(src); if (im) cvs.getContext('2d').drawImage(im, 0, 0, cvs.width, cvs.height);
  }
}
function addAnthBooks(list, src) {
  let added = 0, dup = 0;
  for (const b of list) {
    if (anth.items.some(x => x.book.uuid === b.uuid)) { dup++; continue; }
    anth.items.push({ src, book: b }); added++;
  }
  saveAnth(); renderAnth();
  toast(\`\${added}편을 넣음\${dup ? \` · 이미 있는 \${dup}편은 건너뜀\` : ''}\`);
}
async function anthFromFiles(files) {
  const list = [];
  for (const f of files) { try { list.push(await parseBookFile(f)); } catch (err) { toast(err.message, 4000); } }
  if (list.length) addAnthBooks(list, 'file');
}
$('#btnAnth').onclick = () => setView('anth');
$('#btnAnthBack').onclick = () => setView('library');
$('#btnAnthFiles').onclick = () => $('#fileAnth').click();
$('#fileAnth').onchange = e => { const f = Array.from(e.target.files); e.target.value = ''; anthFromFiles(f); };
const drop = $('#drop');
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => anthFromFiles(Array.from(e.dataTransfer.files).filter(f => /\\.json$/i.test(f.name))));
$('#btnAnthShelf').onclick = () => {
  const books = shelf.books.filter(b => b.genre !== '문집');
  $('#pickList').innerHTML = books.length ? books.map(b => \`<label class="check"><input type="checkbox" value="\${b.id}" \${anth.items.some(x => x.book.uuid === b.uuid) ? 'disabled' : ''}><span>\${esc(b.title || '제목 없는 책')}<small>\${esc(b.author || '지은이 없음')} · \${bookStats(b).chs}장</small></span></label>\`).join('') : '<p class="help">서재에 책이 없음.</p>';
  $('#mPick').classList.add('on');
};
$('#btnPickOk').onclick = () => {
  const ids = $$('#pickList input:checked').map(x => x.value);
  $('#mPick').classList.remove('on');
  if (ids.length) addAnthBooks(ids.map(id => clone(shelf.books.find(b => b.id === id))), 'shelf');
};
$('#anthRows').addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const i = +b.closest('tr').dataset.i, a = anth.items;
  if (b.dataset.a === 'up' && i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]];
  else if (b.dataset.a === 'down' && i < a.length - 1) [a[i + 1], a[i]] = [a[i], a[i + 1]];
  else if (b.dataset.a === 'del') a.splice(i, 1);
  saveAnth(); renderAnth();
});
$('#anthSort').onchange = e => {
  const k = e.target.value; e.target.value = ''; const cmp = (x, y) => String(x).localeCompare(String(y), 'ko');
  if (k === 'author') anth.items.sort((a, b) => cmp(a.book.author, b.book.author));
  else if (k === 'title') anth.items.sort((a, b) => cmp(a.book.title, b.book.title));
  else if (k === 'reverse') anth.items.reverse();
  saveAnth(); renderAnth();
};
$('#btnAnthClear').onclick = () => { if (anth.items.length && confirm('넣은 작품을 모두 뺄까요? (원래 파일은 그대로 남음)')) { anth.items = []; saveAnth(); renderAnth(); } };
[['#aTitle', 'title'], ['#aSub', 'subtitle'], ['#aEditor', 'editor']].forEach(([s, k]) => $(s).addEventListener('input', e => { anth[k] = e.target.value; saveAnth(); }));
$('#aTheme').addEventListener('click', e => { const b = e.target.closest('[data-theme]'); if (!b) return; anth.theme = b.dataset.theme; themeSwatches($('#aTheme'), anth.theme); saveAnth(); });
async function mosaicImage(books, th) {
  // '위아래 나눔' 표지의 그림 칸(1000×820)과 같은 비율로 만듦
  const W = 1000, H = 820, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.fillStyle = th.c2; x.fillRect(0, 0, W, H);
  const n = Math.min(books.length, 20);
  let best = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols), gap = 18;
    const cw = Math.min((W - gap * (cols + 1)) / cols, ((H - gap * (rows + 1)) / rows) / 1.414);
    if (!best || cw > best.cw) best = { cols, rows, cw, gap };
  }
  const { cols, rows, cw, gap } = best, ch = cw * 1.414;
  const ox = (W - (cols * cw + (cols - 1) * gap)) / 2, oy = (H - (rows * ch + (rows - 1) * gap)) / 2;
  for (let i = 0; i < n; i++) {
    const im = await loadImg(await coverJPEG(books[i], 400, 0.85));
    const px = ox + (i % cols) * (cw + gap), py = oy + Math.floor(i / cols) * (ch + gap);
    x.save(); x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = 14; x.shadowOffsetY = 5;
    x.save(); x.translate(px + cw / 2, py + ch / 2); x.rotate(((i * 37) % 7 - 3) * Math.PI / 180);
    if (im) x.drawImage(im, -cw / 2, -ch / 2, cw, ch);
    x.restore(); x.restore();
  }
  return c.toDataURL('image/jpeg', 0.88);
}
$('#btnMakeAnth').onclick = e => busy(e.currentTarget, async () => {
  if (!anth.items.length) return;
  const nb = newBook('class');
  Object.assign(nb, { title: anth.title.trim() || '우리 반 문집', subtitle: anth.subtitle.trim(), author: anth.editor.trim() || '우리 반', publisher: anth.editor.trim(), genre: '문집', theme: anth.theme, bodyStyle: 'modern' });
  nb.blurb = \`\${anth.items.length}명의 작가가 한 편씩 모아 엮은 문집임. \` + anth.items.slice(0, 6).map(it => \`「\${it.book.title || '제목 없는 책'}」\`).join(', ') + (anth.items.length > 6 ? ' 등' : '') + '이 실려 있음.';
  const th = themeOf(nb), divider = $('#oDivider').checked;
  nb.chapters = [];
  if ($('#oPreface').checked) nb.chapters.push(newChapter({ title: '머리말', hint: '이 문집을 엮은 까닭, 함께한 친구들, 담긴 작품을 소개함.' }));
  for (const it of anth.items) {
    const sb = it.book;
    if (divider) nb.chapters.push(newChapter({ kind: 'part', title: sb.title || '제목 없는 책', author: sb.author || '', image: await coverJPEG(sb, 640, 0.85), hint: '작가의 말 (없어도 됨)' }));
    sb.chapters.forEach(c => nb.chapters.push(newChapter({ title: c.title, body: c.body, image: c.image, layout: c.layout || 'normal', author: divider ? (c.author || '') : (c.author || sb.author || ''), hint: c.hint || '' })));
  }
  if ($('#oAfter').checked) nb.chapters.push(newChapter({ title: '맺음말', hint: '1년을 돌아보며 하고 싶은 말을 씀.' }));
  if ($('#oMosaic').checked) { nb.cover.image = await mosaicImage(anth.items.map(x => x.book), th); nb.cover.layout = 'split'; nb.cover.zoom = 1; }
  shelf.books.push(nb); persist();
  openBook(nb.id, 'write');
  toast(\`문집을 만듦: 작품 \${anth.items.length}편 · 원고 \${nb.chapters.length}개\`, 3500);
});

/* ═══════════ 공통: 창 닫기 · 단축키 ═══════════ */
$$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) m.classList.remove('on'); }));
addEventListener('keydown', e => {
  if (e.key === 'Escape') { $$('.modal.on').forEach(m => m.classList.remove('on')); $('#pvBox').classList.remove('full'); if (sel) { sel = null; renderSelbar(); drawStage(); } }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); persist(); toast('이 기기에 자동 저장되고 있음'); }
});

/* ═══════════ 시작 ═══════════ */
(async function init() {
  paintIcons();
  if (innerWidth < 1180) document.body.classList.add('nopv'); // 작은 화면은 미리보기를 닫은 채 시작
  const saved = await store.get('shelf');
  if (saved && Array.isArray(saved.books) && saved.books.length) {
    shelf = saved; shelf.books = shelf.books.map(migrate);
  } else {
    const first = newBook('story');
    first.title = '첫 번째 나의 책'; first.author = '다람이';
    first.blurb = '숲속 다람이가 처음으로 혼자 숲을 건너며 겪는 하루를 담은 이야기임.';
    first.chapters[0].body = '이곳은 첫 장임. 이 글을 지우고 나만의 이야기를 씀.\\n\\n빈 줄을 한 번 넣으면 새 문단이 됨. **굵게**, *기울여* 쓸 수도 있음.\\n\\n# 소제목도 넣을 수 있음\\n\\n> 이렇게 쓰면 인용이 됨.\\n\\n---\\n\\n오른쪽 미리보기에서 책장을 넘겨 보면 실제 e북 모양을 확인할 수 있음.';
    shelf = { books: [first], currentId: null };
    persist();
  }
  const a = await store.get('anth');
  if (a && Array.isArray(a.items)) { anth = Object.assign(anth, a); anth.items.forEach(it => it.book = migrate(it.book)); }
  setView('library');
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (document.body.dataset.view === 'library') renderLibrary(); });
})();
</script>
</body>
</html>
`;

export default {
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/favicon.ico') return new Response(null, { status: 204 });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    return new Response(APP_HTML, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-cache'
      }
    });
  }
};
