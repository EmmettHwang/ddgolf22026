import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../../services/auth';
import { useAuthStore } from '../../store/authStore';
import api from '../../services/api';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement | null,
            options: {
              theme?: string;
              size?: string;
              text?: string;
              width?: number;
              locale?: string;
            }
          ) => void;
        };
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => {
            requestAccessToken: () => void;
          };
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export default function Register() {
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    password2: '',
    phone: '',
    requested_role: 'member' as 'instructor' | 'member',
    requested_club: '' as string,
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [clubs, setClubs] = useState<{ id: number; name: string }[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useAuthStore();

  useEffect(() => {
    // Google Identity Services 스크립트 로드
    if (GOOGLE_CLIENT_ID && !document.getElementById('google-identity-script')) {
      const script = document.createElement('script');
      script.id = 'google-identity-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }

    // 클럽 목록 로드
    api.get('/messenger/public/clubs/').then(res => {
      setClubs(res.data);
    }).catch(() => {});
  }, []);

  // 전화번호 포맷팅 함수
  const formatPhoneNumber = (value: string) => {
    const numbers = value.replace(/[^\d]/g, '');
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'phone') {
      setFormData({ ...formData, phone: formatPhoneNumber(value) });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  // 비밀번호 일치 여부 확인
  const passwordMatch = formData.password && formData.password2
    ? formData.password === formData.password2
    : null;

  // Google 간편 로그인 처리
  const handleGoogleLogin = () => {
    if (!window.google) {
      setError('구글 로그인을 로드하는 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    setGoogleLoading(true);
    setError('');

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'email profile',
      callback: async (response) => {
        if (response.error) {
          setError('구글 로그인에 실패했습니다.');
          setGoogleLoading(false);
          return;
        }

        if (response.access_token) {
          try {
            const result = await authService.googleLogin(response.access_token);

            // 승인 대기 중인 경우
            if (result.pending_approval) {
              alert(result.message || '관리자 승인 대기 중입니다. 승인 후 로그인 가능합니다.');
              setGoogleLoading(false);
              return;
            }

            setUser(result.user);

            if (result.created) {
              alert('구글 계정으로 회원가입이 완료되었습니다!');
            }

            navigate('/', { replace: true });
          } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string } } };
            setError(error.response?.data?.error || '구글 로그인 처리에 실패했습니다.');
          } finally {
            setGoogleLoading(false);
          }
        }
      },
    });

    client.requestAccessToken();
  };

  // 회원가입 처리
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.password2) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    if (formData.password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }

    setIsLoading(true);
    try {
      await authService.registerSimple({
        email: formData.email,
        username: formData.username,
        password: formData.password,
        phone: formData.phone || undefined,
        requested_role: formData.requested_role,
        wants_club_membership: !!formData.requested_club,
        requested_club: formData.requested_club ? Number(formData.requested_club) : null,
      });
      alert('회원가입이 완료되었습니다. 관리자 승인 후 이용 가능합니다.');
      navigate('/login');
    } catch (err: unknown) {
      const error = err as { response?: { data?: Record<string, string | string[]> } };
      const errors = error.response?.data;
      if (errors) {
        // 에러 메시지 추출
        const errorMessages: string[] = [];
        Object.entries(errors).forEach(([key, value]) => {
          const msg = Array.isArray(value) ? value[0] : String(value);
          if (key === 'email') errorMessages.push(`이메일: ${msg}`);
          else if (key === 'password') errorMessages.push(`비밀번호: ${msg}`);
          else if (key === 'username') errorMessages.push(`이름: ${msg}`);
          else if (key === 'phone') errorMessages.push(`전화번호: ${msg}`);
          else errorMessages.push(msg);
        });
        setError(errorMessages.join('\n') || '회원가입에 실패했습니다.');
      } else {
        setError('회원가입에 실패했습니다. 다시 시도해주세요.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <img src="/images/logo.png" alt="DDGA 로고" className="w-16 h-16 object-contain mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900">회원가입</h1>
          <p className="mt-2 text-gray-600">대덕구골프협회 회원이 되어주세요</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm whitespace-pre-line">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                이메일 *
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                placeholder="example@email.com"
                required
              />
            </div>

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                이름 *
              </label>
              <input
                id="username"
                name="username"
                type="text"
                value={formData.username}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                placeholder="이름을 입력하세요"
                required
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                전화번호
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                placeholder="010-0000-0000"
              />
            </div>

            <div>
              <label htmlFor="requested_role" className="block text-sm font-medium text-gray-700 mb-1">
                회원 유형 *
              </label>
              <select
                id="requested_role"
                name="requested_role"
                value={formData.requested_role}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                required
              >
                <option value="member">일반 회원</option>
                <option value="instructor">클럽장</option>
              </select>
            </div>

            <div>
              <label htmlFor="requested_club" className="block text-sm font-medium text-gray-700 mb-1">
                희망 클럽
              </label>
              <select
                id="requested_club"
                name="requested_club"
                value={formData.requested_club}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
              >
                <option value="">클럽 미가입</option>
                {clubs.map(club => (
                  <option key={club.id} value={club.id}>{club.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                클럽을 선택하지 않으면 공용 클럽만 이용 가능합니다.
              </p>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                비밀번호 *
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                  placeholder="8자 이상 입력"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="password2" className="block text-sm font-medium text-gray-700 mb-1">
                비밀번호 확인 *
              </label>
              <div className="relative">
                <input
                  id="password2"
                  name="password2"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password2}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 pr-12 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none ${
                    passwordMatch === null
                      ? 'border-gray-300'
                      : passwordMatch
                      ? 'border-green-500'
                      : 'border-red-500'
                  }`}
                  placeholder="비밀번호 재입력"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {formData.password2 && (
                <p className={`mt-1 text-sm ${passwordMatch ? 'text-green-600' : 'text-red-600'}`}>
                  {passwordMatch ? '✓ 비밀번호가 일치합니다' : '✗ 비밀번호가 일치하지 않습니다'}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-green-700 text-white py-3 rounded-lg font-medium hover:bg-green-800 transition-colors disabled:opacity-50"
            >
              {isLoading ? '가입 중...' : '회원가입'}
            </button>
          </form>

          {/* Google 간편 로그인 - Client ID가 설정된 경우에만 표시 */}
          {GOOGLE_CLIENT_ID && (
            <>
              {/* 구분선 */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">또는</span>
                </div>
              </div>

              {/* 구글 간편 로그인 버튼 */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span className="text-gray-700 font-medium">
                  {googleLoading ? '처리 중...' : 'Google 간편 로그인'}
                </span>
              </button>
              <p className="mt-2 text-xs text-gray-500 text-center">
                Google 계정이 없으면 자동으로 회원가입됩니다.
              </p>
            </>
          )}

          <div className="mt-6 text-center text-sm">
            <p className="text-gray-600">
              이미 계정이 있으신가요?{' '}
              <Link to="/login" className="text-green-700 hover:text-green-800 font-medium">
                로그인
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
