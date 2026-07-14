/*
 * 우리 반 아이디어 보드 — 온라인 서버 (Cloudflare Worker + D1)
 * ──────────────────────────────────────────────────────────
 * 와우아이디어스처럼 교사가 게시판을 만들고, 학생들이 글·그림·파일을
 * 자유롭게 올리는 학급 게시판입니다. 학생은 주소만 열면 바로 접속됩니다.
 *  - 학생용:  https://<워커주소>/
 *  - 교사용:  https://<워커주소>/teacher.html  (같은 화면, 교사 탭이 먼저 열림)
 *
 * ※ 이 파일은 build-ideaboard-worker.ps1 이 만든 자동 생성본입니다.
 *    화면(ideaboard-app/app.html)을 고친 뒤에는 빌드 스크립트를 다시 실행하세요.
 *
 * 설정 (Cloudflare 대시보드에서 1회만):
 *  1. Storage & Databases → D1 → Create Database (이름 예: idea-board)
 *  2. Workers & Pages → Create → Worker 생성 (이름 예: idea-board)
 *  3. 이 파일(ideaboard-worker.js) 내용을 그대로 붙여넣고 Deploy
 *  4. Worker → Settings → Bindings → Add → D1 Database
 *     - Variable name: DB  (반드시 이 이름 그대로!)
 *     - D1 database: 위에서 만든 idea-board 선택
 *  5. 배포 주소를 학생 태블릿 홈 화면에 추가하면 끝!
 *
 * 초기 계정: 교사 teacher / 0000, 학급 코드 6-1 (설정에서 변경하세요)
 *
 * ✅ 사진은 학생 기기에서 자동 압축(최대 1280px)되어 올라갑니다.
 * ✅ 일반 파일 첨부는 1개당 1MB 까지입니다. (D1 무료 용량 보호)
 * ✅ 쪽지는 최근 600개까지 보관되고 오래된 읽은 쪽지부터 정리됩니다.
 */

const APP_HTML = __APP_HTML__;

// ── 기본 데이터 ──
function defaultState() {
  return {
    seq: 100,
    settings: {
      classCode: "6-1",
      className: "우리 반 아이디어 보드",
    },
    // 선생님 계정(여러 명 가능). 각자 아이디·비밀번호·이름으로 로그인해 글·쪽지가 구분됨
    teachers: [{ id: 1, loginId: "teacher", pw: "0000", name: "선생님" }],
    students: [],  // {id, number, name, pin, active}
    boards: [],    // {id, title, desc, createdAt}
    posts: [],     // {id, boardId, author:{type,id,name}, text, files:[{id,name,mime,isImage}], isNotice, createdAt}
    comments: [],  // {id, postId, author:{type,id,name}, text, createdAt}
    likes: [],     // {postId, key}   key = "t<교사id>" | "s<학생id>"
    messages: [],  // {id, from:{type,id,name}, toType:"student"|"teacher", toId, text, createdAt, read}
  };
}

// 예전(교사 1명) 데이터를 새 구조(teachers 배열)로 맞춰 줌
function migrate(st) {
  if (!Array.isArray(st.teachers) || st.teachers.length === 0) {
    const s = st.settings || {};
    st.teachers = [{ id: 1, loginId: s.teacherId || "teacher", pw: s.teacherPw || "0000", name: "선생님" }];
  }
  if (st.settings) { delete st.settings.teacherId; delete st.settings.teacherPw; }
  if ((st.seq | 0) < 100) st.seq = 100;
  return st;
}

// ── 한국 시간 (Worker 는 UTC 로 돌므로 반드시 서울 기준으로 변환) ──
function kst() {
  const s = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date());
  return { date: s.slice(0, 10), time: s.slice(11, 16), datetime: s };
}

