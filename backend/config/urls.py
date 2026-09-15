"""
URL configuration for DDGolf project.
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from pathlib import Path

from accounts.billing_alert import AlertPhoneView


def readme_view(request):
    readme_path = Path(settings.BASE_DIR).parent / 'README.md'
    try:
        content = readme_path.read_text(encoding='utf-8')
    except FileNotFoundError:
        content = 'README.md 파일을 찾을 수 없습니다.'
    return JsonResponse({'content': content})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/accounts/", include("accounts.urls")),
    path("api/boards/", include("boards.urls")),
    path("api/gallery/", include("gallery.urls")),
    path("api/notices/", include("notices.urls")),
    path("api/schedule/", include("schedule.urls")),
    path("api/messenger/", include("messenger.urls")),
    path("api/sms/", include("sms.urls")),
    path("api/documents/", include("documents.urls")),
    path("api/version/readme/", readme_view),
    # 홈페이지유지관리비 — 안내 문자 번호 저장 (관리자만). 2026-09-15
    # ⚠️ 읽기(GET /api/server-billing)는 nginx 가 site-switch 로 넘긴다. 여기는 쓰기만.
    path("api/server-billing/alert/", AlertPhoneView.as_view(), name="billing-alert"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
