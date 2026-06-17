from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password

from .models import EmailVerification

User = get_user_model()


class EmailVerificationSerializer(serializers.Serializer):
    """이메일 인증 코드 발송 시리얼라이저"""
    email = serializers.EmailField()


class VerifyCodeSerializer(serializers.Serializer):
    """이메일 인증 코드 확인 시리얼라이저"""
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6, min_length=6)


class UserSerializer(serializers.ModelSerializer):
    """사용자 정보 시리얼라이저"""
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    requested_role_display = serializers.CharField(source='get_requested_role_display', read_only=True)
    assigned_club_name = serializers.CharField(source='assigned_club.name', read_only=True, default=None)
    requested_club_name = serializers.CharField(source='requested_club.name', read_only=True, default=None)

    class Meta:
        model = User
        fields = ['id', 'email', 'username', 'phone', 'profile_image',
                  'role', 'role_display', 'requested_role', 'requested_role_display',
                  'is_approved', 'is_email_verified', 'social_provider', 'created_at',
                  'wants_club_membership', 'requested_club', 'requested_club_name',
                  'assigned_club', 'assigned_club_name']
        read_only_fields = ['id', 'role', 'role_display', 'requested_role_display',
                           'is_approved', 'is_email_verified', 'social_provider', 'created_at',
                           'assigned_club']


class RegisterSerializer(serializers.ModelSerializer):
    """회원가입 시리얼라이저"""
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True)
    requested_role = serializers.ChoiceField(
        choices=[('instructor', '클럽장'), ('member', '일반 회원')],
        default='member'
    )
    verification_code = serializers.CharField(write_only=True, max_length=6, min_length=6)
    wants_club_membership = serializers.BooleanField(default=False)
    requested_club = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.none(),  # overridden in __init__
        required=False, allow_null=True, default=None
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from messenger.models import ChatRoom
        self.fields['requested_club'].queryset = ChatRoom.objects.all()

    class Meta:
        model = User
        fields = ['email', 'username', 'password', 'password2', 'phone', 'requested_role', 'verification_code', 'wants_club_membership', 'requested_club']

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({"password": "비밀번호가 일치하지 않습니다."})

        # 이메일 인증 확인
        email = attrs['email']
        code = attrs.get('verification_code')

        try:
            verification = EmailVerification.objects.get(
                email=email,
                code=code,
                is_verified=True
            )
        except EmailVerification.DoesNotExist:
            raise serializers.ValidationError({"verification_code": "이메일 인증이 완료되지 않았습니다."})

        return attrs

    def create(self, validated_data):
        validated_data.pop('password2')
        validated_data.pop('verification_code')
        # 회원가입 시 role은 pending, is_approved는 False로 설정
        validated_data['role'] = 'pending'
        validated_data['is_approved'] = False
        validated_data['is_email_verified'] = True
        user = User.objects.create_user(**validated_data)
        return user


class SimpleRegisterSerializer(serializers.ModelSerializer):
    """간편 회원가입 시리얼라이저 (이메일 인증 없음)"""
    password = serializers.CharField(write_only=True, validators=[validate_password])
    requested_role = serializers.ChoiceField(
        choices=[('instructor', '클럽장'), ('member', '일반 회원')],
        default='member'
    )
    wants_club_membership = serializers.BooleanField(default=False)
    requested_club = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.none(),  # overridden in __init__
        required=False, allow_null=True, default=None
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from messenger.models import ChatRoom
        self.fields['requested_club'].queryset = ChatRoom.objects.all()

    class Meta:
        model = User
        fields = ['email', 'username', 'password', 'phone', 'requested_role', 'wants_club_membership', 'requested_club']

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("이미 가입된 이메일입니다.")
        return value

    def create(self, validated_data):
        # 회원가입 시 role은 pending, is_approved는 False로 설정
        validated_data['role'] = 'pending'
        validated_data['is_approved'] = False
        validated_data['is_email_verified'] = False
        user = User.objects.create_user(**validated_data)
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    """사용자 정보 수정 시리얼라이저"""

    class Meta:
        model = User
        fields = ['username', 'phone', 'email', 'profile_image']

    def validate_email(self, value):
        user = self.context['request'].user
        if User.objects.filter(email=value).exclude(pk=user.pk).exists():
            raise serializers.ValidationError("이미 사용 중인 이메일입니다.")
        return value


class AdminUserSerializer(serializers.ModelSerializer):
    """관리자용 사용자 시리얼라이저"""
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    requested_role_display = serializers.CharField(source='get_requested_role_display', read_only=True)
    assigned_club_name = serializers.CharField(source='assigned_club.name', read_only=True, default=None)
    requested_club_name = serializers.CharField(source='requested_club.name', read_only=True, default=None)

    class Meta:
        model = User
        fields = ['id', 'email', 'username', 'phone', 'profile_image',
                  'role', 'role_display', 'requested_role', 'requested_role_display',
                  'is_approved', 'is_email_verified', 'social_provider',
                  'is_active', 'created_at', 'last_login',
                  'wants_club_membership', 'requested_club', 'requested_club_name',
                  'assigned_club', 'assigned_club_name']
        read_only_fields = ['id', 'email', 'created_at', 'last_login']