// ── 공통 도우미 ──
function nextId(st) { st.seq = (st.seq | 0) + 1; return st.seq; }
function randId() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  let s = "";
  for (const b of a) s += b.toString(16).padStart(2, "0");
  return s;
}
function findTeacher(st, auth) {
  if (!auth) return null;
  return (st.teachers || []).find(t =>
    String(t.loginId) === String(auth.id) && String(t.pw) === String(auth.pw)) || null;
}
function authStudent(st, auth) {
  if (!auth) return null;
  if (String(auth.classCode) !== String(st.settings.classCode)) return null;
  return st.students.find(s =>
    Number(s.number) === Number(auth.number) && String(s.pin) === String(auth.pin) && s.active) || null;
}
// 요청의 auth 로 행위자(교사/학생)를 판별
function getActor(st, auth) {
  if (!auth) return null;
  if (auth.role === "teacher") {
    const t = findTeacher(st, auth);
    return t ? { type: "teacher", id: t.id, name: t.name } : null;
  }
  const s = authStudent(st, auth);
  return s ? { type: "student", id: s.id, name: s.name, number: s.number } : null;
}
function likeKey(actor) { return (actor.type === "teacher" ? "t" : "s") + actor.id; }
function sameAuthor(actor, author) {
  return author && author.type === actor.type && Number(author.id) === Number(actor.id);
}

// ── 첨부 파일 검사 (data URL → {id,name,mime,isImage,dataB64}) ──
const MAX_FILES = 4;            // 글 1개당 첨부 수
const MAX_B64 = 1500000;        // 파일 1개당 base64 길이 (~1.1MB 원본)
const MAX_TOTAL_B64 = 4000000;  // 글 1개당 합계
function parseFiles(list) {
  if (!Array.isArray(list) || list.length === 0) return { files: [] };
  if (list.length > MAX_FILES) return { error: "첨부는 한 번에 " + MAX_FILES + "개까지예요." };
  const files = [];
  let total = 0;
  for (const f of list) {
    const m = /^data:([^;,]+);base64,(.+)$/s.exec(String(f && f.data || ""));
    if (!m) return { error: "첨부 파일 형식이 올바르지 않아요." };
    if (m[2].length > MAX_B64) return { error: "파일이 너무 커요. 1MB 이하만 올릴 수 있어요." };
    total += m[2].length;
    if (total > MAX_TOTAL_B64) return { error: "첨부 파일이 전부 합쳐서 너무 커요." };
    const mime = m[1].toLowerCase();
    files.push({
      id: randId(),
      name: String(f.name || "파일").slice(0, 120),
      mime,
      isImage: mime.startsWith("image/"),
      dataB64: m[2],
    });
  }
  return { files };
}

// ── 용량 관리 ──
function prune(st) {
  if (st.messages.length > 600) {
    let excess = st.messages.length - 600;
    st.messages = st.messages.filter(m => {
      if (excess > 0 && m.read) { excess--; return false; }
      return true;
    });
    if (st.messages.length > 800) st.messages = st.messages.slice(-800);
  }
}

// ── API 처리 ──
function fail(msg, status = 400) { return { status, body: { ok: false, error: msg } }; }
function ok(obj) { return { status: 200, body: Object.assign({ ok: true }, obj) }; }

function unreadOf(st, actor) {
  return st.messages.filter(m => !m.read &&
    (actor.type === "teacher"
      ? (m.toType === "teacher" && Number(m.toId) === Number(actor.id))
      : (m.toType === "student" && Number(m.toId) === Number(actor.id))));
}

function postView(st, p, actor) {
  const likes = st.likes.filter(l => l.postId === p.id);
  return {
    id: p.id, boardId: p.boardId, author: p.author, text: p.text,
    files: p.files, isNotice: !!p.isNotice, createdAt: p.createdAt,
    likeCount: likes.length,
    liked: likes.some(l => l.key === likeKey(actor)),
    comments: st.comments.filter(c => c.postId === p.id)
      .map(c => ({ id: c.id, author: c.author, text: c.text, createdAt: c.createdAt })),
  };
}

