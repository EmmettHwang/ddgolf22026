from django.db.models import F, Max, Q
from rest_framework import serializers, viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notice, Banner, Organization, AboutContent, Executive, History
from .serializers import (
    NoticeListSerializer, NoticeDetailSerializer,
    NoticeCreateSerializer, NoticeAdminSerializer,
    BannerSerializer, OrganizationSerializer, AboutContentSerializer,
    ExecutiveSerializer, HistorySerializer, NoticePopupSerializer
)


class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user and request.user.is_staff


class IsAdminOrInstructorOrReadOnly(permissions.BasePermission):
    """관리자 또는 승인된 클럽장은 쓰기 가능, 나머지는 읽기만"""
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_staff:
            return True
        return request.user.role == 'instructor' and request.user.is_approved

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        if request.user.is_staff:
            return True
        # 클럽장은 본인이 작성한 공지만 수정/삭제 가능
        if request.user.role == 'instructor' and request.user.is_approved:
            return obj.author == request.user
        return False


class PublicNoticeViewSet(viewsets.ReadOnlyModelViewSet):
    """공개 공지사항 ViewSet (로그인 불필요)"""
    permission_classes = [permissions.AllowAny]
    pagination_class = None

    def get_queryset(self):
        return Notice.objects.filter(
            visibility='public',
            is_hidden=False
        )

    def get_serializer_class(self):
        if self.action == 'list':
            return NoticeListSerializer
        return NoticeDetailSerializer

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        Notice.objects.filter(pk=instance.pk).update(views=F('views') + 1)
        instance.refresh_from_db()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)


class NoticeViewSet(viewsets.ModelViewSet):
    """회원 공지사항 ViewSet (로그인 필요)"""
    permission_classes = [permissions.IsAuthenticated, IsAdminOrInstructorOrReadOnly]
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        queryset = Notice.objects.all()

        if user.is_staff:
            # 관리자: 전부 표시
            return queryset

        # 일반 회원/클럽장: 전체 공지(club=null) + 본인 클럽 공지, 숨김 제외
        q = Q(club__isnull=True)
        if user.assigned_club_id:
            q |= Q(club=user.assigned_club)
        return queryset.filter(q, is_hidden=False)

    def get_serializer_class(self):
        if self.action == 'list':
            return NoticeListSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            if self.request.user.is_staff:
                return NoticeAdminSerializer
            return NoticeCreateSerializer
        return NoticeDetailSerializer

    def perform_create(self, serializer):
        user = self.request.user
        if user.is_staff:
            serializer.save(author=user)
        else:
            # 클럽장 → 자동으로 본인 클럽, visibility=club 설정
            if not user.assigned_club:
                raise serializers.ValidationError('배정된 클럽이 없어 공지를 작성할 수 없습니다.')
            serializer.save(
                author=user,
                club=user.assigned_club,
                visibility='club',
            )

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        Notice.objects.filter(pk=instance.pk).update(views=F('views') + 1)
        instance.refresh_from_db()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def toggle_hidden(self, request, pk=None):
        """공지사항 숨김/표시 토글"""
        notice = self.get_object()
        notice.is_hidden = not notice.is_hidden
        notice.save()
        return Response({
            'message': f"공지사항이 {'숨김' if notice.is_hidden else '표시'} 처리되었습니다.",
            'is_hidden': notice.is_hidden
        })

    @action(detail=False, methods=['get'])
    def admin_list(self, request):
        """관리자/클럽장용 전체 공지사항 목록 (숨김 포함)"""
        user = request.user
        if user.is_staff:
            queryset = Notice.objects.all()
        elif user.role == 'instructor' and user.is_approved:
            # 클럽장: 본인 클럽 공지만
            queryset = Notice.objects.filter(club=user.assigned_club)
        else:
            return Response(
                {'detail': '권한이 없습니다.'},
                status=status.HTTP_403_FORBIDDEN
            )
        serializer = NoticeAdminSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)


