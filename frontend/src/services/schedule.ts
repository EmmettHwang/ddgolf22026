import api from './api';
import type { Event, PaginatedResponse } from '../types';

export const scheduleService = {
  getEvents: async (page = 1, startDate?: string, endDate?: string): Promise<PaginatedResponse<Event>> => {
    const params = new URLSearchParams({ page: page.toString() });
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    const response = await api.get(`/schedule/events/?${params}`);
    if (Array.isArray(response.data)) {
      return { count: response.data.length, next: null, previous: null, results: response.data };
    }
    return response.data;
  },

  getEvent: async (id: number): Promise<Event> => {
    const response = await api.get(`/schedule/events/${id}/`);
    return response.data;
  },

  getUpcomingEvents: async (): Promise<Event[]> => {
    const response = await api.get('/schedule/events/upcoming/');
    return response.data;
  },

  createEvent: async (data: Partial<Event>): Promise<Event> => {
    const response = await api.post('/schedule/events/', data);
    return response.data;
  },

  updateEvent: async (id: number, data: Partial<Event>): Promise<Event> => {
    const response = await api.patch(`/schedule/events/${id}/`, data);
    return response.data;
  },

  deleteEvent: async (id: number): Promise<void> => {
    await api.delete(`/schedule/events/${id}/`);
  },

  joinEvent: async (id: number): Promise<void> => {
    await api.post(`/schedule/events/${id}/join/`);
  },

  leaveEvent: async (id: number): Promise<void> => {
    await api.post(`/schedule/events/${id}/leave/`);
  },

  getPublicEvents: async (page = 1): Promise<PaginatedResponse<Event>> => {
    const params = new URLSearchParams({ page: page.toString() });
    const response = await api.get(`/schedule/public/events/?${params}`);
    if (Array.isArray(response.data)) {
      return { count: response.data.length, next: null, previous: null, results: response.data };
    }
    return response.data;
  },

  getPublicEvent: async (id: number): Promise<Event> => {
    const response = await api.get(`/schedule/public/events/${id}/`);
    return response.data;
  },

  getPopupEvents: async (): Promise<Event[]> => {
    const response = await api.get('/schedule/events/popup_events/');
    return response.data;
  },
};