function handleApi(st, path, method, d) {
  if (method !== "POST") return fail("없는 주소입니다.", 404);

  // ══════════ 로그인 ══════════
  if (path === "/api/login") {
    if (d.role === "teacher") {
      const t = findTeacher(st, { id: d.id, pw: d.pw });
      if (t) return ok({ id: t.id, name: t.name });
      return fail("아이디 또는 비밀번호가 맞지 않습니다.", 401);
    }
    const stu = authStudent(st, { classCode: d.classCode, number: d.number, pin: d.pin });
    if (stu) return ok({ id: stu.id, number: stu.number, name: stu.name });
    return fail("학급 코드, 번호, PIN을 다시 확인하세요.", 401);
  }

  const actor = getActor(st, d.auth);
  if (!actor) return fail("로그인이 필요합니다.", 401);
  const isTeacher = actor.type === "teacher";

  // ══════════ 홈 (게시판 목록) ══════════
  if (path === "/api/home") {
    const boards = st.boards.map(b => ({
      id: b.id, title: b.title, desc: b.desc, createdAt: b.createdAt,
      postCount: st.posts.filter(p => p.boardId === b.id).length,
    }));
    const res = {
      className: st.settings.className,
      me: { type: actor.type, id: actor.id, name: actor.name },
      boards, unread: unreadOf(st, actor).length,
      // 이름·id만 (비밀번호 제외) — 학생이 쪽지 받을 선생님을 고를 때 사용
      teacherList: st.teachers.map(t => ({ id: t.id, name: t.name })),
    };
    if (isTeacher) {
      res.students = st.students.filter(s => s.active)
        .map(s => ({ id: s.id, number: s.number, name: s.name, pin: s.pin }))
        .sort((a, b) => a.number - b.number);
      res.classCode = st.settings.classCode;
      // 선생님 계정 관리용 (교사에게만 비밀번호 포함)
      res.teachers = st.teachers.map(t => ({ id: t.id, loginId: t.loginId, name: t.name, pw: t.pw }));
    }
    return ok(res);
  }

  // ══════════ 게시판 글 목록 ══════════
  if (path === "/api/board") {
    const b = st.boards.find(x => x.id === Number(d.boardId));
    if (!b) return fail("없는 게시판입니다.", 404);
    const posts = st.posts.filter(p => p.boardId === b.id)
      .sort((a, x) => (!!x.isNotice - !!a.isNotice) || (a.createdAt < x.createdAt ? 1 : -1) || (x.id - a.id))
      .map(p => postView(st, p, actor));
    return ok({
      board: { id: b.id, title: b.title, desc: b.desc },
      me: { type: actor.type, id: actor.id, name: actor.name },
      posts,
    });
  }

  // ══════════ 글 쓰기 ══════════
  if (path === "/api/post/create") {
    const b = st.boards.find(x => x.id === Number(d.boardId));
    if (!b) return fail("없는 게시판입니다.", 404);
    const text = String(d.text || "").trim().slice(0, 3000);
    const pf = parseFiles(d.files);
    if (pf.error) return fail(pf.error);
    if (!text && pf.files.length === 0) return fail("내용을 쓰거나 사진·그림·파일을 붙여 주세요.");
    const post = {
      id: nextId(st), boardId: b.id,
      author: { type: actor.type, id: actor.id, name: actor.name },
      text,
      files: pf.files.map(f => ({ id: f.id, name: f.name, mime: f.mime, isImage: f.isImage })),
      isNotice: isTeacher && !!d.isNotice,
      createdAt: kst().datetime,
    };
    st.posts.push(post);
    return Object.assign(ok({ post: postView(st, post, actor) }),
      { mutated: true, saveFiles: pf.files });
  }

  // ══════════ 글 지우기 (본인 또는 교사) ══════════
  if (path === "/api/post/delete") {
    const p = st.posts.find(x => x.id === Number(d.postId));
    if (!p) return fail("없는 글입니다.", 404);
    if (!isTeacher && !sameAuthor(actor, p.author)) return fail("자기가 쓴 글만 지울 수 있어요.", 403);
    const fileIds = p.files.map(f => f.id);
    st.posts = st.posts.filter(x => x.id !== p.id);
    st.comments = st.comments.filter(c => c.postId !== p.id);
    st.likes = st.likes.filter(l => l.postId !== p.id);
    return Object.assign(ok({}), { mutated: true, deleteFiles: fileIds });
  }

  // ══════════ 공지 고정 (교사) ══════════
  if (path === "/api/post/notice") {
    if (!isTeacher) return fail("선생님만 할 수 있어요.", 403);
    const p = st.posts.find(x => x.id === Number(d.postId));
    if (!p) return fail("없는 글입니다.", 404);
    p.isNotice = !!d.isNotice;
    return Object.assign(ok({ isNotice: p.isNotice }), { mutated: true });
  }

  // ══════════ 댓글 ══════════
  if (path === "/api/comment/create") {
    const p = st.posts.find(x => x.id === Number(d.postId));
    if (!p) return fail("없는 글입니다.", 404);
    const text = String(d.text || "").trim().slice(0, 500);
    if (!text) return fail("댓글 내용을 써 주세요.");
    const c = {
      id: nextId(st), postId: p.id,
      author: { type: actor.type, id: actor.id, name: actor.name },
      text, createdAt: kst().datetime,
    };
    st.comments.push(c);
    return Object.assign(ok({ comment: c }), { mutated: true });
  }
  if (path === "/api/comment/delete") {
    const c = st.comments.find(x => x.id === Number(d.commentId));
    if (!c) return fail("없는 댓글입니다.", 404);
    if (!isTeacher && !sameAuthor(actor, c.author)) return fail("자기가 쓴 댓글만 지울 수 있어요.", 403);
    st.comments = st.comments.filter(x => x.id !== c.id);
    return Object.assign(ok({}), { mutated: true });
  }

  // ══════════ 좋아요 ══════════
  if (path === "/api/like/toggle") {
    const p = st.posts.find(x => x.id === Number(d.postId));
    if (!p) return fail("없는 글입니다.", 404);
    const key = likeKey(actor);
    const has = st.likes.some(l => l.postId === p.id && l.key === key);
    if (has) st.likes = st.likes.filter(l => !(l.postId === p.id && l.key === key));
    else st.likes.push({ postId: p.id, key });
    return Object.assign(ok({
      liked: !has,
      likeCount: st.likes.filter(l => l.postId === p.id).length,
    }), { mutated: true });
  }

  // ══════════ 쪽지 ══════════
  if (path === "/api/msg/send") {
    const text = String(d.text || "").trim().slice(0, 1000);
    if (!text) return fail("쪽지 내용을 써 주세요.");
    const from = { type: actor.type, id: actor.id, name: actor.name };
    const now = kst().datetime;
    if (isTeacher) {
      if (d.to === "all") {
        const targets = st.students.filter(s => s.active);
        if (targets.length === 0) return fail("등록된 학생이 없어요.");
        for (const s of targets)
          st.messages.push({ id: nextId(st), from, toType: "student", toId: s.id, text, createdAt: now, read: false });
      } else {
        const s = st.students.find(x => x.id === Number(d.to) && x.active);
        if (!s) return fail("받을 학생을 찾을 수 없어요.", 404);
        st.messages.push({ id: nextId(st), from, toType: "student", toId: s.id, text, createdAt: now, read: false });
      }
    } else {
      // 학생 → 선생님. 받는 사람은 반드시 선생님(학생끼리 쪽지 불가).
      // 선생님이 여러 명이면 고른 선생님, 지정이 없거나 잘못됐고 선생님이 한 명뿐이면 그 선생님에게 자동 전송
      let target = null;
      if (d.to) target = st.teachers.find(t => t.id === Number(d.to));
      if (!target && st.teachers.length === 1) target = st.teachers[0];
      if (!target) return fail("쪽지를 보낼 선생님을 골라 주세요.", 400);
      st.messages.push({ id: nextId(st), from, toType: "teacher", toId: target.id, text, createdAt: now, read: false });
    }
    return Object.assign(ok({}), { mutated: true });
  }
  if (path === "/api/msg/list") {
    const teacherName = id => (st.teachers.find(t => t.id === Number(id)) || { name: "선생님" }).name;
    const toName = m => m.toType === "teacher" ? teacherName(m.toId)
      : (st.students.find(s => s.id === Number(m.toId)) || { name: "?" }).name;
    const receivedBy = m => actor.type === "teacher"
      ? (m.toType === "teacher" && Number(m.toId) === Number(actor.id))
      : (m.toType === "student" && Number(m.toId) === Number(actor.id));
    const sentBy = m => m.from.type === actor.type && Number(m.from.id) === Number(actor.id);
    const mine = st.messages.filter(m => receivedBy(m) || sentBy(m))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1) || (b.id - a.id))
      .slice(0, 200)
      .map(m => ({
        id: m.id, from: m.from, toType: m.toType, toId: m.toId, toName: toName(m),
        text: m.text, createdAt: m.createdAt, read: !!m.read,
        received: receivedBy(m),
      }));
    return ok({ messages: mine });
  }
  if (path === "/api/msg/read") {
    const ids = Array.isArray(d.ids) ? d.ids.map(Number) : [];
    let changed = false;
    for (const m of st.messages) {
      const isMine = actor.type === "teacher"
        ? (m.toType === "teacher" && Number(m.toId) === Number(actor.id))
        : (m.toType === "student" && Number(m.toId) === Number(actor.id));
      if (isMine && !m.read && ids.includes(m.id)) { m.read = true; changed = true; }
    }
    if (!changed) return ok({});
    return Object.assign(ok({}), { mutated: true });
  }
  // 새 쪽지 확인 (학생·교사 화면이 주기적으로 호출 → 팝업 표시)
  if (path === "/api/poll") {
    const unread = unreadOf(st, actor)
      .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))
      .slice(0, 10)
      .map(m => ({ id: m.id, from: m.from, text: m.text, createdAt: m.createdAt }));
    return ok({ unread: unreadOf(st, actor).length, messages: unread });
  }

  // ══════════ 교사 전용 ══════════
  if (path.startsWith("/api/teacher/")) {
    if (!isTeacher) return fail("선생님만 할 수 있어요.", 403);

    if (path === "/api/teacher/board/create") {
      const title = String(d.title || "").trim().slice(0, 60);
      if (!title) return fail("게시판 이름을 써 주세요.");
      const b = { id: nextId(st), title, desc: String(d.desc || "").trim().slice(0, 200), createdAt: kst().datetime };
      st.boards.push(b);
      return Object.assign(ok({ board: b }), { mutated: true });
    }
    if (path === "/api/teacher/board/update") {
      const b = st.boards.find(x => x.id === Number(d.boardId));
      if (!b) return fail("없는 게시판입니다.", 404);
      const title = String(d.title || "").trim().slice(0, 60);
      if (!title) return fail("게시판 이름을 써 주세요.");
      b.title = title;
      b.desc = String(d.desc || "").trim().slice(0, 200);
      return Object.assign(ok({}), { mutated: true });
    }
    if (path === "/api/teacher/board/delete") {
      const b = st.boards.find(x => x.id === Number(d.boardId));
      if (!b) return fail("없는 게시판입니다.", 404);
      const posts = st.posts.filter(p => p.boardId === b.id);
      const fileIds = [];
      for (const p of posts) for (const f of p.files) fileIds.push(f.id);
      const postIds = new Set(posts.map(p => p.id));
      st.boards = st.boards.filter(x => x.id !== b.id);
      st.posts = st.posts.filter(p => p.boardId !== b.id);
      st.comments = st.comments.filter(c => !postIds.has(c.postId));
      st.likes = st.likes.filter(l => !postIds.has(l.postId));
      return Object.assign(ok({}), { mutated: true, deleteFiles: fileIds });
    }

    // 학생 명단 일괄 저장 (전달된 목록으로 교체)
    if (path === "/api/teacher/students/save") {
      if (!Array.isArray(d.students)) return fail("목록이 올바르지 않아요.");
      const seen = new Set();
      const next = [];
      for (const s of d.students) {
        const number = Number(s.number);
        const name = String(s.name || "").trim().slice(0, 20);
        const pin = String(s.pin || "").trim();
        if (!number || number < 1 || !name) return fail("번호와 이름을 모두 채워 주세요.");
        if (!/^\d{4}$/.test(pin)) return fail(number + "번 " + name + ": PIN은 숫자 4자리여야 해요.");
        if (seen.has(number)) return fail("번호 " + number + "가 겹쳐요.");
        seen.add(number);
        next.push({ id: s.id ? Number(s.id) : nextId(st), number, name, pin, active: true });
      }
      st.students = next.sort((a, b) => a.number - b.number);
      return Object.assign(ok({ count: next.length }), { mutated: true });
    }

    // 학생 포트폴리오: 한 학생이 올린 글·자료·댓글을 모두 모아서 반환
    if (path === "/api/teacher/portfolio") {
      const stu = st.students.find(s => s.id === Number(d.studentId));
      if (!stu) return fail("학생을 찾을 수 없어요.", 404);
      const boardTitle = id => (st.boards.find(b => b.id === Number(id)) || { title: "(지워진 게시판)" }).title;
      const isMe = a => a && a.type === "student" && Number(a.id) === Number(stu.id);
      // 이 학생이 쓴 글 (오래된 → 최신)
      const posts = st.posts.filter(p => isMe(p.author))
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
        .map(p => ({
          id: p.id, boardId: p.boardId, boardTitle: boardTitle(p.boardId),
          text: p.text, files: p.files, isNotice: !!p.isNotice, createdAt: p.createdAt,
          likeCount: st.likes.filter(l => l.postId === p.id).length,
          comments: st.comments.filter(c => c.postId === p.id)
            .map(c => ({ author: c.author, text: c.text, createdAt: c.createdAt })),
        }));
      // 이 학생이 남긴 댓글 (다른 사람 글에)
      const comments = st.comments.filter(c => isMe(c.author))
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
        .map(c => {
          const p = st.posts.find(x => x.id === c.postId);
          return {
            text: c.text, createdAt: c.createdAt,
            onBoard: p ? boardTitle(p.boardId) : "(지워진 글)",
            onPost: p ? (p.text ? p.text.slice(0, 40) : "(사진/파일 글)") : "(지워진 글)",
          };
        });
      const fileCount = posts.reduce((n, p) => n + p.files.length, 0);
      const likeTotal = posts.reduce((n, p) => n + p.likeCount, 0);
      return ok({
        className: st.settings.className,
        student: { id: stu.id, number: stu.number, name: stu.name },
        posts, comments,
        stats: { postCount: posts.length, fileCount, likeTotal, commentCount: comments.length },
        generatedAt: kst().datetime,
      });
    }

    // 선생님 계정 명단 일괄 저장 (여러 명 등록 가능)
    if (path === "/api/teacher/teachers/save") {
      if (!Array.isArray(d.teachers)) return fail("목록이 올바르지 않아요.");
      const seen = new Set();
      const next = [];
      for (const t of d.teachers) {
        const loginId = String(t.loginId || "").trim().slice(0, 30);
        const name = String(t.name || "").trim().slice(0, 20);
        const pw = String(t.pw || "").trim();
        if (!loginId || !name) return fail("아이디와 이름을 모두 채워 주세요.");
        if (pw.length < 4) return fail(name + " 선생님: 비밀번호는 4자 이상이어야 해요.");
        if (seen.has(loginId)) return fail("아이디 '" + loginId + "'가 겹쳐요.");
        seen.add(loginId);
        next.push({ id: t.id ? Number(t.id) : nextId(st), loginId, pw, name });
      }
      if (next.length === 0) return fail("선생님은 최소 한 명은 있어야 해요.");
      st.teachers = next;
      return Object.assign(ok({ count: next.length }), { mutated: true });
    }

    if (path === "/api/teacher/settings/save") {
      const classCode = String(d.classCode || "").trim().slice(0, 20);
      const className = String(d.className || "").trim().slice(0, 40);
      if (!classCode || !className) return fail("학급 코드와 이름을 채워 주세요.");
      st.settings.classCode = classCode;
      st.settings.className = className;
      if (d.newPw) {
        const pw = String(d.newPw).trim();
        if (pw.length < 4) return fail("새 비밀번호는 4자 이상이어야 해요.");
        const me = st.teachers.find(t => t.id === actor.id);  // 지금 로그인한 선생님 본인 비밀번호
        if (me) me.pw = pw;
      }
      return Object.assign(ok({}), { mutated: true });
    }
  }

  return fail("없는 주소입니다.", 404);
}

