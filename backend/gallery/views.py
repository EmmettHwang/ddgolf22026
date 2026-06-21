from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Max

from .models import Album, Photo, GalleryCategory
from .serializers import (
    AlbumListSerializer, AlbumDetailSerializer, AlbumCreateSerializer,
    PhotoSerializer, AlbumAdminSerializer, GalleryCategorySerializer
)


class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user and request.user.is_staff


class GalleryCategoryViewSet(viewsets.ModelViewSet):
    """갤러리 카테고리 ViewSet"""
    queryset = GalleryCategory.objects.all()
    serializer_class = GalleryCategorySerializer
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = None

    def perform_create(self, serializer):
        max_order = GalleryCategory.objects.order_by('-order').values_list('order', flat=True).first() or 0
        serializer.save(order=max_order + 1)


class IsAuthorOrReadOnly(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        # 관리자는 모든 권한
        if request.user.is_staff:
            return True
        return obj.author == request.user


class AlbumViewSet(viewsets.ModelViewSet):
    """앨범 ViewSet"""
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsAuthorOrReadOnly]
    pagination_class = None

    def get_queryset(self):
        queryset = Album.objects.all()

        # 관리자가 아니면 숨김 앨범 제외
        if not self.request.user.is_staff:
            queryset = queryset.filter(is_hidden=False)

        is_public = self.request.query_params.get('public')
        album_type = self.request.query_params.get('type')

        if is_public == 'true':
            queryset = queryset.filter(is_public=True)
        elif not self.request.user.is_authenticated:
            queryset = queryset.filter(is_public=True)

        if album_type:
            queryset = queryset.filter(album_type=album_type)

        category = self.request.query_params.get('category')
        if category:
            queryset = queryset.filter(category_id=category)

        return queryset

    def get_serializer_class(self):
        if self.action == 'list':
            return AlbumListSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return AlbumCreateSerializer
        return AlbumDetailSerializer

    def perform_create(self, serializer):
        album = serializer.save(author=self.request.user)
        photos = self.request.FILES.getlist('photos')
        max_order = 0
        first_photo = None
        for photo_file in photos:
            p = Photo.objects.create(album=album, image=photo_file, order=max_order)
            max_order += 1
            if first_photo is None:
                first_photo = p
        if first_photo and not album.cover_photo:
            album.cover_photo = first_photo
            album.cover_image = first_photo.image
            album.save(update_fields=['cover_photo', 'cover_image'])

    def perform_update(self, serializer):
        album = serializer.save()
        photos = self.request.FILES.getlist('photos')
        max_order = album.photos.aggregate(max_order=Max('order'))['max_order']
        if max_order is None:
            max_order = -1
        next_order = max_order + 1
        first_photo = None
        for photo_file in photos:
            p = Photo.objects.create(album=album, image=photo_file, order=next_order)
            next_order += 1
            if first_photo is None:
                first_photo = p
        if first_photo and not album.cover_photo:
            album.cover_photo = first_photo
            album.cover_image = first_photo.image
            album.save(update_fields=['cover_photo', 'cover_image'])

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def add_photo(self, request, pk=None):
        album = self.get_object()
        if album.author != request.user and not request.user.is_staff:
            return Response(
                {'error': '권한이 없습니다.'},
                status=status.HTTP_403_FORBIDDEN
            )
        serializer = PhotoSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(album=album)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['delete'], url_path='photos/(?P<photo_pk>[^/.]+)',
            permission_classes=[permissions.IsAuthenticated])
    def delete_photo(self, request, pk=None, photo_pk=None):
        album = self.get_object()
        if album.author != request.user and not request.user.is_staff:
            return Response(
                {'error': '권한이 없습니다.'},
                status=status.HTTP_403_FORBIDDEN
            )
        try:
            photo = album.photos.get(pk=photo_pk)
            photo.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Photo.DoesNotExist:
            return Response(
                {'error': '사진을 찾을 수 없습니다.'},
                status=status.HTTP_404_NOT_FOUND
            )

    @action(detail=True, methods=['post'], url_path='set_cover/(?P<photo_pk>[^/.]+)',
            permission_classes=[permissions.IsAdminUser])
    def set_cover(self, request, pk=None, photo_pk=None):
        """사진을 앨범 대표 이미지로 지정"""
        album = self.get_object()
        try:
            photo = album.photos.get(pk=photo_pk)
            album.cover_photo = photo
            album.cover_image = photo.image
            album.save(update_fields=['cover_photo', 'cover_image'])
            return Response({'message': '대표 이미지가 변경되었습니다.', 'cover_photo_id': photo.id})
        except Photo.DoesNotExist:
            return Response(
                {'error': '사진을 찾을 수 없습니다.'},
                status=status.HTTP_404_NOT_FOUND
            )

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def toggle_hidden(self, request, pk=None):
        """앨범 숨김/표시 토글"""
        album = self.get_object()
        album.is_hidden = not album.is_hidden
        album.save()
        return Response({
            'message': f"앨범이 {'숨김' if album.is_hidden else '표시'} 처리되었습니다.",
            'is_hidden': album.is_hidden
        })

    @action(detail=True, methods=['post'], url_path='photos/(?P<photo_pk>[^/.]+)/toggle_hidden',
            permission_classes=[permissions.IsAdminUser])
    def toggle_photo_hidden(self, request, pk=None, photo_pk=None):
        """사진 숨김/표시 토글"""
        album = self.get_object()
        try:
            photo = album.photos.get(pk=photo_pk)
            photo.is_hidden = not photo.is_hidden
            photo.save()
            return Response({
                'message': f"사진이 {'숨김' if photo.is_hidden else '표시'} 처리되었습니다.",
                'is_hidden': photo.is_hidden
            })
        except Photo.DoesNotExist:
            return Response(
                {'error': '사진을 찾을 수 없습니다.'},
                status=status.HTTP_404_NOT_FOUND
            )

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAdminUser])
    def admin_list(self, request):
        """관리자용 전체 앨범 목록 (숨김 포함)"""
        queryset = Album.objects.all()
        album_type = request.query_params.get('type')
        if album_type:
            queryset = queryset.filter(album_type=album_type)
        category = request.query_params.get('category')
        if category:
            queryset = queryset.filter(category_id=category)
        serializer = AlbumAdminSerializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='photos/(?P<photo_pk>[^/.]+)/move_up',
            permission_classes=[permissions.IsAdminUser])
    def move_photo_up(self, request, pk=None, photo_pk=None):
        """사진 순서를 앞으로 (order 감소)"""
        album = self.get_object()
        try:
            photo = album.photos.get(pk=photo_pk)
            prev_photo = album.photos.filter(order__lt=photo.order).order_by('-order').first()
            if prev_photo:
                photo.order, prev_photo.order = prev_photo.order, photo.order
                photo.save(update_fields=['order'])
                prev_photo.save(update_fields=['order'])
            return Response({'message': '순서가 변경되었습니다.'})
        except Photo.DoesNotExist:
            return Response({'error': '사진을 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'], url_path='photos/(?P<photo_pk>[^/.]+)/move_down',
            permission_classes=[permissions.IsAdminUser])
    def move_photo_down(self, request, pk=None, photo_pk=None):
        """사진 순서를 뒤로 (order 증가)"""
        album = self.get_object()
        try:
            photo = album.photos.get(pk=photo_pk)
            next_photo = album.photos.filter(order__gt=photo.order).order_by('order').first()
            if next_photo:
                photo.order, next_photo.order = next_photo.order, photo.order
                photo.save(update_fields=['order'])
                next_photo.save(update_fields=['order'])
            return Response({'message': '순서가 변경되었습니다.'})
        except Photo.DoesNotExist:
            return Response({'error': '사진을 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'], url_path='reorder_photos',
            permission_classes=[permissions.IsAdminUser])
    def reorder_photos(self, request, pk=None):
        """사진 순서 일괄 변경 (드래그앤드롭용)"""
        album = self.get_object()
        photo_ids = request.data.get('photo_ids', [])
        if not photo_ids:
            return Response({'error': 'photo_ids가 필요합니다.'}, status=status.HTTP_400_BAD_REQUEST)
        for order, photo_id in enumerate(photo_ids):
            album.photos.filter(pk=photo_id).update(order=order)
        return Response({'message': '순서가 변경되었습니다.'})

    @action(detail=True, methods=['patch'], url_path='update_date',
            permission_classes=[permissions.IsAdminUser])
    def update_date(self, request, pk=None):
        """앨범 등록일 변경"""
        created_at = request.data.get('created_at')
        if not created_at:
            return Response({'error': 'created_at이 필요합니다.'}, status=status.HTTP_400_BAD_REQUEST)
        from django.utils.dateparse import parse_date
        parsed = parse_date(created_at)
        if not parsed:
            return Response({'error': '날짜 형식이 올바르지 않습니다.'}, status=status.HTTP_400_BAD_REQUEST)
        from django.utils import timezone
        import datetime
        dt = timezone.make_aware(datetime.datetime.combine(parsed, datetime.time.min))
        Album.objects.filter(pk=pk).update(created_at=dt)
        return Response({'message': '등록일이 변경되었습니다.'})
