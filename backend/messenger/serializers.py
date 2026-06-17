from rest_framework import serializers
from .models import ChatRoom, Message, ChatBan, ChatRoomInvitation, ChatRoomMembership, ClubMembershipRequest, ClubImage
from accounts.serializers import UserSerializer


class MessageSerializer(serializers.ModelSerializer):
    sender = UserSerializer(read_only=True)

    class Meta:
        model = Message
        fields = ['id', 'sender', 'content', 'is_read', 'created_at']
        read_only_fields = ['id', 'sender', 'is_read', 'created_at']


class ChatRoomListSerializer(serializers.ModelSerializer):
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()
    created_by = UserSerializer(read_only=True)
    club_leader = serializers.SerializerMethodField()
    can_manage = serializers.SerializerMethodField()
    notification_enabled = serializers.SerializerMethodField()

    class Meta:
        model = ChatRoom
        fields = ['id', 'name', 'description', 'icon', 'is_group', 'is_public',
                  'created_by', 'club_leader', 'member_count', 'can_manage',
                  'last_message', 'unread_count', 'notification_enabled', 'updated_at']

    def get_last_message(self, obj):
        last_msg = obj.messages.filter(is_deleted=False).last()
        if last_msg:
            return {
                'content': last_msg.content[:50],
                'sender': last_msg.sender.username,
                'created_at': last_msg.created_at
            }
        return None

    def get_unread_count(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            # 사용자의 멤버십 조회
            membership = obj.memberships.filter(user=request.user).first()

            # 멤버십이 없으면 0 (아직 채팅방에 참여하지 않음)
            if not membership:
                return 0

            # 알림이 꺼져있으면 안읽은 메시지 수 표시 안함
            if not membership.notification_enabled:
                return 0

            if membership.last_read_at:
                # 마지막 읽은 시간 이후의 메시지 수
                return obj.messages.filter(
                    is_deleted=False,
                    created_at__gt=membership.last_read_at
                ).exclude(sender=request.user).count()
            else:
                # 멤버십은 있지만 읽은 적이 없으면 참여 이후 메시지만 카운트
                return obj.messages.filter(
                    is_deleted=False,
                    created_at__gt=membership.joined_at
                ).exclude(sender=request.user).count()
        return 0

    def get_member_count(self, obj):
        return obj.members.count()

    def get_club_leader(self, obj):
        """클럽에 배정된 클럽장(instructor) 반환"""
        from django.contrib.auth import get_user_model
        User = get_user_model()
        leader = User.objects.filter(
            assigned_club=obj, role='instructor'
        ).first()
        if leader:
            return UserSerializer(leader).data
        return None

    def get_can_manage(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.can_manage(request.user)
        return False

    def get_notification_enabled(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            membership = obj.memberships.filter(user=request.user).first()
            return membership.notification_enabled if membership else True
        return True


class ChatRoomDetailSerializer(serializers.ModelSerializer):
    members = UserSerializer(many=True, read_only=True)
    messages = serializers.SerializerMethodField()
    created_by = UserSerializer(read_only=True)
    club_leader = serializers.SerializerMethodField()
    can_manage = serializers.SerializerMethodField()

    class Meta:
        model = ChatRoom
        fields = ['id', 'name', 'description', 'icon', 'is_group', 'is_public',
                  'created_by', 'club_leader', 'members', 'can_manage',
                  'messages', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_messages(self, obj):
        # 최근 50개 메시지만 반환
        messages = obj.messages.filter(is_deleted=False).order_by('-created_at')[:50]
        return MessageSerializer(messages, many=True).data

    def get_club_leader(self, obj):
        """클럽에 배정된 클럽장(instructor) 반환"""
        from django.contrib.auth import get_user_model
        User = get_user_model()
        leader = User.objects.filter(
            assigned_club=obj, role='instructor'
        ).first()
        if leader:
            return UserSerializer(leader).data
        return None

    def get_can_manage(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.can_manage(request.user)
        return False


class ChatRoomCreateSerializer(serializers.ModelSerializer):
    member_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False
    )

    class Meta:
        model = ChatRoom
        fields = ['name', 'description', 'is_group', 'member_ids']

    def create(self, validated_data):
        member_ids = validated_data.pop('member_ids', [])
        # created_by는 view에서 설정
        room = ChatRoom.objects.create(**validated_data)
        # 초대된 멤버 추가
        for member_id in member_ids:
            room.members.add(member_id)
        return room


class ChatBanSerializer(serializers.ModelSerializer):
    """채팅 제재 시리얼라이저"""
    user = UserSerializer(read_only=True)
    banned_by = UserSerializer(read_only=True)
    ban_type_display = serializers.CharField(source='get_ban_type_display', read_only=True)
    room_name = serializers.CharField(source='room.name', read_only=True)

    class Meta:
        model = ChatBan
        fields = ['id', 'room', 'room_name', 'user', 'banned_by', 'ban_type', 'ban_type_display',
                  'reason', 'expires_at', 'is_active', 'created_at']
        read_only_fields = ['id', 'user', 'banned_by', 'created_at']


class ChatBanCreateSerializer(serializers.ModelSerializer):
    """채팅 제재 생성 시리얼라이저"""
    user_id = serializers.IntegerField(write_only=True)

    class Meta:
        model = ChatBan
        fields = ['user_id', 'ban_type', 'reason', 'expires_at']

    def create(self, validated_data):
        user_id = validated_data.pop('user_id')
        from django.contrib.auth import get_user_model
        User = get_user_model()
        user = User.objects.get(pk=user_id)
        validated_data['user'] = user
        return super().create(validated_data)


class ChatRoomSimpleSerializer(serializers.ModelSerializer):
    """채팅방 간단 시리얼라이저 (초대용)"""
    class Meta:
        model = ChatRoom
        fields = ['id', 'name', 'description', 'is_public']


class ChatRoomInvitationSerializer(serializers.ModelSerializer):
    """채팅방 초대 시리얼라이저"""
    room = ChatRoomSimpleSerializer(read_only=True)
    user = UserSerializer(read_only=True)
    invited_by = UserSerializer(read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = ChatRoomInvitation
        fields = ['id', 'room', 'user', 'invited_by', 'status', 'status_display',
                  'created_at', 'responded_at']
        read_only_fields = ['id', 'created_at', 'responded_at']


class ChatRoomMembershipSerializer(serializers.ModelSerializer):
    """채팅방 멤버십 시리얼라이저"""

    class Meta:
        model = ChatRoomMembership
        fields = ['id', 'room', 'user', 'notification_enabled', 'joined_at']
        read_only_fields = ['id', 'room', 'user', 'joined_at']


class ClubImageSerializer(serializers.ModelSerializer):
    """클럽 이미지 시리얼라이저"""
    class Meta:
        model = ClubImage
        fields = ['id', 'image', 'caption', 'order', 'created_at']
        read_only_fields = ['id', 'created_at']


class ClubMembershipRequestSerializer(serializers.ModelSerializer):
    """클럽 가입/탈퇴 요청 시리얼라이저"""
    user = UserSerializer(read_only=True)
    room_name = serializers.CharField(source='room.name', read_only=True)
    request_type_display = serializers.CharField(source='get_request_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    responded_by_name = serializers.CharField(source='responded_by.username', read_only=True, default=None)

    class Meta:
        model = ClubMembershipRequest
        fields = ['id', 'room', 'room_name', 'user', 'request_type', 'request_type_display',
                  'status', 'status_display', 'created_at', 'responded_at', 'responded_by_name']
        read_only_fields = ['id', 'created_at', 'responded_at']