// ── D1 저장 (버전 잠금: 동시에 여러 명이 써도 기록이 사라지지 않음) ──
let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS board_state (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, data TEXT NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS board_files (id TEXT PRIMARY KEY, name TEXT, mime TEXT, data TEXT NOT NULL)").run();
  schemaReady = true;
}
async function loadState(db) {
  const row = await db.prepare("SELECT version, data FROM board_state WHERE id = 1").first();
  if (!row) return { version: 0, state: defaultState() };
  return { version: row.version, state: migrate(JSON.parse(row.data)) };
}
async function saveState(db, version, state) {
  prune(state);
  const json = JSON.stringify(state);
  if (version === 0) {
    try {
      await db.prepare("INSERT INTO board_state (id, version, data) VALUES (1, 1, ?)").bind(json).run();
      return true;
    } catch (e) { return false; }
  }
  const r = await db.prepare("UPDATE board_state SET version = version + 1, data = ? WHERE id = 1 AND version = ?").bind(json, version).run();
  return r.meta && r.meta.changes === 1;
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname);
    const method = request.method;

    // ── 정적 화면 ──
    if (method === "GET" || method === "HEAD") {
      if (path === "/" || path === "/index.html" || path === "/teacher.html")
        return new Response(APP_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // ── 첨부 파일 내려주기 (주소는 무작위 24자리라 추측 불가) ──
    if (method === "GET" && path.startsWith("/api/file/")) {
      try {
        await ensureSchema(env.DB);
        const id = path.slice("/api/file/".length);
        const row = await env.DB.prepare("SELECT name, mime, data FROM board_files WHERE id = ?").bind(id).first();
        if (!row) return new Response("404", { status: 404 });
        const bytes = Uint8Array.from(atob(row.data), c => c.charCodeAt(0));
        const headers = {
          "Content-Type": row.mime || "application/octet-stream",
          "Cache-Control": "public, max-age=31536000, immutable",
        };
        if (!(row.mime || "").startsWith("image/"))
          headers["Content-Disposition"] = "attachment; filename*=UTF-8''" + encodeURIComponent(row.name || "file");
        return new Response(bytes, { headers });
      } catch (e) {
        return new Response("파일 오류", { status: 500 });
      }
    }

    if (!path.startsWith("/api/")) return new Response("404", { status: 404 });

    let d = {};
    if (method === "POST") {
      try { d = await request.json(); } catch (e) { d = {}; }
    }

    try {
      await ensureSchema(env.DB);
      // 버전 충돌 시 다시 읽어 재시도 (최대 5회)
      for (let attempt = 0; attempt < 5; attempt++) {
        const { version, state } = await loadState(env.DB);
        const r = handleApi(state, path, method, d);
        if (!r.mutated) return jsonResponse(r.body, r.status);
        if (await saveState(env.DB, version, state)) {
          // 상태 저장 성공 후 첨부 파일 반영 (재시도마다 id가 새로 나므로 마지막 것만 사용)
          if (r.saveFiles)
            for (const f of r.saveFiles)
              await env.DB.prepare("INSERT INTO board_files (id, name, mime, data) VALUES (?, ?, ?, ?)")
                .bind(f.id, f.name, f.mime, f.dataB64).run();
          if (r.deleteFiles)
            for (const id of r.deleteFiles)
              await env.DB.prepare("DELETE FROM board_files WHERE id = ?").bind(id).run();
          return jsonResponse(r.body, r.status);
        }
      }
      return jsonResponse({ ok: false, error: "저장이 겹쳤어요. 다시 시도해 주세요." }, 503);
    } catch (e) {
      return jsonResponse({ ok: false, error: "서버 오류: " + (e && e.message ? e.message : e) }, 500);
    }
  },
};