class BannerViewSet(viewsets.ModelViewSet):
    """배너 ViewSet"""
    queryset = Banner.objects.all()
    serializer_class = BannerSerializer
    pagination_class = None  # 페이지네이션 비활성화

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.AllowAny()]
        return [permissions.IsAdminUser()]

    def get_queryset(self):
        queryset = Banner.objects.all()
        # 관리자가 아니면 활성화된 배너만 표시
        if not self.request.user.is_staff:
            queryset = queryset.filter(is_active=True)
        return queryset

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def move_up(self, request, pk=None):
        """배너 순서 위로"""
        banner = self.get_object()
        prev_banner = Banner.objects.filter(order__lt=banner.order).order_by('-order').first()
        if prev_banner:
            banner.order, prev_banner.order = prev_banner.order, banner.order
            banner.save()
            prev_banner.save()
        return Response({'message': '순서가 변경되었습니다.'})

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def move_down(self, request, pk=None):
        """배너 순서 아래로"""
        banner = self.get_object()
        next_banner = Banner.objects.filter(order__gt=banner.order).order_by('order').first()
        if next_banner:
            banner.order, next_banner.order = next_banner.order, banner.order
            banner.save()
            next_banner.save()
        return Response({'message': '순서가 변경되었습니다.'})


class OrganizationViewSet(viewsets.ModelViewSet):
    """유관기관 ViewSet"""
    queryset = Organization.objects.all()
    serializer_class = OrganizationSerializer
    pagination_class = None  # 페이지네이션 비활성화

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'display_settings']:
            return [permissions.AllowAny()]
        return [permissions.IsAdminUser()]

    def get_queryset(self):
        queryset = Organization.objects.all()
        # 관리자가 아니면 활성화된 유관기관만 표시
        if not self.request.user.is_staff:
            queryset = queryset.filter(is_active=True)
        return queryset

    @action(detail=False, methods=['get', 'patch'], url_path='display-settings')
    def display_settings(self, request):
        """유관기관 표시 설정 (marquee_enabled)"""
        from .models import SiteSettings
        site = SiteSettings.load()
        if request.method == 'PATCH':
            if not request.user.is_staff:
                return Response({'error': '권한이 없습니다.'}, status=status.HTTP_403_FORBIDDEN)
            if 'marquee_enabled' in request.data:
                site.marquee_enabled = request.data['marquee_enabled']
                site.save()
            return Response({'marquee_enabled': site.marquee_enabled})
        return Response({'marquee_enabled': site.marquee_enabled})

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def move_up(self, request, pk=None):
        """유관기관 순서 위로"""
        org = self.get_object()
        prev_org = Organization.objects.filter(order__lt=org.order).order_by('-order').first()
        if prev_org:
            org.order, prev_org.order = prev_org.order, org.order
            org.save()
            prev_org.save()
        return Response({'message': '순서가 변경되었습니다.'})

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def move_down(self, request, pk=None):
        """유관기관 순서 아래로"""
        org = self.get_object()
        next_org = Organization.objects.filter(order__gt=org.order).order_by('order').first()
        if next_org:
            org.order, next_org.order = next_org.order, org.order
            org.save()
            next_org.save()
        return Response({'message': '순서가 변경되었습니다.'})


