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
<title>📚 다람쌤 e북 공방</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&family=Noto+Serif+KR:wght@400;700&display=swap" rel="stylesheet">
<style>
:root{
  --brown:#8B4513; --brown-dark:#5C2E0D; --orange:#E8871E;
  --cream:#FBF4E9; --card:#FFFDF8; --line:#E8DCC8;
  --text:#3D2B1F; --muted:#8A7562; --danger:#C62828; --ok:#2E7D32;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{font-family:'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif;background:var(--cream);color:var(--text)}
button,input,textarea,select{font-family:inherit;font-size:inherit;color:inherit}
button{cursor:pointer}

/* ─── 위쪽 띠 ─── */
nav{background:var(--brown);color:#FFF4E3;display:flex;align-items:center;gap:10px;padding:10px 16px;position:sticky;top:0;z-index:30;box-shadow:0 2px 8px rgba(92,46,13,.25);flex-wrap:wrap}
nav .brand{font-family:'Noto Serif KR',serif;font-weight:700;font-size:1.15rem;white-space:nowrap}
nav .grow{flex:1}
nav .status{font-size:.82rem;opacity:.85;white-space:nowrap}
nav button{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.3);color:#FFF4E3;border-radius:8px;padding:6px 12px;font-size:.9rem}
nav button:hover{background:rgba(255,255,255,.25)}

/* ─── 큰 틀: 왼쪽 편집 / 오른쪽 미리보기 ─── */
main{display:grid;grid-template-columns:minmax(340px,520px) 1fr;gap:16px;padding:16px;height:calc(100vh - 56px)}
.panel{background:var(--card);border:1px solid var(--line);border-radius:14px;display:flex;flex-direction:column;min-height:0;overflow:hidden}
.tabs{display:flex;border-bottom:1px solid var(--line)}
.tabs button{flex:1;background:none;border:none;padding:12px 6px;font-weight:700;color:var(--muted);border-bottom:3px solid transparent}
.tabs button.on{color:var(--brown);border-bottom-color:var(--orange)}
.tabbody{padding:16px;overflow:auto;flex:1;min-height:0}
.tab{display:none}.tab.on{display:block}

label.f{display:block;font-size:.85rem;font-weight:700;color:var(--muted);margin:14px 0 6px}
label.f:first-child{margin-top:0}
input[type=text],textarea,select{width:100%;border:1px solid var(--line);background:#fff;border-radius:9px;padding:9px 11px;outline:none}
input[type=text]:focus,textarea:focus,select:focus{border-color:var(--orange);box-shadow:0 0 0 3px rgba(232,135,30,.15)}
.hint{font-size:.8rem;color:var(--muted);margin-top:5px;line-height:1.5}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.btn{background:#fff;border:1px solid var(--line);border-radius:9px;padding:8px 13px;font-size:.9rem}
.btn:hover{border-color:var(--orange)}
.btn.main{background:var(--orange);border-color:var(--orange);color:#fff;font-weight:700}
.btn.main:hover{background:#d4761a}
.btn.danger{color:var(--danger)}
.btn.sm{padding:4px 9px;font-size:.8rem}

.swatches{display:flex;gap:8px;flex-wrap:wrap}
.swatch{width:42px;height:42px;border-radius:10px;border:3px solid transparent;box-shadow:0 1px 3px rgba(0,0,0,.2)}
.swatch.on{border-color:var(--text)}
.choices{display:flex;gap:6px;flex-wrap:wrap}
.choices button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 13px;font-size:.88rem}
.choices button.on{background:var(--brown);border-color:var(--brown);color:#fff}

.coverbox{display:flex;gap:14px;align-items:flex-start;margin-top:6px}
.coverbox canvas{width:120px;border-radius:4px;box-shadow:0 3px 10px rgba(0,0,0,.25);flex:none}

/* 장 목록 */
.chlist{list-style:none;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.chlist li{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--line);background:#fff;cursor:pointer}
.chlist li:last-child{border-bottom:none}
.chlist li.on{background:#FDEBD3}
.chlist .num{width:24px;height:24px;border-radius:50%;background:var(--line);font-size:.75rem;display:grid;place-items:center;flex:none}
.chlist li.on .num{background:var(--orange);color:#fff}
.chlist .t{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chlist .t small{color:var(--muted);margin-left:6px}
.chlist .ops button{background:none;border:none;padding:2px 5px;border-radius:5px;color:var(--muted)}
.chlist .ops button:hover{background:var(--line);color:var(--text)}

.editor{margin-top:14px;border-top:2px dashed var(--line);padding-top:14px}
.toolbar{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px}
.toolbar button{border:1px solid var(--line);background:#fff;border-radius:7px;padding:4px 9px;font-size:.82rem}
.toolbar button:hover{border-color:var(--orange)}
textarea#chBody{min-height:300px;line-height:1.75;resize:vertical;font-family:'Noto Serif KR',serif}
.imgprev{display:flex;gap:10px;align-items:center;margin-top:6px}
.imgprev img{max-width:120px;max-height:90px;border-radius:6px;border:1px solid var(--line)}
.count{text-align:right;font-size:.78rem;color:var(--muted);margin-top:4px}

/* 내보내기 */
.exp{border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px;background:#fff}
.exp h3{font-size:1rem;margin-bottom:4px}
.exp p{font-size:.84rem;color:var(--muted);line-height:1.6;margin-bottom:10px}
.check{margin:0 0 14px;padding:12px 14px;border-radius:10px;background:#FFF6E5;border:1px solid #F3D9A8;font-size:.85rem;line-height:1.7}
.check b{color:var(--brown)}

/* 미리보기 */
.preview{background:#5b4a3c;border-radius:14px;position:relative;overflow:hidden;min-height:0}
.preview iframe{width:100%;height:100%;border:none;display:block}
.preview .lab{position:absolute;top:10px;left:12px;color:#fff;font-size:.78rem;background:rgba(0,0,0,.35);padding:3px 9px;border-radius:999px;pointer-events:none;z-index:2}
.preview .big{position:absolute;top:8px;right:10px;z-index:2;background:rgba(0,0,0,.35);color:#fff;border:1px solid rgba(255,255,255,.4);border-radius:8px;padding:4px 10px;font-size:.8rem}
.preview.full{position:fixed;inset:0;border-radius:0;z-index:60}

/* 책장 · 새 책 창 */
.modal{position:fixed;inset:0;background:rgba(40,25,15,.55);display:none;align-items:center;justify-content:center;z-index:80;padding:16px}
.modal.on{display:flex}
.modal .box{background:var(--card);border-radius:16px;max-width:760px;width:100%;max-height:90vh;overflow:auto;padding:22px;box-shadow:0 10px 40px rgba(0,0,0,.35)}
.modal h2{font-family:'Noto Serif KR',serif;font-size:1.25rem;margin-bottom:6px}
.modal .sub{color:var(--muted);font-size:.88rem;margin-bottom:16px}
.shelf{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:16px}
.shelf .bk{cursor:pointer;text-align:center}
.shelf .bk canvas{width:100%;border-radius:4px;box-shadow:0 3px 10px rgba(0,0,0,.25);transition:transform .15s}
.shelf .bk:hover canvas{transform:translateY(-4px)}
.shelf .bk.cur canvas{outline:3px solid var(--orange);outline-offset:3px}
.shelf .bk .nm{font-size:.85rem;margin-top:6px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.shelf .bk .dt{font-size:.72rem;color:var(--muted)}
.shelf .bk .del{font-size:.72rem;color:var(--danger);background:none;border:none;margin-top:2px}
.tpls{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
.tpl{border:1px solid var(--line);background:#fff;border-radius:12px;padding:14px;text-align:left}
.tpl:hover{border-color:var(--orange);box-shadow:0 2px 8px rgba(232,135,30,.2)}
.tpl .ic{font-size:1.6rem}
.tpl b{display:block;margin:4px 0 2px}
.tpl span{font-size:.8rem;color:var(--muted);line-height:1.5}

.toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(20px);background:#3D2B1F;color:#fff;padding:10px 18px;border-radius:999px;font-size:.9rem;opacity:0;transition:.25s;z-index:100;pointer-events:none;max-width:90vw;text-align:center}
.toast.on{opacity:1;transform:translateX(-50%) translateY(0)}

@media (max-width:860px){
  main{grid-template-columns:1fr;height:auto}
  .panel{max-height:none}
  .tabbody{overflow:visible}
  .preview{height:78vh}
}
@media print{body>*:not(#printFrame){display:none!important}}
</style>
</head>
<body>

<nav>
  <span class="brand">📚 다람쌤 e북 공방</span>
  <span class="grow"></span>
  <span class="status" id="saveStatus">저장됨 ✓</span>
  <button id="btnShelf">🗂 내 책장</button>
  <button id="btnNew">＋ 새 책</button>
</nav>

<main>
  <section class="panel">
    <div class="tabs">
      <button data-tab="info" class="on">① 책 정보·표지</button>
      <button data-tab="write">② 내용 쓰기</button>
      <button data-tab="export">③ e북 내보내기</button>
    </div>
    <div class="tabbody">

      <!-- ① 책 정보 -->
      <div class="tab on" id="tab-info">
        <label class="f" for="bTitle">책 제목</label>
        <input type="text" id="bTitle" maxlength="60" placeholder="예: 우리 반 이야기 숲">
        <label class="f" for="bSub">부제목 (없어도 됨)</label>
        <input type="text" id="bSub" maxlength="80" placeholder="예: 6학년 3반 1년 글모음">
        <label class="f" for="bAuthor">지은이</label>
        <input type="text" id="bAuthor" maxlength="40" placeholder="예: 다람이">
        <div class="hint">🔒 실명 대신 <b>별명</b>을 쓰는 것을 권장함. 입력한 내용은 이 기기 안에만 저장됨.</div>
        <label class="f" for="bPub">펴낸 곳 (없어도 됨)</label>
        <input type="text" id="bPub" maxlength="40" placeholder="예: 다람 출판사 / 6학년 3반">

        <label class="f">표지 색</label>
        <div class="swatches" id="swatches"></div>
        <label class="f">표지 모양</label>
        <div class="choices" id="coverStyles"></div>
        <label class="f">본문 글꼴</label>
        <div class="choices" id="fontChoices"></div>

        <label class="f">표지 그림</label>
        <div class="coverbox">
          <canvas id="coverThumb" width="400" height="566"></canvas>
          <div>
            <div class="row">
              <button class="btn" id="btnCoverImg">🖼 그림 고르기</button>
              <button class="btn danger" id="btnCoverDel">지우기</button>
            </div>
            <div class="hint">직접 그린 그림을 사진으로 찍어 올리면 좋음.<br>얼굴이 나온 사진은 올리지 않음.</div>
          </div>
        </div>
        <input type="file" id="fileCover" accept="image/*" hidden>
      </div>

      <!-- ② 내용 쓰기 -->
      <div class="tab" id="tab-write">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <b>차례</b>
          <button class="btn sm main" id="btnAddCh">＋ 새 장 추가</button>
        </div>
        <ul class="chlist" id="chList"></ul>

        <div class="editor" id="chEditor">
          <label class="f" for="chTitle">장 제목</label>
          <input type="text" id="chTitle" maxlength="60">
          <label class="f">쪽 모양</label>
          <div class="choices" id="layoutChoices"></div>
          <label class="f">그림 (없어도 됨)</label>
          <div class="imgprev">
            <img id="chImgPrev" alt="" hidden>
            <button class="btn sm" id="btnChImg">🖼 그림 넣기</button>
            <button class="btn sm danger" id="btnChImgDel" hidden>지우기</button>
          </div>
          <input type="file" id="fileCh" accept="image/*" hidden>
          <label class="f" for="chBody">본문</label>
          <div class="toolbar">
            <button data-fmt="bold" title="Ctrl+B"><b>굵게</b></button>
            <button data-fmt="italic"><i>기울임</i></button>
            <button data-fmt="h">소제목</button>
            <button data-fmt="quote">“인용”</button>
            <button data-fmt="hr">✱ 장면 나눔</button>
          </div>
          <textarea id="chBody"></textarea>
          <div class="count" id="chCount"></div>
          <div class="hint">빈 줄 한 번 = 새 문단 · <b>**굵게**</b> · <i>*기울임*</i> · 줄 맨 앞 <b># </b>= 소제목 · <b>&gt; </b>= 인용 · <b>---</b> = 장면 나눔</div>
        </div>
      </div>

      <!-- ③ 내보내기 -->
      <div class="tab" id="tab-export">
        <div class="check" id="checkBox"></div>

        <div class="exp">
          <h3>📗 EPUB 파일 (진짜 전자책)</h3>
          <p>교보·리디·밀리의 서재·애플 북스·구글 플레이 북 등 전자책 앱에서 열리는 표준 형식임. 글자 크기를 독자가 바꿀 수 있음.</p>
          <button class="btn main" id="btnEpub">EPUB 내려받기</button>
        </div>

        <div class="exp">
          <h3>📕 PDF (인쇄·제출용)</h3>
          <p>인쇄 창이 열리면 <b>대상(프린터)</b>을 <b>"PDF로 저장"</b>으로 바꾼 뒤 저장함. 종이로 바로 뽑아 책으로 엮어도 됨.</p>
          <div class="row">
            <select id="pdfSize" style="width:auto">
              <option value="a5">A5 (작은 책)</option>
              <option value="a4">A4 (큰 책)</option>
              <option value="b6">B6 (문고본)</option>
            </select>
            <button class="btn main" id="btnPdf">PDF 만들기</button>
          </div>
        </div>

        <div class="exp">
          <h3>🌐 웹 책 (HTML 파일 한 개)</h3>
          <p>앱 설치 없이 더블클릭만 하면 책장 넘기듯 읽을 수 있는 파일임. 패들렛·밴드·클래스룸에 올려 친구에게 보여 주기 좋음.</p>
          <button class="btn main" id="btnHtml">웹 책 내려받기</button>
        </div>

        <div class="exp">
          <h3>💾 책 파일 저장 · 불러오기</h3>
          <p>쓰던 책을 파일(.ebook.json)로 저장해 두면 다른 기기에서 이어서 쓸 수 있음. 선생님께 제출할 때도 이 파일을 쓰면 됨.</p>
          <div class="row">
            <button class="btn" id="btnSaveFile">책 파일 저장</button>
            <button class="btn" id="btnLoadFile">책 파일 불러오기</button>
          </div>
          <input type="file" id="fileProject" accept=".json,application/json" hidden>
        </div>
      </div>
    </div>
  </section>

  <section class="preview" id="previewBox">
    <span class="lab">미리보기 · 실제 웹 책과 같은 모양</span>
    <button class="big" id="btnBig">⛶ 크게 보기</button>
    <iframe id="previewFrame" title="e북 미리보기"></iframe>
  </section>
</main>

<!-- 내 책장 -->
<div class="modal" id="shelfModal">
  <div class="box">
    <div class="row" style="justify-content:space-between">
      <h2>🗂 내 책장</h2>
      <button class="btn" data-close>닫기</button>
    </div>
    <p class="sub">책을 누르면 이어서 쓸 수 있음. 책은 이 기기의 브라우저에만 보관됨.</p>
    <div class="shelf" id="shelfGrid"></div>
  </div>
</div>

<!-- 새 책 -->
<div class="modal" id="newModal">
  <div class="box">
    <div class="row" style="justify-content:space-between">
      <h2>＋ 어떤 책을 만들까요?</h2>
      <button class="btn" data-close>닫기</button>
    </div>
    <p class="sub">틀을 고르면 차례가 미리 만들어짐. 나중에 얼마든지 고칠 수 있음.</p>
    <div class="tpls" id="tplGrid"></div>
  </div>
</div>

<div class="toast" id="toast"></div>
<iframe id="printFrame" style="position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden" title="인쇄용"></iframe>

<!-- ══════════ 웹 책(읽기 화면) 틀: 미리보기와 HTML 내보내기가 함께 씀 ══════════ -->
<script type="text/plain" id="readerCSS">
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
body{background:__DESK__;font-family:__FONT__;color:#2b2420;-webkit-user-select:none;user-select:none;touch-action:pan-y}
#stage{position:absolute;inset:0 0 56px 0;display:flex;align-items:center;justify-content:center}
#viewport{position:relative;overflow:hidden;background:__PAPER__;box-shadow:0 10px 30px rgba(0,0,0,.35);border-radius:3px}
#viewport.spread::after{content:"";position:absolute;top:0;bottom:0;left:50%;width:46px;margin-left:-23px;background:linear-gradient(90deg,rgba(0,0,0,0),rgba(0,0,0,.09) 45%,rgba(0,0,0,.14) 50%,rgba(0,0,0,.09) 55%,rgba(0,0,0,0));pointer-events:none}
#flow{position:absolute;column-fill:auto;font-size:var(--fs,17px);transition:transform .35s ease}
#flow.noanim{transition:none}
.pno{position:absolute;bottom:8px;font-size:12px;color:#a0948a;width:50%;text-align:center;pointer-events:none}
section{break-before:column;-webkit-column-break-before:always}
section:first-child{break-before:auto;-webkit-column-break-before:auto}
.cover{height:100%;display:flex;align-items:center;justify-content:center}
.cover img{max-width:100%;max-height:100%;box-shadow:0 2px 10px rgba(0,0,0,.25)}
#bar{position:fixed;left:0;right:0;bottom:0;height:56px;background:rgba(30,22,16,.92);color:#fff;display:flex;align-items:center;justify-content:center;gap:6px;font-family:'Noto Sans KR','Malgun Gothic',sans-serif;font-size:14px}
#bar button{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);color:#fff;border-radius:8px;padding:7px 12px;font-size:14px;cursor:pointer}
#bar button:hover{background:rgba(255,255,255,.25)}
#bar .pg{min-width:84px;text-align:center}
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
    flow.style.setProperty('--imgmax',Math.floor((ph-2*P)*0.62)+'px');
    flow.style.setProperty('--imgfull',Math.floor((ph-2*P)*0.8)+'px');
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
  try{parent.postMessage({ebookReady:1},'*');}catch(e){}
})();
</script>

<script>
'use strict';
/* ═══════════════════════════════════════════════════════════════
   다람쌤 e북 공방 — 화면 한 개짜리 무료 e북 제작기
   · 서버·외부 라이브러리 없음. 모든 작업은 이 기기 안에서 처리함.
   · 책은 브라우저 저장소(IndexedDB)에만 보관함.
   · EPUB 압축(zip)도 직접 만듦(무압축 방식).
   ═══════════════════════════════════════════════════════════════ */

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/* ─── 기본 설정값 ─── */
const THEMES = {
  sky:    { name:'하늘',  c1:'#4a90d9', c2:'#1f4f86', ink:'#ffffff', accent:'#2a6db0', paper:'#fdfcf8', desk:'#3b4a5c' },
  forest: { name:'숲',    c1:'#4f9a6a', c2:'#22573a', ink:'#ffffff', accent:'#2f7a4d', paper:'#fbfcf7', desk:'#3c4a40' },
  sunset: { name:'노을',  c1:'#f0925a', c2:'#b8452e', ink:'#ffffff', accent:'#c9572f', paper:'#fffaf4', desk:'#5b4236' },
  night:  { name:'밤하늘', c1:'#3a3f7a', c2:'#141633', ink:'#fff3c4', accent:'#4b4fa0', paper:'#fbfaf6', desk:'#26283d' },
  cherry: { name:'벚꽃',  c1:'#f2a9c0', c2:'#c9637f', ink:'#ffffff', accent:'#c2537a', paper:'#fffafb', desk:'#5a3e47' },
  paper:  { name:'한지',  c1:'#f3e7cf', c2:'#d9c39b', ink:'#4a3424', accent:'#8b4513', paper:'#fdf9f0', desk:'#5b4a3c' },
  mint:   { name:'민트',  c1:'#7fd1c3', c2:'#2d8f81', ink:'#ffffff', accent:'#25796d', paper:'#f9fdfc', desk:'#34504b' },
  gold:   { name:'금빛',  c1:'#e7c062', c2:'#a5761f', ink:'#3a2a0c', accent:'#9a6b14', paper:'#fffcf3', desk:'#4d3f25' }
};
const COVER_STYLES = { band:'그림 위·제목 아래', full:'그림 가득', frame:'테두리 액자', plain:'글자만' };
const FONTS = {
  serif: { name:'명조 (책 느낌)', css:"'Noto Serif KR','Nanum Myeongjo','Batang',serif" },
  sans:  { name:'고딕 (깔끔)',   css:"'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif" }
};
const LAYOUTS = { normal:'보통 글', picture:'그림책 (그림 크게)', poem:'시 (가운데 정렬)' };
const PAGE_SIZES = { a5:['148mm','210mm'], a4:['210mm','297mm'], b6:['128mm','182mm'] };

const TEMPLATES = [
  { id:'blank', ic:'📄', name:'빈 책', desc:'장 하나로 시작함. 자유롭게 구성함.',
    chapters:[{ title:'1장', hint:'여기에 이야기를 씀.' }] },
  { id:'picture', ic:'🎨', name:'그림책', desc:'장면마다 그림 한 장과 짧은 글을 넣음.', layout:'picture', cover:'band', theme:'sunset',
    chapters:[1,2,3,4,5,6].map(n => ({ title:'장면 '+n, hint:'이 장면의 그림을 넣고, 한두 문장으로 무슨 일이 일어나는지 씀.' })) },
  { id:'story', ic:'📖', name:'동화·소설', desc:'발단-전개-위기-절정-결말 다섯 장.', theme:'night', cover:'frame',
    chapters:[
      { title:'1장. 발단', hint:'인물과 배경을 소개함. 누가, 언제, 어디에 있는지 보여 줌.' },
      { title:'2장. 전개', hint:'사건이 시작됨. 인물이 원하는 것은 무엇인지 씀.' },
      { title:'3장. 위기', hint:'일이 꼬이기 시작함. 어떤 어려움이 생기는지 씀.' },
      { title:'4장. 절정', hint:'갈등이 가장 커지는 장면. 인물은 어떤 선택을 하는지 씀.' },
      { title:'5장. 결말', hint:'사건이 어떻게 마무리되는지, 인물은 어떻게 달라졌는지 씀.' } ] },
  { id:'poem', ic:'🌸', name:'시집', desc:'시 한 편이 한 장이 됨. 가운데 정렬.', layout:'poem', theme:'cherry', cover:'plain',
    chapters:[1,2,3,4].map(n => ({ title:'시 '+n+' (제목을 바꿔 쓰세요)', hint:'한 줄씩 엔터로 행을 나눔.\\n빈 줄 한 번으로 연을 나눔.' })) },
  { id:'class', ic:'🏫', name:'학급 문집', desc:'머리말부터 친구들 작품, 맺음말까지.', theme:'forest', cover:'band',
    chapters:[
      { title:'머리말', hint:'이 문집을 만든 까닭과 담긴 내용을 소개함.' },
      { title:'우리 반을 소개합니다', hint:'우리 반의 자랑, 규칙, 기억에 남는 일을 씀.' },
      { title:'작품 1', hint:'친구 별명과 작품을 넣음. 작품마다 한 장씩 추가함.' },
      { title:'작품 2', hint:'' }, { title:'작품 3', hint:'' },
      { title:'맺음말', hint:'1년을 돌아보며 하고 싶은 말을 씀.' } ] },
  { id:'report', ic:'🔬', name:'탐구·체험 보고서', desc:'동기-과정-결과-느낀 점 순서.', theme:'mint', cover:'band',
    chapters:[
      { title:'1. 탐구 동기', hint:'왜 이 주제를 골랐는지, 궁금했던 점을 씀.' },
      { title:'2. 탐구 방법과 과정', hint:'준비물, 순서, 한 일을 차례대로 씀. 사진이나 그림을 넣으면 좋음.' },
      { title:'3. 결과', hint:'알게 된 사실을 정리함. 표나 그래프를 그림으로 넣어도 됨.' },
      { title:'4. 느낀 점과 더 알고 싶은 점', hint:'새롭게 알게 된 것과 다음에 해 보고 싶은 것을 씀.' } ] },
  { id:'diary', ic:'✏️', name:'나의 성장 일기', desc:'한 달에 한 장씩, 1년 기록.', theme:'gold', cover:'frame',
    chapters:['3월','4월','5월','6월','7월','9월','10월','11월','12월'].map(m => ({ title:m+' 이야기', hint:m+'에 가장 기억에 남는 일과 그때의 마음을 씀.' })) }
];

/* ─── 작은 도구들 ─── */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c === 'x' ? r : (r&3|8)).toString(16); }));
const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const safeName = (s) => (String(s || '').trim() || '나의 e북').replace(/[\\\\/:*?"<>|\\n\\r\\t]/g, '_').slice(0, 60);
const today = () => { const d = new Date(); return \`\${d.getFullYear()}. \${d.getMonth()+1}. \${d.getDate()}.\`; };
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

/* ─── 상태 ─── */
let shelf = { books: [], currentId: null };
let book = null;          // 지금 편집 중인 책
let curCh = 0;            // 지금 편집 중인 장 번호

function newBook(tplId = 'blank') {
  const t = TEMPLATES.find(x => x.id === tplId) || TEMPLATES[0];
  return {
    id: uid(), uuid: uuid(), created: Date.now(), updated: Date.now(),
    title: t.id === 'blank' ? '' : '', subtitle: '', author: '', publisher: '',
    theme: t.theme || 'sky', coverStyle: t.cover || 'band', font: 'serif', coverImage: null,
    chapters: t.chapters.map(c => ({ id: uid(), title: c.title, body: '', hint: c.hint || '', image: null, layout: t.layout || 'normal' }))
  };
}

let saveTimer = null;
function touch(opts = {}) {
  book.updated = Date.now();
  $('#saveStatus').textContent = '저장 중…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await store.set('shelf', shelf); $('#saveStatus').textContent = '저장됨 ✓'; }
    catch (e) { $('#saveStatus').textContent = '⚠ 저장 실패'; toast('기기 저장 공간이 부족함. ③에서 "책 파일 저장"으로 따로 보관할 것.', 5000); }
  }, 500);
  if (opts.cover !== false) scheduleCover();
  schedulePreview();
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
    if (lines.length === 1 && /^\\s*(-{3,}|\\*{3,}|✱)\\s*$/.test(lines[0])) { out.push('<p class="scene">✱ ✱ ✱</p>'); continue; }
    while (lines.length && /^#{1,3}\\s+/.test(lines[0])) { out.push('<h3>' + inline(lines.shift().replace(/^#{1,3}\\s+/, '')) + '</h3>'); }
    if (!lines.length) continue;
    if (lines.every(l => /^>\\s?/.test(l))) {
      out.push('<blockquote><p>' + lines.map(l => inline(l.replace(/^>\\s?/, ''))).join('<br/>') + '</p></blockquote>');
    } else {
      out.push('<p>' + lines.map(inline).join('<br/>') + '</p>');
    }
  }
  return out.join('\\n');
}
/* 장 하나를 HTML 조각으로. imgSrc: 그림 주소(미리보기는 data URL, EPUB은 파일 경로) */
function chapterHTML(ch, idx, imgSrc, emptyNote) {
  const body = formatBody(ch.body);
  const img = imgSrc ? \`<div class="fig"><img src="\${esc(imgSrc)}" alt="\${esc(ch.title)} 그림"/></div>\` : '';
  const empty = (!body && !img && emptyNote) ? \`<p class="empty">(아직 내용이 없음)</p>\` : '';
  return \`<section class="chapter lay-\${ch.layout || 'normal'}" id="ch\${idx + 1}">
<h2>\${esc(ch.title || (idx + 1) + '장')}</h2>
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
function tocHTML(b, linkFn) {
  return \`<section class="toc" id="toc">
<h2>차례</h2>
<ol>
\${b.chapters.map((c, i) => \`<li>\${linkFn(i, esc(c.title || (i + 1) + '장'))}</li>\`).join('\\n')}
</ol>
</section>\`;
}
function colophonHTML(b) {
  return \`<section class="colophon" id="colophon">
<div class="colo">
<p class="ct">\${esc(b.title || '제목 없는 책')}</p>
<p>만든 날 \${esc(today())}</p>
<p>지은이 \${esc(b.author || '-')}</p>
\${b.publisher ? \`<p>펴낸 곳 \${esc(b.publisher)}</p>\` : ''}
<p class="made">다람쌤 e북 공방에서 만듦</p>
</div>
</section>\`;
}
/* 본문 꾸밈(미리보기·EPUB·PDF 공통). CSS 변수 없이 실제 색을 넣어 전자책 앱 호환성을 높임 */
function contentCSS(b, mode) {
  const th = THEMES[b.theme] || THEMES.sky;
  const font = (FONTS[b.font] || FONTS.serif).css;
  const reader = mode === 'reader';
  return \`
body{font-family:\${font};line-height:1.85;color:#2b2420;word-break:keep-all;overflow-wrap:break-word}
h1{font-size:1.9em;line-height:1.35;color:\${th.accent};margin:0 0 .5em}
h2{font-size:1.35em;line-height:1.4;color:\${th.accent};margin:\${reader ? '0.2em' : '1.2em'} 0 1em;padding-bottom:.4em;border-bottom:2px solid \${th.accent}33}
h3{font-size:1.08em;color:\${th.accent};margin:1.2em 0 .5em}
p{margin:0 0 .85em;text-indent:1em;text-align:justify}
p.scene{text-indent:0;text-align:center;color:\${th.accent};letter-spacing:.4em;margin:1.3em 0}
blockquote{margin:1em 0;padding:.5em 1em;border-left:4px solid \${th.accent}66;background:\${th.accent}0d}
blockquote p{text-indent:0;margin:0}
strong{color:\${th.accent}}
.fig{text-align:center;margin:0 0 1em;break-inside:avoid;page-break-inside:avoid}
.fig img{max-width:100%;\${reader ? 'max-height:var(--imgmax,60vh);' : 'max-height:60vh;'}border-radius:4px}
.lay-picture h2{text-align:center;border-bottom:none}
.lay-picture .fig img{\${reader ? 'max-height:var(--imgfull,75vh);' : 'max-height:75vh;'}}
.lay-picture p{text-indent:0;text-align:center;font-size:1.08em}
.lay-poem h2{text-align:center;border-bottom:none}
.lay-poem p{text-indent:0;text-align:center;line-height:2;margin-bottom:1.4em}
.empty{color:#b8aca2;text-indent:0;text-align:center;margin-top:2em}
.titlepage{text-align:center;padding-top:28%}
.titlepage .subtitle{text-indent:0;text-align:center;font-size:1.05em;color:#6d625a}
.titlepage .author{text-indent:0;text-align:center;margin-top:3em;font-size:1.1em}
.titlepage .publisher{text-indent:0;text-align:center;margin-top:5em;font-size:.9em;color:#8a7f76}
.toc ol{list-style:none;padding:0;margin:0;counter-reset:t}
.toc li{counter-increment:t;padding:.5em 0;border-bottom:1px dotted #d6cdc4}
.toc li::before{content:counter(t) ". ";color:\${th.accent};font-weight:bold}
.toc a{color:inherit;text-decoration:none}
.colophon .colo{margin-top:55%;border-top:1px solid #cfc5bb;padding-top:1em;font-size:.9em}
.colophon p{text-indent:0;margin:0 0 .3em;color:#6d625a}
.colophon .ct{font-weight:bold;color:#2b2420;font-size:1.1em;margin-bottom:.6em}
.colophon .made{margin-top:1em;color:#a0948a;font-size:.85em}
\`;
}

/* ═══════════ 표지 그리기 (캔버스) ═══════════ */
const imgCache = new Map();
function loadImg(src) {
  if (!src) return Promise.resolve(null);
  if (imgCache.has(src)) return imgCache.get(src);
  const p = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  imgCache.set(src, p); return p;
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
    ctx.font = \`\${weight} \${s}px \${family}\`;
    lines = wrapLines(ctx, text, maxW);
    if (lines.length <= maxLines) return { lines, size: s };
  }
  return { lines: lines.slice(0, maxLines), size: minSize };
}
function drawLines(ctx, lines, x, y, lh) { lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh)); return y + lines.length * lh; }
function coverFit(ctx, im, x, y, w, h) {
  const r = Math.max(w / im.width, h / im.height);
  const sw = w / r, sh = h / r;
  ctx.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, x, y, w, h);
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

async function drawCover(b, canvas) {
  const W = 1000, H = 1414;
  canvas = canvas || document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const th = THEMES[b.theme] || THEMES.sky;
  const fam = (FONTS[b.font] || FONTS.serif).css;
  const im = await loadImg(b.coverImage);
  let style = b.coverStyle || 'band';
  if (!im && (style === 'full')) style = 'band';
  const title = b.title || '제목 없는 책';

  // 바탕
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, th.c1); g.addColorStop(1, th.c2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';

  if (style === 'full') {
    coverFit(ctx, im, 0, 0, W, H);
    const sh = ctx.createLinearGradient(0, H * 0.45, 0, H);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.78)');
    ctx.fillStyle = sh; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    const t = fitText(ctx, title, W - 160, 3, 110, 56, 700, fam);
    let y = H - 170 - (t.lines.length - 1) * t.size * 1.2 - (b.subtitle ? 60 : 0);
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 12;
    y = drawLines(ctx, t.lines, W / 2, y, t.size * 1.2);
    if (b.subtitle) { ctx.font = \`400 40px \${fam}\`; ctx.fillText(wrapLines(ctx, b.subtitle, W - 160)[0], W / 2, y + 10); }
    ctx.font = \`400 42px \${fam}\`; ctx.fillText(b.author ? b.author + ' 지음' : '', W / 2, H - 80);
    ctx.shadowBlur = 0;
  } else if (style === 'frame') {
    ctx.fillStyle = th.paper; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = th.accent; ctx.lineWidth = 10; ctx.strokeRect(50, 50, W - 100, H - 100);
    ctx.lineWidth = 3; ctx.strokeRect(74, 74, W - 148, H - 148);
    ctx.fillStyle = th.accent;
    const t = fitText(ctx, title, W - 260, 3, 100, 52, 700, fam);
    let y = drawLines(ctx, t.lines, W / 2, 260, t.size * 1.22);
    if (b.subtitle) { ctx.fillStyle = '#7a6d62'; ctx.font = \`400 38px \${fam}\`; ctx.fillText(wrapLines(ctx, b.subtitle, W - 260)[0], W / 2, y + 6); }
    const iy = Math.max(y + 70, 560), ih = 1130 - iy;
    if (im) { ctx.save(); roundRect(ctx, 170, iy, W - 340, ih, 24); ctx.clip(); coverFit(ctx, im, 170, iy, W - 340, ih); ctx.restore(); }
    else { ctx.fillStyle = th.c1; ctx.globalAlpha = .35; ctx.beginPath(); ctx.arc(W / 2, iy + ih / 2, Math.min(ih, W - 340) / 2.4, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.fillStyle = '#4a3c32'; ctx.font = \`400 42px \${fam}\`; ctx.fillText(b.author ? b.author + ' 지음' : '', W / 2, 1230);
    if (b.publisher) { ctx.font = \`400 30px \${fam}\`; ctx.fillStyle = '#8a7d72'; ctx.fillText(b.publisher, W / 2, 1290); }
  } else if (style === 'plain' || !im) {
    // 장식 동그라미
    ctx.globalAlpha = .13; ctx.fillStyle = '#fff';
    [[820, 230, 260], [140, 1180, 330], [900, 1250, 140]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); });
    ctx.globalAlpha = 1; ctx.fillStyle = th.ink;
    const t = fitText(ctx, title, W - 200, 4, 120, 60, 700, fam);
    const lh = t.size * 1.22;
    let y = H * 0.42 - (t.lines.length - 1) * lh / 2;
    y = drawLines(ctx, t.lines, W / 2, y, lh);
    ctx.fillRect(W / 2 - 60, y - lh / 2 + 30, 120, 6);
    if (b.subtitle) { ctx.font = \`400 42px \${fam}\`; ctx.fillText(wrapLines(ctx, b.subtitle, W - 200)[0], W / 2, y + 70); }
    ctx.font = \`400 46px \${fam}\`; ctx.fillText(b.author ? b.author + ' 지음' : '', W / 2, H - 200);
    if (b.publisher) { ctx.font = \`400 32px \${fam}\`; ctx.globalAlpha = .8; ctx.fillText(b.publisher, W / 2, H - 130); ctx.globalAlpha = 1; }
  } else { // band
    ctx.save(); roundRect(ctx, 60, 60, W - 120, 860, 18); ctx.clip(); coverFit(ctx, im, 60, 60, W - 120, 860); ctx.restore();
    ctx.fillStyle = th.ink;
    const t = fitText(ctx, title, W - 160, 2, 96, 52, 700, fam);
    let y = drawLines(ctx, t.lines, W / 2, 1040, t.size * 1.2);
    if (b.subtitle) { ctx.font = \`400 38px \${fam}\`; ctx.fillText(wrapLines(ctx, b.subtitle, W - 160)[0], W / 2, y + 4); }
    ctx.font = \`400 42px \${fam}\`; ctx.fillText(b.author ? b.author + ' 지음' : '', W / 2, H - 110);
    if (b.publisher) { ctx.font = \`400 28px \${fam}\`; ctx.globalAlpha = .8; ctx.fillText(b.publisher, W / 2, H - 60); ctx.globalAlpha = 1; }
  }
  // 책등 그림자
  const sp = ctx.createLinearGradient(0, 0, 40, 0);
  sp.addColorStop(0, 'rgba(0,0,0,.22)'); sp.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sp; ctx.fillRect(0, 0, 40, H);
  return canvas;
}
let coverTimer = null;
function scheduleCover() { clearTimeout(coverTimer); coverTimer = setTimeout(() => drawCover(book, $('#coverThumb')), 150); }

/* ═══════════ 웹 책(읽기 화면) HTML 만들기 ═══════════ */
async function buildReaderHTML(b, preview) {
  const th = THEMES[b.theme] || THEMES.sky;
  const cover = (await drawCover(b)).toDataURL('image/jpeg', preview ? 0.8 : 0.9);
  const css = $('#readerCSS').textContent
    .replace('__DESK__', th.desk).replace('__PAPER__', th.paper).replace('__ACCENT__', th.accent)
    .replace('__FONT__', (FONTS[b.font] || FONTS.serif).css) + contentCSS(b, 'reader');
  const sections = [
    \`<section class="cover" id="cover"><img src="\${cover}" alt="표지"/></section>\`,
    titlePageHTML(b),
    tocHTML(b, (i, t) => \`<a href="#ch\${i + 1}" data-go="ch\${i + 1}">\${t}</a>\`),
    ...b.chapters.map((c, i) => chapterHTML(c, i, c.image, preview)),
    colophonHTML(b)
  ].join('\\n');
  return \`<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>\${esc(b.title || '나의 e북')}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&family=Noto+Serif+KR:wght@400;700&display=swap" rel="stylesheet">
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
  const seq = ++previewSeq;
  const html = await buildReaderHTML(book, true);
  if (seq !== previewSeq) return;
  const fr = $('#previewFrame');
  fr.onload = () => {
    const onTab = $('.tabs .on').dataset.tab;
    const target = onTab === 'write' ? 'ch' + (curCh + 1) : null;
    if (target) fr.contentWindow.postMessage({ ebookGoto: target }, '*');
  };
  fr.srcdoc = html;
}

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
  const xhtml = (t, body, extra = '') => \`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="ko" xml:lang="ko">
<head><meta charset="UTF-8"/><title>\${esc(t)}</title><link rel="stylesheet" type="text/css" href="style.css"/>\${extra}</head>
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

  // 표지
  const coverJpg = dataURLtoBytes((await drawCover(b)).toDataURL('image/jpeg', 0.9));
  files.push({ name: 'OEBPS/images/cover.jpg', data: coverJpg });
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

  files.push({ name: 'OEBPS/nav.xhtml', data: xhtml('차례', \`<nav epub:type="toc" id="toc" class="toc"><h2>차례</h2>
<ol>
\${b.chapters.map((c, i) => \`<li><a href="ch\${i + 1}.xhtml">\${esc(c.title || (i + 1) + '장')}</a></li>\`).join('\\n')}
</ol></nav>\`) });
  add('nav', 'nav.xhtml', 'application/xhtml+xml', 'nav'); spine.push('<itemref idref="nav"/>');

  b.chapters.forEach((c, i) => {
    let src = null;
    if (c.image) {
      const [ext, mime] = imgExt(c.image);
      src = \`images/ch\${i + 1}.\${ext}\`;
      files.push({ name: 'OEBPS/' + src, data: dataURLtoBytes(c.image) });
      add(\`img\${i + 1}\`, src, mime);
    }
    files.push({ name: \`OEBPS/ch\${i + 1}.xhtml\`, data: xhtml(c.title || (i + 1) + '장', chapterHTML(c, i, src, false).replace('<section ', '<section epub:type="chapter" ')) });
    add(\`ch\${i + 1}\`, \`ch\${i + 1}.xhtml\`, 'application/xhtml+xml'); spine.push(\`<itemref idref="ch\${i + 1}"/>\`);
  });

  files.push({ name: 'OEBPS/colophon.xhtml', data: xhtml('판권', colophonHTML(b)) });
  add('colophon', 'colophon.xhtml', 'application/xhtml+xml'); spine.push('<itemref idref="colophon"/>');

  // 옛 전자책 앱용 차례(toc.ncx)
  files.push({ name: 'OEBPS/toc.ncx', data: \`<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="ko">
<head><meta name="dtb:uid" content="urn:uuid:\${b.uuid}"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>\${esc(title)}</text></docTitle>
<navMap>
\${b.chapters.map((c, i) => \`<navPoint id="np\${i + 1}" playOrder="\${i + 1}"><navLabel><text>\${esc(c.title || (i + 1) + '장')}</text></navLabel><content src="ch\${i + 1}.xhtml"/></navPoint>\`).join('\\n')}
</navMap>
</ncx>\` });
  add('ncx', 'toc.ncx', 'application/x-dtbncx+xml');

  const modified = new Date().toISOString().replace(/\\.\\d+Z$/, 'Z');
  files.push({ name: 'OEBPS/content.opf', data: \`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="ko">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">urn:uuid:\${b.uuid}</dc:identifier>
<dc:title>\${esc(title)}</dc:title>
<dc:creator>\${esc(b.author || '지은이')}</dc:creator>
<dc:language>ko</dc:language>
\${b.publisher ? \`<dc:publisher>\${esc(b.publisher)}</dc:publisher>\` : ''}
\${b.subtitle ? \`<dc:description>\${esc(b.subtitle)}</dc:description>\` : ''}
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
async function printPDF(b, sizeKey) {
  const [pw, ph] = PAGE_SIZES[sizeKey] || PAGE_SIZES.a5;
  const cover = (await drawCover(b)).toDataURL('image/jpeg', 0.92);
  const base = sizeKey === 'a4' ? '12.5pt' : '11pt';
  const html = \`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>\${esc(b.title || '나의 e북')}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&family=Noto+Serif+KR:wght@400;700&display=swap" rel="stylesheet">
<style>
@page{size:\${pw} \${ph};margin:18mm 16mm 20mm;@bottom-center{content:counter(page);font-size:9pt;color:#999}}
@page:first{margin:0;@bottom-center{content:none}}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;padding:0;font-size:\${base}}
\${contentCSS(b, 'print')}
.coverpg{width:\${pw};height:\${ph};overflow:hidden;page-break-after:always;break-after:page}
.coverpg img{width:100%;height:100%;object-fit:cover;display:block}
section{break-before:page;page-break-before:always}
.coverpg+section{break-before:auto;page-break-before:auto}
.titlepage{padding-top:35%}
.colophon .colo{margin-top:80%}
.fig img{max-height:115mm}
.lay-picture .fig img{max-height:140mm}
</style></head><body>
<div class="coverpg"><img src="\${cover}" alt="표지"></div>
\${titlePageHTML(b)}
\${tocHTML(b, (i, t) => t)}
\${b.chapters.map((c, i) => chapterHTML(c, i, c.image, false)).join('\\n')}
\${colophonHTML(b)}
</body></html>\`;
  const fr = $('#printFrame');
  await new Promise(res => { fr.onload = res; fr.srcdoc = html; });
  const doc = fr.contentDocument;
  await Promise.all(Array.from(doc.images).map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
  try { if (doc.fonts) await Promise.race([doc.fonts.ready, new Promise(r => setTimeout(r, 2500))]); } catch (e) {}
  fr.contentWindow.focus();
  fr.contentWindow.print();
}

/* ═══════════ 그림 올리기 (크기 줄여서 저장) ═══════════ */
function readImage(file, maxSide = 1400) {
  return new Promise((res, rej) => {
    if (!file || !/^image\\//.test(file.type)) return rej(new Error('그림 파일이 아님'));
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const r = Math.min(1, maxSide / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * r); c.height = Math.round(im.height * r);
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(im, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', 0.85));
      };
      im.onerror = () => rej(new Error('그림을 열 수 없음'));
      im.src = fr.result;
    };
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
}

/* ═══════════ 화면 그리기 ═══════════ */
function renderInfo() {
  $('#bTitle').value = book.title; $('#bSub').value = book.subtitle;
  $('#bAuthor').value = book.author; $('#bPub').value = book.publisher;
  $('#swatches').innerHTML = Object.entries(THEMES).map(([k, t]) =>
    \`<button class="swatch\${book.theme === k ? ' on' : ''}" data-theme="\${k}" title="\${t.name}" style="background:linear-gradient(135deg,\${t.c1},\${t.c2})"></button>\`).join('');
  $('#coverStyles').innerHTML = Object.entries(COVER_STYLES).map(([k, n]) => \`<button data-cs="\${k}" class="\${book.coverStyle === k ? 'on' : ''}">\${n}</button>\`).join('');
  $('#fontChoices').innerHTML = Object.entries(FONTS).map(([k, f]) => \`<button data-font="\${k}" class="\${book.font === k ? 'on' : ''}">\${f.name}</button>\`).join('');
  $('#btnCoverDel').hidden = !book.coverImage;
  scheduleCover();
}
function renderChList() {
  $('#chList').innerHTML = book.chapters.map((c, i) => {
    const n = c.body.replace(/\\s/g, '').length;
    return \`<li data-i="\${i}" class="\${i === curCh ? 'on' : ''}">
<span class="num">\${i + 1}</span>
<span class="t">\${esc(c.title || '(제목 없음)')}<small>\${c.image ? '🖼 ' : ''}\${n}자</small></span>
<span class="ops"><button data-op="up" title="위로">▲</button><button data-op="down" title="아래로">▼</button><button data-op="del" title="지우기">✕</button></span>
</li>\`;
  }).join('');
}
function renderEditor() {
  const c = book.chapters[curCh];
  if (!c) { $('#chEditor').hidden = true; return; }
  $('#chEditor').hidden = false;
  $('#chTitle').value = c.title;
  $('#chBody').value = c.body;
  $('#chBody').placeholder = c.hint || '여기에 글을 씀.';
  $('#layoutChoices').innerHTML = Object.entries(LAYOUTS).map(([k, n]) => \`<button data-lay="\${k}" class="\${(c.layout || 'normal') === k ? 'on' : ''}">\${n}</button>\`).join('');
  const p = $('#chImgPrev');
  if (c.image) { p.src = c.image; p.hidden = false; } else { p.removeAttribute('src'); p.hidden = true; }
  $('#btnChImgDel').hidden = !c.image;
  updateCount();
}
function updateCount() {
  const c = book.chapters[curCh]; if (!c) return;
  const all = book.chapters.reduce((s, x) => s + x.body.replace(/\\s/g, '').length, 0);
  $('#chCount').textContent = \`이 장 \${c.body.replace(/\\s/g, '').length}자 · 책 전체 \${all}자 (공백 빼고)\`;
}
function renderCheck() {
  const issues = [];
  if (!book.title.trim()) issues.push('책 제목이 비어 있음 (①에서 입력)');
  if (!book.author.trim()) issues.push('지은이가 비어 있음 (①에서 입력)');
  const empty = book.chapters.filter(c => !c.body.trim() && !c.image).map(c => c.title || '(제목 없음)');
  if (empty.length) issues.push(\`내용이 빈 장 \${empty.length}개: \${empty.slice(0, 4).join(', ')}\${empty.length > 4 ? ' …' : ''}\`);
  const chars = book.chapters.reduce((s, x) => s + x.body.replace(/\\s/g, '').length, 0);
  const imgs = book.chapters.filter(c => c.image).length + (book.coverImage ? 1 : 0);
  $('#checkBox').innerHTML = \`<b>📋 내보내기 전 점검</b><br>장 \${book.chapters.length}개 · 글자 \${chars}자 · 그림 \${imgs}장<br>\` +
    (issues.length ? issues.map(x => '⚠ ' + esc(x)).join('<br>') : '✅ 빠진 곳 없음. 바로 내보내도 됨.');
}
function renderAll() { renderInfo(); renderChList(); renderEditor(); renderCheck(); schedulePreview(50); }

/* ═══════════ 책장 ═══════════ */
async function openShelf() {
  const grid = $('#shelfGrid');
  const sorted = [...shelf.books].sort((a, b) => b.updated - a.updated);
  grid.innerHTML = sorted.map(b => \`<div class="bk\${b.id === book.id ? ' cur' : ''}" data-id="\${b.id}">
<canvas width="1000" height="1414"></canvas>
<div class="nm">\${esc(b.title || '제목 없는 책')}</div>
<div class="dt">\${new Date(b.updated).toLocaleDateString('ko-KR')} · \${b.chapters.length}장</div>
<button class="del" data-del="\${b.id}">지우기</button>
</div>\`).join('');
  $('#shelfModal').classList.add('on');
  for (const el of grid.querySelectorAll('.bk')) {
    const b = shelf.books.find(x => x.id === el.dataset.id);
    await drawCover(b, el.querySelector('canvas'));
  }
}
function switchBook(id) {
  const b = shelf.books.find(x => x.id === id); if (!b) return;
  book = b; shelf.currentId = id; curCh = 0;
  renderAll(); touch({ cover: true });
}

/* ═══════════ 이벤트 연결 ═══════════ */
function bindInput(sel, key) {
  $(sel).addEventListener('input', e => { book[key] = e.target.value; touch(); if (key === 'title' || key === 'author') renderCheck(); });
}
bindInput('#bTitle', 'title'); bindInput('#bSub', 'subtitle'); bindInput('#bAuthor', 'author'); bindInput('#bPub', 'publisher');

$('.tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]'); if (!b) return;
  $$('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  $$('.tab').forEach(x => x.classList.toggle('on', x.id === 'tab-' + b.dataset.tab));
  if (b.dataset.tab === 'export') renderCheck();
  const fr = $('#previewFrame');
  if (fr.contentWindow) fr.contentWindow.postMessage({ ebookGoto: b.dataset.tab === 'write' ? 'ch' + (curCh + 1) : 'cover' }, '*');
});
$('#swatches').addEventListener('click', e => { const b = e.target.closest('[data-theme]'); if (!b) return; book.theme = b.dataset.theme; renderInfo(); touch(); });
$('#coverStyles').addEventListener('click', e => { const b = e.target.closest('[data-cs]'); if (!b) return; book.coverStyle = b.dataset.cs; renderInfo(); touch(); });
$('#fontChoices').addEventListener('click', e => { const b = e.target.closest('[data-font]'); if (!b) return; book.font = b.dataset.font; renderInfo(); touch(); });

$('#btnCoverImg').onclick = () => $('#fileCover').click();
$('#fileCover').onchange = async e => {
  try { book.coverImage = await readImage(e.target.files[0]); renderInfo(); touch(); toast('표지 그림을 넣음'); }
  catch (err) { toast(err.message); }
  e.target.value = '';
};
$('#btnCoverDel').onclick = () => { book.coverImage = null; renderInfo(); touch(); };

// 장 목록
$('#chList').addEventListener('click', e => {
  const li = e.target.closest('li'); if (!li) return;
  const i = +li.dataset.i, op = e.target.closest('[data-op]')?.dataset.op;
  if (op === 'up' && i > 0) { [book.chapters[i - 1], book.chapters[i]] = [book.chapters[i], book.chapters[i - 1]]; curCh = i - 1; touch({ cover: false }); }
  else if (op === 'down' && i < book.chapters.length - 1) { [book.chapters[i + 1], book.chapters[i]] = [book.chapters[i], book.chapters[i + 1]]; curCh = i + 1; touch({ cover: false }); }
  else if (op === 'del') {
    if (book.chapters.length === 1) { toast('장은 최소 1개가 있어야 함'); return; }
    const c = book.chapters[i];
    if ((c.body.trim() || c.image) && !confirm(\`"\${c.title}" 장을 지울까요? 쓴 글이 사라짐.\`)) return;
    book.chapters.splice(i, 1); curCh = Math.min(curCh, book.chapters.length - 1); touch({ cover: false });
  } else if (!op) { curCh = i; }
  else return;
  renderChList(); renderEditor();
  const fr = $('#previewFrame'); if (fr.contentWindow) fr.contentWindow.postMessage({ ebookGoto: 'ch' + (curCh + 1) }, '*');
});
$('#btnAddCh').onclick = () => {
  const last = book.chapters[book.chapters.length - 1];
  book.chapters.push({ id: uid(), title: (book.chapters.length + 1) + '장', body: '', hint: '', image: null, layout: last ? last.layout : 'normal' });
  curCh = book.chapters.length - 1;
  renderChList(); renderEditor(); touch({ cover: false });
  $('#chTitle').focus(); $('#chTitle').select();
};
$('#chTitle').addEventListener('input', e => { book.chapters[curCh].title = e.target.value; renderChList(); touch({ cover: false }); });
$('#chBody').addEventListener('input', e => { book.chapters[curCh].body = e.target.value; updateCount(); renderChListSoon(); touch({ cover: false }); });
let chlT; function renderChListSoon() { clearTimeout(chlT); chlT = setTimeout(renderChList, 400); }
$('#layoutChoices').addEventListener('click', e => { const b = e.target.closest('[data-lay]'); if (!b) return; book.chapters[curCh].layout = b.dataset.lay; renderEditor(); touch({ cover: false }); });
$('#btnChImg').onclick = () => $('#fileCh').click();
$('#fileCh').onchange = async e => {
  try { book.chapters[curCh].image = await readImage(e.target.files[0]); renderEditor(); renderChList(); touch({ cover: false }); }
  catch (err) { toast(err.message); }
  e.target.value = '';
};
$('#btnChImgDel').onclick = () => { book.chapters[curCh].image = null; renderEditor(); renderChList(); touch({ cover: false }); };

// 서식 단추
function applyFmt(kind) {
  const ta = $('#chBody'); const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
  const sel = v.slice(s, e);
  let ins, cs, ce;
  const lineStart = v.lastIndexOf('\\n', s - 1) + 1;
  if (kind === 'bold' || kind === 'italic') {
    const m = kind === 'bold' ? '**' : '*'; const t = sel || (kind === 'bold' ? '굵은 글자' : '기울인 글자');
    ins = m + t + m; ta.setRangeText(ins, s, e); cs = s + m.length; ce = cs + t.length;
  } else if (kind === 'h' || kind === 'quote') {
    const m = kind === 'h' ? '# ' : '> ';
    ta.setRangeText(m, lineStart, lineStart); cs = s + m.length; ce = e + m.length;
  } else if (kind === 'hr') {
    ins = (s > 0 && v[s - 1] !== '\\n' ? '\\n' : '') + '\\n---\\n\\n';
    ta.setRangeText(ins, s, e); cs = ce = s + ins.length;
  }
  ta.focus(); ta.setSelectionRange(cs, ce);
  ta.dispatchEvent(new Event('input'));
}
$('.toolbar').addEventListener('click', e => { const b = e.target.closest('[data-fmt]'); if (b) applyFmt(b.dataset.fmt); });
$('#chBody').addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); applyFmt('bold'); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); applyFmt('italic'); }
});

// 내보내기
async function busy(btn, fn) {
  const t = btn.textContent; btn.disabled = true; btn.textContent = '만드는 중…';
  try { await fn(); } catch (err) { console.error(err); toast('문제가 생김: ' + err.message, 4000); }
  finally { btn.disabled = false; btn.textContent = t; }
}
$('#btnEpub').onclick = e => busy(e.target, async () => { download(await buildEPUB(book), safeName(book.title) + '.epub'); toast('EPUB을 내려받음 📗'); });
$('#btnHtml').onclick = e => busy(e.target, async () => { download(new Blob([await buildReaderHTML(book, false)], { type: 'text/html' }), safeName(book.title) + '.html'); toast('웹 책을 내려받음 🌐'); });
$('#btnPdf').onclick = e => busy(e.target, async () => { toast('인쇄 창에서 "PDF로 저장"을 고를 것', 4000); await printPDF(book, $('#pdfSize').value); });
$('#btnSaveFile').onclick = () => {
  download(new Blob([JSON.stringify({ app: 'daram-ebook', version: 1, book }, null, 1)], { type: 'application/json' }), safeName(book.title) + '.ebook.json');
  toast('책 파일을 저장함 💾');
};
$('#btnLoadFile').onclick = () => $('#fileProject').click();
$('#fileProject').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    const b = j.book || j;
    if (!b || !Array.isArray(b.chapters)) throw new Error('e북 공방 책 파일이 아님');
    const nb = Object.assign(newBook('blank'), b, { id: uid(), updated: Date.now() });
    nb.chapters = b.chapters.map(c => Object.assign({ id: uid(), title: '', body: '', hint: '', image: null, layout: 'normal' }, c));
    shelf.books.push(nb); switchBook(nb.id);
    toast(\`"\${nb.title || '제목 없는 책'}"을 책장에 넣음\`);
  } catch (err) { toast('불러오기 실패: ' + err.message, 4000); }
};

// 미리보기 크게
$('#btnBig').onclick = () => {
  const box = $('#previewBox'); const on = box.classList.toggle('full');
  $('#btnBig').textContent = on ? '✕ 닫기' : '⛶ 크게 보기';
};
addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('#previewBox').classList.contains('full')) $('#btnBig').click(); $$('.modal.on').forEach(m => m.classList.remove('on')); } });

// 책장·새 책
$('#btnShelf').onclick = openShelf;
$('#btnNew').onclick = () => $('#newModal').classList.add('on');
$('#tplGrid').innerHTML = TEMPLATES.map(t => \`<button class="tpl" data-tpl="\${t.id}"><div class="ic">\${t.ic}</div><b>\${t.name}</b><span>\${t.desc}</span></button>\`).join('');
$('#tplGrid').addEventListener('click', e => {
  const b = e.target.closest('[data-tpl]'); if (!b) return;
  const nb = newBook(b.dataset.tpl); shelf.books.push(nb);
  $('#newModal').classList.remove('on');
  switchBook(nb.id);
  $$('.tabs button')[0].click(); $('#bTitle').focus();
  toast('새 책을 만듦. 먼저 제목을 정할 것 ✏️');
});
$('#shelfGrid').addEventListener('click', e => {
  const del = e.target.closest('[data-del]');
  if (del) {
    e.stopPropagation();
    const b = shelf.books.find(x => x.id === del.dataset.del);
    if (!confirm(\`"\${b.title || '제목 없는 책'}"을 지울까요? 되돌릴 수 없음.\\n(필요하면 먼저 ③에서 책 파일로 저장할 것)\`)) return;
    shelf.books = shelf.books.filter(x => x.id !== b.id);
    if (!shelf.books.length) shelf.books.push(newBook('blank'));
    if (b.id === book.id) switchBook(shelf.books[0].id); else touch({ cover: false });
    openShelf(); return;
  }
  const bk = e.target.closest('.bk'); if (!bk) return;
  $('#shelfModal').classList.remove('on'); switchBook(bk.dataset.id);
});
$$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) m.classList.remove('on'); }));

/* ═══════════ 시작 ═══════════ */
(async function init() {
  const saved = await store.get('shelf');
  if (saved && Array.isArray(saved.books) && saved.books.length) shelf = saved;
  else {
    const first = newBook('story');
    first.title = '첫 번째 나의 책'; first.author = '다람이';
    first.chapters[0].body = '이곳은 첫 장임. 이 글을 지우고 나만의 이야기를 씀.\\n\\n빈 줄을 한 번 넣으면 새 문단이 됨. **굵게**, *기울여* 쓸 수도 있음.\\n\\n# 소제목도 넣을 수 있음\\n\\n> 이렇게 쓰면 인용이 됨.\\n\\n---\\n\\n오른쪽 미리보기에서 책장을 넘겨 보면 실제 e북 모양을 확인할 수 있음.';
    shelf = { books: [first], currentId: first.id };
  }
  book = shelf.books.find(b => b.id === shelf.currentId) || shelf.books[0];
  shelf.currentId = book.id;
  renderAll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { scheduleCover(); schedulePreview(100); });
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
