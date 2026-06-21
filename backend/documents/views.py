from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.http import FileResponse
from django.shortcuts import get_object_or_404

from .models import DocumentCategory, Document, DocumentFile
from .serializers import DocumentCategorySerializer, DocumentSerializer


class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user and request.user.is_staff


class DocumentCategoryViewSet(viewsets.ModelViewSet):
    """서식 카테고리 ViewSet"""
    queryset = DocumentCategory.objects.all()
    serializer_class = DocumentCategorySerializer
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = None

    def perform_create(self, serializer):
        max_order = DocumentCategory.objects.order_by('-order').values_list('order', flat=True).first()
        serializer.save(order=(max_order or 0) + 1)


class DocumentViewSet(viewsets.ModelViewSet):
    """서식 ViewSet"""
    queryset = Document.objects.select_related('category', 'thumbnail').prefetch_related('files').all()
    serializer_class = DocumentSerializer
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = None
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        queryset = super().get_queryset()
        category_id = self.request.query_params.get('category')
        if category_id:
            queryset = queryset.filter(category_id=category_id)
        return queryset

    def perform_create(self, serializer):
        max_order = Document.objects.filter(
            category=serializer.validated_data['category']
        ).order_by('-order').values_list('order', flat=True).first()
        document = serializer.save(order=(max_order or 0) + 1)
        self._handle_files(document)

    def perform_update(self, serializer):
        document = serializer.save()
        self._handle_files(document)

    def _handle_files(self, document):
        """FormData에서 files 복수 처리"""
        files = self.request.FILES.getlist('files')
        if files:
            max_order = document.files.order_by('-order').values_list('order', flat=True).first() or 0
            for i, f in enumerate(files):
                DocumentFile.objects.create(
                    document=document,
                    file=f,
                    original_name=f.name,
                    order=max_order + i + 1,
                )

    @action(detail=True, methods=['post'], url_path='set_thumbnail')
    def set_thumbnail(self, request, pk=None):
        """대표 이미지 지정 (DocumentFile ID)"""
        document = self.get_object()
        file_id = request.data.get('file_id')
        if file_id:
            doc_file = get_object_or_404(DocumentFile, pk=file_id, document=document)
            document.thumbnail = doc_file
        else:
            document.thumbnail = None
        document.save(update_fields=['thumbnail'])
        serializer = self.get_serializer(document)
        return Response(serializer.data)

    @action(detail=True, methods=['delete'], url_path='delete_file/(?P<file_id>[0-9]+)')
    def delete_file(self, request, pk=None, file_id=None):
        """개별 파일 삭제"""
        document = self.get_object()
        doc_file = get_object_or_404(DocumentFile, pk=file_id, document=document)
        # 대표 이미지인 경우 해제
        if document.thumbnail_id == doc_file.id:
            document.thumbnail = None
            document.save(update_fields=['thumbnail'])
        doc_file.file.delete(save=False)
        doc_file.delete()
        serializer = self.get_serializer(document)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='download/(?P<file_id>[0-9]+)',
            permission_classes=[permissions.AllowAny])
    def download(self, request, pk=None, file_id=None):
        """파일 다운로드 (download_count 증가)"""
        document = self.get_object()
        doc_file = get_object_or_404(DocumentFile, pk=file_id, document=document)
        document.download_count += 1
        document.save(update_fields=['download_count'])
        return FileResponse(
            doc_file.file.open('rb'),
            as_attachment=True,
            filename=doc_file.original_name,
        )
