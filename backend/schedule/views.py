from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.http import HttpResponse

from .models import Event, EventParticipant
from .serializers import (
    EventListSerializer, EventDetailSerializer, EventCreateSerializer,
    EventParticipantSerializer
)


class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user and request.user.is_staff


class EventViewSet(viewsets.ModelViewSet):
    """일정 ViewSet"""
    permission_classes = [permissions.IsAuthenticated, IsAdminOrReadOnly]
    pagination_class = None

    def get_queryset(self):
        queryset = Event.objects.all()
        # 날짜 필터
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        if start_date:
            queryset = queryset.filter(start_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(end_date__lte=end_date)
        return queryset

    def get_serializer_class(self):
        if self.action == 'list':
            return EventListSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return EventCreateSerializer
        return EventDetailSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def join(self, request, pk=None):
        """일정 참가 신청"""
        event = self.get_object()

        # 이미 참가 신청했는지 확인
        if event.participants.filter(user=request.user).exists():
            return Response(
                {'error': '이미 참가 신청한 일정입니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 최대 참가자 수 확인
        if event.max_participants > 0:
            confirmed_count = event.participants.filter(
                status=EventParticipant.Status.CONFIRMED
            ).count()
            if confirmed_count >= event.max_participants:
                return Response(
                    {'error': '참가 인원이 마감되었습니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        EventParticipant.objects.create(
            event=event,
            user=request.user,
            status=EventParticipant.Status.PENDING
        )
        return Response({'message': '참가 신청이 완료되었습니다. 관리자 승인 후 확정됩니다.'})

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def leave(self, request, pk=None):
        """일정 참가 취소"""
        event = self.get_object()
        try:
            participant = event.participants.get(user=request.user)
            participant.delete()
            return Response({'message': '참가가 취소되었습니다.'})
        except EventParticipant.DoesNotExist:
            return Response(
                {'error': '참가 신청 내역이 없습니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['get'])
    def upcoming(self, request):
        """다가오는 일정 조회"""
        events = Event.objects.filter(
            start_date__gte=timezone.now()
        ).order_by('start_date')[:5]
        serializer = EventListSerializer(events, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny])
    def popup_events(self, request):
        """팝업 표시 일정 조회"""
        events = Event.objects.filter(
            is_popup=True,
            start_date__gte=timezone.now()
        ).order_by('start_date')
        serializer = EventListSerializer(events, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def approve_participant(self, request, pk=None):
        """참가자 승인 (관리자)"""
        if not request.user.is_staff:
            return Response({'error': '권한이 없습니다.'}, status=status.HTTP_403_FORBIDDEN)
        participant_id = request.data.get('participant_id')
        try:
            participant = EventParticipant.objects.get(id=participant_id, event_id=pk)
            participant.status = EventParticipant.Status.CONFIRMED
            participant.save()
            return Response({'message': f'{participant.user.username}님을 승인했습니다.'})
        except EventParticipant.DoesNotExist:
            return Response({'error': '참가자를 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def reject_participant(self, request, pk=None):
        """참가자 거절 (관리자)"""
        if not request.user.is_staff:
            return Response({'error': '권한이 없습니다.'}, status=status.HTTP_403_FORBIDDEN)
        participant_id = request.data.get('participant_id')
        try:
            participant = EventParticipant.objects.get(id=participant_id, event_id=pk)
            participant.status = EventParticipant.Status.CANCELLED
            participant.save()
            return Response({'message': f'{participant.user.username}님을 거절했습니다.'})
        except EventParticipant.DoesNotExist:
            return Response({'error': '참가자를 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def export_participants(self, request, pk=None):
        """확정 참가자 XLSX 다운로드 (관리자)"""
        if not request.user.is_staff:
            return Response({'error': '권한이 없습니다.'}, status=status.HTTP_403_FORBIDDEN)
        import openpyxl
        event = self.get_object()
        confirmed = event.participants.filter(
            status=EventParticipant.Status.CONFIRMED
        ).select_related('user')

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = '참가자 명단'
        ws.append(['번호', '이름', '이메일', '전화번호', '신청일'])
        for idx, p in enumerate(confirmed, 1):
            ws.append([
                idx,
                p.user.username,
                p.user.email,
                getattr(p.user, 'phone', ''),
                p.created_at.strftime('%Y-%m-%d %H:%M'),
            ])
        # 열 너비 조정
        ws.column_dimensions['A'].width = 8
        ws.column_dimensions['B'].width = 15
        ws.column_dimensions['C'].width = 30
        ws.column_dimensions['D'].width = 18
        ws.column_dimensions['E'].width = 18

        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        filename = f'{event.title}_참가자명단.xlsx'
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        wb.save(response)
        return response


class PublicEventViewSet(viewsets.ReadOnlyModelViewSet):
    """공개 일정 ViewSet (비로그인 접근 가능)"""
    permission_classes = [permissions.AllowAny]
    pagination_class = None

    def get_queryset(self):
        queryset = Event.objects.filter(visibility='public')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        if start_date:
            queryset = queryset.filter(start_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(end_date__lte=end_date)
        return queryset

    def get_serializer_class(self):
        if self.action == 'list':
            return EventListSerializer
        return EventDetailSerializer
