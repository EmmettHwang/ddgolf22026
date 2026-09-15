# -*- coding: utf-8 -*-
"""로그인 실패 제한 — ddgolf (2026-09-15).

교수오빠: 「백도어는 단단히 잠궈 놓자. 모든 사이트 공통이야」

같은 IP 에서 로그인을 여러 번 틀리면 그 IP 를 잠시 막고, 막는 그 순간
호스트의 site-switch 로 알려 교수오빠 폰에 문자가 가게 한다.

⚠️ 값은 **메모리에만** 둔다. 다시 시작하면 지워진다 — 그래도 무차별 대입은 막힌다.
⚠️ 막혀도 돌려주는 말은 다른 사이트와 같게 맞춘다.
⚠️ daphne 는 1프로세스로 돈다(CHANNEL_LAYERS 가 InMemory 라서). 그래서 메모리 계산이
   프로세스마다 갈리지 않는다.
"""
import json
import os
import threading
import time
import urllib.request

MAX_FAIL = 5
WINDOW = 600
BLOCK = 900

_lock = threading.Lock()
_fails = {}
_blocked = {}

SWITCH = os.environ.get('SITE_SWITCH_URL', 'http://172.17.0.1:8099')


def client_ip(request):
    h = request.META
    for k in ('HTTP_CF_CONNECTING_IP', 'HTTP_X_REAL_IP'):
        v = h.get(k)
        if v:
            return str(v).strip()[:45]
    xff = h.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0].strip()[:45]
    return str(h.get('REMOTE_ADDR') or '?')[:45]


def _lockout_key():
    """환경변수를 먼저 보고, 없으면 옆의 .env 를 훑는다."""
    v = (os.environ.get('LOCKOUT_KEY') or '').strip()
    if v:
        return v
    here = os.path.dirname(os.path.abspath(__file__))
    for d in (here, os.path.dirname(here), os.path.dirname(os.path.dirname(here))):
        for name in ('.env', '.env.docker'):
            try:
                for ln in open(os.path.join(d, name), encoding='utf-8'):
                    ln = ln.strip()
                    if ln.startswith('LOCKOUT_KEY='):
                        return ln.split('=', 1)[1].strip().strip('"').strip("'")
            except Exception:
                pass
    return ''


def _notify(ip, tries):
    key = _lockout_key()
    if not key:
        return
    body = json.dumps({'key': key, 'site': 'ddgolf', 'ip': ip, 'tries': tries}).encode()
    req = urllib.request.Request(SWITCH + '/public/lockout', data=body,
                                 headers={'Content-Type': 'application/json'},
                                 method='POST')
    try:
        urllib.request.urlopen(req, timeout=5).read()
    except Exception:
        pass


def blocked_for(request):
    ip = client_ip(request)
    now = time.time()
    with _lock:
        until = _blocked.get(ip, 0)
        if until > now:
            return int(until - now)
        if until:
            _blocked.pop(ip, None)
    return 0


def record_fail(request):
    ip = client_ip(request)
    now = time.time()
    fire = 0
    with _lock:
        arr = [t for t in _fails.get(ip, []) if now - t < WINDOW]
        arr.append(now)
        _fails[ip] = arr
        if len(arr) >= MAX_FAIL and _blocked.get(ip, 0) <= now:
            _blocked[ip] = now + BLOCK
            _fails[ip] = []
            fire = len(arr)
    if fire:
        threading.Thread(target=_notify, args=(ip, fire), daemon=True).start()


def record_ok(request):
    ip = client_ip(request)
    with _lock:
        _fails.pop(ip, None)
        _blocked.pop(ip, None)
