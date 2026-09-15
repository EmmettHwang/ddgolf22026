# -*- coding: utf-8 -*-
"""홈페이지유지관리비 — 안내 문자 받을 번호 저장 (2026-09-15).

왜 여기에 있나:
    요금·기한·문자 설정은 호스트의 `site-switch` 가 들고 있다. 그 길은 **토큰**이 있어야
    쓸 수 있다. 토큰을 화면(브라우저)으로 내보낼 수는 없으므로,
    **「관리자인지」는 Django 가 확인하고**, 확인된 뒤에만 토큰을 붙여 넘긴다.

⚠️ 토큰은 코드에 박지 않는다. `/run/switch_token` 에 읽기 전용으로 마운트돼 있다.
⚠️ 읽기(GET)는 nginx 가 이미 `/api/server-billing` 으로 넘겨 주므로 여기서는 쓰기만 맡는다.
"""
import json
import urllib.error
import urllib.request

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

SWITCH = 'http://172.17.0.1:8099'
SITE = 'ddgolf'
TOKEN_FILE = '/run/switch_token'


def _token():
    try:
        with open(TOKEN_FILE, encoding='utf-8') as f:
            return f.read().strip()
    except Exception:
        return ''


class AlertPhoneView(APIView):
    """안내 문자 받을 번호를 저장한다. **관리자만.**"""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if getattr(request.user, 'role', '') != 'admin':
            return Response({'ok': False, 'error': '관리자만 바꿀 수 있습니다.'}, status=403)

        tok = _token()
        if not tok:
            return Response({'ok': False, 'error': '설정이 준비되지 않았습니다.'}, status=503)

        body = json.dumps({
            'site': SITE,
            'phone': str(request.data.get('phone') or '')[:20],
            'alert_on': bool(request.data.get('alert_on')),
        }).encode('utf-8')

        req = urllib.request.Request(
            SWITCH + '/alert-phone', data=body, method='POST',
            headers={'Content-Type': 'application/json', 'X-Switch-Token': tok})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return Response(json.loads(r.read().decode('utf-8')))
        except urllib.error.HTTPError as e:
            try:
                return Response(json.loads(e.read().decode('utf-8')), status=e.code)
            except Exception:
                return Response({'ok': False, 'error': '저장하지 못했습니다.'}, status=e.code)
        except Exception:
            return Response({'ok': False, 'error': '저장하지 못했습니다.'}, status=502)