class AboutContentView(APIView):
    """협회소개 콘텐츠 API (GET=AllowAny, PUT=IsAdmin)"""

    def get_permissions(self):
        if self.request.method == 'GET':
            return [permissions.AllowAny()]
        return [permissions.IsAdminUser()]

    def get(self, request):
        about = AboutContent.load()
        serializer = AboutContentSerializer(about, context={'request': request})
        return Response(serializer.data)

    def put(self, request):
        about = AboutContent.load()
        serializer = AboutContentSerializer(about, data=request.data, partial=True, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ExecutiveViewSet(viewsets.ModelViewSet):
    """협회 임원 ViewSet"""
    queryset = Executive.objects.all()
    serializer_class = ExecutiveSerializer
    pagination_class = None

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.AllowAny()]
        return [permissions.IsAdminUser()]

    def perform_create(self, serializer):
        if 'order' not in self.request.data or self.request.data.get('order') == '':
            max_order = Executive.objects.aggregate(m=Max('order'))['m'] or 0
            serializer.save(order=max_order + 1)
        else:
            serializer.save()

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def move_up(self, request, pk=None):
        """임원 순서 위로 (같은 order 내에서도 위치 교환)"""
        all_execs = list(Executive.objects.order_by('order', 'created_at'))
        exec_obj = self.get_object()
        idx = next((i for i, e in enumerate(all_execs) if e.id == exec_obj.id), -1)
        if idx > 0:
            prev_obj = all_execs[idx - 1]
            if exec_obj.order == prev_obj.order:
                # 같은 순위: created_at을 교환해서 순서 변경
                Executive.objects.filter(pk=exec_obj.pk).update(created_at=prev_obj.created_at)
                Executive.objects.filter(pk=prev_obj.pk).update(created_at=exec_obj.created_at)
            else:
                # 다른 순위: order 값 교환
                exec_obj.order, prev_obj.order = prev_obj.order, exec_obj.order
                exec_obj.save()
                prev_obj.save()
        return Response({'message': '순서가 변경되었습니다.'})

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def move_down(self, request, pk=None):
        """임원 순서 아래로 (같은 order 내에서도 위치 교환)"""
        all_execs = list(Executive.objects.order_by('order', 'created_at'))
        exec_obj = self.get_object()
        idx = next((i for i, e in enumerate(all_execs) if e.id == exec_obj.id), -1)
        if 0 <= idx < len(all_execs) - 1:
            next_obj = all_execs[idx + 1]
            if exec_obj.order == next_obj.order:
                # 같은 순위: created_at을 교환해서 순서 변경
                Executive.objects.filter(pk=exec_obj.pk).update(created_at=next_obj.created_at)
                Executive.objects.filter(pk=next_obj.pk).update(created_at=exec_obj.created_at)
            else:
                # 다른 순위: order 값 교환
                exec_obj.order, next_obj.order = next_obj.order, exec_obj.order
                exec_obj.save()
                next_obj.save()
        return Response({'message': '순서가 변경되었습니다.'})


class HistoryViewSet(viewsets.ModelViewSet):
    """연혁 ViewSet"""
    queryset = History.objects.all()
    serializer_class = HistorySerializer
    pagination_class = None

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.AllowAny()]
        return [permissions.IsAdminUser()]

    def perform_create(self, serializer):
        max_order = History.objects.aggregate(max_order=Max('order'))['max_order'] or 0
        serializer.save(order=max_order + 1)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def move_up(self, request, pk=None):
        """연혁 순서 위로"""
        obj = self.get_object()
        prev_obj = History.objects.filter(order__lt=obj.order).order_by('-order').first()
        if prev_obj:
            obj.order, prev_obj.order = prev_obj.order, obj.order
            obj.save()
            prev_obj.save()
        return Response({'message': '순서가 변경되었습니다.'})

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def move_down(self, request, pk=None):
        """연혁 순서 아래로"""
        obj = self.get_object()
        next_obj = History.objects.filter(order__gt=obj.order).order_by('order').first()
        if next_obj:
            obj.order, next_obj.order = next_obj.order, obj.order
            obj.save()
            next_obj.save()
        return Response({'message': '순서가 변경되었습니다.'})


class PopupNoticeView(APIView):
    """활성 팝업 공지사항 목록 API"""
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        notices = Notice.objects.filter(is_popup=True, is_hidden=False)
        serializer = NoticePopupSerializer(notices, many=True, context={'request': request})
        return Response(serializer.data)
