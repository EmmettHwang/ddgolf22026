// 사용자
export interface User {
  id: number;
  email: string;
  username: string;
  phone?: string;
  profile_image?: string;
  role: 'admin' | 'instructor' | 'member' | 'pending';
  role_display?: string;
  requested_role: 'instructor' | 'member';
  requested_role_display?: string;
  is_approved: boolean;
  is_active?: boolean;
  is_email_verified?: boolean;
  social_provider?: string | null;
  created_at: string;
  wants_club_membership?: boolean;
  requested_club?: number | null;
  requested_club_name?: string | null;
  assigned_club?: number | null;
  assigned_club_name?: string | null;
}

// 인증
export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface LoginRequest {
  email: string;  // 이메일 또는 이름
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  password2: string;
  phone?: string;
}

// 게시판
export interface Post {
  id: number;
  title: string;
  content: string;
  author: User;
  views: number;
  is_public: boolean;
  images: PostImage[];
  comments: Comment[];
  thumbnail?: string;
  comment_count?: number;
  created_at: string;
  updated_at: string;
}

export interface PostImage {
  id: number;
  image: string;
  created_at: string;
}

export interface Comment {
  id: number;
  author: User;
  content: string;
  created_at: string;
  updated_at: string;
}

// 갤러리 카테고리
export interface GalleryCategory {
  id: number;
  name: string;
  order: number;
  album_count: number;
}

// 갤러리
export interface Album {
  id: number;
  title: string;
  description: string;
  cover_image?: string;
  cover_photo_id?: number | null;
  author: User;
  album_type: 'public' | 'member';
  is_public: boolean;
  is_hidden: boolean;
  photos: Photo[];
  photo_count?: number;
  category?: number | null;
  category_name?: string;
  created_at: string;
  updated_at: string;
}

export interface Photo {
  id: number;
  image: string;
  caption: string;
  is_hidden: boolean;
  order: number;
  created_at: string;
}

// 공지사항
export interface Notice {
  id: number;
  title: string;
  content: string;
  author: User;
  visibility: 'public' | 'member' | 'club';
  visibility_display?: string;
  is_important: boolean;
  is_hidden: boolean;
  is_popup?: boolean;
  popup_image?: string | null;
  popup_content?: string;
  linked_event?: number | null;
  views: number;
  club?: number | null;
  club_name?: string | null;
  created_at: string;
  updated_at: string;
}

// 팝업 공지사항
export interface PopupNotice {
  id: number;
  title: string;
  popup_image: string | null;
  popup_content: string;
  linked_event: number | null;
  created_at: string;
}

// 연혁
export interface History {
  id: number;
  year: number;
  content: string;
  detail: string;
  order: number;
}

// 일정
export interface Event {
  id: number;
  title: string;
  description: string;
  event_type: 'match' | 'tournament' | 'practice' | 'meeting' | 'other';
  location: string;
  location_link: string;
  start_date: string;
  end_date: string;
  max_participants: number;
  participants: EventParticipant[];
  participant_count?: number;
  pending_participant_count?: number;
  is_participating?: boolean;
  visibility: 'public' | 'member';
  visibility_display?: string;
  is_popup?: boolean;
  created_by: User;
  created_at: string;
  updated_at: string;
}

export interface EventParticipant {
  id: number;
  user: User;
  status: 'pending' | 'confirmed' | 'cancelled';
  created_at: string;
}

// 메신저
export interface ChatRoom {
  id: number;
  name: string;
  description: string;
  icon?: string | null;
  is_group: boolean;
  is_public: boolean;
  created_by?: User;
  club_leader?: User | null;
  members: User[];
  messages?: Message[];
  last_message?: {
    content: string;
    sender: string;
    created_at: string;
  };
  unread_count?: number;
  member_count?: number;
  can_manage?: boolean;
  notification_enabled?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  sender: User;
  content: string;
  is_read: boolean;
  created_at: string;
}

export interface ChatBan {
  id: number;
  room: number;
  room_name?: string;
  user: User;
  banned_by: User;
  ban_type: 'mute' | 'kick' | 'ban';
  ban_type_display: string;
  reason: string;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

// 클럽 가입/탈퇴 요청
export interface ClubMembershipRequest {
  id: number;
  room: number;
  room_name: string;
  user: User;
  request_type: 'join' | 'leave';
  request_type_display: string;
  status: 'pending' | 'approved' | 'rejected';
  status_display: string;
  created_at: string;
  responded_at: string | null;
  responded_by_name: string | null;
}

// 클럽 이미지
export interface ClubImage {
  id: number;
  image: string;
  caption: string;
  order: number;
  created_at: string;
}

// 공개 클럽 목록 아이템 (협회소개용)
export interface PublicClubItem {
  id: number;
  name: string;
  icon: string | null;
  description: string;
  member_count: number;
  images: { id: number; image: string; caption: string }[];
}

// 클럽 목록 아이템 (가입/탈퇴용)
export interface ClubListItem {
  id: number;
  name: string;
  description: string;
  icon: string | null;
  member_count: number;
  is_member: boolean;
  pending_request: {
    id: number;
    request_type: 'join' | 'leave';
  } | null;
}

// SMS 로그
export interface SmsLog {
  id: number;
  sender: number;
  sender_name: string;
  club: number | null;
  club_name: string;
  message: string;
  msg_type: 'SMS' | 'LMS';
  recipients_count: number;
  recipients_info: { id: number; username: string; phone: string }[];
  aligo_response: Record<string, unknown>;
  created_at: string;
}

// 서식다운로드
export interface DocumentCategory {
  id: number;
  name: string;
  order: number;
  documents: Document[];
}

export interface DocumentFile {
  id: number;
  file: string;
  original_name: string;
  order: number;
}

export interface Document {
  id: number;
  category: number;
  title: string;
  description: string;
  thumbnail_id: number | null;
  files: DocumentFile[];
  download_count: number;
  order: number;
  created_at: string;
}

// API 응답
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// 협회소개 콘텐츠
export interface AboutContent {
  greeting_text: string;
  greeting_author: string;
  greeting_image: string | null;
  updated_at: string;
}

// 협회 임원
export interface Executive {
  id: number;
  name: string;
  phone: string;
  greeting: string;
  photo: string | null;
  order: number;
  created_at: string;
}

// 배너
export interface Banner {
  id: number;
  image: string;
  phone_number: string;
  description: string;
  link: string;
  order: number;
  is_active: boolean;
  created_at: string;
}

// 유관기관
export interface Organization {
  id: number;
  name: string;
  logo: string;
  link: string;
  order: number;
  is_active: boolean;
}
