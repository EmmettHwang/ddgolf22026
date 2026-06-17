import random
import string
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.utils import timezone
from datetime import timedelta


class UserManager(BaseUserManager):
    """커스텀 사용자 매니저"""

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('이메일은 필수입니다.')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_approved', True)
        extra_fields.setdefault('role', 'admin')

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')

        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    """커스텀 사용자 모델"""

    class Role(models.TextChoices):
        ADMIN = 'admin', '관리자'
        INSTRUCTOR = 'instructor', '클럽장'
        MEMBER = 'member', '일반 회원'
        PENDING = 'pending', '승인대기'

    # 이름 필드 - 한글 등 유니코드 문자 허용
    username = models.CharField(
        '이름',
        max_length=150,
        unique=False,  # 이메일이 고유 식별자이므로 이름은 중복 허용
        help_text='사용자 이름',
    )
    email = models.EmailField('이메일', unique=True)
    phone = models.CharField('전화번호', max_length=20, blank=True)
    profile_image = models.ImageField('프로필 이미지', upload_to='profiles/', blank=True, null=True)
    role = models.CharField('역할', max_length=20, choices=Role.choices, default=Role.PENDING)
    requested_role = models.CharField(
        '요청 역할',
        max_length=20,
        choices=[
            ('instructor', '클럽장'),
            ('member', '일반 회원'),
        ],
        default='member',
        help_text='회원가입 시 신청한 역할'
    )
    is_approved = models.BooleanField('승인 여부', default=False)
    wants_club_membership = models.BooleanField('클럽 가입 희망', default=False)
    requested_club = models.ForeignKey(
        'messenger.ChatRoom',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        verbose_name='희망 클럽',
        related_name='requested_members'
    )
    assigned_club = models.ForeignKey(
        'messenger.ChatRoom',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        verbose_name='배정 클럽',
        related_name='assigned_members'
    )
    is_email_verified = models.BooleanField('이메일 인증 여부', default=False)
    social_provider = models.CharField('소셜 로그인 제공자', max_length=20, blank=True, null=True)
    created_at = models.DateTimeField('가입일', auto_now_add=True)
    updated_at = models.DateTimeField('수정일', auto_now=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    objects = UserManager()

    class Meta:
        verbose_name = '사용자'
        verbose_name_plural = '사용자 목록'

    def __str__(self):
        return self.email


class EmailVerification(models.Model):
    """이메일 인증 코드"""
    email = models.EmailField('이메일')
    code = models.CharField('인증 코드', max_length=6)
    is_verified = models.BooleanField('인증 완료', default=False)
    created_at = models.DateTimeField('생성일', auto_now_add=True)
    expires_at = models.DateTimeField('만료일')

    class Meta:
        verbose_name = '이메일 인증'
        verbose_name_plural = '이메일 인증 목록'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.email} - {self.code}'

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(minutes=10)
        super().save(*args, **kwargs)

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    @classmethod
    def generate_code(cls):
        """6자리 인증 코드 생성"""
        return ''.join(random.choices(string.digits, k=6))

    @classmethod
    def create_verification(cls, email):
        """새 인증 코드 생성 (기존 코드 삭제)"""
        cls.objects.filter(email=email, is_verified=False).delete()
        code = cls.generate_code()
        return cls.objects.create(email=email, code=code)

    @classmethod
    def verify_code(cls, email, code):
        """인증 코드 확인"""
        try:
            verification = cls.objects.get(
                email=email,
                code=code,
                is_verified=False
            )
            if verification.is_expired:
                return False, '인증 코드가 만료되었습니다.'
            verification.is_verified = True
            verification.save()
            return True, '인증이 완료되었습니다.'
        except cls.DoesNotExist:
            return False, '잘못된 인증 코드입니다.'
