from rest_framework import generics, status, permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import get_user_model, authenticate
from django.core.mail import send_mail
from django.conf import settings

from .models import EmailVerification
from .serializers import (
    UserSerializer, RegisterSerializer, SimpleRegisterSerializer, UserUpdateSerializer, AdminUserSerializer,
    EmailVerificationSerializer, VerifyCodeSerializer
)

User = get_user_model()


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """커스텀 토큰 시리얼라이저 - 이메일 또는 이름으로 로그인, 승인 여부 체크"""

    def validate(self, attrs):
        # 이메일 또는 이름으로 사용자 찾기
        email_or_name = attrs.get('email', '')
        password = attrs.get('password')

        if email_or_name and password:
            # 먼저 이메일로 검색, 없으면 이름으로 검색
            user = User.objects.filter(email=email_or_name).first()
            if not user:
                users_by_name = User.objects.filter(username=email_or_name)
                if users_by_name.count() == 1:
                    user = users_by_name.first()
                elif users_by_name.count() > 1:
                    raise serializers.ValidationError({
                        'detail': '동일한 이름의 회원이 여러 명 있습니다. 이메일로 로그인해주세요.'
                    })

            if not user:
                raise serializers.ValidationError({
                    'detail': '이메일/이름 또는 비밀번호가 올바르지 않습니다.'
                })

            # 차단된 사용자 체크
            if not user.is_active:
                raise serializers.ValidationError({
                    'detail': '차단된 계정입니다. 관리자에게 문의하세요.'
                })

            # 승인 여부 체크
            if not user.is_approved:
                raise serializers.ValidationError({
                    'detail': '관리자 승인 대기 중입니다. 승인 후 로그인 가능합니다.'
                })

            # 이름으로 로그인한 경우, attrs의 email을 실제 이메일로 교체
            attrs['email'] = user.email

        # 기본 검증 수행 (비밀번호 확인 등)
        return super().validate(attrs)


class CustomTokenObtainPairView(TokenObtainPairView):
    """커스텀 로그인 뷰 - 승인된 사용자만 로그인 가능"""
    serializer_class = CustomTokenObtainPairSerializer


