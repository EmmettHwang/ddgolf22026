import api from './api';
import type { AuthTokens, LoginRequest, RegisterRequest, User } from '../types';

interface RegisterWithVerification extends RegisterRequest {
  verification_code: string;
  requested_role: 'instructor' | 'member';
}

interface GoogleLoginResponse {
  access?: string;
  refresh?: string;
  user: User;
  created: boolean;
  pending_approval?: boolean;
  message?: string;
}

// 토큰 저장소 키
const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const REMEMBER_ME_KEY = 'remember_me';

// 토큰 저장 (rememberMe에 따라 localStorage 또는 sessionStorage 사용)
const saveTokens = (access: string, refresh: string, rememberMe: boolean) => {
  const storage = rememberMe ? localStorage : sessionStorage;

  // 다른 저장소의 토큰 삭제
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);

  // 선택된 저장소에 토큰 저장
  storage.setItem(ACCESS_TOKEN_KEY, access);
  storage.setItem(REFRESH_TOKEN_KEY, refresh);

  // rememberMe 상태 저장 (항상 localStorage에)
  if (rememberMe) {
    localStorage.setItem(REMEMBER_ME_KEY, 'true');
  } else {
    localStorage.removeItem(REMEMBER_ME_KEY);
  }
};

// 토큰 가져오기 (localStorage 또는 sessionStorage에서)
const getAccessToken = (): string | null => {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || sessionStorage.getItem(ACCESS_TOKEN_KEY);
};

const getRefreshToken = (): string | null => {
  return localStorage.getItem(REFRESH_TOKEN_KEY) || sessionStorage.getItem(REFRESH_TOKEN_KEY);
};

// 토큰 삭제
const clearTokens = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(REMEMBER_ME_KEY);
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
};

export const authService = {
  login: async (data: LoginRequest, rememberMe = false): Promise<AuthTokens> => {
    const response = await api.post('/accounts/login/', data);
    const tokens = response.data;

    saveTokens(tokens.access, tokens.refresh, rememberMe);

    return tokens;
  },

  register: async (data: RegisterWithVerification): Promise<User> => {
    const response = await api.post('/accounts/register/', data);
    return response.data;
  },

  // 간편 회원가입 (이메일 인증 없음)
  registerSimple: async (data: {
    email: string;
    username: string;
    password: string;
    phone?: string;
    requested_role: 'instructor' | 'member';
    wants_club_membership?: boolean;
    requested_club?: number | null;
  }): Promise<User> => {
    const response = await api.post('/accounts/register/simple/', data);
    return response.data;
  },

  logout: () => {
    clearTokens();
  },

  getProfile: async (): Promise<User> => {
    const response = await api.get('/accounts/profile/');
    return response.data;
  },

  updateProfile: async (data: Partial<User> | FormData): Promise<User> => {
    const isFormData = data instanceof FormData;
    const response = await api.patch('/accounts/profile/', data, isFormData ? {
      headers: { 'Content-Type': 'multipart/form-data' },
    } : undefined);
    return response.data;
  },

  deleteAccount: async (password?: string): Promise<void> => {
    await api.post('/accounts/delete-account/', { password });
    clearTokens();
  },

  isAuthenticated: (): boolean => {
    return !!getAccessToken();
  },

  getAccessToken,
  getRefreshToken,

  // 이메일 인증 코드 발송
  sendVerificationCode: async (email: string): Promise<{ message: string; email: string }> => {
    const response = await api.post('/accounts/send-verification/', { email });
    return response.data;
  },

  // 이메일 인증 코드 확인
  verifyCode: async (email: string, code: string): Promise<{ message: string; verified: boolean }> => {
    const response = await api.post('/accounts/verify-code/', { email, code });
    return response.data;
  },

  // 구글 로그인 (항상 자동 로그인 유지)
  googleLogin: async (accessToken: string, rememberMe = true): Promise<GoogleLoginResponse> => {
    const response = await api.post('/accounts/google/login/', { access_token: accessToken });
    const { access, refresh, user, created, pending_approval, message } = response.data;

    // 승인된 사용자만 토큰 저장
    if (access && refresh && !pending_approval) {
      saveTokens(access, refresh, rememberMe);
    }

    return { access, refresh, user, created, pending_approval, message };
  },

  // 비밀번호 확인
  verifyPassword: async (password: string): Promise<{ verified: boolean; message?: string }> => {
    const response = await api.post('/accounts/verify-password/', { password });
    return response.data;
  },

  // 비밀번호 변경
  changePassword: async (data: {
    current_password: string;
    new_password: string;
    new_password2: string;
  }): Promise<{ message: string }> => {
    const response = await api.post('/accounts/change-password/', data);
    return response.data;
  },
};
