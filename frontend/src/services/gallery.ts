import api from './api';
import type { Album, Photo, GalleryCategory, PaginatedResponse } from '../types';

export const galleryService = {
  // 카테고리 API
  getCategories: async (): Promise<GalleryCategory[]> => {
    const response = await api.get('/gallery/categories/');
    return response.data;
  },

  createCategory: async (data: { name: string; order?: number }): Promise<GalleryCategory> => {
    const response = await api.post('/gallery/categories/', data);
    return response.data;
  },

  updateCategory: async (id: number, data: { name: string; order?: number }): Promise<GalleryCategory> => {
    const response = await api.patch(`/gallery/categories/${id}/`, data);
    return response.data;
  },

  deleteCategory: async (id: number): Promise<void> => {
    await api.delete(`/gallery/categories/${id}/`);
  },

  // 앨범 API
  getAlbums: async (page = 1, publicOnly = false, categoryId?: number): Promise<PaginatedResponse<Album>> => {
    const params = new URLSearchParams({ page: page.toString() });
    if (publicOnly) {
      params.append('public', 'true');
    }
    if (categoryId) {
      params.append('category', categoryId.toString());
    }
    const response = await api.get(`/gallery/albums/?${params}`);
    if (Array.isArray(response.data)) {
      return { count: response.data.length, next: null, previous: null, results: response.data };
    }
    return response.data;
  },

  getAlbum: async (id: number): Promise<Album> => {
    const response = await api.get(`/gallery/albums/${id}/`);
    return response.data;
  },

  createAlbum: async (data: FormData): Promise<Album> => {
    const response = await api.post('/gallery/albums/', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  updateAlbum: async (id: number, data: FormData): Promise<Album> => {
    const response = await api.patch(`/gallery/albums/${id}/`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  deleteAlbum: async (id: number): Promise<void> => {
    await api.delete(`/gallery/albums/${id}/`);
  },

  addPhoto: async (albumId: number, data: FormData): Promise<Photo> => {
    const response = await api.post(`/gallery/albums/${albumId}/add_photo/`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  deletePhoto: async (albumId: number, photoId: number): Promise<void> => {
    await api.delete(`/gallery/albums/${albumId}/photos/${photoId}/`);
  },

  setCover: async (albumId: number, photoId: number): Promise<void> => {
    await api.post(`/gallery/albums/${albumId}/set_cover/${photoId}/`);
  },

  movePhotoUp: async (albumId: number, photoId: number): Promise<void> => {
    await api.post(`/gallery/albums/${albumId}/photos/${photoId}/move_up/`);
  },

  movePhotoDown: async (albumId: number, photoId: number): Promise<void> => {
    await api.post(`/gallery/albums/${albumId}/photos/${photoId}/move_down/`);
  },

  reorderPhotos: async (albumId: number, photoIds: number[]): Promise<void> => {
    await api.post(`/gallery/albums/${albumId}/reorder_photos/`, { photo_ids: photoIds });
  },

  updateAlbumDate: async (albumId: number, date: string): Promise<void> => {
    await api.patch(`/gallery/albums/${albumId}/update_date/`, { created_at: date });
  },
};