class SendVerificationCodeView(APIView):
    """이메일 인증 코드 발송 API"""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = EmailVerificationSerializer(data=request.data)
        if serializer.is_valid():
            email = serializer.validated_data['email']

            # 이미 가입된 이메일인지 확인
            if User.objects.filter(email=email).exists():
                return Response(
                    {'error': '이미 가입된 이메일입니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # 인증 코드 생성
            verification = EmailVerification.create_verification(email)

            # 이메일 발송
            try:
                send_mail(
                    subject='[DDGolf] 이메일 인증 코드',
                    message=f'인증 코드: {verification.code}\n\n이 코드는 10분간 유효합니다.',
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[email],
                    html_message=f'''
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #16a34a;">DDGolf 이메일 인증</h2>
                        <p>안녕하세요, DDGolf 회원가입을 위한 인증 코드입니다.</p>
                        <div style="background-color: #f3f4f6; padding: 20px; text-align: center; margin: 20px 0;">
                            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #16a34a;">
                                {verification.code}
                            </span>
                        </div>
                        <p style="color: #6b7280;">이 코드는 10분간 유효합니다.</p>
                        <p style="color: #6b7280;">본인이 요청하지 않은 경우 이 이메일을 무시하세요.</p>
                    </div>
                    ''',
                )
                return Response({
                    'message': '인증 코드가 발송되었습니다.',
                    'email': email
                })
            except Exception as e:
                return Response(
                    {'error': '이메일 발송에 실패했습니다.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class VerifyCodeView(APIView):
    """이메일 인증 코드 확인 API"""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = VerifyCodeSerializer(data=request.data)
        if serializer.is_valid():
            email = serializer.validated_data['email']
            code = serializer.validated_data['code']

            success, message = EmailVerification.verify_code(email, code)
            if success:
                return Response({'message': message, 'verified': True})
            return Response(
                {'error': message, 'verified': False},
                status=status.HTTP_400_BAD_REQUEST
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class RegisterView(generics.CreateAPIView):
    """회원가입 API (이메일 인증 필요)"""
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class SimpleRegisterView(generics.CreateAPIView):
    """간편 회원가입 API (이메일 인증 없음)"""
    queryset = User.objects.all()
    serializer_class = SimpleRegisterSerializer
    permission_classes = [permissions.AllowAny]


class GoogleLoginView(APIView):
    """Google OAuth 콜백 처리"""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        """프론트엔드에서 Google access_token을 받아 처리"""
        access_token = request.data.get('access_token')
        if not access_token:
            return Response(
                {'error': 'access_token이 필요합니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Google API로 사용자 정보 가져오기
            import requests
            google_response = requests.get(
                'https://www.googleapis.com/oauth2/v3/userinfo',
                headers={'Authorization': f'Bearer {access_token}'}
            )

            if google_response.status_code != 200:
                return Response(
                    {'error': 'Google 인증에 실패했습니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            google_data = google_response.json()
            email = google_data.get('email')
            name = google_data.get('name', email.split('@')[0])

            if not email:
                return Response(
                    {'error': '이메일 정보를 가져올 수 없습니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # 기존 사용자 확인 또는 새 사용자 생성
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    'username': name,
                    'is_email_verified': True,
                    'social_provider': 'google',
                    'role': 'pending',
                    'is_approved': False,
                }
            )

            if created:
                user.set_unusable_password()
                user.save()

            # 차단된 사용자 체크
            if not user.is_active:
                return Response(
                    {'error': '차단된 계정입니다. 관리자에게 문의하세요.'},
                    status=status.HTTP_403_FORBIDDEN
                )

            # 승인되지 않은 사용자는 토큰 발급하지 않음
            if not user.is_approved:
                return Response({
                    'user': UserSerializer(user).data,
                    'created': created,
                    'pending_approval': True,
                    'message': '관리자 승인 대기 중입니다. 승인 후 로그인 가능합니다.'
                }, status=status.HTTP_202_ACCEPTED)

            # 승인된 사용자만 JWT 토큰 생성
            refresh = RefreshToken.for_user(user)

            return Response({
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'user': UserSerializer(user).data,
                'created': created,
            })

        except Exception as e:
            return Response(
                {'error': f'Google 로그인 처리 중 오류가 발생했습니다: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ProfileView(generics.RetrieveUpdateAPIView):
    """프로필 조회/수정 API"""
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user

    def get_serializer_class(self):
        if self.request.method in ['PUT', 'PATCH']:
            return UserUpdateSerializer
        return UserSerializer

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        # 전체 사용자 정보를 반환
        return Response(UserSerializer(instance).data)


class UserListView(generics.ListAPIView):
    """회원 목록 API (관리자용)"""
    queryset = User.objects.all().order_by('-created_at')
    serializer_class = AdminUserSerializer
    permission_classes = [permissions.IsAdminUser]


class PendingUserCountView(APIView):
    """미승인 회원 수 조회 API (관리자용)"""
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        count = User.objects.filter(is_approved=False).count()
        return Response({'count': count})


class AdminNotificationsView(APIView):
    """관리자 대시보드 알림 카운트 API"""
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        from schedule.models import EventParticipant

        pending_users = User.objects.filter(is_approved=False).count()
        pending_participants = EventParticipant.objects.filter(
            status=EventParticipant.Status.PENDING
        ).count()

        return Response({
            'pending_users': pending_users,
            'pending_participants': pending_participants,
            'total': pending_users + pending_participants,
        })


class UserApproveView(APIView):
    """회원 승인 API (관리자용)"""
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, pk):
        from messenger.models import ChatRoom, ChatRoomMembership

        try:
            user = User.objects.get(pk=pk)
            user.is_approved = True
            approved_role = request.data.get('role', user.requested_role)
            if approved_role in ['instructor', 'member']:
                user.role = approved_role
            else:
                user.role = user.requested_role

            # 클럽 배정 로직
            assigned_club_id = request.data.get('assigned_club')
            if assigned_club_id:
                try:
                    club = ChatRoom.objects.get(pk=assigned_club_id)
                    user.assigned_club = club
                    # 클럽 멤버 추가 및 멤버십 자동 생성
                    club.members.add(user)
                    ChatRoomMembership.objects.get_or_create(room=club, user=user)
                except ChatRoom.DoesNotExist:
                    pass

            user.save()
            role_display = user.get_role_display()
            return Response({
                'message': f'회원이 {role_display}(으)로 승인되었습니다.',
                'role': user.role,
                'role_display': role_display,
                'assigned_club': user.assigned_club_id
            })
        except User.DoesNotExist:
            return Response(
                {'error': '사용자를 찾을 수 없습니다.'},
                status=status.HTTP_404_NOT_FOUND
            )


class UserChangeRoleView(APIView):
    """회원 역할 변경 API (관리자용)"""
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
            new_role = request.data.get('role')
            if new_role not in ['admin', 'instructor', 'member']:
                return Response(
                    {'error': '유효하지 않은 역할입니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            user.role = new_role
            user.save()
            return Response({
                'message': f'회원 역할이 {user.get_role_display()}(으)로 변경되었습니다.',
                'role': user.role,
                'role_display': user.get_role_display()
            })
        except User.DoesNotExist:
            return Response(
                {'error': '사용자를 찾을 수 없습니다.'},
                status=status.HTTP_404_NOT_FOUND
            )


class UserToggleClubMembershipView(APIView):
    """클럽 가입 희망 여부 변경 API (관리자용)"""
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
            wants = request.data.get('wants_club_membership')
            if wants is not None:
                user.wants_club_membership = wants
            else:
                user.wants_club_membership = not user.wants_club_membership
            user.save()
            return Response({
                'message': f'클럽 가입 희망이 {"활성화" if user.wants_club_membership else "비활성화"}되었습니다.',
                'wants_club_membership': user.wants_club_membership,
            })
        except User.DoesNotExist:
            return Response(
                {'error': '사용자를 찾을 수 없습니다.'},
                status=status.HTTP_404_NOT_FOUND
            )


class UserDeleteView(APIView):
    """미승인 회원 삭제 API (관리자용)"""
    permission_classes = [permissions.IsAdminUser]

    def delete(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
            if user.is_approved:
                return Response(
                    {'error': '승인된 회원은 삭제할 수 없습니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            user.delete()
            return Response({'message': '회원이 삭제되었습니다.'})
        except User.DoesNotExist:
            return Response(
                {'error': '사용자를 찾을 수 없습니다.'},
                status=status.HTTP_404_NOT_FOUND
            )


class AccountDeleteView(APIView):
    """본인 계정 삭제 API"""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        password = request.data.get('password')

        # 관리자 계정은 삭제 불가
        if user.role == 'admin':
            return Response(
                {'error': '관리자 계정은 삭제할 수 없습니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 소셜 로그인 사용자가 아닌 경우 비밀번호 확인
        if not user.social_provider:
            if not password:
                return Response(
                    {'error': '비밀번호를 입력해주세요.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if not user.check_password(password):
                return Response(
                    {'error': '비밀번호가 일치하지 않습니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # 클럽 멤버십 정리
        user.chat_rooms.clear()

        user.delete()
        return Response({'message': '계정이 삭제되었습니다.'})


class UserBlockView(APIView):
    """회원 차단 API (관리자용)"""
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
            user.is_active = False
            user.save()
            return Response({'message': '회원이 차단되었습니다.'})
        except User.DoesNotExist:
            return Response(
                {'error': '사용자를 찾을 수 없습니다.'},
                status=status.HTTP_404_NOT_FOUND
            )


class UserUnblockView(APIView):
    """회원 차단 해제 API (관리자용)"""
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
            user.is_active = True
            user.save()
            return Response({'message': '회원 차단이 해제되었습니다.'})
        except User.DoesNotExist:
            return Response(
                {'error': '사용자를 찾을 수 없습니다.'},
                status=status.HTTP_404_NOT_FOUND
            )


class UserAssignClubView(APIView):
    """회원 클럽 배정 API (관리자용)"""
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, pk):
        from messenger.models import ChatRoom, ChatRoomMembership

        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response(
                {'error': '사용자를 찾을 수 없습니다.'},
                status=status.HTTP_404_NOT_FOUND
            )

        club_id = request.data.get('club_id')

        # 기존 클럽 멤버십 제거 (이전 배정 클럽에서)
        if user.assigned_club:
            old_club = user.assigned_club
            old_club.members.remove(user)
            ChatRoomMembership.objects.filter(room=old_club, user=user).delete()

        if club_id:
            try:
                new_club = ChatRoom.objects.get(pk=club_id)
                user.assigned_club = new_club
                new_club.members.add(user)
                ChatRoomMembership.objects.get_or_create(room=new_club, user=user)
                user.save()
                return Response({
                    'message': f'{user.username}님이 {new_club.name} 클럽에 배정되었습니다.',
                    'assigned_club': new_club.id,
                    'assigned_club_name': new_club.name,
                })
            except ChatRoom.DoesNotExist:
                return Response(
                    {'error': '클럽을 찾을 수 없습니다.'},
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            user.assigned_club = None
            user.save()
            return Response({
                'message': f'{user.username}님의 클럽 배정이 해제되었습니다.',
                'assigned_club': None,
                'assigned_club_name': None,
            })


class DashboardStatsView(APIView):
    """관리자 대시보드 통계 API"""
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        from notices.models import Notice
        from schedule.models import Event
        from messenger.models import ChatRoom
        from sms.models import SmsLog
        from django.utils import timezone

        total_users = User.objects.count()
        pending_users = User.objects.filter(is_approved=False).count()
        admin_count = User.objects.filter(role='admin').count()
        instructor_count = User.objects.filter(role='instructor').count()
        member_count = User.objects.filter(role='member').count()
        club_count = ChatRoom.objects.filter(is_public=False).count()
        total_notices = Notice.objects.count()
        total_events = Event.objects.count()
        upcoming_events_count = Event.objects.filter(start_date__gte=timezone.now()).count()
        total_sms_sent = SmsLog.objects.count()

        recent_users = list(
            User.objects.order_by('-created_at')[:5].values(
                'id', 'username', 'email', 'role', 'is_approved', 'created_at'
            )
        )
        recent_notices = list(
            Notice.objects.order_by('-created_at')[:5].values(
                'id', 'title', 'created_at'
            )
        )

        # System resource info
        import psutil
        cpu_percent = psutil.cpu_percent(interval=0.5)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage('/')

        return Response({
            'total_users': total_users,
            'pending_users': pending_users,
            'admin_count': admin_count,
            'instructor_count': instructor_count,
            'member_count': member_count,
            'club_count': club_count,
            'total_notices': total_notices,
            'total_events': total_events,
            'upcoming_events_count': upcoming_events_count,
            'total_sms_sent': total_sms_sent,
            'recent_users': recent_users,
            'recent_notices': recent_notices,
            'system': {
                'cpu_percent': cpu_percent,
                'memory_total': mem.total,
                'memory_used': mem.used,
                'memory_percent': mem.percent,
                'disk_total': disk.total,
                'disk_used': disk.used,
                'disk_percent': disk.percent,
            },
        })


class VerifyPasswordView(APIView):
    """비밀번호 확인 API"""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        password = request.data.get('password')
        if not password:
            return Response(
                {'error': '비밀번호를 입력해주세요.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if request.user.check_password(password):
            return Response({'verified': True, 'message': '비밀번호가 확인되었습니다.'})
        return Response(
            {'verified': False, 'error': '비밀번호가 일치하지 않습니다.'},
            status=status.HTTP_400_BAD_REQUEST
        )


class ChangePasswordView(APIView):
    """비밀번호 변경 API"""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        current_password = request.data.get('current_password')
        new_password = request.data.get('new_password')
        new_password2 = request.data.get('new_password2')

        if not all([current_password, new_password, new_password2]):
            return Response(
                {'error': '모든 필드를 입력해주세요.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not request.user.check_password(current_password):
            return Response(
                {'error': '현재 비밀번호가 일치하지 않습니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if new_password != new_password2:
            return Response(
                {'error': '새 비밀번호가 일치하지 않습니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if len(new_password) < 8:
            return Response(
                {'error': '비밀번호는 8자 이상이어야 합니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        request.user.set_password(new_password)
        request.user.save()
        return Response({'message': '비밀번호가 변경되었습니다.'})
