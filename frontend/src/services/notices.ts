import api from './api';
import type { Notice, PaginatedResponse, Banner, Organization, AboutContent, Executive, PublicClubItem, History, PopupNotice } from '../types';

export const noticesService = {
  // 회원용 공지사항 (로그인 필요)
  getNotices: async (page = 1): Promise<PaginatedResponse<Notice>> => {
    const response = await api.get(`/notices/?page=${page}`);
    if (Array.isArray(response.data)) {
      return { count: response.data.length, next: null, previous: null, results: response.data };
    }
    return response.data;
  },

  getNotice: async (id: number): Promise<Notice> => {
    const response = await api.get(`/notices/${id}/`);
    return response.data;
  },

  createNotice: async (data: Partial<Notice>): Promise<Notice> => {
    const response = await api.post('/notices/', data);
    return response.data;
  },

  updateNotice: async (id: number, data: Partial<Notice>): Promise<Notice> => {
    const response = await api.patch(`/notices/${id}/`, data);
    return response.data;
  },

  deleteNotice: async (id: number): Promise<void> => {
    await api.delete(`/notices/${id}/`);
  },

  // 공개 공지사항 (로그인 불필요)
  getPublicNotices: async (page = 1): Promise<PaginatedResponse<Notice>> => {
    const response = await api.get(`/notices/public/?page=${page}`);
    if (Array.isArray(response.data)) {
      return { count: response.data.length, next: null, previous: null, results: response.data };
    }
    return response.data;
  },

  getPublicNotice: async (id: number): Promise<Notice> => {
    const response = await api.get(`/notices/public/${id}/`);
    return response.data;
  },

  // 배너 API
  getBanners: async (): Promise<Banner[]> => {
    const response = await api.get('/notices/banners/');
    return response.data;
  },

  createBanner: async (data: FormData): Promise<Banner> => {
    const response = await api.post('/notices/banners/', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  updateBanner: async (id: number, data: FormData): Promise<Banner> => {
    const response = await api.patch(`/notices/banners/${id}/`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  deleteBanner: async (id: number): Promise<void> => {
    await api.delete(`/notices/banners/${id}/`);
  },

  moveBannerUp: async (id: number): Promise<void> => {
    await api.post(`/notices/banners/${id}/move_up/`);
  },

  moveBannerDown: async (id: number): Promise<void> => {
    await api.post(`/notices/banners/${id}/move_down/`);
  },

  // 유관기관 API
  getOrganizations: async (): Promise<Organization[]> => {
    const response = await api.get('/notices/organizations/');
    return response.data;
  },

  createOrganization: async (data: FormData): Promise<Organization> => {
    const response = await api.post('/notices/organizations/', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  updateOrganization: async (id: number, data: FormData): Promise<Organization> => {
    const response = await api.patch(`/notices/organizations/${id}/`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  deleteOrganization: async (id: number): Promise<void> => {
    await api.delete(`/notices/organizations/${id}/`);
  },

  moveOrganizationUp: async (id: number): Promise<void> => {
    await api.post(`/notices/organizations/${id}/move_up/`);
  },

  moveOrganizationDown: async (id: number): Promise<void> => {
    await api.post(`/notices/organizations/${id}/move_down/`);
  },

  // 협회소개 콘텐츠 API
  getAboutContent: async (): Promise<AboutContent> => {
    const response = await api.get('/notices/about/');
    return response.data;
  },

  updateAboutContent: async (data: FormData): Promise<AboutContent> => {
    const response = await api.put('/notices/about/', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // 공개 클럽 목록 API
  getPublicClubs: async (): Promise<PublicClubItem[]> => {
    const response = await api.get('/messenger/public/clubs/');
    return response.data;
  },

  // 협회 임원 API
  getExecutives: async (): Promise<Executive[]> => {
    const response = await api.get('/notices/executives/');
    return response.data;
  },

  createExecutive: async (data: FormData): Promise<Executive> => {
    const response = await api.post('/notices/executives/', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  updateExecutive: async (id: number, data: FormData): Promise<Executive> => {
    const response = await api.patch(`/notices/executives/${id}/`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  deleteExecutive: async (id: number): Promise<void> => {
    await api.delete(`/notices/executives/${id}/`);
  },

  moveExecutiveUp: async (id: number): Promise<void> => {
    await api.post(`/notices/executives/${id}/move_up/`);
  },

  moveExecutiveDown: async (id: number): Promise<void> => {
    await api.post(`/notices/executives/${id}/move_down/`);
  },

  // 연혁 API
  getHistories: async (): Promise<History[]> => {
    const response = await api.get('/notices/histories/');
    return response.data;
  },

  createHistory: async (data: Partial<History>): Promise<History> => {
    const response = await api.post('/notices/histories/', data);
    return response.data;
  },

  updateHistory: async (id: number, data: Partial<History>): Promise<History> => {
    const response = await api.patch(`/notices/histories/${id}/`, data);
    return response.data;
  },

  deleteHistory: async (id: number): Promise<void> => {
    await api.delete(`/notices/histories/${id}/`);
  },

  moveHistoryUp: async (id: number): Promise<void> => {
    await api.post(`/notices/histories/${id}/move_up/`);
  },

  moveHistoryDown: async (id: number): Promise<void> => {
    await api.post(`/notices/histories/${id}/move_down/`);
  },

  // 팝업 공지사항 API
  getPopupNotices: async (): Promise<PopupNotice[]> => {
    const response = await api.get('/notices/popup/');
    return response.data;
  },
};
