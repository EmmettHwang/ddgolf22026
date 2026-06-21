import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { authService } from '../../services/auth';
import ConfirmDialog, { useDialog } from '../../components/common/ConfirmDialog';

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

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const { login, isLoading, setUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { dialogState, showAlert, handleConfirm, handleCancel } = useDialog();

  const from = location.state?.from?.pathname || '/';

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
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await login(email, password, rememberMe);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || '로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.');
    }
  };

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
            // Google 로그인은 rememberMe 옵션 적용
            const result = await authService.googleLogin(response.access_token, rememberMe);

            // 승인 대기 중인 경우
            if (result.pending_approval) {
              showAlert(result.message || '관리자 승인 대기 중입니다. 승인 후 로그인 가능합니다.');
              setGoogleLoading(false);
              return;
            }

            setUser(result.user);

            if (result.created) {
              showAlert('구글 계정으로 회원가입이 완료되었습니다!');
            }

            navigate(from, { replace: true });
          } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string; message?: string } } };
            setError(error.response?.data?.error || error.response?.data?.message || '구글 로그인 처리에 실패했습니다.');
          } finally {
            setGoogleLoading(false);
          }
        }
      },
    });

    client.requestAccessToken();
  };

  return (
    <div className="min-h-[600px] flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <img src="/images/logo.png" alt="DDGA 로고" className="w-16 h-16 object-contain mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">로그인</h1>
          <p className="mt-2 text-gray-600">대덕구골프협회에 오신 것을 환영합니다</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                이메일 또는 이름
              </label>
              <input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                placeholder="이메일 또는 이름을 입력하세요"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                비밀번호
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-16 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                  placeholder="비밀번호를 입력하세요"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 hover:text-gray-700 px-1 py-0.5"
                >
                  {showPassword ? '숨기기' : '보기'}
                </button>
              </div>
            </div>

            {/* 자동 로그인 체크박스 */}
            <div className="flex items-center">
              <input
                id="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded cursor-pointer"
              />
              <label htmlFor="rememberMe" className="ml-2 text-sm text-gray-600 cursor-pointer">
                자동 로그인
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-green-700 text-white py-3 rounded-lg font-medium hover:bg-green-800 transition-colors disabled:opacity-50"
            >
              {isLoading ? '로그인 중...' : '로그인'}
            </button>
          </form>

          {/* 구글 로그인 - Client ID가 설정된 경우에만 표시 */}
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

              {/* 구글 로그인 버튼 */}
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
                  {googleLoading ? '로그인 중...' : 'Google 간편 로그인'}
                </span>
              </button>
            </>
          )}

          <div className="mt-6 text-center text-sm">
            <p className="text-gray-600">
              아직 회원이 아니신가요?{' '}
              <Link to="/register" className="text-green-700 hover:text-green-800 font-medium">
                회원가입
              </Link>
            </p>
          </div>
        </div>

      </div>

      <ConfirmDialog
        open={dialogState.open}
        title={dialogState.title}
        message={dialogState.message}
        type={dialogState.type}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
}
