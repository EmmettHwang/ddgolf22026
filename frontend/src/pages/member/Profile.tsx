import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { authService } from '../../services/auth';
import { messengerService } from '../../services/messenger';
import ConfirmDialog, { useDialog } from '../../components/common/ConfirmDialog';

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || '';

type EditMode = 'none' | 'verify' | 'edit' | 'password';

export default function Profile() {
  const { user, fetchProfile, logout } = useAuthStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { dialogState, showAlert, showConfirm, handleConfirm: handleDialogConfirm, handleCancel: handleDialogCancel } = useDialog();

  // 페이지 진입 시 최신 프로필 갱신 (assigned_club 반영)
  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const [editMode, setEditMode] = useState<EditMode>('none');
  const [verifyPassword, setVerifyPassword] = useState('');
  const [formData, setFormData] = useState({
    username: user?.username || '',
    phone: user?.phone || '',
    email: user?.email || '',
  });
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    new_password2: '',
  });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [verifyError, setVerifyError] = useState('');

  // 전화번호 포맷팅
  const formatPhoneNumber = (value: string) => {
    const numbers = value.replace(/[^\d]/g, '');
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
  };

  // 비밀번호 확인
  const verifyMutation = useMutation({
    mutationFn: (password: string) => authService.verifyPassword(password),
    onSuccess: () => {
      setVerifyError('');
      setVerifyPassword('');
      setEditMode('edit');
    },
    onError: () => {
      setVerifyError('비밀번호가 일치하지 않습니다.');
    },
  });

  // 프로필 수정
  const updateMutation = useMutation({
    mutationFn: (data: FormData) =>
      authService.updateProfile(data),
    onSuccess: async () => {
      await fetchProfile();
      setEditMode('none');
      setProfileImageFile(null);
      setProfileImagePreview(null);
      setMessage({ type: 'success', text: '프로필이 업데이트되었습니다.' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: Record<string, string[]> } };
      const errorData = error.response?.data;
      if (errorData?.email) {
        setMessage({ type: 'error', text: errorData.email[0] });
      } else {
        setMessage({ type: 'error', text: '프로필 수정에 실패했습니다.' });
      }
    },
  });

  // 비밀번호 변경
  const changePasswordMutation = useMutation({
    mutationFn: (data: { current_password: string; new_password: string; new_password2: string }) =>
      authService.changePassword(data),
    onSuccess: () => {
      setEditMode('none');
      setPasswordData({ current_password: '', new_password: '', new_password2: '' });
      setMessage({ type: 'success', text: '비밀번호가 변경되었습니다.' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } };
      setMessage({ type: 'error', text: error.response?.data?.error || '비밀번호 변경에 실패했습니다.' });
    },
  });

  // 클럽 관련
  const { data: clubList } = useQuery({
    queryKey: ['clubList'],
    queryFn: () => messengerService.getClubList(),
    enabled: !!user?.is_approved,
  });

  const joinClubMutation = useMutation({
    mutationFn: (roomId: number) => messengerService.requestJoinClub(roomId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubList'] });
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } };
      showAlert(error.response?.data?.error || '가입 요청에 실패했습니다.');
    },
  });

  const leaveClubMutation = useMutation({
    mutationFn: (roomId: number) => messengerService.requestLeaveClub(roomId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubList'] });
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } };
      showAlert(error.response?.data?.error || '탈퇴 요청에 실패했습니다.');
    },
  });

  // 계정 삭제
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const deleteAccountMutation = useMutation({
    mutationFn: (password?: string) => authService.deleteAccount(password),
    onSuccess: () => {
      logout();
      navigate('/login', { replace: true });
      showAlert('계정이 삭제되었습니다.');
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } };
      setDeleteError(error.response?.data?.error || '계정 삭제에 실패했습니다.');
    },
  });

  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyPassword) {
      setVerifyError('비밀번호를 입력해주세요.');
      return;
    }
    verifyMutation.mutate(verifyPassword);
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!await showConfirm('프로필을 수정하시겠습니까?')) return;

    const fd = new FormData();
    fd.append('username', formData.username);
    fd.append('phone', formData.phone);
    fd.append('email', formData.email);
    if (profileImageFile) {
      fd.append('profile_image', profileImageFile);
    }
    updateMutation.mutate(fd);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.new_password !== passwordData.new_password2) {
      setMessage({ type: 'error', text: '새 비밀번호가 일치하지 않습니다.' });
      return;
    }
    if (passwordData.new_password.length < 8) {
      setMessage({ type: 'error', text: '비밀번호는 8자 이상이어야 합니다.' });
      return;
    }
    changePasswordMutation.mutate(passwordData);
  };

  const handleCancel = () => {
    setEditMode('none');
    setVerifyPassword('');
    setVerifyError('');
    setFormData({ username: user?.username || '', phone: user?.phone || '', email: user?.email || '' });
    setProfileImageFile(null);
    setProfileImagePreview(null);
    setPasswordData({ current_password: '', new_password: '', new_password2: '' });
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProfileImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setProfileImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  if (!user) return null;

  // 소셜 로그인 사용자인지 확인
  const isSocialUser = !!user.social_provider;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">프로필</h1>

      {message.text && (
        <div className={`mb-4 p-3 rounded-lg ${
          message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      <div className="card">
        <div className="flex items-center gap-6 mb-8">
          {user.profile_image ? (
            <img
              src={user.profile_image.startsWith('http') ? user.profile_image : `${API_BASE}${user.profile_image}`}
              alt="프로필"
              className="w-24 h-24 rounded-full object-cover"
            />
          ) : (
            <div className="w-24 h-24 bg-primary-100 rounded-full flex items-center justify-center text-primary-600 text-3xl font-bold">
              {user.username.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="text-xl font-semibold">{user.username}</h2>
            <p className="text-gray-500">{user.email}</p>
            <div className="flex gap-2 mt-2">
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  user.is_approved
                    ? 'bg-green-100 text-green-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}
              >
                {user.is_approved ? '승인됨' : '승인 대기'}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                {user.role === 'admin' ? '관리자' : user.role === 'instructor' ? '클럽장' : '회원'}
              </span>
              {isSocialUser && (
                <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                  Google 계정
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 비밀번호 확인 모달 */}
        {editMode === 'verify' && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
              <h3 className="text-lg font-bold mb-4">비밀번호 확인</h3>
              <p className="text-sm text-gray-600 mb-4">
                프로필을 수정하려면 현재 비밀번호를 입력해주세요.
              </p>
              <form onSubmit={handleVerifySubmit}>
                <input
                  type="password"
                  value={verifyPassword}
                  onChange={(e) => setVerifyPassword(e.target.value)}
                  placeholder="현재 비밀번호"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg mb-2 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                  autoFocus
                />
                {verifyError && (
                  <p className="text-red-500 text-sm mb-2">{verifyError}</p>
                )}
                <div className="flex gap-2 mt-4">
                  <button
                    type="submit"
                    disabled={verifyMutation.isPending}
                    className="flex-1 bg-green-700 text-white py-2 rounded-lg hover:bg-green-800 disabled:opacity-50"
                  >
                    {verifyMutation.isPending ? '확인 중...' : '확인'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="flex-1 border border-gray-300 py-2 rounded-lg hover:bg-gray-50"
                  >
                    취소
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 프로필 수정 폼 */}
        {editMode === 'edit' && (
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            {/* 프로필 사진 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                프로필 사진
              </label>
              <div className="flex items-center gap-4">
                {profileImagePreview ? (
                  <img src={profileImagePreview} alt="미리보기" className="w-20 h-20 rounded-full object-cover" />
                ) : user.profile_image ? (
                  <img
                    src={user.profile_image.startsWith('http') ? user.profile_image : `${API_BASE}${user.profile_image}`}
                    alt="현재 프로필"
                    className="w-20 h-20 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center text-primary-600 text-2xl font-bold">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-sm bg-gray-100 px-4 py-2 rounded-lg hover:bg-gray-200"
                  >
                    사진 변경
                  </button>
                  {profileImageFile && (
                    <p className="text-xs text-gray-500 mt-1">{profileImageFile.name}</p>
                  )}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                이름
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                이메일
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                전화번호
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: formatPhoneNumber(e.target.value) })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                placeholder="010-0000-0000"
              />
            </div>
            <div className="flex gap-2 pt-4">
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="bg-green-700 text-white px-6 py-2 rounded-lg hover:bg-green-800 disabled:opacity-50"
              >
                {updateMutation.isPending ? '저장 중...' : '저장'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="border border-gray-300 px-6 py-2 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
            </div>
          </form>
        )}

        {/* 비밀번호 변경 폼 */}
        {editMode === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                현재 비밀번호
              </label>
              <input
                type="password"
                value={passwordData.current_password}
                onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                새 비밀번호
              </label>
              <input
                type="password"
                value={passwordData.new_password}
                onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                placeholder="8자 이상"
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                새 비밀번호 확인
              </label>
              <input
                type="password"
                value={passwordData.new_password2}
                onChange={(e) => setPasswordData({ ...passwordData, new_password2: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                required
              />
              {passwordData.new_password2 && (
                <p className={`mt-1 text-sm ${
                  passwordData.new_password === passwordData.new_password2
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}>
                  {passwordData.new_password === passwordData.new_password2
                    ? '✓ 비밀번호가 일치합니다'
                    : '✗ 비밀번호가 일치하지 않습니다'}
                </p>
              )}
            </div>
            <div className="flex gap-2 pt-4">
              <button
                type="submit"
                disabled={changePasswordMutation.isPending}
                className="bg-green-700 text-white px-6 py-2 rounded-lg hover:bg-green-800 disabled:opacity-50"
              >
                {changePasswordMutation.isPending ? '변경 중...' : '비밀번호 변경'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="border border-gray-300 px-6 py-2 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
            </div>
          </form>
        )}

        {/* 기본 프로필 보기 */}
        {editMode === 'none' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-500">이름</label>
              <p className="mt-1">{user.username}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500">이메일</label>
              <p className="mt-1">{user.email}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500">전화번호</label>
              <p className="mt-1">{user.phone || '-'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500">가입일</label>
              <p className="mt-1">{new Date(user.created_at).toLocaleDateString()}</p>
            </div>
            <div className="flex gap-2 pt-4">
              <button
                onClick={() => {
                  setFormData({ username: user.username, phone: user.phone || '', email: user.email });
                  setEditMode('edit');
                }}
                className="bg-green-700 text-white px-6 py-2 rounded-lg hover:bg-green-800"
              >
                프로필 수정
              </button>
              {!isSocialUser && (
                <button
                  onClick={() => setEditMode('password')}
                  className="border border-green-700 text-green-700 px-6 py-2 rounded-lg hover:bg-green-50"
                >
                  비밀번호 변경
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 클럽 섹션 */}
      {user.is_approved && (
        <div className="card mt-6">
          <h2 className="text-lg font-semibold mb-4">클럽</h2>

          {/* 현재 소속 클럽 */}
          {user.assigned_club_name ? (
            <div className="mb-4 p-3 bg-green-50 rounded-lg">
              <div className="text-sm text-gray-500">현재 소속 클럽</div>
              <div className="font-medium text-green-800">{user.assigned_club_name}</div>
            </div>
          ) : (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-500">소속 클럽이 없습니다.</div>
            </div>
          )}

          {/* 전체 클럽 목록 */}
          <h3 className="text-sm font-medium text-gray-700 mb-2">전체 클럽 목록</h3>
          {clubList && clubList.length > 0 ? (
            <div className="space-y-2">
              {clubList.map((club) => (
                <div key={club.id} className="flex justify-between items-center p-3 border border-gray-200 rounded-lg">
                  <div>
                    <div className="font-medium">{club.name}</div>
                    <div className="text-sm text-gray-500">{club.member_count}명</div>
                  </div>
                  <div>
                    {club.pending_request ? (
                      <span className={`text-xs px-3 py-1.5 rounded-lg ${
                        club.pending_request.request_type === 'join'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-orange-100 text-orange-700'
                      }`}>
                        {club.pending_request.request_type === 'join' ? '가입 요청 중' : '탈퇴 요청 중'}
                      </span>
                    ) : club.is_member ? (
                      <button
                        onClick={async () => {
                          if (await showConfirm(`${club.name} 클럽 탈퇴를 요청하시겠습니까?`)) {
                            leaveClubMutation.mutate(club.id);
                          }
                        }}
                        disabled={leaveClubMutation.isPending}
                        className="px-3 py-1.5 text-sm border border-orange-300 text-orange-600 rounded-lg hover:bg-orange-50 disabled:opacity-50"
                      >
                        탈퇴 요청
                      </button>
                    ) : user.assigned_club ? (
                      <span className="text-xs text-gray-400">
                        기존 클럽 탈퇴 후 가입 가능
                      </span>
                    ) : (
                      <button
                        onClick={() => joinClubMutation.mutate(club.id)}
                        disabled={joinClubMutation.isPending}
                        className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        가입 요청
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">등록된 클럽이 없습니다.</div>
          )}
        </div>
      )}

      {/* 계정 삭제 */}
      {user.role !== 'admin' && (
        <div className="card mt-6 border border-red-200">
          <h2 className="text-lg font-semibold text-red-700 mb-2">계정 삭제</h2>
          <p className="text-sm text-gray-600 mb-4">
            계정 삭제는 대덕구골프협회 탈퇴를 포함하며, 모든 데이터가 영구적으로 삭제되어 복구할 수 없습니다.
          </p>
          <button
            onClick={() => {
              setShowDeleteModal(true);
              setDeletePassword('');
              setDeleteError('');
            }}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            계정 삭제
          </button>
        </div>
      )}

      {/* 계정 삭제 확인 모달 */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold text-red-700 mb-2">계정 삭제</h3>
            <p className="text-sm text-gray-600 mb-4">
              정말로 계정을 삭제하시겠습니까?
              <br />계정 삭제는 대덕구골프협회 탈퇴를 포함하며, 모든 데이터(프로필, 클럽 멤버십, 메시지 등)가 영구 삭제됩니다.
            </p>
            {!isSocialUser && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  비밀번호 확인
                </label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="현재 비밀번호를 입력하세요"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                  autoFocus
                />
              </div>
            )}
            {deleteError && (
              <p className="text-red-500 text-sm mb-3">{deleteError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (isSocialUser) {
                    deleteAccountMutation.mutate(undefined);
                  } else {
                    if (!deletePassword) {
                      setDeleteError('비밀번호를 입력해주세요.');
                      return;
                    }
                    deleteAccountMutation.mutate(deletePassword);
                  }
                }}
                disabled={deleteAccountMutation.isPending}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleteAccountMutation.isPending ? '삭제 중...' : '삭제'}
              </button>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 border border-gray-300 py-2 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={dialogState.open}
        title={dialogState.title}
        message={dialogState.message}
        type={dialogState.type}
        onConfirm={handleDialogConfirm}
        onCancel={handleDialogCancel}
      />
    </div>
  );
}
