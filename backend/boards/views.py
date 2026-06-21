from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q

from .models import Post, PostImage, Comment
from .serializers import (
    PostListSerializer, PostDetailSerializer, PostCreateSerializer,
    CommentSerializer, PostImageSerializer
)


class IsAuthorOrReadOnly(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.author == request.user


class PostViewSet(viewsets.ModelViewSet):
    """게시글 ViewSet"""
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsAuthorOrReadOnly]
    pagination_class = None

    def get_queryset(self):
        queryset = Post.objects.all()
        if not self.request.user.is_authenticated:
            queryset = queryset.filter(is_public=True)
        elif not self.request.user.is_approved:
            queryset = queryset.filter(is_public=True)
        return queryset

    def get_serializer_class(self):
        if self.action == 'list':
            return PostListSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return PostCreateSerializer
        return PostDetailSerializer

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.views += 1
        instance.save()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def add_image(self, request, pk=None):
        post = self.get_object()
        if post.author != request.user:
            return Response(
                {'error': '권한이 없습니다.'},
                status=status.HTTP_403_FORBIDDEN
            )
        serializer = PostImageSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(post=post)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CommentViewSet(viewsets.ModelViewSet):
    """댓글 ViewSet"""
    serializer_class = CommentSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsAuthorOrReadOnly]
    pagination_class = None

    def get_queryset(self):
        return Comment.objects.filter(post_id=self.kwargs.get('post_pk'))

    def perform_create(self, serializer):
        post = Post.objects.get(pk=self.kwargs.get('post_pk'))
        serializer.save(author=self.request.user, post=post)
