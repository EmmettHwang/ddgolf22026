import api from './api';
import type { Post, Comment, PaginatedResponse } from '../types';

export const boardsService = {
  getPosts: async (page = 1): Promise<PaginatedResponse<Post>> => {
    const response = await api.get(`/boards/posts/?page=${page}`);
    if (Array.isArray(response.data)) {
      return { count: response.data.length, next: null, previous: null, results: response.data };
    }
    return response.data;
  },

  getPost: async (id: number): Promise<Post> => {
    const response = await api.get(`/boards/posts/${id}/`);
    return response.data;
  },

  createPost: async (data: FormData): Promise<Post> => {
    const response = await api.post('/boards/posts/', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  updatePost: async (id: number, data: Partial<Post>): Promise<Post> => {
    const response = await api.patch(`/boards/posts/${id}/`, data);
    return response.data;
  },

  deletePost: async (id: number): Promise<void> => {
    await api.delete(`/boards/posts/${id}/`);
  },

  getComments: async (postId: number): Promise<Comment[]> => {
    const response = await api.get(`/boards/posts/${postId}/comments/`);
    return response.data;
  },

  createComment: async (postId: number, content: string): Promise<Comment> => {
    const response = await api.post(`/boards/posts/${postId}/comments/`, { content });
    return response.data;
  },

  deleteComment: async (postId: number, commentId: number): Promise<void> => {
    await api.delete(`/boards/posts/${postId}/comments/${commentId}/`);
  },
};
