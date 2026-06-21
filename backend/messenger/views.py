from django.db.models import Q, Count
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import ChatRoom, Message, ChatBan, ChatRoomInvitation, ChatRoomMembership, ClubMembershipRequest, ClubImage
from .serializers import (
    ChatRoomListSerializer, ChatRoomDetailSerializer,
    ChatRoomCreateSerializer, MessageSerializer,
    ChatBanSerializer, ChatBanCreateSerializer,
    ChatRoomInvitationSerializer, ChatRoomMembershipSerializer,
    ClubMembershipRequestSerializer, ClubImageSerializer
)

User = get_user_model()


class IsAdminOrInstructor(permissions.BasePermission):
    """관리자 또는 클럽장만 허용"""
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return request.user.is_staff or request.user.role in ['admin', 'instructor']


class ChatRoomViewSet(viewsets.ModelViewSet):
    """채팅방 ViewSet"""
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        user = self.request.user

        # 관리자: 모든 채팅방 조회 가능
        if user.is_staff or user.role == 'admin':
            return ChatRoom.objects.all()

        # 초대를 수락한 비공용 채팅방 ID 목록
        accepted_room_ids = ChatRoomInvitation.objects.filter(
            user=user,
            status='accepted'
        ).values_list('room_id', flat=True)

        # 공통 조건: 공용 채팅방 + 멤버로 속한 채팅방 + 초대 수락한 채팅방 + 배정된 클럽
        q = Q(is_public=True) | Q(members=user) | Q(id__in=accepted_room_ids)
        if user.assigned_club_id:
            q |= Q(pk=user.assigned_club_id)

        # 클럽장: 추가로 자신이 생성한 채팅방
        if user.role == 'instructor':
            q |= Q(created_by=user)

        return ChatRoom.objects.filter(q).distinct()

    def get_serializer_class(self):
        if self.action == 'list':
            return ChatRoomListSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return ChatRoomCreateSerializer
        return ChatRoomDetailSerializer

    def get_permissions(self):
        """채팅방 생성/삭제는 관리자만 가능"""
        if self.action in ('create', 'destroy'):
            return [permissions.IsAdminUser()]
        return super().get_permissions()

    def perform_create(self, serializer):
        """채팅방 생성 시 생성자 설정 (관리자 전용)"""
        user = self.request.user
        room = serializer.save(created_by=user)
        # 생성자를 멤버로 추가
        room.members.add(user)

    @action(detail=True, methods=['get'])
    def messages(self, request, pk=None):
        """채팅방 메시지 조회"""
        room = self.get_object()

        # 채팅방 접근 시 멤버십 자동 생성 (공용 채팅방 또는 기존 멤버인 경우)
        # 관리자는 조회만 가능하고 자동 멤버 추가 안 함
        is_member = room.members.filter(pk=request.user.pk).exists()
        if room.is_public or is_member:
            if not is_member:
                room.members.add(request.user)
            ChatRoomMembership.objects.get_or_create(
                room=room,
                user=request.user,
                defaults={'notification_enabled': True}
            )

        messages = room.messages.filter(is_deleted=False).order_by('-created_at')[:50]
        serializer = MessageSerializer(messages, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def send_message(self, request, pk=None):
        """메시지 전송"""
        room = self.get_object()

        # 제재 상태 확인
        active_ban = room.bans.filter(
            user=request.user,
            is_active=True,
            ban_type='mute'
        ).first()

        if active_ban:
            if active_ban.expires_at and active_ban.expires_at < timezone.now():
                active_ban.is_active = False
                active_ban.save()
            else:
                return Response(
                    {'error': '채팅이 금지된 상태입니다.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        content = request.data.get('content')
        if not content:
            return Response(
                {'error': '메시지 내용이 필요합니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        message = Message.objects.create(
            room=room,
            sender=request.user,
            content=content
        )
        room.save()  # updated_at 갱신
        serializer = MessageSerializer(message)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        """메시지 읽음 처리 - 사용자별 last_read_at 업데이트"""
        room = self.get_object()

        # 사용자별 멤버십의 last_read_at 업데이트
        membership, created = ChatRoomMembership.objects.get_or_create(
            room=room,
            user=request.user,
            defaults={'notification_enabled': True}
        )
        membership.last_read_at = timezone.now()
        membership.save()

        return Response({'message': '읽음 처리되었습니다.'})

    @action(detail=True, methods=['post'])
    def invite(self, request, pk=None):
        """멤버 초대 (관리자/클럽장 전용)"""
        room = self.get_object()

        # 공용 채팅방은 초대 불가 (자동 참여)
        if room.is_public:
            return Response(
                {'error': '공용 채팅방은 초대할 수 없습니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 권한 확인
        if not room.can_manage(request.user):
            return Response(
                {'error': '초대 권한이 없습니다.'},
                status=status.HTTP_403_FORBIDDEN
            )

        user_ids = request.data.get('user_ids', [])
        invited_users = []

        for user_id in user_ids:
            try:
                user = User.objects.get(pk=user_id, is_approved=True)
                # 영구 차단된 사용자는 초대 불가
                if room.bans.filter(user=user, ban_type='ban', is_active=True).exists():
                    continue
                # 이미 멤버인 경우 스킵
                if room.members.filter(pk=user_id).exists():
                    continue
                # 이미 대기 중인 초대가 있는 경우 스킵
                if ChatRoomInvitation.objects.filter(
                    room=room, user=user, status='pending'
                ).exists():
                    continue

                # 초대장 생성
                ChatRoomInvitation.objects.create(
                    room=room,
                    user=user,
                    invited_by=request.user
                )
                invited_users.append(user.username)
            except User.DoesNotExist:
                continue

        return Response({
            'message': f'{len(invited_users)}명에게 초대장을 보냈습니다.',
            'invited_users': invited_users
        })

    @action(detail=True, methods=['post'])
    def kick(self, request, pk=None):
        """멤버 퇴출 (관리자/클럽장 전용)"""
        room = self.get_object()

        # 공용 채팅방에서는 퇴출 불가
        if room.is_public:
            return Response(
                {'error': '공용 채팅방에서는 멤버를 퇴출할 수 없습니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 권한 확인
        if not room.can_manage(request.user):
            return Response(
                {'error': '퇴출 권한이 없습니다.'},
                status=status.HTTP_403_FORBIDDEN
            )

        user_id = request.data.get('user_id')
        if not user_id:
            return Response(
                {'error': 'user_id가 필요합니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            user = User.objects.get(pk=user_id)
            # 관리자/생성자는 퇴출 불가
            if user.is_staff or user.role == 'admin' or user == room.created_by:
                return Response(
                    {'error': '해당 사용자는 퇴출할 수 없습니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            room.members.remove(user)
            return Response({'message': f'{user.username}님이 퇴출되었습니다.'})
        except User.DoesNotExist:
            return Response(
                {'error': '사용자를 찾을 수 없습니다.'},
                status=status.HTTP_404_NOT_FOUND
            )

    @action(detail=True, methods=['post'])
    def leave(self, request, pk=None):
        """채팅방 나가기"""
        room = self.get_object()

        # 공용 채팅방에서는 나가기 불가
        if room.is_public:
            return Response(
                {'error': '공용 채팅방에서는 나갈 수 없습니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        room.members.remove(request.user)
        return Response({'message': '채팅방을 나갔습니다.'})

    @action(detail=True, methods=['get'])
    def members_list(self, request, pk=None):
        """채팅방 멤버 목록"""
        room = self.get_object()
        from accounts.serializers import UserSerializer
        serializer = UserSerializer(room.members.all(), many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def available_users(self, request, pk=None):
        """초대 가능한 사용자 목록 (검색 지원)"""
        room = self.get_object()

        if not room.can_manage(request.user):
            return Response(
                {'error': '권한이 없습니다.'},
                status=status.HTTP_403_FORBIDDEN
            )

        search = request.query_params.get('search', '').strip()

        # 승인된 사용자 중 현재 멤버가 아닌 사용자
        available = User.objects.filter(
            is_approved=True
        ).exclude(
            pk__in=room.members.all()
        ).exclude(
            # 영구 차단된 사용자 제외
            chat_bans__room=room,
            chat_bans__ban_type='ban',
            chat_bans__is_active=True
        ).exclude(
            # 이미 대기 중인 초대가 있는 사용자 제외
            chat_invitations__room=room,
            chat_invitations__status='pending'
        )

        # 검색어가 있으면 필터링
        if search:
            available = available.filter(
                Q(username__icontains=search) |
                Q(email__icontains=search)
            )

        # 최대 20명만 반환
        available = available[:20]

        from accounts.serializers import UserSerializer
        serializer = UserSerializer(available, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def bans(self, request, pk=None):
        """채팅방 제재 목록 조회 (관리자/클럽장)"""
        room = self.get_object()
        if not room.can_manage(request.user):
            return Response({'error': '권한이 없습니다.'}, status=status.HTTP_403_FORBIDDEN)
        bans = room.bans.filter(is_active=True)
        serializer = ChatBanSerializer(bans, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def ban_user(self, request, pk=None):
        """회원 제재 (관리자/클럽장)"""
        room = self.get_object()
        if not room.can_manage(request.user):
            return Response({'error': '권한이 없습니다.'}, status=status.HTTP_403_FORBIDDEN)
        serializer = ChatBanCreateSerializer(data=request.data)
        if serializer.is_valid():
            ban = serializer.save(room=room, banned_by=request.user)

            # 강제 퇴장(kick) 또는 영구 차단(ban)인 경우 멤버에서 제거
            if ban.ban_type in ['kick', 'ban']:
                room.members.remove(ban.user)

            return Response(
                ChatBanSerializer(ban).data,
                status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='unban/(?P<ban_pk>[^/.]+)')
    def unban_user(self, request, pk=None, ban_pk=None):
        """회원 제재 해제 (관리자/클럽장)"""
        room = self.get_object()
        if not room.can_manage(request.user):
            return Response({'error': '권한이 없습니다.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            ban = room.bans.get(pk=ban_pk)
            ban.is_active = False
            ban.save()
            return Response({'message': '제재가 해제되었습니다.'})
        except ChatBan.DoesNotExist:
            return Response(
                {'error': '제재 정보를 찾을 수 없습니다.'},
                status=status.HTTP_404_NOT_FOUND
            )

    @action(detail=True, methods=['get'])
    def my_ban_status(self, request, pk=None):
        """내 제재 상태 확인"""
        room = self.get_object()
        active_ban = room.bans.filter(
            user=request.user,
            is_active=True
        ).first()

        if active_ban:
            # 만료된 제재 자동 해제
            if active_ban.expires_at and active_ban.expires_at < timezone.now():
                active_ban.is_active = False
                active_ban.save()
                return Response({'is_banned': False})

            return Response({
                'is_banned': True,
                'ban_type': active_ban.ban_type,
                'ban_type_display': active_ban.get_ban_type_display(),
                'reason': active_ban.reason,
                'expires_at': active_ban.expires_at
            })
        return Response({'is_banned': False})

    @action(detail=True, methods=['post'])
    def toggle_notification(self, request, pk=None):
        """알림 설정 토글"""
        room = self.get_object()

        membership, created = ChatRoomMembership.objects.get_or_create(
            room=room,
            user=request.user,
            defaults={'notification_enabled': True}
        )

        membership.notification_enabled = not membership.notification_enabled
        membership.save()

        return Response({
            'notification_enabled': membership.notification_enabled,
            'message': '알림이 켜졌습니다.' if membership.notification_enabled else '알림이 꺼졌습니다.'
        })

    @action(detail=True, methods=['get'])
    def my_settings(self, request, pk=None):
        """내 채팅방 설정 조회"""
        room = self.get_object()

        membership = ChatRoomMembership.objects.filter(
            room=room,
            user=request.user
        ).first()

        return Response({
            'notification_enabled': membership.notification_enabled if membership else True
        })

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def clear_messages(self, request, pk=None):
        """채팅 기록 삭제 (관리자 전용) - 채팅방은 유지"""
        room = self.get_object()

        # 모든 메시지를 삭제 처리 (실제 삭제 대신 is_deleted=True)
        deleted_count = room.messages.filter(is_deleted=False).update(is_deleted=True)

        return Response({
            'message': f'{deleted_count}개의 메시지가 삭제되었습니다.',
            'deleted_count': deleted_count
        })

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def admin_add_member(self, request, pk=None):
        """관리자용 멤버 추가 - 모든 채팅방에 사용 가능"""
        room = self.get_object()
        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'error': 'user_id가 필요합니다.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(pk=user_id, is_approved=True)
        except User.DoesNotExist:
            return Response({'error': '사용자를 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)
        if room.members.filter(pk=user.pk).exists():
            return Response({'error': '이미 멤버입니다.'}, status=status.HTTP_400_BAD_REQUEST)
        room.members.add(user)
        ChatRoomMembership.objects.get_or_create(room=room, user=user)
        return Response({'message': f'{user.username}님이 추가되었습니다.'})

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def admin_remove_member(self, request, pk=None):
        """관리자용 멤버 제거 - 모든 채팅방에 사용 가능"""
        room = self.get_object()
        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'error': 'user_id가 필요합니다.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'error': '사용자를 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)
        room.members.remove(user)
        ChatRoomMembership.objects.filter(room=room, user=user).delete()
        # 배정 클럽이 이 방이면 해제
        if user.assigned_club_id == room.pk:
            user.assigned_club = None
            user.save(update_fields=['assigned_club'])
        return Response({'message': f'{user.username}님이 제거되었습니다.'})

    @action(detail=True, methods=['get'], permission_classes=[permissions.IsAdminUser])
    def admin_messages(self, request, pk=None):
        """관리자용 메시지 조회 - 채팅방 멤버가 아니어도 조회 가능"""
        room = self.get_object()
        messages = room.messages.filter(is_deleted=False).order_by('created_at')[:100]
        serializer = MessageSerializer(messages, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def club_list(self, request):
        """전체 클럽 목록 (비공용) + 현재 사용자의 멤버 여부 및 대기 요청 상태"""
        clubs = ChatRoom.objects.filter(is_public=False)
        result = []
        for club in clubs:
            is_member = club.members.filter(pk=request.user.pk).exists()
            pending_request = ClubMembershipRequest.objects.filter(
                room=club, user=request.user, status='pending'
            ).first()
            icon_url = None
            if club.icon:
                icon_url = request.build_absolute_uri(club.icon.url)
            result.append({
                'id': club.id,
                'name': club.name,
                'description': club.description or '',
                'icon': icon_url,
                'member_count': club.members.count(),
                'is_member': is_member,
                'pending_request': {
                    'id': pending_request.id,
                    'request_type': pending_request.request_type,
                } if pending_request else None,
            })
        return Response(result)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def set_icon(self, request, pk=None):
        """클럽 아이콘 설정 (관리자/클럽장)"""
        room = self.get_object()
        if not room.can_manage(request.user):
            return Response({'error': '권한이 없습니다.'}, status=status.HTTP_403_FORBIDDEN)
        icon = request.FILES.get('icon')
        if icon:
            room.icon = icon
            room.save()
            return Response({'message': '아이콘이 설정되었습니다.', 'icon': room.icon.url})
        elif 'remove_icon' in request.data:
            room.icon = None
            room.save()
            return Response({'message': '아이콘이 제거되었습니다.', 'icon': None})
        return Response({'error': '아이콘 파일이 필요합니다.'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'])
    def club_images(self, request, pk=None):
        """클럽 이미지 목록"""
        room = self.get_object()
        images = room.club_images.all()
        serializer = ClubImageSerializer(images, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def add_club_image(self, request, pk=None):
        """클럽 이미지 추가 (최대 10개)"""
        room = self.get_object()
        if not room.can_manage(request.user):
            return Response({'error': '권한이 없습니다.'}, status=status.HTTP_403_FORBIDDEN)
        if room.club_images.count() >= 10:
            return Response({'error': '이미지는 최대 10개까지 등록할 수 있습니다.'}, status=status.HTTP_400_BAD_REQUEST)
        image = request.FILES.get('image')
        if not image:
            return Response({'error': '이미지 파일이 필요합니다.'}, status=status.HTTP_400_BAD_REQUEST)
        caption = request.data.get('caption', '')
        club_image = ClubImage.objects.create(room=room, image=image, caption=caption)
        serializer = ClubImageSerializer(club_image)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path='club_images/(?P<image_pk>[^/.]+)')
    def delete_club_image(self, request, pk=None, image_pk=None):
        """클럽 이미지 삭제"""
        room = self.get_object()
        if not room.can_manage(request.user):
            return Response({'error': '권한이 없습니다.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            image = room.club_images.get(pk=image_pk)
            image.delete()
            return Response({'message': '이미지가 삭제되었습니다.'})
        except ClubImage.DoesNotExist:
            return Response({'error': '이미지를 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['patch'], url_path='club_images/(?P<image_pk>[^/.]+)/update')
    def update_club_image(self, request, pk=None, image_pk=None):
        """클럽 이미지 수정 (설명)"""
        room = self.get_object()
        if not room.can_manage(request.user):
            return Response({'error': '권한이 없습니다.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            image = room.club_images.get(pk=image_pk)
        except ClubImage.DoesNotExist:
            return Response({'error': '이미지를 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)
        caption = request.data.get('caption')
        if caption is not None:
            image.caption = caption
            image.save(update_fields=['caption'])
        serializer = ClubImageSerializer(image)
        return Response(serializer.data)

    @action(detail=True, methods=['patch'])
    def update_info(self, request, pk=None):
        """클럽 소개글 수정"""
        room = self.get_object()
        if not room.can_manage(request.user):
            return Response({'error': '권한이 없습니다.'}, status=status.HTTP_403_FORBIDDEN)
        description = request.data.get('description')
        if description is not None:
            room.description = description
            room.save(update_fields=['description'])
        return Response({'message': '클럽 정보가 수정되었습니다.', 'description': room.description})


class ChatRoomInvitationViewSet(viewsets.ReadOnlyModelViewSet):
    """채팅방 초대 ViewSet"""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ChatRoomInvitationSerializer

    def get_queryset(self):
        """내 초대 목록"""
        return ChatRoomInvitation.objects.filter(
            user=self.request.user,
            status='pending'
        )

    @action(detail=False, methods=['get'])
    def pending_count(self, request):
        """대기 중인 초대 수"""
        count = ChatRoomInvitation.objects.filter(
            user=request.user,
            status='pending'
        ).count()
        return Response({'count': count})

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        """초대 수락"""
        try:
            invitation = ChatRoomInvitation.objects.get(
                pk=pk,
                user=request.user,
                status='pending'
            )
        except ChatRoomInvitation.DoesNotExist:
            return Response(
                {'error': '초대를 찾을 수 없습니다.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # 초대 수락
        invitation.status = 'accepted'
        invitation.responded_at = timezone.now()
        invitation.save()

        # 채팅방 멤버로 추가
        invitation.room.members.add(request.user)

        # 멤버십 생성
        ChatRoomMembership.objects.get_or_create(
            room=invitation.room,
            user=request.user
        )

        return Response({
            'message': f'{invitation.room.name} 채팅방에 참여했습니다.',
            'room_id': invitation.room.id
        })

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """초대 거절"""
        try:
            invitation = ChatRoomInvitation.objects.get(
                pk=pk,
                user=request.user,
                status='pending'
            )
        except ChatRoomInvitation.DoesNotExist:
            return Response(
                {'error': '초대를 찾을 수 없습니다.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # 초대 거절
        invitation.status = 'rejected'
        invitation.responded_at = timezone.now()
        invitation.save()

        return Response({'message': '초대를 거절했습니다.'})


from rest_framework.views import APIView


class TotalUnreadCountView(APIView):
    """전체 안읽은 메시지 수 조회"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user

        # 초대를 수락한 비공용 채팅방 ID 목록
        accepted_room_ids = ChatRoomInvitation.objects.filter(
            user=user,
            status='accepted'
        ).values_list('room_id', flat=True)

        # 사용자가 참여 중인 채팅방 또는 공용 채팅방
        if user.is_staff or user.role == 'admin':
            rooms = ChatRoom.objects.all()
        elif user.role == 'instructor':
            rooms = ChatRoom.objects.filter(
                Q(is_public=True) | Q(created_by=user) | Q(id__in=accepted_room_ids)
            ).distinct()
        else:
            rooms = ChatRoom.objects.filter(
                Q(is_public=True) | Q(id__in=accepted_room_ids)
            ).distinct()

        total_unread = 0
        for room in rooms:
            # 사용자별 멤버십 조회
            membership = room.memberships.filter(user=user).first()

            # 멤버십이 없으면 스킵 (아직 채팅방에 참여하지 않음)
            if not membership:
                continue

            # 알림이 꺼져있으면 안읽은 메시지 수에 포함하지 않음
            if not membership.notification_enabled:
                continue

            if membership.last_read_at:
                unread = room.messages.filter(
                    is_deleted=False,
                    created_at__gt=membership.last_read_at
                ).exclude(sender=user).count()
            else:
                # 멤버십은 있지만 읽은 적이 없으면 참여 이후 메시지만 카운트
                unread = room.messages.filter(
                    is_deleted=False,
                    created_at__gt=membership.joined_at
                ).exclude(sender=user).count()
            total_unread += unread

        # 대기 중인 초대 수
        pending_invitations = ChatRoomInvitation.objects.filter(
            user=user,
            status='pending'
        ).count()

        return Response({
            'total_unread': total_unread,
            'pending_invitations': pending_invitations
        })


class PublicClubListView(APIView):
    """공개 클럽 목록 API (비로그인 가능)"""
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        clubs = ChatRoom.objects.filter(is_public=False).prefetch_related('club_images')
        result = []
        for club in clubs:
            icon_url = None
            if club.icon:
                icon_url = request.build_absolute_uri(club.icon.url)
            images = []
            for img in club.club_images.all():
                images.append({
                    'id': img.id,
                    'image': request.build_absolute_uri(img.image.url),
                    'caption': img.caption,
                })
            result.append({
                'id': club.id,
                'name': club.name,
                'icon': icon_url,
                'description': club.description or '',
                'member_count': club.members.count(),
                'images': images,
            })
        return Response(result)


class ChatBanViewSet(viewsets.ModelViewSet):
    """채팅 제재 관리 ViewSet (관리자 전용)"""
    permission_classes = [permissions.IsAdminUser]
    pagination_class = None
    serializer_class = ChatBanSerializer

    def get_queryset(self):
        return ChatBan.objects.all()

    @action(detail=False, methods=['get'])
    def active(self, request):
        """활성 제재 목록"""
        bans = ChatBan.objects.filter(is_active=True)
        serializer = self.get_serializer(bans, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def by_user(self, request):
        """사용자별 제재 이력"""
        user_id = request.query_params.get('user_id')
        if not user_id:
            return Response(
                {'error': 'user_id 파라미터가 필요합니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        bans = ChatBan.objects.filter(user_id=user_id)
        serializer = self.get_serializer(bans, many=True)
        return Response(serializer.data)


class ClubMembershipRequestViewSet(viewsets.GenericViewSet):
    """클럽 가입/탈퇴 요청 ViewSet"""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ClubMembershipRequestSerializer
    pagination_class = None

    def get_queryset(self):
        return ClubMembershipRequest.objects.all()

    @action(detail=False, methods=['post'], url_path='request-join')
    def request_join(self, request):
        """클럽 가입 요청 (1인 1클럽 제한)"""
        room_id = request.data.get('room_id')
        if not room_id:
            return Response({'error': 'room_id가 필요합니다.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            room = ChatRoom.objects.get(pk=room_id, is_public=False)
        except ChatRoom.DoesNotExist:
            return Response({'error': '클럽을 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)

        # 이미 다른 클럽 소속이면 차단
        if request.user.assigned_club_id:
            return Response({'error': '이미 다른 클럽에 소속되어 있습니다. 기존 클럽을 탈퇴한 후 가입해주세요.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # 이미 해당 클럽 멤버인 경우
        if room.members.filter(pk=request.user.pk).exists():
            return Response({'error': '이미 해당 클럽의 멤버입니다.'}, status=status.HTTP_400_BAD_REQUEST)

        # 대기 중인 가입 요청이 있는 경우
        if ClubMembershipRequest.objects.filter(
            user=request.user, status='pending', request_type='join'
        ).exists():
            return Response({'error': '이미 대기 중인 가입 요청이 있습니다.'}, status=status.HTTP_400_BAD_REQUEST)

        req = ClubMembershipRequest.objects.create(
            room=room, user=request.user, request_type='join'
        )
        serializer = self.get_serializer(req)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='request-leave')
    def request_leave(self, request):
        """클럽 탈퇴 요청"""
        room_id = request.data.get('room_id')
        if not room_id:
            return Response({'error': 'room_id가 필요합니다.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            room = ChatRoom.objects.get(pk=room_id, is_public=False)
        except ChatRoom.DoesNotExist:
            return Response({'error': '클럽을 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)

        # 멤버가 아닌 경우
        if not room.members.filter(pk=request.user.pk).exists():
            return Response({'error': '해당 클럽의 멤버가 아닙니다.'}, status=status.HTTP_400_BAD_REQUEST)

        # 대기 중인 탈퇴 요청이 있는 경우
        if ClubMembershipRequest.objects.filter(
            room=room, user=request.user, status='pending', request_type='leave'
        ).exists():
            return Response({'error': '이미 대기 중인 탈퇴 요청이 있습니다.'}, status=status.HTTP_400_BAD_REQUEST)

        req = ClubMembershipRequest.objects.create(
            room=room, user=request.user, request_type='leave'
        )
        serializer = self.get_serializer(req)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='my-requests')
    def my_requests(self, request):
        """내 요청 이력"""
        requests = ClubMembershipRequest.objects.filter(user=request.user)
        serializer = self.get_serializer(requests, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='pending-requests')
    def pending_requests(self, request):
        """클럽장: 내 클럽 대기 요청 목록"""
        user = request.user
        if not user.assigned_club_id:
            return Response([])
        if user.role not in ('instructor', 'admin'):
            return Response({'error': '권한이 없습니다.'}, status=status.HTTP_403_FORBIDDEN)

        requests = ClubMembershipRequest.objects.filter(
            room_id=user.assigned_club_id, status='pending'
        )
        serializer = self.get_serializer(requests, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='pending-count')
    def pending_count(self, request):
        """클럽장: 대기 요청 수 (뱃지용)"""
        user = request.user
        if user.role not in ('instructor', 'admin') or not user.assigned_club_id:
            return Response({'count': 0})
        count = ClubMembershipRequest.objects.filter(
            room_id=user.assigned_club_id, status='pending'
        ).count()
        return Response({'count': count})

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """요청 승인"""
        user = request.user
        try:
            req = ClubMembershipRequest.objects.get(pk=pk, status='pending')
        except ClubMembershipRequest.DoesNotExist:
            return Response({'error': '요청을 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)

        # 권한 확인: 관리자이거나, 해당 클럽의 클럽장
        if not (user.is_staff or user.role == 'admin' or
                (user.role == 'instructor' and user.assigned_club_id == req.room_id)):
            return Response({'error': '권한이 없습니다.'}, status=status.HTTP_403_FORBIDDEN)

        req.status = 'approved'
        req.responded_at = timezone.now()
        req.responded_by = user
        req.save()

        if req.request_type == 'join':
            # 멤버로 추가 + assigned_club 설정
            req.room.members.add(req.user)
            ChatRoomMembership.objects.get_or_create(room=req.room, user=req.user)
            req.user.assigned_club = req.room
            req.user.save(update_fields=['assigned_club'])
        elif req.request_type == 'leave':
            # 멤버 제거 + assigned_club 해제
            req.room.members.remove(req.user)
            ChatRoomMembership.objects.filter(room=req.room, user=req.user).delete()
            if req.user.assigned_club_id == req.room_id:
                req.user.assigned_club = None
                req.user.save(update_fields=['assigned_club'])

        return Response({'message': '요청이 승인되었습니다.'})

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """요청 거절"""
        user = request.user
        try:
            req = ClubMembershipRequest.objects.get(pk=pk, status='pending')
        except ClubMembershipRequest.DoesNotExist:
            return Response({'error': '요청을 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)

        # 권한 확인
        if not (user.is_staff or user.role == 'admin' or
                (user.role == 'instructor' and user.assigned_club_id == req.room_id)):
            return Response({'error': '권한이 없습니다.'}, status=status.HTTP_403_FORBIDDEN)

        req.status = 'rejected'
        req.responded_at = timezone.now()
        req.responded_by = user
        req.save()

        return Response({'message': '요청이 거절되었습니다.'})

    @action(detail=False, methods=['get'], url_path='club-members')
    def club_members(self, request):
        """클럽장: 내 클럽 멤버 목록"""
        user = request.user
        if not user.assigned_club_id:
            return Response([])
        if user.role not in ('instructor', 'admin'):
            return Response({'error': '권한이 없습니다.'}, status=status.HTTP_403_FORBIDDEN)

        from accounts.serializers import UserSerializer
        members = user.assigned_club.members.all()
        serializer = UserSerializer(members, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='available-members')
    def available_members(self, request):
        """클럽장: 클럽에 추가 가능한 회원 검색"""
        user = request.user
        if not user.assigned_club_id:
            return Response([])
        if user.role not in ('instructor', 'admin'):
            return Response({'error': '권한이 없습니다.'}, status=status.HTTP_403_FORBIDDEN)

        search = request.query_params.get('search', '').strip()
        if not search:
            return Response([])

        room = user.assigned_club
        available = User.objects.filter(
            is_approved=True
        ).exclude(
            pk__in=room.members.all()
        )

        available = available.filter(
            Q(username__icontains=search) |
            Q(email__icontains=search) |
            Q(phone__icontains=search)
        )[:20]

        from accounts.serializers import UserSerializer
        serializer = UserSerializer(available, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='add-member')
    def add_member(self, request):
        """클럽장: 멤버 직접 추가"""
        user = request.user
        if not user.assigned_club_id:
            return Response({'error': '배정된 클럽이 없습니다.'}, status=status.HTTP_400_BAD_REQUEST)
        if user.role not in ('instructor', 'admin'):
            return Response({'error': '권한이 없습니다.'}, status=status.HTTP_403_FORBIDDEN)

        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'error': 'user_id가 필요합니다.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            target_user = User.objects.get(pk=user_id, is_approved=True)
        except User.DoesNotExist:
            return Response({'error': '사용자를 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)

        room = user.assigned_club

        if room.members.filter(pk=target_user.pk).exists():
            return Response({'error': '이미 클럽 멤버입니다.'}, status=status.HTTP_400_BAD_REQUEST)

        if target_user.assigned_club_id and target_user.assigned_club_id != room.pk:
            return Response({'error': '해당 사용자는 이미 다른 클럽에 소속되어 있습니다.'}, status=status.HTTP_400_BAD_REQUEST)

        # 멤버 추가
        room.members.add(target_user)
        ChatRoomMembership.objects.get_or_create(room=room, user=target_user)
        target_user.assigned_club = room
        target_user.save(update_fields=['assigned_club'])

        return Response({'message': f'{target_user.username}님이 클럽에 추가되었습니다.'})

    @action(detail=False, methods=['post'], url_path='remove-member')
    def remove_member(self, request):
        """클럽장: 멤버 제거"""
        user = request.user
        if not user.assigned_club_id:
            return Response({'error': '배정된 클럽이 없습니다.'}, status=status.HTTP_400_BAD_REQUEST)
        if user.role not in ('instructor', 'admin'):
            return Response({'error': '권한이 없습니다.'}, status=status.HTTP_403_FORBIDDEN)

        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'error': 'user_id가 필요합니다.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            target_user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'error': '사용자를 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)

        room = user.assigned_club

        # 관리자/클럽장 본인은 제거 불가
        if target_user.is_staff or target_user.role == 'admin':
            return Response({'error': '관리자는 제거할 수 없습니다.'}, status=status.HTTP_400_BAD_REQUEST)
        if target_user.pk == user.pk:
            return Response({'error': '본인은 제거할 수 없습니다.'}, status=status.HTTP_400_BAD_REQUEST)

        if not room.members.filter(pk=target_user.pk).exists():
            return Response({'error': '해당 사용자는 클럽 멤버가 아닙니다.'}, status=status.HTTP_400_BAD_REQUEST)

        # 멤버 제거
        room.members.remove(target_user)
        ChatRoomMembership.objects.filter(room=room, user=target_user).delete()
        if target_user.assigned_club_id == room.pk:
            target_user.assigned_club = None
            target_user.save(update_fields=['assigned_club'])

        return Response({'message': f'{target_user.username}님이 클럽에서 제거되었습니다.'})
