import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { messengerService } from '../../services/messenger';
import api from '../../services/api';
import Loading from '../../components/common/Loading';
import type { ClubImage, User, ChatBan } from '../../types';

type TabType = 'requests' | 'members' | 'bans' | 'info' | 'images';

export default function ClubManage() {
  const { user, fetchProfile } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('requests');

  // info tab state
  const [description, setDescription] = useState('');
  const [descriptionLoaded, setDescriptionLoaded] = useState(false);
  const iconInputRef = useRef<HTMLInputElement>(null);

  // images tab state
  const [imageCaption, setImageCaption] = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [editingCaptions, setEditingCaptions] = useState<Record<number, string>>({});

  // members tab state
  const [memberSearch, setMemberSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');


  // 페이지 진입 시 최신 프로필 갱신 (assigned_club 반영)
  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const clubId = user?.assigned_club;

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ['clubMembers'],
    queryFn: () => messengerService.getClubMembers(),
    enabled: !!clubId,
  });

  const { data: pendingRequests, isLoading: requestsLoading } = useQuery({
    queryKey: ['pendingClubRequests'],
    queryFn: () => messengerService.getPendingClubRequests(),
    enabled: !!clubId,
  });

  const { data: clubRoom, isLoading: clubRoomLoading } = useQuery({
    queryKey: ['chatRoom', clubId],
    queryFn: () => messengerService.getChatRoom(clubId!),
    enabled: !!clubId,
  });

  const { data: clubImages, isLoading: imagesLoading } = useQuery({
    queryKey: ['clubImages', clubId],
    queryFn: () => messengerService.getClubImages(clubId!),
    enabled: !!clubId,
  });

  const { data: searchResults, isFetching: searchFetching } = useQuery({
    queryKey: ['availableMembers', memberSearch],
    queryFn: () => messengerService.searchAvailableMembers(memberSearch),
    enabled: !!memberSearch && memberSearch.length >= 1,
  });

  // Load description from clubRoom
  useEffect(() => {
    if (clubRoom && !descriptionLoaded) {
      setDescription(clubRoom.description || '');
      setDescriptionLoaded(true);
    }
  }, [clubRoom, descriptionLoaded]);

  // Initialize editing captions when images load
  useEffect(() => {
    if (clubImages) {
      const captions: Record<number, string> = {};
      clubImages.forEach((img: ClubImage) => {
        captions[img.id] = img.caption || '';
      });
      setEditingCaptions((prev) => {
        // only set if not already set (preserve user edits)
        const merged = { ...captions };
        for (const key of Object.keys(prev)) {
          const numKey = Number(key);
          if (captions[numKey] !== undefined) {
            merged[numKey] = prev[numKey];
          }
        }
        return merged;
      });
    }
  }, [clubImages]);

  const approveMutation = useMutation({
    mutationFn: (requestId: number) => messengerService.approveClubRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingClubRequests'] });
      queryClient.invalidateQueries({ queryKey: ['pendingClubRequestCount'] });
      queryClient.invalidateQueries({ queryKey: ['clubMembers'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (requestId: number) => messengerService.rejectClubRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingClubRequests'] });
      queryClient.invalidateQueries({ queryKey: ['pendingClubRequestCount'] });
    },
  });

  const updateInfoMutation = useMutation({
    mutationFn: (data: { description: string }) => messengerService.updateClubInfo(clubId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatRoom', clubId] });
      alert('클럽 소개글이 수정되었습니다.');
    },
  });

  const setIconMutation = useMutation({
    mutationFn: (data: FormData) => messengerService.setClubIcon(clubId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatRoom', clubId] });
      alert('아이콘이 설정되었습니다.');
    },
  });

  const addImageMutation = useMutation({
    mutationFn: (data: FormData) => messengerService.addClubImage(clubId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubImages', clubId] });
      setImageCaption('');
      if (imageInputRef.current) imageInputRef.current.value = '';
    },
    onError: (error: any) => {
      alert(error.response?.data?.error || '이미지 업로드에 실패했습니다.');
    },
  });

  const deleteImageMutation = useMutation({
    mutationFn: (imageId: number) => messengerService.deleteClubImage(clubId!, imageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubImages', clubId] });
    },
  });

  const updateImageMutation = useMutation({
    mutationFn: ({ imageId, caption }: { imageId: number; caption: string }) =>
      messengerService.updateClubImage(clubId!, imageId, { caption }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubImages', clubId] });
      alert('설명이 수정되었습니다.');
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: (userId: number) => messengerService.addClubMember(userId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['clubMembers'] });
      queryClient.invalidateQueries({ queryKey: ['availableMembers'] });
      alert(data.message);
    },
    onError: (error: any) => {
      alert(error.response?.data?.error || '멤버 추가에 실패했습니다.');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: number) => messengerService.removeClubMember(userId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['clubMembers'] });
      alert(data.message);
    },
    onError: (error: any) => {
      alert(error.response?.data?.error || '멤버 삭제에 실패했습니다.');
    },
  });

  // Bans
  const { data: activeBans, isLoading: bansLoading } = useQuery({
    queryKey: ['clubBans', clubId],
    queryFn: async () => {
      const res = await api.get(`/messenger/rooms/${clubId}/bans/`);
      return res.data as ChatBan[];
    },
    enabled: !!clubId && activeTab === 'bans',
  });

  const banMutation = useMutation({
    mutationFn: (data: { user_id: number; ban_type: string; reason: string; expires_at: string | null }) =>
      api.post(`/messenger/rooms/${clubId}/ban_user/`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubBans', clubId] });
      queryClient.invalidateQueries({ queryKey: ['clubMembers'] });
      alert('제재가 적용되었습니다.');
    },
    onError: () => alert('제재 적용에 실패했습니다.'),
  });

  const unbanMutation = useMutation({
    mutationFn: (banId: number) =>
      api.post(`/messenger/rooms/${clubId}/unban/${banId}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubBans', clubId] });
      alert('제재가 해제되었습니다.');
    },
    onError: () => alert('제재 해제에 실패했습니다.'),
  });

  const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('icon', file);
    setIconMutation.mutate(formData);
  };

  const handleRemoveIcon = () => {
    const formData = new FormData();
    formData.append('remove_icon', 'true');
    setIconMutation.mutate(formData);
  };

  const handleAddImage = () => {
    const file = imageInputRef.current?.files?.[0];
    if (!file) {
      alert('이미지 파일을 선택해주세요.');
      return;
    }
    const formData = new FormData();
    formData.append('image', file);
    if (imageCaption) formData.append('caption', imageCaption);
    addImageMutation.mutate(formData);
  };

  const handleMemberSearch = () => {
    setMemberSearch(searchInput.trim());
  };

  const canRemoveMember = (member: User) => {
    if (member.role === 'admin') return false;
    if (member.id === user?.id) return false;
    return true;
  };

  const isCaptionChanged = (img: ClubImage) => {
    return editingCaptions[img.id] !== undefined && editingCaptions[img.id] !== (img.caption || '');
  };

  if (!clubId) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">클럽장 관리</h1>
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          배정된 클럽이 없습니다.
        </div>
      </div>
    );
  }

  const tabs: { key: TabType; label: string; badge?: React.ReactNode }[] = [
    {
      key: 'requests',
      label: '요청 관리',
      badge: pendingRequests && pendingRequests.length > 0 ? (
        <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
          {pendingRequests.length}
        </span>
      ) : undefined,
    },
    {
      key: 'members',
      label: '멤버 관리',
      badge: members ? (
        <span className="ml-2 text-gray-400 text-xs">{members.length}명</span>
      ) : undefined,
    },
    { key: 'bans', label: '회원 제재' },
    { key: 'info', label: '클럽 정보' },
    {
      key: 'images',
      label: '클럽 이미지',
      badge: clubImages ? (
        <span className="ml-2 text-gray-400 text-xs">{clubImages.length}/10</span>
      ) : undefined,
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">클럽장 관리</h1>
      <p className="text-gray-500 mb-6">
        소속 클럽: <span className="font-medium text-gray-700">{user?.assigned_club_name}</span>
      </p>

      {/* 탭 */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.badge}
          </button>
        ))}
      </div>

      {/* 요청 관리 탭 */}
      {activeTab === 'requests' && (
        <div className="bg-white rounded-lg shadow">
          {requestsLoading ? (
            <Loading />
          ) : pendingRequests && pendingRequests.length > 0 ? (
            <div className="divide-y divide-gray-200">
              {pendingRequests.map((req) => (
                <div key={req.id} className="p-4 flex justify-between items-center">
                  <div>
                    <div className="font-medium">{req.user.username}</div>
                    <div className="text-sm text-gray-500">
                      {req.user.email}
                    </div>
                    <div className="mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        req.request_type === 'join'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-orange-100 text-orange-700'
                      }`}>
                        {req.request_type_display} 요청
                      </span>
                      <span className="text-xs text-gray-400 ml-2">
                        {new Date(req.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => approveMutation.mutate(req.id)}
                      disabled={approveMutation.isPending}
                      className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      승인
                    </button>
                    <button
                      onClick={() => rejectMutation.mutate(req.id)}
                      disabled={rejectMutation.isPending}
                      className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      거절
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              대기 중인 요청이 없습니다.
            </div>
          )}
        </div>
      )}

      {/* 멤버 관리 탭 */}
      {activeTab === 'members' && (
        <div className="space-y-6">
          {/* 멤버 추가 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">멤버 추가</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleMemberSearch(); }}
                placeholder="이름, 이메일 또는 전화번호로 검색"
                className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
              <button
                onClick={handleMemberSearch}
                className="px-5 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 whitespace-nowrap"
              >
                검색
              </button>
            </div>

            {/* 검색 결과 */}
            {memberSearch && (
              <div className="mt-3">
                {searchFetching ? (
                  <div className="text-sm text-gray-400 py-2">검색 중...</div>
                ) : searchResults && searchResults.length > 0 ? (
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-60 overflow-y-auto">
                    {searchResults.map((u) => (
                      <div key={u.id} className="p-3 flex justify-between items-center hover:bg-gray-50">
                        <div>
                          <div className="text-sm font-medium">{u.username}</div>
                          <div className="text-xs text-gray-500">{u.email}{u.phone ? ` / ${u.phone}` : ''}</div>
                        </div>
                        <button
                          onClick={() => addMemberMutation.mutate(u.id)}
                          disabled={addMemberMutation.isPending}
                          className="px-3 py-1 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                          추가
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 py-2">
                    검색 결과가 없습니다.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 멤버 목록 */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-sm font-medium text-gray-700">현재 멤버</h3>
              <span className="text-sm text-gray-500">{members?.length || 0}명</span>
            </div>
            {membersLoading ? (
              <Loading />
            ) : members && members.length > 0 ? (
              <div className="divide-y divide-gray-200">
                {members.map((member) => (
                  <div key={member.id} className="p-4 flex justify-between items-center">
                    <div>
                      <div className="font-medium">{member.username}</div>
                      <div className="text-sm text-gray-500">{member.email}{member.phone ? ` / ${member.phone}` : ''}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        member.role === 'admin'
                          ? 'bg-purple-100 text-purple-700'
                          : member.role === 'instructor'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                      }`}>
                        {member.role === 'admin' ? '관리자' : member.role === 'instructor' ? '클럽장' : '회원'}
                      </span>
                      {canRemoveMember(member) && (
                        <button
                          onClick={() => {
                            if (confirm(`${member.username}님을 클럽에서 삭제하시겠습니까?`)) {
                              removeMemberMutation.mutate(member.id);
                            }
                          }}
                          disabled={removeMemberMutation.isPending}
                          className="px-3 py-1 text-xs text-red-600 border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                멤버가 없습니다.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 회원 제재 탭 */}
      {activeTab === 'bans' && (
        <div className="space-y-6">
          {/* 제재 등록 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">제재 등록</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const formData = new FormData(form);
                banMutation.mutate({
                  user_id: Number(formData.get('user_id')),
                  ban_type: formData.get('ban_type') as string,
                  reason: formData.get('reason') as string,
                  expires_at: (formData.get('expires_at') as string) || null,
                });
                form.reset();
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">대상 회원</label>
                  <select
                    name="user_id"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                  >
                    <option value="">선택하세요</option>
                    {members?.filter(m => m.role !== 'admin' && m.id !== user?.id).map((m) => (
                      <option key={m.id} value={m.id}>{m.username} ({m.email})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">제재 유형</label>
                  <select
                    name="ban_type"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                  >
                    <option value="mute">채팅 금지</option>
                    <option value="kick">강제 퇴장</option>
                    <option value="ban">영구 차단</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">사유</label>
                  <input
                    type="text"
                    name="reason"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">만료일 (선택)</label>
                  <input
                    type="datetime-local"
                    name="expires_at"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                  />
                </div>
              </div>
              <div className="mt-4">
                <button
                  type="submit"
                  disabled={banMutation.isPending}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
                >
                  {banMutation.isPending ? '처리 중...' : '제재 적용'}
                </button>
              </div>
            </form>
          </div>

          {/* 활성 제재 목록 */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-700">활성 제재 목록</h3>
            </div>
            {bansLoading ? (
              <Loading />
            ) : activeBans && activeBans.length > 0 ? (
              <div className="divide-y divide-gray-200">
                {activeBans.map((ban) => (
                  <div key={ban.id} className="p-4 flex justify-between items-center">
                    <div>
                      <div className="font-medium text-sm">{ban.user.username}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          ban.ban_type === 'mute' ? 'bg-yellow-100 text-yellow-800' :
                          ban.ban_type === 'kick' ? 'bg-orange-100 text-orange-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {ban.ban_type_display}
                        </span>
                        {ban.reason && <span className="text-xs text-gray-500">{ban.reason}</span>}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {new Date(ban.created_at).toLocaleString()}
                        {ban.expires_at && <> ~ {new Date(ban.expires_at).toLocaleString()}</>}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm('이 제재를 해제하시겠습니까?')) {
                          unbanMutation.mutate(ban.id);
                        }
                      }}
                      disabled={unbanMutation.isPending}
                      className="px-3 py-1 text-xs text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 disabled:opacity-50"
                    >
                      해제
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                활성 제재가 없습니다.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 클럽 정보 탭 */}
      {activeTab === 'info' && (
        <div className="space-y-6">
          {clubRoomLoading ? (
            <Loading />
          ) : (
            <>
              {/* 현재 등록 정보 미리보기 */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-sm font-medium text-gray-700 mb-4">현재 등록 정보</h3>
                <div className="flex items-start gap-5">
                  {clubRoom?.icon ? (
                    <img src={clubRoom.icon} alt="클럽 아이콘" className="w-20 h-20 rounded-full object-cover border-2 border-gray-200 shrink-0" />
                  ) : (
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center border-2 border-dashed border-gray-300 shrink-0">
                      <span className="text-xs text-gray-400">아이콘 없음</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-lg text-gray-900">{clubRoom?.name}</h4>
                    {clubRoom?.description ? (
                      <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{clubRoom.description}</p>
                    ) : (
                      <p className="text-sm text-gray-400 mt-1">등록된 소개글이 없습니다.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* 아이콘 수정 */}
              <div className="bg-white rounded-lg shadow p-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">아이콘 변경</label>
                <div className="flex items-center gap-4">
                  {clubRoom?.icon ? (
                    <img src={clubRoom.icon} alt="현재 아이콘" className="w-16 h-16 rounded-full object-cover" />
                  ) : (
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      ref={iconInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleIconUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => iconInputRef.current?.click()}
                      disabled={setIconMutation.isPending}
                      className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {setIconMutation.isPending ? '업로드 중...' : '새 아이콘 업로드'}
                    </button>
                    {clubRoom?.icon && (
                      <button
                        onClick={handleRemoveIcon}
                        disabled={setIconMutation.isPending}
                        className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50"
                      >
                        아이콘 삭제
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 소개글 수정 */}
              <div className="bg-white rounded-lg shadow p-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">소개글 수정</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="클럽 소개를 입력하세요..."
                />
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={() => updateInfoMutation.mutate({ description })}
                    disabled={updateInfoMutation.isPending}
                    className="px-6 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {updateInfoMutation.isPending ? '저장 중...' : '소개글 저장'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 클럽 이미지 탭 */}
      {activeTab === 'images' && (
        <div className="space-y-6">
          {/* 이미지 업로드 */}
          {(!clubImages || clubImages.length < 10) && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">새 이미지 추가</h3>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={imageCaption}
                  onChange={(e) => setImageCaption(e.target.value)}
                  placeholder="설명 (선택)"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <button
                  onClick={handleAddImage}
                  disabled={addImageMutation.isPending}
                  className="px-6 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {addImageMutation.isPending ? '업로드 중...' : '업로드'}
                </button>
              </div>
            </div>
          )}

          {/* 등록된 이미지 목록 */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-medium text-gray-700">등록된 이미지</h3>
              <span className="text-sm text-gray-500">{clubImages?.length || 0}/10</span>
            </div>
            {imagesLoading ? (
              <Loading />
            ) : clubImages && clubImages.length > 0 ? (
              <div className="space-y-4">
                {clubImages.map((img: ClubImage) => (
                  <div key={img.id} className="flex gap-4 items-start border border-gray-200 rounded-lg p-3">
                    <img
                      src={img.image}
                      alt={img.caption || '클럽 이미지'}
                      className="w-32 h-24 object-cover rounded-lg shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={editingCaptions[img.id] ?? img.caption ?? ''}
                        onChange={(e) =>
                          setEditingCaptions((prev) => ({ ...prev, [img.id]: e.target.value }))
                        }
                        placeholder="이미지 설명 입력"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      />
                      <div className="flex items-center gap-2 mt-2">
                        {isCaptionChanged(img) && (
                          <button
                            onClick={() =>
                              updateImageMutation.mutate({
                                imageId: img.id,
                                caption: editingCaptions[img.id] || '',
                              })
                            }
                            disabled={updateImageMutation.isPending}
                            className="px-3 py-1 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50"
                          >
                            {updateImageMutation.isPending ? '저장 중...' : '설명 저장'}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm('이 이미지를 삭제하시겠습니까?')) {
                              deleteImageMutation.mutate(img.id);
                            }
                          }}
                          disabled={deleteImageMutation.isPending}
                          className="px-3 py-1 text-xs text-red-600 border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50"
                        >
                          삭제
                        </button>
                        <span className="text-xs text-gray-400 ml-auto">
                          {new Date(img.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                등록된 이미지가 없습니다.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
