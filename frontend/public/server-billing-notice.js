/* 홈페이지유지관리비 안내 팝업 — ddgolf (2026-09-13)
 *
 * 교수오빠 지시: 「관리자 로그인 하면 결제가 필요하면 팝업 띄워서 결제 화면으로」
 *
 * ⚠️ React 화면(SPA) 밖에서 도는 작은 스크립트다. 화면을 다시 빌드해도 살아남도록
 *    index.html 에 <script> 로 걸어 두고 public/ 에 둔다.
 * ⚠️ 기한이 7일 이내이거나 지났을 때만 뜬다. 그 밖에는 조용하다.
 * ⚠️ 「오늘은 그만 보기」를 누르면 그날은 다시 안 뜬다 — 매번 뜨면 성가시다.
 * ⚠️ 관리자에게만 보인다. 회원 화면에서는 아무 일도 하지 않는다.
 */
(function () {
  'use strict';

  function todayKey() {
    var d = new Date();
    return 'sbHide' + d.getFullYear() + (d.getMonth() + 1) + d.getDate();
  }
  function token() {
    try {
      return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    } catch (e) { return null; }
  }
  function won(n) { return (Number(n) || 0).toLocaleString('ko-KR') + '원'; }

  function due(b) {
    return b && (b.overdue === true ||
      (b.days_left !== null && b.days_left !== undefined && b.days_left <= 7));
  }

  function show(b) {
    if (document.getElementById('sb-overlay')) return;
    var overdue = b.overdue === true;
    var w = document.createElement('div');
    w.id = 'sb-overlay';
    w.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;'
                    + 'display:flex;align-items:center;justify-content:center;padding:20px';
    w.innerHTML =
      '<div style="background:#fff;border-radius:14px;max-width:440px;width:100%;overflow:hidden;'
    + 'box-shadow:0 20px 60px rgba(0,0,0,.35);font-family:system-ui,-apple-system,sans-serif">'
    +   '<div style="padding:18px 22px;background:' + (overdue ? '#c5221f' : '#a15c00') + ';color:#fff">'
    +     '<b style="font-size:17px">'
    +       (overdue ? '홈페이지유지관리비 납부 기한이 지났습니다' : '홈페이지유지관리비 납부 기한이 다가옵니다')
    +     '</b>'
    +   '</div>'
    +   '<div style="padding:22px">'
    +     '<div style="font-size:15px;line-height:1.7">납부 기한 <b>' + (b.paid_until || '미정') + '</b><br>'
    +       (overdue
            ? '<span style="color:#c5221f">기한이 지났습니다. 서비스가 중지될 수 있습니다.</span>'
            : '<b>' + b.days_left + '일</b> 남았습니다.')
    +     '</div>'
    +     '<div style="margin-top:14px;padding:12px 14px;background:#f6f8fa;border-radius:8px;font-size:14px">'
    +       '월 <b>' + won(b.monthly_fee) + '</b> · 1년 선결제 <b>' + won(b.annual_fee) + '</b>'
    +       ' <span style="color:#137333">(' + won(b.annual_save) + ' 절약)</span>'
    +     '</div>'
    +     '<div style="margin-top:20px;display:flex;gap:8px;align-items:center">'
    +       '<button id="sb-go" style="flex:1;border:0;border-radius:8px;padding:12px;background:#15803d;'
    +         'color:#fff;font-weight:700;font-size:14.5px;cursor:pointer">결제하러 가기</button>'
    +       '<button id="sb-later" style="border:1px solid #cfd4da;background:#fff;border-radius:8px;'
    +         'padding:12px 14px;font-size:13.5px;cursor:pointer;white-space:nowrap">오늘은 그만 보기</button>'
    +     '</div>'
    +   '</div>'
    + '</div>';
    document.body.appendChild(w);
    w.querySelector('#sb-go').onclick = function () { location.href = '/server-billing.html'; };
    w.querySelector('#sb-later').onclick = function () {
      try { localStorage.setItem(todayKey(), '1'); } catch (e) {}
      w.remove();
    };
  }

  function badge(on) {
    // 메뉴는 React 가 나중에 그린다 → 조금 기다렸다가 찾는다(없으면 그냥 넘어간다).
    var tries = 0;
    (function look() {
      var el = document.getElementById('server-billing-badge');
      if (el) { el.classList.toggle('hidden', !on); return; }
      if (++tries < 20) setTimeout(look, 400);
    })();
  }

  async function check() {
    var t = token();
    if (!t) return;
    var me;
    try {
      var r = await fetch('/api/accounts/profile/', { headers: { Authorization: 'Bearer ' + t } });
      if (!r.ok) return;
      me = await r.json();
    } catch (e) { return; }
    if (!me || me.role !== 'admin') return;

    var b;
    try {
      var rb = await fetch('/api/server-billing');
      if (!rb.ok) return;
      b = await rb.json();
    } catch (e) { return; }

    if (!due(b)) { badge(false); return; }
    badge(true);
    try { if (localStorage.getItem(todayKey()) === '1') return; } catch (e) {}
    show(b);
  }

  /* ⚠️ 이 화면은 SPA 다. 로그인해도 **페이지가 새로 열리지 않는다** —
   *    처음 한 번만 확인하면 그때는 아직 로그인 전이라 팝업이 영영 안 뜬다
   *    (2026-09-15 에 실제로 그랬다. edenfood 는 로그인 때 페이지가 새로 열려서 됐다).
   *    그래서 **토큰이 생길 때까지** 잠깐 지켜보다가 한 번만 확인한다. */
  function waitForLogin() {
    var tries = 0;
    (function look() {
      if (token()) { check(); return; }        // 로그인됐다 → 확인하고 끝
      if (++tries > 60) return;                // 2분 지켜보고 그만둔다
      setTimeout(look, 2000);
    })();
  }

  function start() { setTimeout(waitForLogin, 1200); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
