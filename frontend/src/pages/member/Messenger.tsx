import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { messengerService } from '../../services/messenger';
import { useAuthStore } from '../../store/authStore';
import type { ChatRoom, Message, User } from '../../types';
import Loading from '../../components/common/Loading';
import api from '../../services/api';

interface BanStatus {
  is_banned: boolean;
  ban_type?: string;
  ban_type_display?: string;
  reason?: string;
  expires_at?: string;
}

export default function Messenger() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showInvitationsModal, setShowInvitationsModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: rooms, isLoading } = useQuery({
    queryKey: ['chatRooms'],
    queryFn: () => messengerService.getChatRooms(),
  });

  // 대기 중인 초대 조회
  const { data: invitations } = useQuery({
    queryKey: ['chatInvitations'],
    queryFn: () => messengerService.getInvitations(),
  });

  const sendMutation = useMutation({
    mutationFn: ({ roomId, content }: { roomId: number; content: string }) =>
      messengerService.sendMessage(roomId, content),
    onSuccess: (data) => {
      setMessages((prev) => [...prev, data]);
      // 채팅방 목록 새로고침
      queryClient.invalidateQueries({ queryKey: ['chatRooms'] });
    },
    onError: (error: { response?: { status?: number; data?: { error?: string } } }) => {
      if (error.response?.status === 403) {
        // 제재로 인한 거부 - 제재 상태 새로 조회
        queryClient.invalidateQueries({ queryKey: ['myBanStatus', selectedRoom?.id] });
        alert(error.response?.data?.error || '채팅이 금지된 상태입니다.');
      } else {
        alert('메시지 전송에 실패했습니다.');
      }
    },
  });

  const kickMutation = useMutation({
    mutationFn: ({ roomId, userId }: { roomId: number; userId: number }) =>
      api.post(`/messenger/rooms/${roomId}/kick/`, { user_id: userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatRooms'] });
      queryClient.invalidateQueries({ queryKey: ['roomMembers', selectedRoom?.id] });
    },
  });

  const inviteMutation = useMutation({
    mutationFn: ({ roomId, userIds }: { roomId: number; userIds: number[] }) =>
      api.post(`/messenger/rooms/${roomId}/invite/`, { user_ids: userIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatRooms'] });
      setShowInviteModal(false);
    },
  });

  const toggleNotificationMutation = useMutation({
    mutationFn: (roomId: number) => messengerService.toggleNotification(roomId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['chatRooms'] });
      // 선택된 채팅방의 알림 상태도 즉시 업데이트
      if (selectedRoom) {
        setSelectedRoom({
          ...selectedRoom,
          notification_enabled: data.notification_enabled,
        });
      }
    },
  });

  const acceptInvitationMutation = useMutation({
    mutationFn: (invitationId: number) => messengerService.acceptInvitation(invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatRooms'] });
      queryClient.invalidateQueries({ queryKey: ['chatInvitations'] });
    },
  });

  const rejectInvitationMutation = useMutation({
    mutationFn: (invitationId: number) => messengerService.rejectInvitation(invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatInvitations'] });
    },
  });

  // 채팅방 멤버 조회
  const { data: roomMembers } = useQuery({
    queryKey: ['roomMembers', selectedRoom?.id],
    queryFn: async () => {
      if (!selectedRoom) return [];
      const response = await api.get(`/messenger/rooms/${selectedRoom.id}/members_list/`);
      return response.data as User[];
    },
    enabled: !!selectedRoom && showMembersModal,
    staleTime: 0,
  });

  // 제재 상태 조회
  const { data: banStatus } = useQuery({
    queryKey: ['myBanStatus', selectedRoom?.id],
    queryFn: async () => {
      if (!selectedRoom) return null;
      const response = await api.get(`/messenger/rooms/${selectedRoom.id}/my_ban_status/`);
      return response.data as BanStatus;
    },
    enabled: !!selectedRoom,
  });

  // rooms 데이터 갱신 시 selectedRoom 동기화
  useEffect(() => {
    if (selectedRoom && rooms) {
      const updated = rooms.find((r) => r.id === selectedRoom.id);
      if (updated && updated !== selectedRoom) {
        setSelectedRoom(updated);
      }
    }
  }, [rooms]);

  // 채팅방 선택 시 메시지 로드 및 읽음 처리
  useEffect(() => {
    if (selectedRoom) {
      // 초기 메시지 로드
      messengerService.getMessages(selectedRoom.id).then((msgs) => {
        setMessages(msgs.reverse());
      });

      // 읽음 처리 - 채팅방 목록 및 헤더 알림 즉시 업데이트
      messengerService.markAsRead(selectedRoom.id).then(() => {
        queryClient.invalidateQueries({ queryKey: ['chatRooms'] });
        queryClient.invalidateQueries({ queryKey: ['totalUnread'] });
      });

      // 폴링으로 새 메시지 확인 (2초마다)
      const pollInterval = setInterval(async () => {
        try {
          const msgs = await messengerService.getMessages(selectedRoom.id);
          const reversed = msgs.reverse();
          setMessages((prev) => {
            // 새 메시지가 있으면 업데이트
            if (reversed.length !== prev.length ||
                (reversed.length > 0 && prev.length > 0 && reversed[reversed.length - 1]?.id !== prev[prev.length - 1]?.id)) {
              // 읽음 처리 - 채팅방 목록 및 헤더 알림 즉시 업데이트
              messengerService.markAsRead(selectedRoom.id).then(() => {
                queryClient.invalidateQueries({ queryKey: ['chatRooms'] });
                queryClient.invalidateQueries({ queryKey: ['totalUnread'] });
              });
              return reversed;
            }
            return prev;
          });
        } catch (error) {
          console.error('Polling error:', error);
        }
      }, 2000);

      return () => {
        clearInterval(pollInterval);
      };
    }
  }, [selectedRoom, queryClient]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !selectedRoom) return;

    // 제재 상태 확인
    if (banStatus?.is_banned) {
      const banTypeText = banStatus.ban_type_display || '알 수 없는 제재';
      const reasonText = banStatus.reason ? `\n사유: ${banStatus.reason}` : '';
      const expiresText = banStatus.expires_at
        ? `\n만료: ${new Date(banStatus.expires_at).toLocaleString()}`
        : '\n만료: 무기한';
      alert(`채팅이 제한되었습니다.\n\n제재 유형: ${banTypeText}${reasonText}${expiresText}`);
      return;
    }

    // HTTP로 메시지 전송
    sendMutation.mutate({ roomId: selectedRoom.id, content: message });
    setMessage('');
  };

  if (isLoading) return <Loading />;

  // 공용 채팅방과 일반 채팅방 분리
  const publicRooms = rooms?.filter((r) => r.is_public) || [];
  const privateRooms = rooms?.filter((r) => !r.is_public) || [];
  const pendingInvitations = invitations?.filter((i) => i.status === 'pending') || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">클럽</h1>
        <div className="flex gap-2">
          {pendingInvitations.length > 0 && (
            <button
              onClick={() => setShowInvitationsModal(true)}
              className="relative bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-yellow-600"
            >
              초대 {pendingInvitations.length}건
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-[600px]">
        {/* 채팅방 목록 */}
        <div className="bg-white rounded-lg shadow p-4 overflow-y-auto max-h-[600px]">
          {/* 공용 클럽 */}
          {publicRooms.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                공용 클럽
              </h3>
              {publicRooms.map((room) => (
                <RoomButton
                  key={room.id}
                  room={room}
                  isSelected={selectedRoom?.id === room.id}
                  onClick={() => setSelectedRoom(room)}
                />
              ))}
            </div>
          )}

          {/* 비공용 클럽 - 서버에서 접근 가능한 클럽만 반환 */}
          {privateRooms.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                {user?.role === 'admin' ? '전체 클럽' : user?.role === 'instructor' ? '내 클럽' : '참여 중인 클럽'}
              </h3>
              {privateRooms.map((room) => (
                <RoomButton
                  key={room.id}
                  room={room}
                  isSelected={selectedRoom?.id === room.id}
                  onClick={() => setSelectedRoom(room)}
                />
              ))}
            </div>
          )}

          {rooms?.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-4">
              참여 중인 클럽이 없습니다.
            </p>
          )}
        </div>

        {/* 채팅 영역 */}
        <div className="md:col-span-3 bg-white rounded-lg shadow flex flex-col min-h-0 max-h-[600px]">
          {selectedRoom ? (
            <>
              {/* 클럽 헤더 */}
              <div className="border-b p-4 flex justify-between items-center flex-shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{selectedRoom.name}</h2>
                    {selectedRoom.is_public && (
                      <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded">
                        공용
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    {selectedRoom.member_count}명 참여 중
                    {selectedRoom.club_leader && !selectedRoom.is_public && (
                      <> | 클럽장: {selectedRoom.club_leader.username}</>
                    )}
                  </p>
                </div>
                <div className="flex gap-2 items-center">
                  {/* 알림 토글 */}
                  <button
                    onClick={() => toggleNotificationMutation.mutate(selectedRoom.id)}
                    className={`text-sm px-2 py-1 rounded ${
                      selectedRoom.notification_enabled
                        ? 'text-green-600 hover:bg-green-50'
                        : 'text-gray-400 hover:bg-gray-50'
                    }`}
                    title={selectedRoom.notification_enabled ? '알림 끄기' : '알림 켜기'}
                  >
                    {selectedRoom.notification_enabled ? '🔔' : '🔕'}
                  </button>
                  <button
                    onClick={() => setShowMembersModal(true)}
                    className="text-gray-500 hover:text-gray-700 text-sm"
                  >
                    멤버 보기
                  </button>
                  {selectedRoom.can_manage && !selectedRoom.is_public && (
                    <button
                      onClick={() => setShowInviteModal(true)}
                      className="text-green-600 hover:text-green-700 text-sm"
                    >
                      초대하기
                    </button>
                  )}
                </div>
              </div>

              {/* 메시지 영역 */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
                {messages.map((msg, idx) => {
                  const msgDate = new Date(msg.created_at).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'long',
                  });
                  const prevDate = idx > 0
                    ? new Date(messages[idx - 1].created_at).toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        weekday: 'long',
                      })
                    : null;
                  const showDateSeparator = idx === 0 || msgDate !== prevDate;

                  return (
                    <div key={msg.id}>
                      {showDateSeparator && (
                        <div className="flex items-center gap-3 my-4">
                          <div className="flex-1 border-t border-gray-300" />
                          <span className="text-xs text-gray-500 whitespace-nowrap">{msgDate}</span>
                          <div className="flex-1 border-t border-gray-300" />
                        </div>
                      )}
                      <div
                        className={`flex ${
                          msg.sender.id === user?.id ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <div
                          className={`max-w-[70%] ${
                            msg.sender.id === user?.id
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-100'
                          } rounded-lg px-4 py-2 overflow-hidden`}
                        >
                          {msg.sender.id !== user?.id && (
                            <div className="text-xs font-medium mb-1">
                              {msg.sender.username}
                            </div>
                          )}
                          <p className="break-all whitespace-pre-wrap">{msg.content}</p>
                          <div
                            className={`text-xs mt-1 ${
                              msg.sender.id === user?.id ? 'text-green-200' : 'text-gray-500'
                            }`}
                          >
                            {new Date(msg.created_at).toLocaleTimeString('ko-KR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* 메시지 입력 */}
              <form onSubmit={handleSend} className="border-t p-4 flex gap-2 flex-shrink-0">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                  placeholder="메시지를 입력하세요"
                />
                <button
                  type="submit"
                  className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"
                >
                  전송
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              클럽을 선택하세요
            </div>
          )}
        </div>
      </div>

      {/* 멤버 목록 모달 */}
      {showMembersModal && selectedRoom && (
        <Modal onClose={() => setShowMembersModal(false)} title={`${selectedRoom.name} 멤버`}>
          <div className="max-h-80 overflow-y-auto">
            {!roomMembers ? (
              <p className="text-gray-500 text-center py-4">로딩 중...</p>
            ) : roomMembers.length === 0 ? (
              <p className="text-gray-500 text-center py-4">멤버가 없습니다.</p>
            ) : (
              roomMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex justify-between items-center py-2 border-b last:border-0"
                >
                  <div>
                    <div className="font-medium">{member.username}</div>
                    <div className="text-sm text-gray-500">
                      {member.role === 'admin'
                        ? '관리자'
                        : member.role === 'instructor'
                          ? '클럽장'
                          : '일반 회원'}
                    </div>
                  </div>
                  {selectedRoom.can_manage &&
                    !selectedRoom.is_public &&
                    member.id !== user?.id &&
                    member.role !== 'admin' &&
                    member.id !== selectedRoom.created_by?.id &&
                    member.id !== selectedRoom.club_leader?.id && (
                      <button
                        onClick={() => {
                          if (window.confirm(`${member.username}님을 퇴출하시겠습니까?`)) {
                            kickMutation.mutate({
                              roomId: selectedRoom.id,
                              userId: member.id,
                            });
                          }
                        }}
                        className="text-red-600 hover:text-red-700 text-sm"
                      >
                        퇴출
                      </button>
                    )}
                </div>
              ))
            )}
          </div>
        </Modal>
      )}

      {/* 초대 모달 (검색 기능 포함) */}
      {showInviteModal && selectedRoom && (
        <InviteModalWithSearch
          roomId={selectedRoom.id}
          onClose={() => setShowInviteModal(false)}
          onInvite={(userIds) => {
            inviteMutation.mutate({ roomId: selectedRoom.id, userIds });
          }}
          isLoading={inviteMutation.isPending}
        />
      )}

      {/* 받은 초대 모달 */}
      {showInvitationsModal && (
        <Modal onClose={() => setShowInvitationsModal(false)} title="받은 초대">
          <div className="max-h-80 overflow-y-auto">
            {pendingInvitations.length > 0 ? (
              pendingInvitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="border rounded-lg p-4 mb-3 last:mb-0"
                >
                  <div className="font-medium text-lg">{invitation.room.name}</div>
                  <div className="text-sm text-gray-500 mb-3">
                    {invitation.invited_by.username}님의 초대
                    <span className="mx-1">|</span>
                    {new Date(invitation.created_at).toLocaleDateString()}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => acceptInvitationMutation.mutate(invitation.id)}
                      disabled={acceptInvitationMutation.isPending}
                      className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      수락
                    </button>
                    <button
                      onClick={() => rejectInvitationMutation.mutate(invitation.id)}
                      disabled={rejectInvitationMutation.isPending}
                      className="flex-1 border border-gray-300 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      거절
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">받은 초대가 없습니다.</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function RoomButton({
  room,
  isSelected,
  onClick,
}: {
  room: ChatRoom;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg transition-colors mb-1 ${
        isSelected ? 'bg-green-100 text-green-700' : 'hover:bg-gray-100'
      }`}
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{room.name}</span>
          {!room.notification_enabled && (
            <span className="text-gray-400 text-xs">🔕</span>
          )}
        </div>
        {room.unread_count && room.unread_count > 0 && (
          <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full ml-2">
            {room.unread_count}
          </span>
        )}
      </div>
      {room.last_message && (
        <div className="text-sm text-gray-500 truncate">{room.last_message.content}</div>
      )}
    </button>
  );
}

function Modal({
  children,
  title,
  onClose,
}: {
  children: React.ReactNode;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            X
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function InviteModalWithSearch({
  roomId,
  onClose,
  onInvite,
  isLoading,
}: {
  roomId: number;
  onClose: () => void;
  onInvite: (userIds: number[]) => void;
  isLoading: boolean;
}) {
  const [search, setSearch] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // 검색 실행
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (search.trim()) {
        setIsSearching(true);
        try {
          const users = await messengerService.searchAvailableUsers(roomId, search);
          setSearchResults(users);
        } catch (error) {
          console.error('Search error:', error);
        } finally {
          setIsSearching(false);
        }
      } else {
        // 검색어가 없으면 전체 목록 표시
        setIsSearching(true);
        try {
          const users = await messengerService.searchAvailableUsers(roomId, '');
          setSearchResults(users);
        } catch (error) {
          console.error('Search error:', error);
        } finally {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search, roomId]);

  const toggleUser = (userId: number) => {
    if (selectedUsers.includes(userId)) {
      setSelectedUsers(selectedUsers.filter((id) => id !== userId));
    } else {
      setSelectedUsers([...selectedUsers, userId]);
    }
  };

  return (
    <Modal onClose={onClose} title="멤버 초대">
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름 또는 이메일로 검색"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
        />
      </div>
      <div className="max-h-60 overflow-y-auto mb-4">
        {isSearching ? (
          <p className="text-gray-500 text-center py-4">검색 중...</p>
        ) : searchResults.length > 0 ? (
          searchResults.map((user) => (
            <label
              key={user.id}
              className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedUsers.includes(user.id)}
                onChange={() => toggleUser(user.id)}
                className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
              />
              <div>
                <div className="font-medium">{user.username}</div>
                <div className="text-sm text-gray-500">{user.email}</div>
              </div>
            </label>
          ))
        ) : (
          <p className="text-gray-500 text-center py-4">
            {search ? '검색 결과가 없습니다.' : '초대 가능한 사용자가 없습니다.'}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          취소
        </button>
        <button
          onClick={() => onInvite(selectedUsers)}
          disabled={selectedUsers.length === 0 || isLoading}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {isLoading ? '초대 중...' : `${selectedUsers.length}명 초대`}
        </button>
      </div>
    </Modal>
  );
}
