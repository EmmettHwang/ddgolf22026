from django.db import models
from django.conf import settings


class History(models.Model):
    """협회 연혁"""
    year = models.IntegerField('연도')
    content = models.CharField('내용', max_length=500)
    detail = models.TextField('상세 내용', blank=True, default='')
    order = models.PositiveIntegerField('순서', default=0)

    class Meta:
        verbose_name = '연혁'
        verbose_name_plural = '연혁 목록'
        ordering = ['order', '-year']

    def __str__(self):
        return f'{self.year} - {self.content}'


class Notice(models.Model):
    """공지사항"""

    class Visibility(models.TextChoices):
        PUBLIC = 'public', '공용 (비로그인 가능)'
        MEMBER = 'member', '회원 전용'
        CLUB = 'club', '클럽 전용'

    title = models.CharField('제목', max_length=200)
    content = models.TextField('내용')
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notices',
        verbose_name='작성자'
    )
    club = models.ForeignKey(
        'messenger.ChatRoom',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='club_notices',
        verbose_name='클럽',
    )
    visibility = models.CharField(
        '노출 범위',
        max_length=20,
        choices=Visibility.choices,
        default=Visibility.MEMBER
    )
    is_important = models.BooleanField('중요 공지', default=False)
    is_hidden = models.BooleanField('숨김', default=False)
    is_popup = models.BooleanField('팝업 표시', default=False)
    popup_image = models.ImageField('팝업 이미지', upload_to='popup/', blank=True, null=True)
    popup_content = models.TextField('팝업 문구', blank=True, default='')
    linked_event = models.ForeignKey(
        'schedule.Event',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='popup_notices',
        verbose_name='연결 경기일정',
    )
    views = models.PositiveIntegerField('조회수', default=0)
    created_at = models.DateTimeField('작성일', auto_now_add=True)
    updated_at = models.DateTimeField('수정일', auto_now=True)

    class Meta:
        verbose_name = '공지사항'
        verbose_name_plural = '공지사항 목록'
        ordering = ['-is_important', '-created_at']

    def __str__(self):
        return self.title


class Banner(models.Model):
    """배너 광고"""
    image = models.ImageField('배너 이미지', upload_to='banners/')
    phone_number = models.CharField('전화번호', max_length=20)
    description = models.CharField('간단 문구', max_length=100)
    link = models.URLField('링크', max_length=500, blank=True, default='')
    order = models.PositiveIntegerField('순서', default=0)
    is_active = models.BooleanField('활성화', default=True)
    created_at = models.DateTimeField('생성일', auto_now_add=True)

    class Meta:
        verbose_name = '배너'
        verbose_name_plural = '배너 목록'
        ordering = ['order', '-created_at']

    def __str__(self):
        return self.description


class AboutContent(models.Model):
    """협회소개 콘텐츠 (싱글톤)"""
    greeting_text = models.TextField('인사말 텍스트', blank=True, default='')
    greeting_author = models.CharField('인사말 서명', max_length=100, blank=True, default='대덕구골프협회장')
    greeting_image = models.ImageField('인사말 이미지', upload_to='about/', blank=True, null=True)
    updated_at = models.DateTimeField('수정일', auto_now=True)

    class Meta:
        verbose_name = '협회소개 콘텐츠'
        verbose_name_plural = '협회소개 콘텐츠'

    def __str__(self):
        return '협회소개 콘텐츠'

    def save(self, *args, **kwargs):
        # 싱글톤: 항상 pk=1로 저장
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class Executive(models.Model):
    """협회 임원"""
    name = models.CharField('이름', max_length=50)
    phone = models.CharField('전화번호', max_length=20, blank=True, default='')
    greeting = models.TextField('인사말', blank=True, default='')
    photo = models.ImageField('프로필 사진', upload_to='executives/', blank=True, null=True)
    order = models.PositiveIntegerField('순서', default=0)
    created_at = models.DateTimeField('등록일', auto_now_add=True)

    class Meta:
        verbose_name = '협회 임원'
        verbose_name_plural = '협회 임원 목록'
        ordering = ['order', 'created_at']

    def __str__(self):
        return self.name


class SiteSettings(models.Model):
    """사이트 전역 설정 (싱글톤)"""
    marquee_enabled = models.BooleanField('유관기관 스크롤', default=True)

    class Meta:
        verbose_name = '사이트 설정'
        verbose_name_plural = '사이트 설정'

    def __str__(self):
        return '사이트 설정'

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class Organization(models.Model):
    """유관기관"""
    name = models.CharField('기관명', max_length=100)
    logo = models.ImageField('로고', upload_to='organizations/')
    link = models.URLField('링크')
    order = models.PositiveIntegerField('순서', default=0)
    is_active = models.BooleanField('활성화', default=True)

    class Meta:
        verbose_name = '유관기관'
        verbose_name_plural = '유관기관 목록'
        ordering = ['order']

    def __str__(self):
        return self.name
