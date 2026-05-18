import { useState, useRef, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import type { User, Notice, Album, Photo, ChatRoom, Message, Banner, Organization, SmsLog, History } from '../../types';
import Loading from '../../components/common/Loading';
import { noticesService } from '../../services/notices';
import { smsService } from '../../services/sms';

// Event 타입 정의
interface Event {
  id: number;
  title: string;
  description: string;
  event_type: string;
  location: string;
  location_link: string;
  start_date: string;
  end_date: string;
  max_participants: number;
  participant_count: number;
  pending_participant_count: number;
  visibility: 'public' | 'member';
  visibility_display?: string;
  is_popup?: boolean;
  created_by: User;
  created_at: string;
}

// 드래그 앤 드랍 파일 업로드 컴포넌트
function FileDropZone({
  label,
  multiple = false,
  accept = 'image/*',
  files,
  onFilesChange,
  coverIndex,
  onCoverSelect,
}: {
  label: string;
  multiple?: boolean;
  accept?: string;
  files: File[];
  onFilesChange: (files: File[]) => void;
  coverIndex?: number;
  onCoverSelect?: (index: number) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [sizeError, setSizeError] = useState('');
  const [dragReorderIdx, setDragReorderIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const MAX_TOTAL_SIZE = 1024 * 1024 * 1024; // 1GB
  const MAX_SINGLE_FILE = 200 * 1024 * 1024; // 개별 파일 200MB

  const validateAndAdd = useCallback((existingFiles: File[], newFiles: File[]) => {
    // 개별 파일 크기 체크
    const tooLarge = newFiles.filter(f => f.size > MAX_SINGLE_FILE);
    if (tooLarge.length > 0) {
      setSizeError(`파일 크기 초과 (최대 200MB): ${tooLarge.map(f => f.name).join(', ')}`);
      newFiles = newFiles.filter(f => f.size <= MAX_SINGLE_FILE);
    }

    // 총 크기 체크
    const currentTotal = existingFiles.reduce((sum, f) => sum + f.size, 0);
    const newTotal = newFiles.reduce((sum, f) => sum + f.size, 0);
    if (currentTotal + newTotal > MAX_TOTAL_SIZE) {
      const remaining = Math.max(0, MAX_TOTAL_SIZE - currentTotal);
      setSizeError(`총 업로드 용량 초과 (최대 1GB, 남은 용량: ${(remaining / 1024 / 1024).toFixed(0)}MB)`);
      return existingFiles;
    }

    if (newFiles.length > 0) setSizeError('');
    return [...existingFiles, ...newFiles];
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const droppedFiles = accept === 'image/*'
        ? Array.from(e.dataTransfer.files).filter((file) => file.type.startsWith('image/'))
        : Array.from(e.dataTransfer.files);

      if (droppedFiles.length > 0) {
        if (multiple) {
          onFilesChange(validateAndAdd(files, droppedFiles));
        } else {
          onFilesChange([droppedFiles[0]]);
        }
      }
    },
    [files, multiple, onFilesChange, accept, validateAndAdd]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (multiple) {
      onFilesChange(validateAndAdd(files, selectedFiles));
    } else {
      onFilesChange(selectedFiles);
    }
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  const moveFileLeft = (index: number) => {
    if (index <= 0) return;
    const newFiles = [...files];
    [newFiles[index - 1], newFiles[index]] = [newFiles[index], newFiles[index - 1]];
    // coverIndex 보정
    if (onCoverSelect && coverIndex !== undefined) {
      if (coverIndex === index) onCoverSelect(index - 1);
      else if (coverIndex === index - 1) onCoverSelect(index);
    }
    onFilesChange(newFiles);
  };

  const moveFileRight = (index: number) => {
    if (index >= files.length - 1) return;
    const newFiles = [...files];
    [newFiles[index], newFiles[index + 1]] = [newFiles[index + 1], newFiles[index]];
    // coverIndex 보정
    if (onCoverSelect && coverIndex !== undefined) {
      if (coverIndex === index) onCoverSelect(index + 1);
      else if (coverIndex === index + 1) onCoverSelect(index);
    }
    onFilesChange(newFiles);
  };

  const [previewUrls, setPreviewUrls] = useState<(string | null)[]>([]);

  // blob URL 대신 canvas 썸네일 data URL 생성 (ERR_FAILED 방지)
  useEffect(() => {
    let cancelled = false;
    if (files.length === 0) { setPreviewUrls([]); return; }

    Promise.all(
      files.map(async (file) => {
        if (!file.type.startsWith('image/')) return null;
        try {
          const bitmap = await createImageBitmap(file);
          const scale = Math.min(160 / bitmap.width, 160 / bitmap.height, 1);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(bitmap.width * scale);
          canvas.height = Math.round(bitmap.height * scale);
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          bitmap.close();
          return canvas.toDataURL('image/jpeg', 0.7);
        } catch {
          return null;
        }
      })
    ).then(urls => { if (!cancelled) setPreviewUrls(urls); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length, ...files.map(f => f.name + f.size + f.lastModified)]);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div
        onClick={() => { inputRef.current?.click(); }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-green-500 bg-green-50'
            : 'border-gray-300 hover:border-green-400 hover:bg-gray-50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileSelect}
          className="hidden"
        />
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          stroke="currentColor"
          fill="none"
          viewBox="0 0 48 48"
        >
          <path
            d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="mt-2 text-sm text-gray-600">
          <span className="font-medium text-green-600">클릭하여 파일 선택</span> 또는 드래그 앤 드랍
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {accept === 'image/*'
            ? (multiple ? '여러 이미지 선택 가능 (PNG, JPG, GIF)' : '이미지 파일 (PNG, JPG, GIF)')
            : (multiple ? '여러 파일 선택 가능' : '파일 선택')}
        </p>
        {multiple && <p className="mt-1 text-xs text-gray-400">개별 파일 최대 200MB / 총 1GB</p>}
      </div>

      {/* 용량 초과 경고 */}
      {sizeError && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
          {sizeError}
        </div>
      )}

      {/* 선택된 파일 미리보기 */}
      {files.length > 0 && (
        <div className="mt-3">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm text-gray-600">
              선택된 파일 ({files.length}개)
              {onCoverSelect && ' - 클릭하여 대표 지정'}
            </p>
            <p className="text-xs text-gray-400">
              {(files.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024).toFixed(1)}MB / 1024MB
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {files.map((file, index) => {
              const isCover = onCoverSelect && coverIndex === index;
              const isImage = file.type.startsWith('image/');
              const canSelectCover = onCoverSelect && isImage;
              return (
                <div
                  key={index}
                  className={`relative group ${dragReorderIdx === index ? 'opacity-50' : ''}`}
                  draggable={multiple && files.length > 1}
                  onDragStart={(e) => { e.stopPropagation(); setDragReorderIdx(index); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={(e) => { if (dragReorderIdx !== null && dragReorderIdx !== index) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; } }}
                  onDrop={(e) => {
                    if (dragReorderIdx !== null && dragReorderIdx !== index) {
                      e.preventDefault(); e.stopPropagation();
                      const newFiles = [...files];
                      const [moved] = newFiles.splice(dragReorderIdx, 1);
                      newFiles.splice(index, 0, moved);
                      if (onCoverSelect && coverIndex !== undefined) {
                        if (coverIndex === dragReorderIdx) onCoverSelect(index);
                        else if (dragReorderIdx < coverIndex && index >= coverIndex) onCoverSelect(coverIndex - 1);
                        else if (dragReorderIdx > coverIndex && index <= coverIndex) onCoverSelect(coverIndex + 1);
                      }
                      onFilesChange(newFiles);
                      setDragReorderIdx(null);
                    }
                  }}
                  onDragEnd={() => setDragReorderIdx(null)}
                >
                  {isImage && previewUrls[index] ? (
                    <img
                      src={previewUrls[index]}
                      alt={file.name}
                      className={`w-20 h-20 object-contain rounded-lg bg-gray-50 ${
                        isCover
                          ? 'ring-3 ring-green-500 border-2 border-green-500'
                          : 'border border-gray-200'
                      } ${canSelectCover ? 'cursor-pointer hover:ring-2 hover:ring-blue-300' : ''}`}
                      onClick={(e) => {
                        if (canSelectCover) {
                          e.stopPropagation();
                          onCoverSelect(index);
                        }
                      }}
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-lg border border-gray-200 bg-gray-50 flex flex-col items-center justify-center">
                      <span className="text-lg font-bold text-gray-400">{file.name.split('.').pop()?.toUpperCase() || 'FILE'}</span>
                    </div>
                  )}
                  {isCover && (
                    <span className="absolute -top-2 -left-2 bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                      대표
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(index);
                    }}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                  >
                    X
                  </button>
                  <p className="text-xs text-gray-500 truncate w-20 mt-1">{file.name}</p>
                  {multiple && files.length > 1 && (
                    <div className="flex gap-1 mt-0.5 justify-center">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={(e) => { e.stopPropagation(); moveFileLeft(index); }}
                        className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 rounded disabled:opacity-30"
                      >
                        &larr;
                      </button>
                      <button
                        type="button"
                        disabled={index === files.length - 1}
                        onClick={(e) => { e.stopPropagation(); moveFileRight(index); }}
                        className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 rounded disabled:opacity-30"
                      >
                        &rarr;
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

type TabType = 'dashboard' | 'members' | 'about' | 'notices' | 'schedule' | 'gallery' | 'messenger' | 'banners' | 'organizations' | 'documents' | 'sms';

interface ChatBan {
  id: number;
  room: number;
  user: User;
  banned_by: User;
  ban_type: 'mute' | 'kick' | 'ban';
  ban_type_display: string;
  reason: string;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

function ClubAssignSelect({
  currentClubId,
  currentClubName,
  clubs,
  disabled,
  onAssign,
}: {
  currentClubId: number | null;
  currentClubName: string | null;
  clubs: ChatRoom[];
  disabled: boolean;
  onAssign: (clubId: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch('');
      }
    };
    const handleScroll = () => {
      if (btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        setPos({ top: rect.bottom + 4, left: rect.left });
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open]);

  const handleOpen = () => {
    if (disabled) return;
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(!open);
    setSearch('');
  };

  const select = (clubId: number | null) => {
    onAssign(clubId);
    setOpen(false);
    setSearch('');
  };

  const filtered = clubs.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={`text-xs border rounded px-2 py-1 w-[130px] text-left truncate inline-flex items-center gap-1 ${
          disabled ? 'opacity-50 border-gray-200 bg-gray-50' : 'border-gray-300 hover:border-gray-400 bg-white'
        }`}
      >
        <span className="truncate flex-1">{currentClubName || '미배정'}</span>
        <svg className="w-3 h-3 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && createPortal(
        <div
          ref={dropRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, width: 224 }}
          className="bg-white border border-gray-200 rounded-lg shadow-lg"
        >
          <div className="p-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="클럽 검색..."
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-green-500 focus:border-green-500"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            <button
              type="button"
              onClick={() => select(null)}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 ${
                !currentClubId ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-700'
              }`}
            >
              미배정
            </button>
            {filtered.map((club) => (
              <button
                key={club.id}
                type="button"
                onClick={() => select(club.id)}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 ${
                  currentClubId === club.id ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-700'
                }`}
              >
                {club.name}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400">검색 결과 없음</div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

const APP_VERSION = 'v2.5.20260518';

export default function AdminDashboard() {
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabType) || 'dashboard';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [readmeContent, setReadmeContent] = useState<string | null>(null);
  const [memberFilter, setMemberFilter] = useState<'pending' | 'all'>('pending');
  const [showNoticeForm, setShowNoticeForm] = useState(false);
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const noticeFormRef = useRef<HTMLFormElement>(null);
  const [showAlbumForm, setShowAlbumForm] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
  const albumFormRef = useRef<HTMLFormElement>(null);
  const executiveFormRef = useRef<HTMLFormElement>(null);
  const historyFormRef = useRef<HTMLFormElement>(null);
  const eventFormRef = useRef<HTMLFormElement>(null);
  const bannerFormRef = useRef<HTMLFormElement>(null);
  const orgFormRef = useRef<HTMLFormElement>(null);
  const clubSettingsRef = useRef<HTMLDivElement>(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<number | null>(null);
  const [albumPhotos, setAlbumPhotos] = useState<File[]>([]);
  const [albumCoverIndex, setAlbumCoverIndex] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showGalleryCategoryForm, setShowGalleryCategoryForm] = useState(false);
  const [editingGalleryCategory, setEditingGalleryCategory] = useState<{ id: number; name: string; order: number } | null>(null);
  const [showBannerForm, setShowBannerForm] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [showOrgForm, setShowOrgForm] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [bannerImage, setBannerImage] = useState<File[]>([]);
  const [orgLogo, setOrgLogo] = useState<File[]>([]);
  const [managingEventId, setManagingEventId] = useState<number | null>(null);
  const [showClubModal, setShowClubModal] = useState(false);
  const [pendingApprovalUser, setPendingApprovalUser] = useState<User | null>(null);
  const [pendingApprovalRole, setPendingApprovalRole] = useState<string>('member');
  const [selectedClubId, setSelectedClubId] = useState<number | null>(null);
  const [aboutGreetingImage, setAboutGreetingImage] = useState<File[]>([]);
  const [showExecutiveForm, setShowExecutiveForm] = useState(false);
  const [editingExecutive, setEditingExecutive] = useState<{ id: number; name: string; phone: string; greeting: string; photo: string | null } | null>(null);
  const [executivePhoto, setExecutivePhoto] = useState<File[]>([]);
  const [executivePhonePrefix, setExecutivePhonePrefix] = useState('042');
  const [executivePhoneNumber, setExecutivePhoneNumber] = useState('');
  const [editingClubId, setEditingClubId] = useState<number | null>(null);
  const [editingClubName, setEditingClubName] = useState('');
  const [showCreateClubForm, setShowCreateClubForm] = useState(false);
  const [bannerPhonePrefix, setBannerPhonePrefix] = useState('02');
  const [bannerPhoneNumber, setBannerPhoneNumber] = useState('');
  // SMS state
  const [smsMessage, setSmsMessage] = useState('');
  const [smsClubFilter, setSmsClubFilter] = useState<number | ''>('');
  const [smsSelectedIds, setSmsSelectedIds] = useState<number[]>([]);
  const [smsSending, setSmsSending] = useState(false);
  const [smsDetailLog, setSmsDetailLog] = useState<SmsLog | null>(null);
  const [showHistoryForm, setShowHistoryForm] = useState(false);
  const [editingHistory, setEditingHistory] = useState<History | null>(null);
  const [popupImage, setPopupImage] = useState<File[]>([]);
  const [isPopupChecked, setIsPopupChecked] = useState(false);
  // Documents state
  const [showDocCategoryForm, setShowDocCategoryForm] = useState(false);
  const [editingDocCategory, setEditingDocCategory] = useState<{ id: number; name: string; order: number } | null>(null);
  const [showDocForm, setShowDocForm] = useState(false);
  const [editingDoc, setEditingDoc] = useState<{ id: number; category: number; title: string; description: string; thumbnail_id: number | null; files: { id: number; file: string; original_name: string; order: number }[]; order: number } | null>(null);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [docThumbnailIndex, setDocThumbnailIndex] = useState<number | undefined>(undefined);
  const queryClient = useQueryClient();

  const PHONE_PREFIXES = [
    { value: '010', label: '010 (휴대폰)' },
    { value: '02', label: '02 (서울)' },
    { value: '031', label: '031 (경기)' },
    { value: '032', label: '032 (인천)' },
    { value: '033', label: '033 (강원)' },
    { value: '041', label: '041 (충남)' },
    { value: '042', label: '042 (대전)' },
    { value: '043', label: '043 (충북)' },
    { value: '044', label: '044 (세종)' },
    { value: '051', label: '051 (부산)' },
    { value: '052', label: '052 (울산)' },
    { value: '053', label: '053 (대구)' },
    { value: '054', label: '054 (경북)' },
    { value: '055', label: '055 (경남)' },
    { value: '061', label: '061 (전남)' },
    { value: '062', label: '062 (광주)' },
    { value: '063', label: '063 (전북)' },
    { value: '064', label: '064 (제주)' },
    { value: '070', label: '070 (인터넷전화)' },
  ];

  const formatPhoneSuffix = (value: string, prefix: string) => {
    const numbers = value.replace(/[^\d]/g, '');
    if (prefix === '02') {
      // 02: 3자리-4자리 또는 4자리-4자리
      const limited = numbers.slice(0, 8);
      if (limited.length <= 3) return limited;
      if (limited.length <= 7) return `${limited.slice(0, 3)}-${limited.slice(3)}`;
      return `${limited.slice(0, 4)}-${limited.slice(4)}`;
    }
    // 3자리 지역번호/010: 3자리-4자리 또는 4자리-4자리
    const limited = numbers.slice(0, 8);
    if (limited.length <= 3) return limited;
    if (limited.length <= 7) return `${limited.slice(0, 3)}-${limited.slice(3)}`;
    return `${limited.slice(0, 4)}-${limited.slice(4)}`;
  };

  const parsePhoneNumber = (phone: string) => {
    const numbers = phone.replace(/[^\d]/g, '');
    if (numbers.startsWith('02')) {
      return { prefix: '02', suffix: formatPhoneSuffix(numbers.slice(2), '02') };
    }
    if (numbers.length >= 3) {
      const prefix = numbers.slice(0, 3);
      const knownPrefix = PHONE_PREFIXES.find(p => p.value === prefix);
      if (knownPrefix) {
        return { prefix, suffix: formatPhoneSuffix(numbers.slice(3), prefix) };
      }
    }
    return { prefix: '02', suffix: formatPhoneSuffix(numbers, '02') };
  };

  const resetBannerPhone = () => {
    setBannerPhonePrefix('02');
    setBannerPhoneNumber('');
  };

  // Admin Notifications Query (탭 배지용)
  const { data: adminNoti } = useQuery({
    queryKey: ['adminNotifications'],
    queryFn: async () => {
      const response = await api.get('/accounts/users/admin-notifications/');
      return response.data as { pending_users: number; pending_participants: number; total: number };
    },
    refetchInterval: 30000,
    staleTime: 10000,
  });

  // Users Query
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['adminUsers'],
    queryFn: async () => {
      const response = await api.get('/accounts/users/');
      if (response.data.results) {
        return response.data.results as User[];
      }
      return response.data as User[];
    },
  });

  // Notices Query
  const { data: notices, isLoading: noticesLoading, error: noticesError } = useQuery({
    queryKey: ['adminNotices'],
    queryFn: async () => {
      const response = await api.get('/notices/admin_list/');
      if (response.data.results) {
        return response.data.results as Notice[];
      }
      return response.data as Notice[];
    },
    enabled: activeTab === 'notices',
  });

  // Events Query
  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['adminEvents'],
    queryFn: async () => {
      const response = await api.get('/schedule/events/');
      if (response.data.results) {
        return response.data.results as Event[];
      }
      return response.data as Event[];
    },
    enabled: activeTab === 'schedule',
  });

  // Gallery Query
  const { data: albums, isLoading: albumsLoading, error: albumsError } = useQuery({
    queryKey: ['adminAlbums'],
    queryFn: async () => {
      const response = await api.get('/gallery/albums/admin_list/');
      if (response.data.results) {
        return response.data.results as Album[];
      }
      return response.data as Album[];
    },
    enabled: activeTab === 'gallery',
  });

  // Gallery Categories Query
  const { data: galleryCategories, isLoading: galleryCategoriesLoading } = useQuery({
    queryKey: ['adminGalleryCategories'],
    queryFn: async () => {
      const response = await api.get('/gallery/categories/');
      return response.data as { id: number; name: string; order: number; album_count: number }[];
    },
    enabled: activeTab === 'gallery',
  });

  // ChatRooms Query
  const { data: chatRooms, isLoading: roomsLoading } = useQuery({
    queryKey: ['adminChatRooms'],
    queryFn: async () => {
      const response = await api.get('/messenger/rooms/');
      // 페이지네이션 응답 처리
      if (response.data.results) {
        return response.data.results as ChatRoom[];
      }
      return response.data as ChatRoom[];
    },
    enabled: activeTab === 'messenger',
  });

  // Active Bans Query
  const { data: activeBans } = useQuery({
    queryKey: ['adminActiveBans'],
    queryFn: async () => {
      const response = await api.get('/messenger/bans/active/');
      return response.data as ChatBan[];
    },
    enabled: activeTab === 'messenger',
  });

  // Banners Query
  const { data: banners, isLoading: bannersLoading } = useQuery({
    queryKey: ['adminBanners'],
    queryFn: () => noticesService.getBanners(),
    enabled: activeTab === 'banners',
  });

  // Organizations Query
  const { data: organizations, isLoading: orgsLoading } = useQuery({
    queryKey: ['adminOrganizations'],
    queryFn: () => noticesService.getOrganizations(),
    enabled: activeTab === 'organizations',
  });

  const { data: orgSettings } = useQuery({
    queryKey: ['orgSettings'],
    queryFn: async () => {
      const res = await api.get('/notices/organizations/display-settings/');
      return res.data as { marquee_enabled: boolean };
    },
    enabled: activeTab === 'organizations',
  });

  const toggleMarqueeMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.patch('/notices/organizations/display-settings/', { marquee_enabled: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgSettings'] });
      queryClient.invalidateQueries({ queryKey: ['organizationSettings'] });
    },
  });

  // About Content Query
  const { data: aboutContent, isLoading: aboutLoading } = useQuery({
    queryKey: ['adminAboutContent'],
    queryFn: async () => {
      const response = await api.get('/notices/about/');
      return response.data as { greeting_text: string; greeting_author: string; greeting_image: string | null; updated_at: string };
    },
    enabled: activeTab === 'about',
  });

  // Executives Query
  const { data: executives } = useQuery({
    queryKey: ['adminExecutives'],
    queryFn: () => noticesService.getExecutives(),
    enabled: activeTab === 'about',
  });

  // Histories Query
  const { data: histories } = useQuery({
    queryKey: ['adminHistories'],
    queryFn: () => noticesService.getHistories(),
    enabled: activeTab === 'about',
  });

  // Dashboard Stats Query
  const { data: dashboardStats } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: async () => {
      try {
        const response = await api.get('/accounts/users/dashboard-stats/');
        return response.data as {
          total_users: number;
          pending_users: number;
          admin_count: number;
          instructor_count: number;
          member_count: number;
          club_count: number;
          total_notices: number;
          total_events: number;
          upcoming_events_count: number;
          total_sms_sent: number;
          recent_users: { id: number; username: string; email: string; role: string; is_approved: boolean; created_at: string }[];
          recent_notices: { id: number; title: string; created_at: string }[];
          system: {
            cpu_percent: number;
            memory_total: number;
            memory_used: number;
            memory_percent: number;
            disk_total: number;
            disk_used: number;
            disk_percent: number;
          };
        };
      } catch {
        return null;
      }
    },
    enabled: activeTab === 'dashboard',
    retry: false,
  });

  // Events for popup linking
  const { data: allEvents } = useQuery({
    queryKey: ['allEventsForPopup'],
    queryFn: async () => {
      const response = await api.get('/schedule/events/');
      if (response.data.results) return response.data.results as Event[];
      return response.data as Event[];
    },
    enabled: activeTab === 'notices',
  });

  // SMS Remain Query
  const { data: smsRemain } = useQuery({
    queryKey: ['smsRemain'],
    queryFn: () => smsService.getRemain(),
    enabled: activeTab === 'sms',
  });

  // SMS History Query
  const { data: smsHistory, isLoading: smsHistoryLoading } = useQuery({
    queryKey: ['smsHistory'],
    queryFn: () => smsService.getHistory(),
    enabled: activeTab === 'sms',
  });

  // SMS용 전체 회원 목록 (전화번호 있는 승인 회원)
  const smsEligibleUsers = (users || []).filter(u => u.phone && u.is_approved && u.role !== 'pending');

  // SMS 클럽별 필터된 회원 목록
  const smsFilteredUsers = smsClubFilter
    ? smsEligibleUsers.filter(u => u.assigned_club === smsClubFilter)
    : smsEligibleUsers;

  // SMS 탭 진입 또는 필터 변경 시 전체 선택 기본값
  useEffect(() => {
    if (activeTab === 'sms' && smsFilteredUsers.length > 0) {
      setSmsSelectedIds(smsFilteredUsers.map(u => u.id));
    }
  }, [activeTab, smsClubFilter, smsFilteredUsers.length]);

  // Documents Queries
  const { data: docCategories, isLoading: docCategoriesLoading } = useQuery({
    queryKey: ['adminDocCategories'],
    queryFn: async () => {
      const response = await api.get('/documents/categories/');
      return response.data as { id: number; name: string; order: number; documents: { id: number; category: number; title: string; description: string; thumbnail_id: number | null; files: { id: number; file: string; original_name: string; order: number }[]; download_count: number; order: number; created_at: string }[] }[];
    },
    enabled: activeTab === 'documents',
  });

  const createDocCategoryMutation = useMutation({
    mutationFn: (data: { name: string }) => api.post('/documents/categories/', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminDocCategories'] });
      setShowDocCategoryForm(false);
      setEditingDocCategory(null);
      alert('카테고리가 등록되었습니다.');
    },
  });

  const updateDocCategoryMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string } }) => api.patch(`/documents/categories/${id}/`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminDocCategories'] });
      setEditingDocCategory(null);
      alert('카테고리가 수정되었습니다.');
    },
  });

  const deleteDocCategoryMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/documents/categories/${id}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminDocCategories'] }),
  });

  const createDocMutation = useMutation({
    mutationFn: (data: FormData) => api.post('/documents/items/', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
    onSuccess: async (response) => {
      // 대표이미지 지정
      const doc = response.data;
      if (docThumbnailIndex !== undefined && doc.files && doc.files[docThumbnailIndex]) {
        await api.post(`/documents/items/${doc.id}/set_thumbnail/`, { file_id: doc.files[docThumbnailIndex].id });
      }
      queryClient.invalidateQueries({ queryKey: ['adminDocCategories'] });
      setShowDocForm(false);
      setEditingDoc(null);
      setDocFiles([]);
      setDocThumbnailIndex(undefined);
      alert('서식이 등록되었습니다.');
    },
  });

  const updateDocMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormData }) => api.patch(`/documents/items/${id}/`, data, { headers: { 'Content-Type': 'multipart/form-data' } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminDocCategories'] });
      setEditingDoc(null);
      setShowDocForm(false);
      setDocFiles([]);
      setDocThumbnailIndex(undefined);
      alert('서식이 수정되었습니다.');
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/documents/items/${id}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminDocCategories'] }),
  });

  const moveDocOrderMutation = useMutation({
    mutationFn: ({ id, order }: { id: number; order: number }) => api.patch(`/documents/items/${id}/`, { order }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminDocCategories'] }),
  });

  const setDocThumbnailMutation = useMutation({
    mutationFn: ({ docId, fileId }: { docId: number; fileId: number | null }) =>
      api.post(`/documents/items/${docId}/set_thumbnail/`, { file_id: fileId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminDocCategories'] }),
  });

  const deleteDocFileMutation = useMutation({
    mutationFn: ({ docId, fileId }: { docId: number; fileId: number }) =>
      api.delete(`/documents/items/${docId}/delete_file/${fileId}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminDocCategories'] }),
  });

  // All ChatRooms for club assignment
  const { data: allChatRooms } = useQuery({
    queryKey: ['allChatRoomsForAssignment'],
    queryFn: async () => {
      const response = await api.get('/messenger/rooms/');
      if (response.data.results) {
        return response.data.results as ChatRoom[];
      }
      return response.data as ChatRoom[];
    },
    enabled: showClubModal || activeTab === 'members' || activeTab === 'sms',
  });

  // Room Messages Query (관리자용 - 모든 메시지 조회)
  const { data: roomMessages, isLoading: messagesLoading } = useQuery({
    queryKey: ['adminRoomMessages', selectedRoom],
    queryFn: async () => {
      const response = await api.get(`/messenger/rooms/${selectedRoom}/admin_messages/`);
      return response.data as Message[];
    },
    enabled: activeTab === 'messenger' && selectedRoom !== null,
  });

  // Room Members Query (선택된 클럽의 멤버 목록)
  const { data: roomMembersList } = useQuery({
    queryKey: ['adminRoomMembers', selectedRoom],
    queryFn: async () => {
      const response = await api.get(`/messenger/rooms/${selectedRoom}/members_list/`);
      return response.data as User[];
    },
    enabled: activeTab === 'messenger' && selectedRoom !== null,
  });

  // Member Mutations
  const approveMutation = useMutation({
    mutationFn: ({ userId, role, assignedClub }: { userId: number; role?: string; assignedClub?: number }) =>
      api.post(`/accounts/users/${userId}/approve/`, { role, assigned_club: assignedClub }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['adminNotifications'] });
      setShowClubModal(false);
      setPendingApprovalUser(null);
      setPendingApprovalRole('member');
      setSelectedClubId(null);
      alert('회원이 승인되었습니다.');
    },
  });

  const blockMutation = useMutation({
    mutationFn: (userId: number) => api.post(`/accounts/users/${userId}/block/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      alert('회원이 차단되었습니다.');
    },
  });

  const unblockMutation = useMutation({
    mutationFn: (userId: number) => api.post(`/accounts/users/${userId}/unblock/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      alert('차단이 해제되었습니다.');
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) =>
      api.post(`/accounts/users/${userId}/change-role/`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      alert('역할이 변경되었습니다.');
    },
  });

  // Notice Mutations
  const toggleNoticeHiddenMutation = useMutation({
    mutationFn: (noticeId: number) => api.post(`/notices/${noticeId}/toggle_hidden/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminNotices'] }),
  });

  const deleteNoticeMutation = useMutation({
    mutationFn: (noticeId: number) => api.delete(`/notices/${noticeId}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminNotices'] }),
  });

  const createNoticeMutation = useMutation({
    mutationFn: (data: Partial<Notice>) =>
      api.post('/notices/', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminNotices'] });
      setShowNoticeForm(false);
      alert('공지사항이 등록되었습니다.');
    },
  });

  const updateNoticeMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Notice> }) =>
      noticesService.updateNotice(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminNotices'] });
      setShowNoticeForm(false);
      setEditingNotice(null);
      alert('공지사항이 수정되었습니다.');
    },
  });

  // Event Mutations
  const createEventMutation = useMutation({
    mutationFn: (data: {
      title: string;
      description: string;
      event_type: string;
      location: string;
      start_date: string;
      end_date: string;
      max_participants: number;
      visibility: string;
      is_popup: boolean;
    }) => api.post('/schedule/events/', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminEvents'] });
      setShowEventForm(false);
      alert('일정이 등록되었습니다.');
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      api.patch(`/schedule/events/${id}/`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminEvents'] });
      setEditingEvent(null);
      alert('일정이 수정되었습니다.');
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/schedule/events/${id}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminEvents'] }),
  });

  // Event Participants Query
  const { data: eventDetail, isLoading: eventDetailLoading } = useQuery({
    queryKey: ['eventDetail', managingEventId],
    queryFn: async () => {
      const response = await api.get(`/schedule/events/${managingEventId}/`);
      return response.data;
    },
    enabled: managingEventId !== null,
  });

  const approveParticipantMutation = useMutation({
    mutationFn: ({ eventId, participantId }: { eventId: number; participantId: number }) =>
      api.post(`/schedule/events/${eventId}/approve_participant/`, { participant_id: participantId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eventDetail', managingEventId] });
      queryClient.invalidateQueries({ queryKey: ['adminEvents'] });
      queryClient.invalidateQueries({ queryKey: ['adminNotifications'] });
      alert('참가가 승인되었습니다.');
    },
  });

  const rejectParticipantMutation = useMutation({
    mutationFn: ({ eventId, participantId }: { eventId: number; participantId: number }) =>
      api.post(`/schedule/events/${eventId}/reject_participant/`, { participant_id: participantId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eventDetail', managingEventId] });
      queryClient.invalidateQueries({ queryKey: ['adminEvents'] });
      queryClient.invalidateQueries({ queryKey: ['adminNotifications'] });
      alert('참가가 거절되었습니다.');
    },
  });

  // Gallery Mutations
  const toggleAlbumHiddenMutation = useMutation({
    mutationFn: (albumId: number) => api.post(`/gallery/albums/${albumId}/toggle_hidden/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminAlbums'] }),
  });

  const deleteAlbumMutation = useMutation({
    mutationFn: (albumId: number) => api.delete(`/gallery/albums/${albumId}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminAlbums'] });
      queryClient.invalidateQueries({ queryKey: ['adminGalleryCategories'] });
    },
  });

  const createAlbumMutation = useMutation({
    mutationFn: (data: FormData) =>
      api.post('/gallery/albums/', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        },
      }),
    onSuccess: () => {
      setUploadProgress(0);
      queryClient.invalidateQueries({ queryKey: ['adminAlbums'] });
      queryClient.invalidateQueries({ queryKey: ['adminGalleryCategories'] });
      setAlbumPhotos([]); setAlbumCoverIndex(0);
      setShowAlbumForm(false);
      alert('앨범이 등록되었습니다.');
    },
    onError: (error: any) => {
      setUploadProgress(0);
      alert('앨범 등록 실패: ' + (error?.response?.data?.detail || error?.message || '서버 오류'));
    },
  });

  const updateAlbumMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormData }) =>
      api.patch(`/gallery/albums/${id}/`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        },
      }),
    onSuccess: () => {
      setUploadProgress(0);
      queryClient.invalidateQueries({ queryKey: ['adminAlbums'] });
      queryClient.invalidateQueries({ queryKey: ['adminGalleryCategories'] });
      setEditingAlbum(null);
      setAlbumPhotos([]); setAlbumCoverIndex(0);
      setShowAlbumForm(false);
      alert('앨범이 수정되었습니다.');
    },
    onError: (error: any) => {
      setUploadProgress(0);
      alert('앨범 수정 실패: ' + (error?.response?.data?.detail || error?.message || '서버 오류'));
    },
  });

  const deletePhotoMutation = useMutation({
    mutationFn: ({ albumId, photoId }: { albumId: number; photoId: number }) =>
      api.delete(`/gallery/albums/${albumId}/photos/${photoId}/`),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adminAlbums'] });
      if (editingAlbum && editingAlbum.id === variables.albumId) {
        setEditingAlbum({ ...editingAlbum, photos: editingAlbum.photos.filter(p => p.id !== variables.photoId) });
      }
    },
  });

  const setCoverMutation = useMutation({
    mutationFn: ({ albumId, photoId }: { albumId: number; photoId: number }) =>
      api.post(`/gallery/albums/${albumId}/set_cover/${photoId}/`),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adminAlbums'] });
      if (editingAlbum && editingAlbum.id === variables.albumId) {
        setEditingAlbum({ ...editingAlbum, cover_photo_id: variables.photoId });
      }
    },
  });

  const reorderPhotosMutation = useMutation({
    mutationFn: ({ albumId, photoIds }: { albumId: number; photoIds: number[] }) =>
      api.post(`/gallery/albums/${albumId}/reorder_photos/`, { photo_ids: photoIds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminAlbums'] }),
  });

  const updateAlbumDateMutation = useMutation({
    mutationFn: ({ albumId, date }: { albumId: number; date: string }) =>
      api.patch(`/gallery/albums/${albumId}/update_date/`, { created_at: date }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminAlbums'] }),
  });

  // 사진 순서 즉시 반영 헬퍼
  const applyPhotoReorder = (albumId: number, newPhotos: Photo[]) => {
    const updated = newPhotos.map((p, i) => ({ ...p, order: i }));
    if (editingAlbum && editingAlbum.id === albumId) {
      setEditingAlbum({ ...editingAlbum, photos: updated });
    }
    reorderPhotosMutation.mutate({ albumId, photoIds: newPhotos.map(p => p.id) });
  };

  const movePhotoLocal = (albumId: number, photoId: number, direction: 'up' | 'down') => {
    if (!editingAlbum || editingAlbum.id !== albumId) return;
    const sorted = [...editingAlbum.photos].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex(p => p.id === photoId);
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    const reordered = [...sorted];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
    applyPhotoReorder(albumId, reordered);
  };

  const [photoDragIdx, setPhotoDragIdx] = useState<number | null>(null);
  const [photoDragOverIdx, setPhotoDragOverIdx] = useState<number | null>(null);

  // Gallery Category Mutations
  const createGalleryCategoryMutation = useMutation({
    mutationFn: (data: { name: string }) => api.post('/gallery/categories/', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminGalleryCategories'] });
      setShowGalleryCategoryForm(false);
      setEditingGalleryCategory(null);
      alert('카테고리가 등록되었습니다.');
    },
    onError: () => alert('카테고리 등록에 실패했습니다.'),
  });

  const updateGalleryCategoryMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string } }) => api.patch(`/gallery/categories/${id}/`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminGalleryCategories'] });
      setEditingGalleryCategory(null);
      alert('카테고리가 수정되었습니다.');
    },
    onError: () => alert('카테고리 수정에 실패했습니다.'),
  });

  const deleteGalleryCategoryMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/gallery/categories/${id}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminGalleryCategories'] }),
    onError: () => alert('카테고리 삭제에 실패했습니다.'),
  });

  // Ban Mutations
  const unbanMutation = useMutation({
    mutationFn: ({ roomId, banId }: { roomId: number; banId: number }) =>
      api.post(`/messenger/rooms/${roomId}/unban/${banId}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminActiveBans'] }),
  });

  // ChatRoom Delete Mutation
  const deleteChatRoomMutation = useMutation({
    mutationFn: (roomId: number) => api.delete(`/messenger/rooms/${roomId}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminChatRooms'] });
      setSelectedRoom(null);
    },
  });

  // Rename ChatRoom Mutation
  const renameChatRoomMutation = useMutation({
    mutationFn: ({ roomId, name }: { roomId: number; name: string }) =>
      api.patch(`/messenger/rooms/${roomId}/`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminChatRooms'] });
      alert('클럽 이름이 변경되었습니다.');
    },
  });

  // Update ChatRoom Description Mutation
  const updateChatRoomDescriptionMutation = useMutation({
    mutationFn: ({ roomId, description }: { roomId: number; description: string }) =>
      api.patch(`/messenger/rooms/${roomId}/`, { description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminChatRooms'] });
      alert('클럽 소개가 저장되었습니다.');
    },
  });

  // Clear Messages Mutation (for public chat rooms)
  const clearMessagesMutation = useMutation({
    mutationFn: (roomId: number) => api.post(`/messenger/rooms/${roomId}/clear_messages/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminChatRooms'] });
      alert('채팅 기록이 삭제되었습니다.');
    },
  });

  // Create Club Mutation
  const createClubMutation = useMutation({
    mutationFn: (data: { name: string; description: string }) =>
      api.post('/messenger/rooms/', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminChatRooms'] });
      setShowCreateClubForm(false);
    },
  });

  // Banner Mutations
  const createBannerMutation = useMutation({
    mutationFn: (data: FormData) => noticesService.createBanner(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminBanners'] });
      setShowBannerForm(false);
      setBannerImage([]);
      resetBannerPhone();
      alert('배너가 등록되었습니다.');
    },
  });

  const updateBannerMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormData }) => noticesService.updateBanner(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminBanners'] });
      setEditingBanner(null);
      setShowBannerForm(false);
      setBannerImage([]);
      resetBannerPhone();
      alert('배너가 수정되었습니다.');
    },
  });

  const deleteBannerMutation = useMutation({
    mutationFn: (id: number) => noticesService.deleteBanner(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminBanners'] }),
  });

  const moveBannerUpMutation = useMutation({
    mutationFn: (id: number) => noticesService.moveBannerUp(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminBanners'] }),
  });

  const moveBannerDownMutation = useMutation({
    mutationFn: (id: number) => noticesService.moveBannerDown(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminBanners'] }),
  });

  // Organization Mutations
  const createOrgMutation = useMutation({
    mutationFn: (data: FormData) => noticesService.createOrganization(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminOrganizations'] });
      setShowOrgForm(false);
      setOrgLogo([]);
      alert('유관기관이 등록되었습니다.');
    },
  });

  const updateOrgMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormData }) => noticesService.updateOrganization(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminOrganizations'] });
      setEditingOrg(null);
      setShowOrgForm(false);
      setOrgLogo([]);
      alert('유관기관이 수정되었습니다.');
    },
  });

  const deleteOrgMutation = useMutation({
    mutationFn: (id: number) => noticesService.deleteOrganization(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminOrganizations'] }),
  });

  const moveOrgUpMutation = useMutation({
    mutationFn: (id: number) => noticesService.moveOrganizationUp(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminOrganizations'] }),
  });

  const moveOrgDownMutation = useMutation({
    mutationFn: (id: number) => noticesService.moveOrganizationDown(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminOrganizations'] }),
  });

  // About Content Mutation
  const updateAboutMutation = useMutation({
    mutationFn: (data: FormData) => noticesService.updateAboutContent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminAboutContent'] });
      setAboutGreetingImage([]);
      alert('협회소개가 수정되었습니다.');
    },
  });

  // Executive Mutations
  const createExecutiveMutation = useMutation({
    mutationFn: (data: FormData) => noticesService.createExecutive(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminExecutives'] });
      setShowExecutiveForm(false);
      setExecutivePhoto([]);
      setEditingExecutive(null);
      alert('임원이 등록되었습니다.');
    },
  });

  const updateExecutiveMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormData }) => noticesService.updateExecutive(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminExecutives'] });
      setShowExecutiveForm(false);
      setExecutivePhoto([]);
      setEditingExecutive(null);
      alert('임원 정보가 수정되었습니다.');
    },
  });

  const deleteExecutiveMutation = useMutation({
    mutationFn: (id: number) => noticesService.deleteExecutive(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminExecutives'] }),
  });

  const moveExecutiveUpMutation = useMutation({
    mutationFn: (id: number) => noticesService.moveExecutiveUp(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminExecutives'] }),
  });

  const moveExecutiveDownMutation = useMutation({
    mutationFn: (id: number) => noticesService.moveExecutiveDown(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminExecutives'] }),
  });

  // History Mutations
  const createHistoryMutation = useMutation({
    mutationFn: (data: Partial<History>) => noticesService.createHistory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminHistories'] });
      setShowHistoryForm(false);
      setEditingHistory(null);
    },
  });

  const updateHistoryMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<History> }) => noticesService.updateHistory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminHistories'] });
      setShowHistoryForm(false);
      setEditingHistory(null);
    },
  });

  const deleteHistoryMutation = useMutation({
    mutationFn: (id: number) => noticesService.deleteHistory(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminHistories'] }),
  });

  const moveHistoryUpMutation = useMutation({
    mutationFn: (id: number) => noticesService.moveHistoryUp(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminHistories'] }),
  });

  const moveHistoryDownMutation = useMutation({
    mutationFn: (id: number) => noticesService.moveHistoryDown(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminHistories'] }),
  });

  // SMS Delete Mutation
  const deleteSmsLogMutation = useMutation({
    mutationFn: (id: number) => smsService.deleteSmsLog(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['smsHistory'] }),
  });

  // Set Club Icon Mutation
  const setClubIconMutation = useMutation({
    mutationFn: ({ roomId, data }: { roomId: number; data: FormData }) =>
      api.post(`/messenger/rooms/${roomId}/set_icon/`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminChatRooms'] });
      alert('클럽 이미지가 저장되었습니다.');
    },
  });

  // Assign Club Mutation
  const assignClubMutation = useMutation({
    mutationFn: ({ userId, clubId }: { userId: number; clubId: number | null }) =>
      api.post(`/accounts/users/${userId}/assign-club/`, { club_id: clubId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminUsers'] }),
  });

  const isLoading = usersLoading || noticesLoading || albumsLoading || roomsLoading || eventsLoading || bannersLoading || orgsLoading;
  if (isLoading && activeTab === 'members') return <Loading />;

  const handleBannerSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData();

    const fullPhone = bannerPhoneNumber
      ? `${bannerPhonePrefix}-${bannerPhoneNumber}`
      : bannerPhonePrefix;
    formData.append('phone_number', fullPhone);
    formData.append('description', form.querySelector<HTMLInputElement>('[name="description"]')?.value || '');
    formData.append('link', form.querySelector<HTMLInputElement>('[name="link"]')?.value || '');
    formData.append('is_active', form.querySelector<HTMLInputElement>('[name="is_active"]')?.checked ? 'true' : 'false');

    if (bannerImage.length > 0) {
      formData.append('image', bannerImage[0]);
    }

    if (editingBanner) {
      updateBannerMutation.mutate({ id: editingBanner.id, data: formData });
    } else {
      createBannerMutation.mutate(formData);
    }
  };

  const handleOrgSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData();

    formData.append('name', form.querySelector<HTMLInputElement>('[name="name"]')?.value || '');
    formData.append('link', form.querySelector<HTMLInputElement>('[name="link"]')?.value || '');
    formData.append('is_active', form.querySelector<HTMLInputElement>('[name="is_active"]')?.checked ? 'true' : 'false');

    if (orgLogo.length > 0) {
      formData.append('logo', orgLogo[0]);
    }

    if (editingOrg) {
      updateOrgMutation.mutate({ id: editingOrg.id, data: formData });
    } else {
      createOrgMutation.mutate(formData);
    }
  };

  // 회원 승인 핸들러 - 클럽 가입 희망 시 모달 표시
  const handleApprove = (user: User, role: string) => {
    if (user.wants_club_membership) {
      setPendingApprovalUser(user);
      setPendingApprovalRole(role);
      setShowClubModal(true);
    } else {
      if (window.confirm(`${user.username}님을 ${role === 'instructor' ? '클럽장' : '일반 회원'}(으)로 승인하시겠습니까?`)) {
        approveMutation.mutate({ userId: user.id, role });
      }
    }
  };

  const handleApproveWithClub = () => {
    if (!pendingApprovalUser) return;
    approveMutation.mutate({
      userId: pendingApprovalUser.id,
      role: pendingApprovalRole,
      assignedClub: selectedClubId || undefined,
    });
  };

  const pendingUsers = users?.filter((u) => !u.is_approved) || [];
  const displayUsers = memberFilter === 'pending' ? pendingUsers : users || [];

  const handleNoticeSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const noticeData: Record<string, unknown> = {
      title: formData.get('title') as string,
      content: formData.get('content') as string,
      visibility: formData.get('visibility') as 'public' | 'member',
      is_important: formData.get('is_important') === 'on',
      is_popup: formData.get('is_popup') === 'on',
      popup_content: formData.get('popup_content') as string || '',
      linked_event: formData.get('linked_event') ? Number(formData.get('linked_event')) : null,
    };

    // If popup_image is selected, use multipart form data
    if (popupImage.length > 0) {
      const multipartData = new FormData();
      Object.entries(noticeData).forEach(([key, val]) => {
        if (val !== null && val !== undefined) multipartData.append(key, String(val));
      });
      multipartData.append('popup_image', popupImage[0]);
      try {
        if (editingNotice) {
          await api.patch(`/notices/${editingNotice.id}/`, multipartData, { headers: { 'Content-Type': 'multipart/form-data' } });
        } else {
          await api.post('/notices/', multipartData, { headers: { 'Content-Type': 'multipart/form-data' } });
        }
        queryClient.invalidateQueries({ queryKey: ['adminNotices'] });
        setShowNoticeForm(false);
        setEditingNotice(null);
        setPopupImage([]);
      } catch {
        alert('저장 중 오류가 발생했습니다.');
      }
    } else {
      if (editingNotice) {
        updateNoticeMutation.mutate({ id: editingNotice.id, data: noticeData as Partial<Notice> });
      } else {
        createNoticeMutation.mutate(noticeData as Partial<Notice>);
      }
    }
    setPopupImage([]);
  };

  const handleEventSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    const eventData = {
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      event_type: formData.get('event_type') as string,
      location: formData.get('location') as string,
      location_link: formData.get('location_link') as string,
      start_date: formData.get('start_date') as string,
      end_date: formData.get('end_date') as string,
      max_participants: Number(formData.get('max_participants')) || 0,
      visibility: formData.get('visibility') as string,
      is_popup: formData.get('is_popup') === 'on',
    };

    if (editingEvent) {
      updateEventMutation.mutate({ id: editingEvent.id, data: eventData });
    } else {
      createEventMutation.mutate(eventData);
    }
  };

  const handleAlbumSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData();

    formData.append('title', form.querySelector<HTMLInputElement>('[name="title"]')?.value || '');
    formData.append('description', form.querySelector<HTMLTextAreaElement>('[name="description"]')?.value || '');
    formData.append('album_type', form.querySelector<HTMLSelectElement>('[name="album_type"]')?.value || 'public');
    formData.append('is_public', form.querySelector<HTMLInputElement>('[name="is_public"]')?.checked ? 'true' : 'false');
    const categoryVal = form.querySelector<HTMLSelectElement>('[name="category"]')?.value;
    if (categoryVal) {
      formData.append('category', categoryVal);
    }

    if (editingAlbum) {
      albumPhotos.forEach((photo) => {
        formData.append('photos', photo);
      });
      updateAlbumMutation.mutate({ id: editingAlbum.id, data: formData });
    } else {
      if (albumPhotos.length === 0) {
        alert('사진을 1장 이상 추가해주세요.');
        return;
      }
      // 대표로 선택된 사진을 맨 앞으로
      const ordered = [...albumPhotos];
      if (albumCoverIndex > 0 && albumCoverIndex < ordered.length) {
        const [cover] = ordered.splice(albumCoverIndex, 1);
        ordered.unshift(cover);
      }
      ordered.forEach((photo) => {
        formData.append('photos', photo);
      });
      createAlbumMutation.mutate(formData);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-6">
        <h1
          className="text-3xl font-bold text-gray-900 cursor-pointer hover:text-green-700 transition-colors"
          onClick={() => setActiveTab('dashboard')}
        >관리자 대시보드</h1>
        <button
          onClick={async () => {
            setShowVersionModal(true);
            if (!readmeContent) {
              try {
                const res = await api.get('/version/readme/');
                setReadmeContent(res.data.content);
              } catch {
                setReadmeContent('README를 불러올 수 없습니다.');
              }
            }
          }}
          className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full hover:bg-green-200 transition-colors"
        >
          {APP_VERSION}
        </button>
      </div>

      {/* Version Modal */}
      {showVersionModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowVersionModal(false)}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center px-6 py-4 border-b bg-green-700 text-white">
              <h2 className="font-bold text-lg">DDGolf {APP_VERSION}</h2>
              <button onClick={() => setShowVersionModal(false)} className="text-white hover:text-green-200 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-64px)]">
              {readmeContent ? (
                <div className="text-sm text-gray-700 leading-relaxed space-y-2">
                  {readmeContent.split('\n').map((line, i) => {
                    if (line.startsWith('### ')) return <h3 key={i} className="text-base font-bold text-gray-800 mt-4 mb-1">{line.slice(4)}</h3>;
                    if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-bold text-gray-900 mt-5 mb-2 pb-1 border-b">{line.slice(3)}</h2>;
                    if (line.startsWith('# ')) return <h1 key={i} className="text-xl font-bold text-gray-900 mt-4 mb-2">{line.slice(2)}</h1>;
                    if (line.startsWith('| ') && line.includes('---')) return <hr key={i} className="border-gray-200 my-1" />;
                    if (line.startsWith('| ')) {
                      const cells = line.split('|').filter(Boolean).map(c => c.trim());
                      return (
                        <div key={i} className="grid gap-2 text-xs" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
                          {cells.map((cell, j) => (
                            <span key={j} className={`px-2 py-1 ${i === 0 || line.includes('버전') && j === 0 ? 'font-semibold bg-gray-50' : ''}`}>{cell}</span>
                          ))}
                        </div>
                      );
                    }
                    if (line.startsWith('- ')) return <p key={i} className="pl-4 before:content-['•'] before:mr-2 before:text-green-600">{line.slice(2)}</p>;
                    if (line.startsWith('```')) return null;
                    if (line.startsWith('---')) return <hr key={i} className="border-gray-300 my-3" />;
                    if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-bold text-gray-800">{line.replace(/\*\*/g, '')}</p>;
                    if (line.trim() === '') return <div key={i} className="h-1" />;
                    return <p key={i}>{line}</p>;
                  })}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">로딩 중...</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex overflow-x-auto gap-x-4 scrollbar-hide">
          {[
            { key: 'members', label: '회원 관리', badge: adminNoti?.pending_users || 0 },
            { key: 'about', label: '협회소개 관리', badge: 0 },
            { key: 'notices', label: '공지사항 관리', badge: 0 },
            { key: 'schedule', label: '경기일정 관리', badge: adminNoti?.pending_participants || 0 },
            { key: 'gallery', label: '갤러리 관리', badge: 0 },
            { key: 'messenger', label: '클럽 관리', badge: 0 },
            { key: 'banners', label: '배너 관리', badge: 0 },
            { key: 'organizations', label: '유관기관 관리', badge: 0 },
            { key: 'documents', label: '서식 관리', badge: 0 },
            { key: 'sms', label: 'SMS 관리', badge: 0 },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabType)}
              className={`inline-flex items-center gap-1.5 py-3 px-1 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.badge > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center leading-none">
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {!dashboardStats && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-700">
              대시보드 통계를 불러올 수 없습니다. 백엔드 서버를 업데이트해 주세요.
            </div>
          )}
          {/* System Resources */}
          {dashboardStats?.system && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  label: 'CPU 사용률',
                  icon: '🖥️',
                  percent: dashboardStats.system.cpu_percent,
                  detail: `${dashboardStats.system.cpu_percent.toFixed(1)}%`,
                },
                {
                  label: '메모리',
                  icon: '🧠',
                  percent: dashboardStats.system.memory_percent,
                  detail: `${(dashboardStats.system.memory_used / 1073741824).toFixed(1)} / ${(dashboardStats.system.memory_total / 1073741824).toFixed(1)} GB`,
                },
                {
                  label: '디스크',
                  icon: '💾',
                  percent: dashboardStats.system.disk_percent,
                  detail: `${(dashboardStats.system.disk_used / 1073741824).toFixed(1)} / ${(dashboardStats.system.disk_total / 1073741824).toFixed(1)} GB`,
                },
              ].map((item) => {
                const barColor = item.percent > 90 ? 'bg-red-500' : item.percent > 70 ? 'bg-yellow-500' : 'bg-green-500';
                const textColor = item.percent > 90 ? 'text-red-600' : item.percent > 70 ? 'text-yellow-600' : 'text-green-600';
                return (
                  <div key={item.label} className="bg-white rounded-lg shadow p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">{item.icon}</span>
                      <span className="font-semibold text-gray-700">{item.label}</span>
                      <span className={`ml-auto text-lg font-bold ${textColor}`}>{item.percent.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                      <div className={`${barColor} h-3 rounded-full transition-all`} style={{ width: `${Math.max(item.percent, 1)}%` }} />
                    </div>
                    <div className="text-xs text-gray-500 text-right">{item.detail}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Charts */}
          {dashboardStats && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Member Distribution Bar Chart */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">회원 구성</h3>
                <div className="space-y-3">
                  {[
                    { label: '관리자', count: dashboardStats.admin_count, color: 'bg-yellow-500' },
                    { label: '클럽장', count: dashboardStats.instructor_count, color: 'bg-purple-500' },
                    { label: '일반회원', count: dashboardStats.member_count, color: 'bg-teal-500' },
                    { label: '대기', count: dashboardStats.pending_users, color: 'bg-red-400' },
                  ].map((item) => {
                    const max = dashboardStats.total_users || 1;
                    const pct = Math.round((item.count / max) * 100);
                    return (
                      <div key={item.label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">{item.label}</span>
                          <span className="font-medium">{item.count}명 ({pct}%)</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-4">
                          <div className={`${item.color} h-4 rounded-full transition-all`} style={{ width: `${Math.max(pct, 2)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 운영 현황 */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">운영 현황</h3>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: '클럽', value: dashboardStats.club_count, color: 'text-green-600', bg: 'bg-green-100' },
                    { label: '공지사항', value: dashboardStats.total_notices, color: 'text-indigo-600', bg: 'bg-indigo-100' },
                    { label: '전체 일정', value: dashboardStats.total_events, color: 'text-orange-600', bg: 'bg-orange-100' },
                    { label: '다가오는 일정', value: dashboardStats.upcoming_events_count, color: 'text-amber-600', bg: 'bg-amber-100' },
                    { label: 'SMS 발송', value: dashboardStats.total_sms_sent, color: 'text-pink-600', bg: 'bg-pink-100' },
                  ].map((item) => (
                    <div key={item.label} className={`${item.bg} rounded-lg p-4 text-center`}>
                      <div className={`text-3xl font-bold ${item.color}`}>{item.value}</div>
                      <div className="text-sm text-gray-600 mt-1">{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Recent Data */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Users */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b">
                <h3 className="font-semibold">최근 가입자</h3>
              </div>
              <div className="divide-y">
                {dashboardStats?.recent_users?.map((u) => (
                  <div key={u.id} className="p-3 flex justify-between items-center text-sm">
                    <div>
                      <span className="font-medium">{u.username}</span>
                      <span className="text-gray-400 ml-2 text-xs">{u.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${u.is_approved ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {u.is_approved ? '승인' : '대기'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(u.created_at).toLocaleDateString('ko-KR')}
                      </span>
                    </div>
                  </div>
                )) || <div className="p-4 text-center text-gray-500 text-sm">데이터 없음</div>}
              </div>
            </div>

            {/* Recent Notices */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b">
                <h3 className="font-semibold">최근 공지사항</h3>
              </div>
              <div className="divide-y">
                {dashboardStats?.recent_notices?.map((n) => (
                  <div key={n.id} className="p-3 flex justify-between items-center text-sm">
                    <span className="font-medium truncate flex-1 mr-2">{n.title}</span>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {new Date(n.created_at).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                )) || <div className="p-4 text-center text-gray-500 text-sm">데이터 없음</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">전체 회원</div>
              <div className="text-2xl font-bold text-gray-900">{users?.length || 0}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">승인 대기</div>
              <div className="text-2xl font-bold text-yellow-600">{pendingUsers.length}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">관리자</div>
              <div className="text-2xl font-bold text-red-600">
                {users?.filter((u) => u.role === 'admin').length || 0}
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">클럽장</div>
              <div className="text-2xl font-bold text-purple-600">
                {users?.filter((u) => u.role === 'instructor').length || 0}
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">일반 회원</div>
              <div className="text-2xl font-bold text-blue-600">
                {users?.filter((u) => u.role === 'member').length || 0}
              </div>
            </div>
          </div>

          {/* Member Filter */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex gap-4 mb-4">
              <button
                onClick={() => setMemberFilter('pending')}
                className={`pb-2 border-b-2 text-sm ${
                  memberFilter === 'pending'
                    ? 'border-green-600 text-green-600'
                    : 'border-transparent text-gray-500'
                }`}
              >
                승인 대기 ({pendingUsers.length})
              </button>
              <button
                onClick={() => setMemberFilter('all')}
                className={`pb-2 border-b-2 text-sm ${
                  memberFilter === 'all'
                    ? 'border-green-600 text-green-600'
                    : 'border-transparent text-gray-500'
                }`}
              >
                전체 회원
              </button>
            </div>

            {displayUsers.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">이름</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">이메일</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">전화번호</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">신청 역할</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">현재 역할</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">클럽 배정</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">가입일</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">관리</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {displayUsers.map((user) => (
                      <tr key={user.id}>
                        <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">{user.username}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{user.email}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{user.phone || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            user.requested_role === 'instructor'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {user.requested_role === 'instructor' ? '클럽장' : '일반 회원'}
                          </span>
                          {user.wants_club_membership && (
                            <span className="ml-1 inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                              클럽 희망
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {user.is_approved ? (
                            <select
                              value={user.role}
                              onChange={(e) => {
                                if (window.confirm(`역할을 변경하시겠습니까?`)) {
                                  changeRoleMutation.mutate({ userId: user.id, role: e.target.value });
                                }
                              }}
                              disabled={user.role === 'admin'}
                              className="text-xs border border-gray-300 rounded px-2 py-1"
                            >
                              <option value="admin">관리자</option>
                              <option value="instructor">클럽장</option>
                              <option value="member">일반 회원</option>
                            </select>
                          ) : (
                            <span className="text-xs text-gray-400">승인대기</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {user.is_approved && user.role !== 'admin' ? (
                            <ClubAssignSelect
                              currentClubId={user.assigned_club || null}
                              currentClubName={user.assigned_club_name || null}
                              clubs={allChatRooms?.filter((r) => !r.is_public) || []}
                              disabled={assignClubMutation.isPending}
                              onAssign={(clubId) => assignClubMutation.mutate({ userId: user.id, clubId })}
                            />
                          ) : user.role === 'admin' ? (
                            <span className="text-xs text-gray-400">-</span>
                          ) : (
                            <span className={`inline-flex px-2 py-0.5 text-xs rounded-full ${user.wants_club_membership ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                              {user.wants_club_membership ? '클럽 희망' : '-'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{new Date(user.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex gap-2">
                            {!user.is_approved && (
                              <>
                                <button
                                  onClick={() => handleApprove(user, user.requested_role)}
                                  className="text-green-600 hover:text-green-700 text-sm font-medium cursor-pointer"
                                  disabled={approveMutation.isPending}
                                >
                                  {user.requested_role === 'instructor' ? '클럽장 승인' : '회원 승인'}
                                </button>
                                {user.requested_role === 'instructor' && (
                                  <button
                                    onClick={() => handleApprove(user, 'member')}
                                    className="text-blue-600 hover:text-blue-700 text-sm font-medium cursor-pointer"
                                    disabled={approveMutation.isPending}
                                  >
                                    회원으로 승인
                                  </button>
                                )}
                              </>
                            )}
                            {user.role !== 'admin' && user.is_approved && (
                              <select
                                value={user.is_active === false ? 'blocked' : 'active'}
                                onChange={(e) => {
                                  const newVal = e.target.value;
                                  if (newVal === 'blocked' && user.is_active !== false) {
                                    if (window.confirm('정말 차단하시겠습니까?')) {
                                      blockMutation.mutate(user.id);
                                    } else {
                                      e.target.value = 'active';
                                    }
                                  } else if (newVal === 'active' && user.is_active === false) {
                                    if (window.confirm('차단을 해제하시겠습니까?')) {
                                      unblockMutation.mutate(user.id);
                                    } else {
                                      e.target.value = 'blocked';
                                    }
                                  }
                                }}
                                disabled={blockMutation.isPending || unblockMutation.isPending}
                                className={`text-xs border rounded px-2 py-1 ${
                                  user.is_active === false
                                    ? 'border-red-300 text-red-700 bg-red-50'
                                    : 'border-gray-300 text-gray-700'
                                }`}
                              >
                                <option value="active">정상</option>
                                <option value="blocked">차단</option>
                              </select>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">
                {memberFilter === 'pending' ? '승인 대기 중인 회원이 없습니다.' : '등록된 회원이 없습니다.'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* About Tab */}
      {activeTab === 'about' && (
        <div className="space-y-6">
          {/* 인사말 관리 */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold">협회소개 관리</h2>
              <p className="text-sm text-gray-500 mt-1">공개 페이지의 협회소개 콘텐츠를 수정합니다.</p>
            </div>
            {aboutLoading ? (
              <div className="p-6 text-center text-gray-500">로딩 중...</div>
            ) : (
            <form
              key={aboutContent?.updated_at || 'default'}
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const formData = new FormData();
                const greetingText = form.querySelector<HTMLTextAreaElement>('[name="greeting_text"]')?.value || '';
                const greetingAuthor = form.querySelector<HTMLInputElement>('[name="greeting_author"]')?.value || '';
                formData.append('greeting_text', greetingText);
                formData.append('greeting_author', greetingAuthor);
                if (aboutGreetingImage.length > 0) {
                  formData.append('greeting_image', aboutGreetingImage[0]);
                }
                updateAboutMutation.mutate(formData);
              }}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">인사말 텍스트</label>
                <textarea
                  name="greeting_text"
                  rows={8}
                  defaultValue={aboutContent?.greeting_text || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                  placeholder="인사말 내용을 입력하세요. 줄바꿈으로 문단을 구분합니다."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">서명</label>
                <input
                  type="text"
                  name="greeting_author"
                  defaultValue={aboutContent?.greeting_author || '대덕구골프협회장'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">인사말 이미지</label>
                {aboutContent?.greeting_image && aboutGreetingImage.length === 0 ? (
                  <div className="space-y-2">
                    <img
                      src={aboutContent.greeting_image}
                      alt="현재 인사말 이미지"
                      className="max-h-48 rounded-lg border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (file) setAboutGreetingImage([file]);
                        };
                        input.click();
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800 underline"
                    >
                      이미지 변경
                    </button>
                  </div>
                ) : (
                  <>
                    <FileDropZone
                      label="인사말 이미지"

                      files={aboutGreetingImage}
                      onFilesChange={setAboutGreetingImage}
                    />
                    {aboutGreetingImage.length > 0 && aboutContent?.greeting_image && (
                      <button
                        type="button"
                        onClick={() => setAboutGreetingImage([])}
                        className="text-sm text-gray-500 hover:text-gray-700 underline mt-1"
                      >
                        변경 취소
                      </button>
                    )}
                  </>
                )}
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={updateAboutMutation.isPending}
                  className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                >
                  {updateAboutMutation.isPending ? '저장 중...' : '인사말 저장'}
                </button>
              </div>
            </form>
            )}
          </div>

          {/* 협회임원 관리 */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-semibold">협회임원 관리</h2>
              <button
                onClick={() => {
                  setEditingExecutive(null);
                  setShowExecutiveForm(!showExecutiveForm);
                  setExecutivePhoto([]);
                  setExecutivePhonePrefix('042');
                  setExecutivePhoneNumber('');
                }}
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700"
              >
                {showExecutiveForm ? '취소' : '임원 추가'}
              </button>
            </div>

            {showExecutiveForm && (
              <form
                ref={executiveFormRef}
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const formData = new FormData();
                  formData.append('name', form.querySelector<HTMLInputElement>('[name="exec_name"]')?.value || '');
                  const phone = executivePhoneNumber ? `${executivePhonePrefix}-${executivePhoneNumber}` : '';
                  formData.append('phone', phone);
                  formData.append('greeting', form.querySelector<HTMLTextAreaElement>('[name="exec_greeting"]')?.value || '');
                  if (executivePhoto.length > 0) {
                    formData.append('photo', executivePhoto[0]);
                  }
                  if (editingExecutive) {
                    updateExecutiveMutation.mutate({ id: editingExecutive.id, data: formData });
                  } else {
                    createExecutiveMutation.mutate(formData);
                  }
                }}
                className="p-4 border-b border-gray-200 bg-gray-50"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">이름 *</label>
                    <input
                      type="text"
                      name="exec_name"
                      required
                      defaultValue={editingExecutive?.name || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
                    <div className="flex gap-2">
                      <select
                        value={executivePhonePrefix}
                        onChange={(e) => setExecutivePhonePrefix(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                      >
                        {PHONE_PREFIXES.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={executivePhoneNumber}
                        onChange={(e) => setExecutivePhoneNumber(formatPhoneSuffix(e.target.value, executivePhonePrefix))}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                        placeholder="1234-5678"
                      />
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">인사말</label>
                    <textarea
                      name="exec_greeting"
                      rows={3}
                      defaultValue={editingExecutive?.greeting || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                      placeholder="임원 인사말을 입력하세요."
                    />
                  </div>
                  <div className="md:col-span-2">
                    <FileDropZone
                      label="프로필 사진"

                      files={executivePhoto}
                      onFilesChange={setExecutivePhoto}
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    type="submit"
                    disabled={createExecutiveMutation.isPending || updateExecutiveMutation.isPending}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                  >
                    {(createExecutiveMutation.isPending || updateExecutiveMutation.isPending) ? '저장 중...' : (editingExecutive ? '수정' : '추가')}
                  </button>
                </div>
              </form>
            )}

            <div className="divide-y divide-gray-200">
              {executives && executives.length > 0 ? (
                executives.map((exec) => (
                  <div key={exec.id} className="p-4 flex items-center gap-4">
                    {exec.photo ? (
                      <img src={exec.photo} alt={exec.name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{exec.name}</div>
                      {exec.phone && <div className="text-sm text-gray-500">{exec.phone}</div>}
                      {exec.greeting && <div className="text-sm text-gray-400 truncate">{exec.greeting}</div>}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => moveExecutiveUpMutation.mutate(exec.id)}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 rounded"
                      >
                        &uarr;
                      </button>
                      <button
                        onClick={() => moveExecutiveDownMutation.mutate(exec.id)}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 rounded"
                      >
                        &darr;
                      </button>
                      <button
                        onClick={() => {
                          setEditingExecutive(exec);
                          setShowExecutiveForm(true);
                          setExecutivePhoto([]);
                          if (exec.phone) {
                            const parsed = parsePhoneNumber(exec.phone);
                            setExecutivePhonePrefix(parsed.prefix);
                            setExecutivePhoneNumber(parsed.suffix);
                          } else {
                            setExecutivePhonePrefix('042');
                            setExecutivePhoneNumber('');
                          }
                          setTimeout(() => executiveFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
                        }}
                        className="px-2 py-1 text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 rounded"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`"${exec.name}" 임원을 삭제하시겠습니까?`)) {
                            deleteExecutiveMutation.mutate(exec.id);
                          }
                        }}
                        className="px-2 py-1 text-xs bg-red-100 text-red-700 hover:bg-red-200 rounded"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-gray-500">등록된 임원이 없습니다.</div>
              )}
            </div>
          </div>

          {/* 연혁 관리 */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-semibold">연혁 관리</h2>
              <button
                onClick={() => {
                  setEditingHistory(null);
                  setShowHistoryForm(!showHistoryForm);
                }}
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700"
              >
                {showHistoryForm ? '취소' : '연혁 추가'}
              </button>
            </div>

            {showHistoryForm && (
              <form
                ref={historyFormRef}
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const year = parseInt(form.querySelector<HTMLInputElement>('[name="history_year"]')?.value || '2024');
                  const content = form.querySelector<HTMLInputElement>('[name="history_content"]')?.value || '';
                  const detail = form.querySelector<HTMLTextAreaElement>('[name="history_detail"]')?.value || '';
                  if (editingHistory) {
                    updateHistoryMutation.mutate({ id: editingHistory.id, data: { year, content, detail } });
                  } else {
                    createHistoryMutation.mutate({ year, content, detail });
                  }
                }}
                className="p-4 border-b border-gray-200 bg-gray-50"
              >
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">연도 *</label>
                    <input
                      type="number"
                      name="history_year"
                      required
                      defaultValue={editingHistory?.year || new Date().getFullYear()}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">내용 *</label>
                    <input
                      type="text"
                      name="history_content"
                      required
                      defaultValue={editingHistory?.content || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                      placeholder="연혁 내용을 입력하세요."
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">상세 내용</label>
                  <textarea
                    name="history_detail"
                    rows={3}
                    defaultValue={editingHistory?.detail || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                    placeholder="상세 내용을 입력하세요. (선택사항)"
                  />
                </div>
                <div className="mt-4">
                  <button
                    type="submit"
                    disabled={createHistoryMutation.isPending || updateHistoryMutation.isPending}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                  >
                    {(createHistoryMutation.isPending || updateHistoryMutation.isPending) ? '저장 중...' : (editingHistory ? '수정' : '추가')}
                  </button>
                </div>
              </form>
            )}

            <div className="divide-y divide-gray-200">
              {histories && histories.length > 0 ? (
                histories.map((item: History) => (
                  <div key={item.id} className="p-4 flex items-center gap-4">
                    <div className="flex-shrink-0 bg-green-100 text-green-800 font-bold px-3 py-1 rounded text-sm">
                      {item.year}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700">{item.content}</p>
                      {item.detail && (
                        <p className="text-xs text-gray-500 mt-1">{item.detail}</p>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => moveHistoryUpMutation.mutate(item.id)}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 rounded"
                      >
                        &uarr;
                      </button>
                      <button
                        onClick={() => moveHistoryDownMutation.mutate(item.id)}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 rounded"
                      >
                        &darr;
                      </button>
                      <button
                        onClick={() => {
                          setEditingHistory(item);
                          setShowHistoryForm(true);
                          setTimeout(() => historyFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
                        }}
                        className="px-2 py-1 text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 rounded"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`"${item.year} - ${item.content}" 연혁을 삭제하시겠습니까?`)) {
                            deleteHistoryMutation.mutate(item.id);
                          }
                        }}
                        className="px-2 py-1 text-xs bg-red-100 text-red-700 hover:bg-red-200 rounded"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-gray-500">등록된 연혁이 없습니다.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notices Tab */}
      {activeTab === 'notices' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold">공지사항 목록</h2>
            <button
              onClick={() => {
                setShowNoticeForm(!showNoticeForm);
                if (showNoticeForm) {
                  setEditingNotice(null);
                  setIsPopupChecked(false);
                } else {
                  setIsPopupChecked(false);
                }
              }}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700"
            >
              {showNoticeForm ? '취소' : '새 공지사항'}
            </button>
          </div>

          {showNoticeForm && (
            <form ref={noticeFormRef} key={editingNotice?.id || 'new'} onSubmit={handleNoticeSubmit} className="p-4 border-b border-gray-200 bg-gray-50">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
                  <input
                    type="text"
                    name="title"
                    required
                    defaultValue={editingNotice?.title || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">내용</label>
                  <textarea
                    name="content"
                    required
                    rows={4}
                    defaultValue={editingNotice?.content || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">노출 범위</label>
                  <select
                    name="visibility"
                    defaultValue={editingNotice?.visibility || 'member'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                  >
                    <option value="member">회원 전용</option>
                    <option value="public">공용 (비로그인 가능)</option>
                    <option value="club">클럽 전용</option>
                  </select>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="is_important"
                      id="is_important"
                      defaultChecked={editingNotice?.is_important || false}
                      className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                    />
                    <label htmlFor="is_important" className="text-sm text-gray-700">중요 공지</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="is_popup"
                      id="is_popup"
                      defaultChecked={editingNotice?.is_popup || false}
                      onChange={(e) => setIsPopupChecked(e.target.checked)}
                      className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                    />
                    <label htmlFor="is_popup" className="text-sm text-gray-700">팝업 표시</label>
                  </div>
                  <div className={`flex items-center gap-2 ${!isPopupChecked ? 'opacity-40 pointer-events-none' : ''}`}>
                    <label htmlFor="linked_event" className="text-sm text-gray-700 whitespace-nowrap">경기일정 연결:</label>
                    <select
                      name="linked_event"
                      id="linked_event"
                      defaultValue={editingNotice?.linked_event || ''}
                      disabled={!isPopupChecked}
                      className="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:ring-green-500 focus:border-green-500"
                    >
                      <option value="">없음 (공지사항으로 이동)</option>
                      {allEvents?.map((evt) => (
                        <option key={evt.id} value={evt.id}>{evt.title} ({new Date(evt.start_date).toLocaleDateString('ko-KR')})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className={!isPopupChecked ? 'opacity-40 pointer-events-none' : ''}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">팝업 문구 (선택)</label>
                  <textarea
                    name="popup_content"
                    rows={2}
                    defaultValue={editingNotice?.popup_content || ''}
                    disabled={!isPopupChecked}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                    placeholder="팝업에 표시할 문구를 입력하세요."
                  />
                </div>
                <div className={!isPopupChecked ? 'opacity-40 pointer-events-none' : ''}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">팝업 이미지 (선택)</label>
                  <FileDropZone
                    label="팝업 이미지"

                    files={popupImage}
                    onFilesChange={setPopupImage}
                  />
                </div>
                <button
                  type="submit"
                  disabled={createNoticeMutation.isPending || updateNoticeMutation.isPending}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                >
                  {(createNoticeMutation.isPending || updateNoticeMutation.isPending) ? '저장 중...' : (editingNotice ? '수정' : '저장')}
                </button>
              </div>
            </form>
          )}

          <div className="divide-y divide-gray-200">
            {noticesLoading ? (
              <div className="p-8 text-center text-gray-500">로딩 중...</div>
            ) : noticesError ? (
              <div className="p-8 text-center text-red-500">공지사항을 불러오는 중 오류가 발생했습니다. 새로고침해 주세요.</div>
            ) : notices && notices.length > 0 ? (
              notices.map((notice) => (
                <div key={notice.id} className={`p-4 flex justify-between items-center ${notice.is_hidden ? 'bg-gray-100' : ''}`}>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                        notice.visibility === 'public' ? 'bg-blue-100 text-blue-800' : notice.visibility === 'club' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'
                      }`}>
                        {notice.visibility === 'public' ? '공용' : notice.visibility === 'club' ? '클럽전용' : '회원전용'}
                      </span>
                      {notice.club_name && (
                        <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-blue-500 text-white">
                          {notice.club_name}
                        </span>
                      )}
                      {notice.is_important && (
                        <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-800">중요</span>
                      )}
                      {notice.is_hidden && (
                        <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-gray-200 text-gray-600">숨김</span>
                      )}
                      <span className="font-medium">{notice.title}</span>
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {notice.author?.username} | {new Date(notice.created_at).toLocaleDateString()} | 조회수 {notice.views}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingNotice(notice);
                        setIsPopupChecked(!!notice.is_popup);
                        setShowNoticeForm(true);
                        setTimeout(() => noticeFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
                      }}
                      className="px-3 py-1 rounded text-sm bg-blue-100 text-blue-700 hover:bg-blue-200"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => toggleNoticeHiddenMutation.mutate(notice.id)}
                      className={`px-3 py-1 rounded text-sm ${
                        notice.is_hidden ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {notice.is_hidden ? '표시' : '숨김'}
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
                          deleteNoticeMutation.mutate(notice.id);
                        }
                      }}
                      className="px-3 py-1 rounded text-sm bg-red-100 text-red-700 hover:bg-red-200"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-500">공지사항이 없습니다.</div>
            )}
          </div>
        </div>
      )}

      {/* Schedule Tab */}
      {activeTab === 'schedule' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold">경기일정 목록</h2>
            <button
              onClick={() => {
                setEditingEvent(null);
                setShowEventForm(!showEventForm);
              }}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700"
            >
              {showEventForm && !editingEvent ? '취소' : '새 일정'}
            </button>
          </div>

          {(showEventForm || editingEvent) && (
            <form ref={eventFormRef} onSubmit={handleEventSubmit} className="p-4 border-b border-gray-200 bg-gray-50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
                  <input
                    type="text"
                    name="title"
                    required
                    defaultValue={editingEvent?.title || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">일정 유형</label>
                  <select
                    name="event_type"
                    defaultValue={editingEvent?.event_type || 'match'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                  >
                    <option value="match">정기 경기</option>
                    <option value="tournament">토너먼트</option>
                    <option value="practice">연습</option>
                    <option value="meeting">모임</option>
                    <option value="other">기타</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">장소</label>
                  <input
                    type="text"
                    name="location"
                    defaultValue={editingEvent?.location || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">장소 링크</label>
                  <input
                    type="url"
                    name="location_link"
                    defaultValue={editingEvent?.location_link || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                    placeholder="https://naver.me/... 또는 https://maps.google.com/..."
                  />
                  <p className="text-xs text-gray-500 mt-1">네이버지도, 구글맵 등 장소 링크</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">최대 참가자</label>
                  <input
                    type="number"
                    name="max_participants"
                    min="0"
                    defaultValue={editingEvent?.max_participants || 0}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">노출 범위</label>
                  <div className="flex items-center gap-4">
                    <select
                      name="visibility"
                      defaultValue={editingEvent?.visibility || 'member'}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                    >
                      <option value="member">회원 전용</option>
                      <option value="public">공용</option>
                    </select>
                    <label className="flex items-center gap-1.5 whitespace-nowrap">
                      <input
                        type="checkbox"
                        name="is_popup"
                        defaultChecked={editingEvent?.is_popup || false}
                        className="rounded text-green-600 focus:ring-green-500"
                      />
                      <span className="text-sm text-gray-700">팝업 표시</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">시작 일시</label>
                  <input
                    type="datetime-local"
                    name="start_date"
                    required
                    defaultValue={editingEvent?.start_date?.slice(0, 16) || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">종료 일시</label>
                  <input
                    type="datetime-local"
                    name="end_date"
                    required
                    defaultValue={editingEvent?.end_date?.slice(0, 16) || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
                  <textarea
                    name="description"
                    rows={3}
                    defaultValue={editingEvent?.description || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="submit"
                  disabled={createEventMutation.isPending || updateEventMutation.isPending}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                >
                  {createEventMutation.isPending || updateEventMutation.isPending
                    ? '저장 중...'
                    : editingEvent
                      ? '수정'
                      : '저장'}
                </button>
                {editingEvent && (
                  <button
                    type="button"
                    onClick={() => setEditingEvent(null)}
                    className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-400"
                  >
                    취소
                  </button>
                )}
              </div>
            </form>
          )}

          <div className="divide-y divide-gray-200">
            {eventsLoading ? (
              <div className="p-8 text-center text-gray-500">로딩 중...</div>
            ) : events && events.length > 0 ? (
              events.map((event) => (
                <div key={event.id}>
                  <div className="p-4 flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                          event.event_type === 'match' ? 'bg-green-100 text-green-800' :
                          event.event_type === 'tournament' ? 'bg-yellow-100 text-yellow-800' :
                          event.event_type === 'practice' ? 'bg-blue-100 text-blue-800' :
                          event.event_type === 'meeting' ? 'bg-purple-100 text-purple-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {event.event_type === 'match' ? '정기 경기' :
                           event.event_type === 'tournament' ? '토너먼트' :
                           event.event_type === 'practice' ? '연습' :
                           event.event_type === 'meeting' ? '모임' : '기타'}
                        </span>
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                          event.visibility === 'public' ? 'bg-sky-100 text-sky-800' : 'bg-orange-100 text-orange-800'
                        }`}>
                          {event.visibility === 'public' ? '공용' : '회원전용'}
                        </span>
                        {event.is_popup && (
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-pink-100 text-pink-800">팝업</span>
                        )}
                        <span className="font-medium">{event.title}</span>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {new Date(event.start_date).toLocaleString()} ~ {new Date(event.end_date).toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-500">
                        {event.location && (
                          <>
                            장소: {event.location}
                            {event.location_link && (
                              <a href={event.location_link} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-600 hover:underline">[지도]</a>
                            )}
                            {' | '}
                          </>
                        )}
                        참가자: {event.participant_count || 0}{event.max_participants > 0 && `/${event.max_participants}`}명
                        {(event.pending_participant_count || 0) > 0 && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            승인 대기 {event.pending_participant_count}명
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setManagingEventId(managingEventId === event.id ? null : event.id)}
                        className={`relative px-3 py-1 rounded text-sm ${managingEventId === event.id ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                      >
                        참가 관리
                        {(event.pending_participant_count || 0) > 0 && managingEventId !== event.id && (
                          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                            {event.pending_participant_count}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setShowEventForm(false);
                          setEditingEvent(event);
                          setTimeout(() => eventFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
                        }}
                        className="px-3 py-1 rounded text-sm bg-blue-100 text-blue-700 hover:bg-blue-200"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm('정말 삭제하시겠습니까?')) {
                            deleteEventMutation.mutate(event.id);
                          }
                        }}
                        className="px-3 py-1 rounded text-sm bg-red-100 text-red-700 hover:bg-red-200"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                  {/* 참가 인원 관리 패널 - 해당 일정 바로 밑에 표시 */}
                  {managingEventId === event.id && (
                    <div className="px-4 pb-4 pt-2 bg-gray-50 border-t border-dashed border-gray-300">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-base font-semibold text-gray-800">참가 인원 관리</h3>
                        <button
                          onClick={async () => {
                            try {
                              const response = await api.get(`/schedule/events/${event.id}/export_participants/`, { responseType: 'blob' });
                              const url = window.URL.createObjectURL(new Blob([response.data]));
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `${event.title}_참가자명단.xlsx`;
                              a.click();
                              window.URL.revokeObjectURL(url);
                            } catch {
                              alert('다운로드에 실패했습니다.');
                            }
                          }}
                          className="px-3 py-1.5 rounded text-sm bg-blue-600 text-white hover:bg-blue-700"
                        >
                          XLSX 다운로드
                        </button>
                      </div>
                      {eventDetailLoading ? (
                        <div className="text-center text-gray-500 py-4">로딩 중...</div>
                      ) : eventDetail ? (
                        <div className="space-y-4">
                          {eventDetail.participants?.filter((p: { status: string }) => p.status === 'pending').length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium text-yellow-700 mb-2">승인 대기</h4>
                              <div className="space-y-2">
                                {eventDetail.participants
                                  .filter((p: { status: string }) => p.status === 'pending')
                                  .map((p: { id: number; user: { username: string; email: string }; created_at: string }) => (
                                    <div key={p.id} className="flex justify-between items-center bg-yellow-50 p-3 rounded-lg">
                                      <div>
                                        <span className="font-medium">{p.user.username}</span>
                                        <span className="text-sm text-gray-500 ml-2">{p.user.email}</span>
                                        <span className="text-xs text-gray-400 ml-2">{new Date(p.created_at).toLocaleDateString()}</span>
                                      </div>
                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => approveParticipantMutation.mutate({ eventId: event.id, participantId: p.id })}
                                          disabled={approveParticipantMutation.isPending}
                                          className="px-3 py-1 rounded text-sm bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                                        >
                                          수락
                                        </button>
                                        <button
                                          onClick={() => rejectParticipantMutation.mutate({ eventId: event.id, participantId: p.id })}
                                          disabled={rejectParticipantMutation.isPending}
                                          className="px-3 py-1 rounded text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                                        >
                                          거절
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                          <div>
                            <h4 className="text-sm font-medium text-green-700 mb-2">
                              확정 인원 ({eventDetail.participants?.filter((p: { status: string }) => p.status === 'confirmed').length || 0}명)
                            </h4>
                            {eventDetail.participants?.filter((p: { status: string }) => p.status === 'confirmed').length > 0 ? (
                              <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">이름</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">이메일</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">신청일</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {eventDetail.participants
                                      .filter((p: { status: string }) => p.status === 'confirmed')
                                      .map((p: { id: number; user: { username: string; email: string }; created_at: string }) => (
                                        <tr key={p.id}>
                                          <td className="px-4 py-2 text-sm">{p.user.username}</td>
                                          <td className="px-4 py-2 text-sm text-gray-500">{p.user.email}</td>
                                          <td className="px-4 py-2 text-sm text-gray-500">{new Date(p.created_at).toLocaleDateString()}</td>
                                        </tr>
                                      ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500">확정된 참가자가 없습니다.</p>
                            )}
                          </div>
                          {eventDetail.participants?.filter((p: { status: string }) => p.status === 'cancelled').length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium text-red-700 mb-2">거절</h4>
                              <div className="flex flex-wrap gap-2">
                                {eventDetail.participants
                                  .filter((p: { status: string }) => p.status === 'cancelled')
                                  .map((p: { id: number; user: { username: string } }) => (
                                    <span key={p.id} className="bg-red-50 text-red-700 px-3 py-1 rounded-full text-sm">
                                      {p.user.username}
                                    </span>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center text-gray-500 py-4">데이터를 불러올 수 없습니다.</div>
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-500">등록된 일정이 없습니다.</div>
            )}
          </div>
        </div>
      )}

      {/* Gallery Tab */}
      {activeTab === 'gallery' && (
        <div className="space-y-6">
          {/* 갤러리 카테고리 관리 */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-semibold">갤러리 카테고리</h2>
              <button
                onClick={() => {
                  setShowGalleryCategoryForm(!showGalleryCategoryForm);
                  setEditingGalleryCategory(null);
                }}
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700"
              >
                {showGalleryCategoryForm ? '취소' : '카테고리 추가'}
              </button>
            </div>

            {(showGalleryCategoryForm || editingGalleryCategory) && (
              <form
                key={editingGalleryCategory?.id || 'new'}
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const name = formData.get('name') as string;
                  if (!name.trim()) return;
                  if (editingGalleryCategory) {
                    updateGalleryCategoryMutation.mutate({ id: editingGalleryCategory.id, data: { name: name.trim() } });
                  } else {
                    createGalleryCategoryMutation.mutate({ name: name.trim() });
                  }
                }}
                className="p-4 border-b border-gray-200 bg-gray-50"
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    name="name"
                    required
                    defaultValue={editingGalleryCategory?.name || ''}
                    placeholder="카테고리 이름 (예: 대회, 행사, 연습)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                  />
                  <button
                    type="submit"
                    disabled={createGalleryCategoryMutation.isPending || updateGalleryCategoryMutation.isPending}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                  >
                    {editingGalleryCategory ? '수정' : '추가'}
                  </button>
                  {editingGalleryCategory && (
                    <button
                      type="button"
                      onClick={() => setEditingGalleryCategory(null)}
                      className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-400"
                    >
                      취소
                    </button>
                  )}
                </div>
              </form>
            )}

            <div className="divide-y divide-gray-200">
              {galleryCategoriesLoading ? (
                <div className="p-8 text-center text-gray-500">로딩 중...</div>
              ) : galleryCategories && galleryCategories.length > 0 ? (
                galleryCategories.map((cat) => (
                  <div key={cat.id} className="p-4 flex justify-between items-center">
                    <div>
                      <span className="font-medium">{cat.name}</span>
                      <span className="text-sm text-gray-500 ml-2">({cat.album_count}개 앨범)</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingGalleryCategory(cat);
                          setShowGalleryCategoryForm(true);
                        }}
                        className="px-3 py-1 text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 rounded"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => {
                          if (cat.album_count > 0) {
                            alert('앨범이 포함된 카테고리는 삭제할 수 없습니다. 앨범의 카테고리를 먼저 변경해주세요.');
                            return;
                          }
                          if (confirm(`"${cat.name}" 카테고리를 삭제하시겠습니까?`)) {
                            deleteGalleryCategoryMutation.mutate(cat.id);
                          }
                        }}
                        className="px-3 py-1 text-sm bg-red-100 text-red-700 hover:bg-red-200 rounded"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-gray-500">등록된 카테고리가 없습니다.</div>
              )}
            </div>
          </div>

          {/* 앨범 관리 */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-semibold">갤러리 앨범 목록</h2>
              <button
                onClick={() => {
                  if (showAlbumForm && !editingAlbum) {
                    setAlbumPhotos([]); setAlbumCoverIndex(0);
                  }
                  setEditingAlbum(null);
                  setAlbumPhotos([]); setAlbumCoverIndex(0);
                  setShowAlbumForm(!showAlbumForm);
                }}
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700"
              >
                {showAlbumForm && !editingAlbum ? '취소' : '새 앨범'}
              </button>
            </div>

            {(showAlbumForm || editingAlbum) && (
              <form ref={albumFormRef} key={editingAlbum?.id || 'new'} onSubmit={handleAlbumSubmit} className="p-4 border-b border-gray-200 bg-gray-50">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
                      <input
                        type="text"
                        name="title"
                        required
                        defaultValue={editingAlbum?.title || ''}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
                      <select
                        name="category"
                        defaultValue={editingAlbum?.category || ''}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                      >
                        <option value="">선택 안함</option>
                        {galleryCategories?.map((cat) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
                    <textarea
                      name="description"
                      rows={2}
                      defaultValue={editingAlbum?.description || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">앨범 유형</label>
                      <select
                        name="album_type"
                        defaultValue={editingAlbum?.album_type || 'public'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                      >
                        <option value="public">공용 갤러리</option>
                        <option value="member">회원 전용 갤러리</option>
                      </select>
                    </div>
                    {editingAlbum && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">등록일</label>
                        <input
                          type="date"
                          name="created_at"
                          defaultValue={editingAlbum.created_at?.slice(0, 10)}
                          onChange={(e) => {
                            if (e.target.value) {
                              updateAlbumDateMutation.mutate({ albumId: editingAlbum.id, date: e.target.value });
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                        />
                      </div>
                    )}
                  </div>
                  {editingAlbum?.photos && editingAlbum.photos.length > 0 && (() => {
                    const sortedPhotos = [...editingAlbum.photos].sort((a, b) => a.order - b.order);
                    return (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">기존 사진 (클릭: 대표 지정 / 드래그: 순서 변경)</label>
                      <div
                        className="flex flex-wrap"
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                        onDragEnd={() => { setPhotoDragIdx(null); setPhotoDragOverIdx(null); }}
                      >
                        {sortedPhotos.map((photo, idx) => {
                          const isCover = editingAlbum.cover_photo_id === photo.id;
                          const isDragging = photoDragIdx !== null;
                          const isDraggedItem = photoDragIdx === idx;
                          const isDropTarget = isDragging && photoDragOverIdx === idx && !isDraggedItem;
                          return (
                            <div
                              key={photo.id}
                              className="flex items-start"
                              onDragOver={(e) => {
                                e.preventDefault();
                                if (photoDragIdx !== null && photoDragIdx !== idx) {
                                  setPhotoDragOverIdx(idx);
                                }
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (photoDragIdx !== null && photoDragIdx !== idx) {
                                  const reordered = [...sortedPhotos];
                                  const [moved] = reordered.splice(photoDragIdx, 1);
                                  reordered.splice(idx, 0, moved);
                                  applyPhotoReorder(editingAlbum.id, reordered);
                                }
                                setPhotoDragIdx(null);
                                setPhotoDragOverIdx(null);
                              }}
                            >
                              {isDropTarget && (
                                <div className="w-1.5 bg-blue-500 rounded-full self-stretch min-h-[5.5rem] flex-shrink-0" />
                              )}
                              <div
                                className={`relative group flex flex-col items-center mx-1 mb-2 ${isDraggedItem ? 'opacity-30 scale-90' : ''} transition-all duration-150`}
                                draggable
                                onDragStart={(e) => {
                                  setPhotoDragIdx(idx);
                                  setPhotoDragOverIdx(null);
                                  e.dataTransfer.effectAllowed = 'move';
                                }}
                              >
                                <img
                                  src={photo.image}
                                  alt=""
                                  className={`w-20 h-20 object-cover rounded cursor-grab active:cursor-grabbing ${isCover ? 'ring-3 ring-green-500 border-2 border-green-500' : 'border border-gray-300 hover:ring-2 hover:ring-blue-300'}`}
                                  onClick={() => {
                                    if (!isCover && !isDragging) {
                                      setCoverMutation.mutate({ albumId: editingAlbum.id, photoId: photo.id });
                                    }
                                  }}
                                />
                                {isCover && (
                                  <span className="absolute -top-2 -left-2 bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                                    대표
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm('이 사진을 삭제하시겠습니까?')) {
                                      deletePhotoMutation.mutate({ albumId: editingAlbum.id, photoId: photo.id });
                                    }
                                  }}
                                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center"
                                >
                                  X
                                </button>
                                <div className="flex gap-1 mt-1">
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() => movePhotoLocal(editingAlbum.id, photo.id, 'up')}
                                    className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 rounded disabled:opacity-30"
                                  >
                                    &larr;
                                  </button>
                                  <button
                                    type="button"
                                    disabled={idx === sortedPhotos.length - 1}
                                    onClick={() => movePhotoLocal(editingAlbum.id, photo.id, 'down')}
                                    className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 rounded disabled:opacity-30"
                                  >
                                    &rarr;
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })()}
                  <FileDropZone
                    label={editingAlbum ? '새 사진 추가 (여러장 선택 가능)' : '사진 (여러장 선택 가능)'}
                    multiple={true}
                    files={albumPhotos}
                    onFilesChange={(files) => {
                      if (!editingAlbum) {
                        if (files.length <= albumCoverIndex) {
                          setAlbumCoverIndex(Math.max(0, files.length - 1));
                        }
                      }
                      setAlbumPhotos(files);
                    }}
                    {...(!editingAlbum ? { coverIndex: albumCoverIndex, onCoverSelect: setAlbumCoverIndex } : {})}
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="is_public"
                      id="is_public"
                      defaultChecked={editingAlbum ? editingAlbum.is_public : true}
                      className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                    />
                    <label htmlFor="is_public" className="text-sm text-gray-700">공개</label>
                  </div>
                  {/* 업로드 프로그래스바 */}
                  {(createAlbumMutation.isPending || updateAlbumMutation.isPending) && (
                    <div className="w-full">
                      <div className="flex justify-between text-sm text-gray-600 mb-1">
                        <span>업로드 중...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div
                          className="bg-green-600 h-3 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={createAlbumMutation.isPending || updateAlbumMutation.isPending}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                    >
                      {(createAlbumMutation.isPending || updateAlbumMutation.isPending) ? '저장 중...' : (editingAlbum ? '수정' : '저장')}
                    </button>
                    {editingAlbum && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAlbum(null);
                          setShowAlbumForm(false);
                          setAlbumPhotos([]); setAlbumCoverIndex(0);
                        }}
                        className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-400"
                      >
                        취소
                      </button>
                    )}
                  </div>
                </div>
              </form>
            )}

            <div className="divide-y divide-gray-200">
              {albumsLoading ? (
                <div className="p-8 text-center text-gray-500">로딩 중...</div>
              ) : albumsError ? (
                <div className="p-8 text-center text-red-500">갤러리를 불러오는 중 오류가 발생했습니다. 새로고침해 주세요.</div>
              ) : albums && albums.length > 0 ? (
                albums.map((album) => (
                  <div key={album.id} className={`p-4 flex justify-between items-center ${album.is_hidden ? 'bg-gray-100' : ''}`}>
                    <div className="flex items-center gap-4">
                      {album.cover_image && (
                        <img src={album.cover_image} alt={album.title} className="w-16 h-16 object-cover rounded" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                            album.album_type === 'public' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                          }`}>
                            {album.album_type === 'public' ? '공용' : '회원전용'}
                          </span>
                          {album.category_name && (
                            <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-700">
                              {album.category_name}
                            </span>
                          )}
                          {album.is_hidden && (
                            <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-gray-200 text-gray-600">숨김</span>
                          )}
                          <span className="font-medium">{album.title}</span>
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {album.author?.username} | {new Date(album.created_at).toLocaleDateString()} | 사진 {album.photo_count || 0}장
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingAlbum(album);
                          setAlbumPhotos([]); setAlbumCoverIndex(0);
                          setShowAlbumForm(false);
                          setTimeout(() => albumFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
                        }}
                        className="px-3 py-1 rounded text-sm bg-blue-100 text-blue-700 hover:bg-blue-200"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => toggleAlbumHiddenMutation.mutate(album.id)}
                        className={`px-3 py-1 rounded text-sm ${
                          album.is_hidden ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {album.is_hidden ? '표시' : '숨김'}
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm('정말 삭제하시겠습니까? 앨범 내 모든 사진도 함께 삭제됩니다.')) {
                            deleteAlbumMutation.mutate(album.id);
                          }
                        }}
                        className="px-3 py-1 rounded text-sm bg-red-100 text-red-700 hover:bg-red-200"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-gray-500">앨범이 없습니다.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Messenger/Bans Tab */}
      {activeTab === 'messenger' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-semibold">클럽 목록</h2>
              <button
                onClick={() => setShowCreateClubForm(!showCreateClubForm)}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                새 클럽 만들기
              </button>
            </div>
            {showCreateClubForm && (
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    createClubMutation.mutate({
                      name: formData.get('name') as string,
                      description: formData.get('description') as string,
                    });
                  }}
                  className="space-y-3"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">클럽 이름</label>
                    <input
                      type="text"
                      name="name"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
                    <textarea
                      name="description"
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateClubForm(false)}
                      className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 rounded-lg"
                    >
                      취소
                    </button>
                    <button
                      type="submit"
                      disabled={createClubMutation.isPending}
                      className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {createClubMutation.isPending ? '생성 중...' : '생성'}
                    </button>
                  </div>
                </form>
              </div>
            )}
            <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
              {roomsLoading ? (
                <div className="p-8 text-center text-gray-500">로딩 중...</div>
              ) : chatRooms && chatRooms.length > 0 ? (
                chatRooms.map((room) => (
                  <div
                    key={room.id}
                    className={`p-4 hover:bg-gray-50 ${selectedRoom === room.id ? 'bg-green-50' : ''}`}
                  >
                    <div className="flex justify-between items-center">
                      <button
                        onClick={() => {
                          setSelectedRoom(selectedRoom === room.id ? null : room.id);
                          if (selectedRoom !== room.id) {
                            setTimeout(() => clubSettingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
                          }
                        }}
                        className="flex-1 text-left flex items-center gap-3"
                      >
                        {room.icon ? (
                          <img src={room.icon} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </div>
                        )}
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {room.name}
                            {room.is_public && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">공용</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">
                            {room.member_count}명 참여 | {room.last_message ? `${room.last_message.content.substring(0, 15)}...` : '메시지 없음'}
                          </div>
                        </div>
                      </button>
                      <div className="flex gap-1 items-center flex-shrink-0">
                        <button
                          onClick={() => {
                            setSelectedRoom(room.id);
                            setTimeout(() => clubSettingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
                          }}
                          className="px-2 py-1 text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 rounded"
                        >
                          수정
                        </button>
                        {room.is_public ? (
                          <button
                            onClick={() => {
                              if (window.confirm(`"${room.name}" 클럽의 모든 메시지를 삭제하시겠습니까?\n클럽은 유지됩니다.`)) {
                                clearMessagesMutation.mutate(room.id);
                              }
                            }}
                            className="px-2 py-1 text-xs bg-orange-100 text-orange-700 hover:bg-orange-200 rounded"
                          >
                            기록 삭제
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              if (window.confirm(`"${room.name}" 클럽을 삭제하시겠습니까?\n모든 메시지가 함께 삭제됩니다.`)) {
                                deleteChatRoomMutation.mutate(room.id);
                              }
                            }}
                            className="px-2 py-1 text-xs bg-red-100 text-red-700 hover:bg-red-200 rounded"
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-gray-500">클럽이 없습니다.</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold">활성 제재 목록</h2>
            </div>
            <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
              {activeBans && activeBans.length > 0 ? (
                activeBans.map((ban) => (
                  <div key={ban.id} className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                            ban.ban_type === 'mute' ? 'bg-yellow-100 text-yellow-800' :
                            ban.ban_type === 'kick' ? 'bg-orange-100 text-orange-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {ban.ban_type_display}
                          </span>
                          <span className="font-medium">{ban.user?.username}</span>
                        </div>
                        <div className="text-sm text-gray-500 mt-1">사유: {ban.reason || '없음'}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          제재자: {ban.banned_by?.username} | {new Date(ban.created_at).toLocaleDateString()}
                          {ban.expires_at && <> | 만료: {new Date(ban.expires_at).toLocaleDateString()}</>}
                        </div>
                      </div>
                      <button
                        onClick={() => unbanMutation.mutate({ roomId: ban.room, banId: ban.id })}
                        className="px-3 py-1 rounded text-sm bg-green-100 text-green-700 hover:bg-green-200"
                      >
                        해제
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-gray-500">활성 제재가 없습니다.</div>
              )}
            </div>
          </div>

          {selectedRoom && (
            <>
              {/* 클럽 설정 */}
              {(() => {
                const currentRoom = chatRooms?.find((r) => r.id === selectedRoom);
                if (!currentRoom) return null;
                return (
                  <div ref={clubSettingsRef} className="lg:col-span-2 bg-white rounded-lg shadow">
                    <div className="p-4 border-b border-gray-200">
                      <h2 className="text-lg font-semibold">클럽 설정 - {currentRoom.name}</h2>
                    </div>
                    <div className="p-4 space-y-4">
                      {/* 클럽 이름 수정 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">클럽 이름</label>
                        {editingClubId === currentRoom.id ? (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={editingClubName}
                              onChange={(e) => setEditingClubName(e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                            />
                            <button
                              onClick={() => {
                                if (editingClubName.trim()) {
                                  renameChatRoomMutation.mutate(
                                    { roomId: currentRoom.id, name: editingClubName.trim() },
                                    { onSuccess: () => { setEditingClubId(null); setEditingClubName(''); } }
                                  );
                                }
                              }}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                            >
                              저장
                            </button>
                            <button
                              onClick={() => { setEditingClubId(null); setEditingClubName(''); }}
                              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-800">{currentRoom.name}</span>
                            <button
                              onClick={() => { setEditingClubId(currentRoom.id); setEditingClubName(currentRoom.name); }}
                              className="px-3 py-1 text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 rounded"
                            >
                              이름 변경
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 클럽 이미지 수정 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">클럽 이미지</label>
                        <div className="flex items-center gap-4">
                          {currentRoom.icon ? (
                            <img src={currentRoom.icon} alt="" className="w-16 h-16 rounded-full object-cover border border-gray-200" />
                          ) : (
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center border border-gray-200">
                              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <label className="px-3 py-1.5 text-sm bg-green-100 text-green-700 hover:bg-green-200 rounded cursor-pointer">
                              이미지 업로드
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const formData = new FormData();
                                    formData.append('icon', file);
                                    setClubIconMutation.mutate({ roomId: currentRoom.id, data: formData });
                                  }
                                  e.target.value = '';
                                }}
                              />
                            </label>
                            {currentRoom.icon && (
                              <button
                                onClick={() => {
                                  const formData = new FormData();
                                  formData.append('remove_icon', 'true');
                                  setClubIconMutation.mutate({ roomId: currentRoom.id, data: formData });
                                }}
                                className="px-3 py-1.5 text-sm bg-red-100 text-red-700 hover:bg-red-200 rounded"
                              >
                                이미지 삭제
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 클럽 소개 수정 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">클럽 소개</label>
                        <form
                          key={`desc-${currentRoom.id}-${currentRoom.description || ''}`}
                          onSubmit={(e) => {
                            e.preventDefault();
                            const textarea = e.currentTarget.querySelector<HTMLTextAreaElement>('[name="club_description"]');
                            updateChatRoomDescriptionMutation.mutate({
                              roomId: currentRoom.id,
                              description: textarea?.value || '',
                            });
                          }}
                          className="flex flex-col gap-2"
                        >
                          <textarea
                            name="club_description"
                            rows={3}
                            defaultValue={currentRoom.description || ''}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                            placeholder="클럽 소개를 입력하세요."
                          />
                          <div className="flex justify-end">
                            <button
                              type="submit"
                              disabled={updateChatRoomDescriptionMutation.isPending}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                            >
                              {updateChatRoomDescriptionMutation.isPending ? '저장 중...' : '소개 저장'}
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 클럽 내용 보기 */}
              <div className="lg:col-span-2 bg-white rounded-lg shadow">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold">클럽 내용 - {chatRooms?.find((r) => r.id === selectedRoom)?.name}</h2>
                </div>
                <div className="p-4 max-h-96 overflow-y-auto bg-gray-50">
                  {messagesLoading ? (
                    <div className="text-center text-gray-500 py-4">로딩 중...</div>
                  ) : roomMessages && roomMessages.length > 0 ? (
                    <div className="space-y-3">
                      {roomMessages.map((msg) => (
                        <div key={msg.id} className="bg-white p-3 rounded-lg shadow-sm">
                          <div className="flex justify-between items-start">
                            <div className="font-medium text-sm text-green-700">{msg.sender.username}</div>
                            <div className="text-xs text-gray-400">
                              {new Date(msg.created_at).toLocaleString()}
                            </div>
                          </div>
                          <div className="mt-1 text-gray-700 break-all whitespace-pre-wrap">{msg.content}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-4">메시지가 없습니다.</div>
                  )}
                </div>
              </div>

              {/* 회원 제재 */}
              <div className="lg:col-span-2 bg-white rounded-lg shadow">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold">회원 제재 - {chatRooms?.find((r) => r.id === selectedRoom)?.name}</h2>
                </div>
                <BanForm
                  roomId={selectedRoom}
                  users={roomMembersList?.filter((u) => u.role !== 'admin') || []}
                  onSuccess={() => queryClient.invalidateQueries({ queryKey: ['adminActiveBans'] })}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Banners Tab */}
      {activeTab === 'banners' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold">배너 목록</h2>
            <button
              onClick={() => {
                if (showBannerForm && !editingBanner) {
                  setBannerImage([]);
                  resetBannerPhone();
                }
                setEditingBanner(null);
                setShowBannerForm(!showBannerForm);
              }}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700"
            >
              {showBannerForm && !editingBanner ? '취소' : '새 배너'}
            </button>
          </div>

          {(showBannerForm || editingBanner) && (
            <form ref={bannerFormRef} onSubmit={handleBannerSubmit} className="p-4 border-b border-gray-200 bg-gray-50">
              <div className="space-y-4">
                <div>
                  <FileDropZone
                    label="배너 이미지"

                    multiple={false}
                    files={bannerImage}
                    onFilesChange={setBannerImage}
                  />
                  {editingBanner && bannerImage.length === 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-500 mb-1">현재 이미지 (변경하려면 위에서 새 이미지를 선택하세요)</p>
                      <img src={editingBanner.image} alt={editingBanner.description} className="w-48 h-16 object-cover rounded border" />
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-1">권장 사이즈: 1200 x 300px (가로형)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">간단 문구</label>
                  <input
                    type="text"
                    name="description"
                    required
                    maxLength={100}
                    defaultValue={editingBanner?.description || ''}
                    key={editingBanner?.id || 'new'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                    placeholder="배너에 표시될 문구"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
                  <div className="flex gap-2">
                    <select
                      value={bannerPhonePrefix}
                      onChange={(e) => setBannerPhonePrefix(e.target.value)}
                      className="w-44 px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                    >
                      {PHONE_PREFIXES.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      required
                      value={bannerPhoneNumber}
                      onChange={(e) => setBannerPhoneNumber(formatPhoneSuffix(e.target.value, bannerPhonePrefix))}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                      placeholder="123-4567"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    입력 예시: {bannerPhonePrefix}-{bannerPhoneNumber || 'XXX-XXXX'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">링크 (선택)</label>
                  <input
                    type="url"
                    name="link"
                    defaultValue={editingBanner?.link || ''}
                    key={editingBanner ? `link-${editingBanner.id}` : 'link-new'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                    placeholder="https://example.com"
                  />
                  <p className="text-xs text-gray-500 mt-1">배너 클릭 시 이동할 링크 (비워두면 링크 없음)</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="is_active"
                    id="banner_is_active"
                    defaultChecked={editingBanner ? editingBanner.is_active : true}
                    key={editingBanner ? `active-${editingBanner.id}` : 'active-new'}
                    className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                  />
                  <label htmlFor="banner_is_active" className="text-sm text-gray-700">활성화</label>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={createBannerMutation.isPending || updateBannerMutation.isPending || (!editingBanner && bannerImage.length === 0)}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                  >
                    {createBannerMutation.isPending || updateBannerMutation.isPending
                      ? '저장 중...'
                      : editingBanner
                        ? '수정'
                        : '저장'}
                  </button>
                  {editingBanner && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBanner(null);
                        setShowBannerForm(false);
                        setBannerImage([]);
                        resetBannerPhone();
                      }}
                      className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-400"
                    >
                      취소
                    </button>
                  )}
                </div>
              </div>
            </form>
          )}

          <div className="divide-y divide-gray-200">
            {bannersLoading ? (
              <div className="p-8 text-center text-gray-500">로딩 중...</div>
            ) : banners && banners.length > 0 ? (
              banners.map((banner, index) => (
                <div key={banner.id} className={`p-4 flex justify-between items-center ${!banner.is_active ? 'bg-gray-100' : ''}`}>
                  <div className="flex items-center gap-4">
                    <img src={banner.image} alt={banner.description} className="w-24 h-16 object-cover rounded" />
                    <div>
                      <div className="flex items-center gap-2">
                        {!banner.is_active && (
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-gray-200 text-gray-600">비활성</span>
                        )}
                        <span className="font-medium">{banner.description}</span>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {banner.phone_number} | 순서: {banner.order}
                        {banner.link && (
                          <> | <a href={banner.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">링크</a></>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setShowBannerForm(false);
                        setEditingBanner(banner);
                        const parsed = parsePhoneNumber(banner.phone_number);
                        setBannerPhonePrefix(parsed.prefix);
                        setBannerPhoneNumber(parsed.suffix);
                        setBannerImage([]);
                        setTimeout(() => bannerFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
                      }}
                      className="px-3 py-1 rounded text-sm bg-blue-100 text-blue-700 hover:bg-blue-200"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => moveBannerUpMutation.mutate(banner.id)}
                      disabled={index === 0}
                      className="px-2 py-1 rounded text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-30"
                    >
                      위
                    </button>
                    <button
                      onClick={() => moveBannerDownMutation.mutate(banner.id)}
                      disabled={index === banners.length - 1}
                      className="px-2 py-1 rounded text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-30"
                    >
                      아래
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('정말 삭제하시겠습니까?')) {
                          deleteBannerMutation.mutate(banner.id);
                        }
                      }}
                      className="px-3 py-1 rounded text-sm bg-red-100 text-red-700 hover:bg-red-200"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-500">배너가 없습니다.</div>
            )}
          </div>
        </div>
      )}

      {/* Organizations Tab */}
      {activeTab === 'organizations' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold">유관기관 목록</h2>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={orgSettings?.marquee_enabled ?? true}
                  onChange={(e) => toggleMarqueeMutation.mutate(e.target.checked)}
                  className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                />
                스크롤 애니메이션
              </label>
            </div>
            <button
              onClick={() => {
                if (showOrgForm && !editingOrg) {
                  setOrgLogo([]);
                }
                setEditingOrg(null);
                setShowOrgForm(!showOrgForm);
              }}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700"
            >
              {showOrgForm && !editingOrg ? '취소' : '새 유관기관'}
            </button>
          </div>

          {(showOrgForm || editingOrg) && (
            <form ref={orgFormRef} onSubmit={handleOrgSubmit} className="p-4 border-b border-gray-200 bg-gray-50">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">기관명</label>
                  <input
                    type="text"
                    name="name"
                    required
                    maxLength={100}
                    defaultValue={editingOrg?.name || ''}
                    key={editingOrg?.id || 'new'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                    placeholder="기관 이름"
                  />
                </div>
                <div>
                  <FileDropZone
                    label="로고 이미지"

                    multiple={false}
                    files={orgLogo}
                    onFilesChange={setOrgLogo}
                  />
                  {editingOrg && orgLogo.length === 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-500 mb-1">현재 로고 (변경하려면 위에서 새 이미지를 선택하세요)</p>
                      <img src={editingOrg.logo} alt={editingOrg.name} className="object-contain rounded border" style={{ width: '160px', height: '56px' }} />
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-1">권장 사이즈: 320 x 112px (가로형, 자동 조정됨)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">링크</label>
                  <input
                    type="url"
                    name="link"
                    required
                    defaultValue={editingOrg?.link || ''}
                    key={editingOrg ? `link-${editingOrg.id}` : 'link-new'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                    placeholder="https://example.com"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="is_active"
                    id="org_is_active"
                    defaultChecked={editingOrg ? editingOrg.is_active : true}
                    key={editingOrg ? `active-${editingOrg.id}` : 'active-new'}
                    className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                  />
                  <label htmlFor="org_is_active" className="text-sm text-gray-700">활성화</label>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={createOrgMutation.isPending || updateOrgMutation.isPending || (!editingOrg && orgLogo.length === 0)}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                  >
                    {createOrgMutation.isPending || updateOrgMutation.isPending
                      ? '저장 중...'
                      : editingOrg
                        ? '수정'
                        : '저장'}
                  </button>
                  {editingOrg && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingOrg(null);
                        setShowOrgForm(false);
                        setOrgLogo([]);
                      }}
                      className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-400"
                    >
                      취소
                    </button>
                  )}
                </div>
              </div>
            </form>
          )}

          <div className="divide-y divide-gray-200">
            {orgsLoading ? (
              <div className="p-8 text-center text-gray-500">로딩 중...</div>
            ) : organizations && organizations.length > 0 ? (
              organizations.map((org, index) => (
                <div key={org.id} className={`p-4 flex justify-between items-center ${!org.is_active ? 'bg-gray-100' : ''}`}>
                  <div className="flex items-center gap-4">
                    <img src={org.logo} alt={org.name} className="object-contain rounded border" style={{ width: '160px', height: '56px' }} />
                    <div>
                      <div className="flex items-center gap-2">
                        {!org.is_active && (
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-gray-200 text-gray-600">비활성</span>
                        )}
                        <span className="font-medium">{org.name}</span>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        <a href={org.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          {org.link}
                        </a>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setShowOrgForm(false);
                        setEditingOrg(org);
                        setOrgLogo([]);
                        setTimeout(() => orgFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
                      }}
                      className="px-3 py-1 rounded text-sm bg-blue-100 text-blue-700 hover:bg-blue-200"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => moveOrgUpMutation.mutate(org.id)}
                      disabled={index === 0}
                      className="px-2 py-1 rounded text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-30"
                    >
                      위
                    </button>
                    <button
                      onClick={() => moveOrgDownMutation.mutate(org.id)}
                      disabled={index === organizations.length - 1}
                      className="px-2 py-1 rounded text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-30"
                    >
                      아래
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('정말 삭제하시겠습니까?')) {
                          deleteOrgMutation.mutate(org.id);
                        }
                      }}
                      className="px-3 py-1 rounded text-sm bg-red-100 text-red-700 hover:bg-red-200"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-500">유관기관이 없습니다.</div>
            )}
          </div>
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <div className="space-y-6">
          {/* 카테고리 관리 */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-semibold">서식 카테고리</h2>
              <button
                onClick={() => {
                  setShowDocCategoryForm(!showDocCategoryForm);
                  setEditingDocCategory(null);
                }}
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700"
              >
                {showDocCategoryForm ? '취소' : '카테고리 추가'}
              </button>
            </div>

            {(showDocCategoryForm || editingDocCategory) && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const name = formData.get('name') as string;
                  if (!name.trim()) return;
                  if (editingDocCategory) {
                    updateDocCategoryMutation.mutate({ id: editingDocCategory.id, data: { name: name.trim() } });
                  } else {
                    createDocCategoryMutation.mutate({ name: name.trim() });
                  }
                }}
                className="p-4 border-b border-gray-200 bg-gray-50"
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    name="name"
                    required
                    defaultValue={editingDocCategory?.name || ''}
                    placeholder="카테고리 이름 (예: 규정, 규장, 서식)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                  />
                  <button
                    type="submit"
                    disabled={createDocCategoryMutation.isPending || updateDocCategoryMutation.isPending}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                  >
                    {editingDocCategory ? '수정' : '추가'}
                  </button>
                  {editingDocCategory && (
                    <button
                      type="button"
                      onClick={() => setEditingDocCategory(null)}
                      className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-400"
                    >
                      취소
                    </button>
                  )}
                </div>
              </form>
            )}

            <div className="divide-y divide-gray-200">
              {docCategoriesLoading ? (
                <div className="p-8 text-center text-gray-500">로딩 중...</div>
              ) : docCategories && docCategories.length > 0 ? (
                docCategories.map((cat) => (
                  <div key={cat.id} className="p-4 flex justify-between items-center">
                    <div>
                      <span className="font-medium">{cat.name}</span>
                      <span className="text-sm text-gray-500 ml-2">({cat.documents.length}개 서식)</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingDocCategory(cat);
                          setShowDocCategoryForm(true);
                        }}
                        className="px-3 py-1 text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 rounded"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => {
                          if (cat.documents.length > 0) {
                            alert('서식이 포함된 카테고리는 삭제할 수 없습니다. 서식을 먼저 삭제해주세요.');
                            return;
                          }
                          if (confirm(`"${cat.name}" 카테고리를 삭제하시겠습니까?`)) {
                            deleteDocCategoryMutation.mutate(cat.id);
                          }
                        }}
                        className="px-3 py-1 text-sm bg-red-100 text-red-700 hover:bg-red-200 rounded"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-gray-500">등록된 카테고리가 없습니다.</div>
              )}
            </div>
          </div>

          {/* 서식 관리 */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-semibold">서식 목록</h2>
              <button
                onClick={() => {
                  if (!docCategories || docCategories.length === 0) {
                    alert('카테고리를 먼저 등록해주세요.');
                    return;
                  }
                  setShowDocForm(!showDocForm);
                  setEditingDoc(null);
                  setDocFiles([]);
                  setDocThumbnailIndex(undefined);
                }}
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700"
              >
                {showDocForm && !editingDoc ? '취소' : '서식 등록'}
              </button>
            </div>

            {(showDocForm || editingDoc) && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const formData = new FormData();

                  formData.append('category', form.querySelector<HTMLSelectElement>('[name="category"]')?.value || '');
                  formData.append('title', form.querySelector<HTMLInputElement>('[name="title"]')?.value || '');
                  formData.append('description', form.querySelector<HTMLTextAreaElement>('[name="description"]')?.value || '');

                  if (docFiles.length > 0) {
                    docFiles.forEach((file) => formData.append('files', file));
                  } else if (!editingDoc) {
                    alert('파일을 선택해주세요.');
                    return;
                  }

                  if (editingDoc) {
                    updateDocMutation.mutate({ id: editingDoc.id, data: formData });
                  } else {
                    createDocMutation.mutate(formData);
                  }
                }}
                className="p-4 border-b border-gray-200 bg-gray-50"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
                    <select
                      name="category"
                      required
                      defaultValue={editingDoc?.category || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                    >
                      <option value="">선택</option>
                      {docCategories?.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
                    <input
                      type="text"
                      name="title"
                      required
                      defaultValue={editingDoc?.title || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
                    <textarea
                      name="description"
                      rows={2}
                      defaultValue={editingDoc?.description || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <FileDropZone
                      label={editingDoc ? '새 파일 추가' : '파일 업로드'}

                      multiple={true}
                      accept="*/*"
                      files={docFiles}
                      onFilesChange={setDocFiles}
                      coverIndex={docThumbnailIndex}
                      onCoverSelect={setDocThumbnailIndex}
                    />
                  </div>
                </div>

                {/* 수정 시 기존 파일 목록 */}
                {editingDoc && editingDoc.files.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">기존 파일 ({editingDoc.files.length}개) - 이미지 클릭으로 대표 지정</p>
                    <div className="flex flex-wrap gap-2">
                      {editingDoc.files.map((ef) => {
                        const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(ef.original_name);
                        const isThumbnail = editingDoc.thumbnail_id === ef.id;
                        return (
                          <div key={ef.id} className="relative group">
                            {isImage ? (
                              <img
                                src={ef.file}
                                alt={ef.original_name}
                                className={`w-20 h-20 object-contain rounded-lg cursor-pointer bg-gray-50 ${
                                  isThumbnail
                                    ? 'ring-3 ring-green-500 border-2 border-green-500'
                                    : 'border border-gray-200 hover:ring-2 hover:ring-blue-300'
                                }`}
                                onClick={() => setDocThumbnailMutation.mutate({ docId: editingDoc.id, fileId: ef.id })}
                              />
                            ) : (
                              <div className="w-20 h-20 rounded-lg border border-gray-200 bg-gray-50 flex flex-col items-center justify-center">
                                <span className="text-lg font-bold text-gray-400">{ef.original_name.split('.').pop()?.toUpperCase()}</span>
                              </div>
                            )}
                            {isThumbnail && (
                              <span className="absolute -top-2 -left-2 bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">대표</span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`"${ef.original_name}" 파일을 삭제하시겠습니까?`)) {
                                  deleteDocFileMutation.mutate({ docId: editingDoc.id, fileId: ef.id });
                                }
                              }}
                              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                            >
                              X
                            </button>
                            <p className="text-xs text-gray-500 truncate w-20 mt-1">{ef.original_name}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  <button
                    type="submit"
                    disabled={createDocMutation.isPending || updateDocMutation.isPending}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                  >
                    {createDocMutation.isPending || updateDocMutation.isPending ? '저장 중...' : editingDoc ? '수정' : '저장'}
                  </button>
                  {editingDoc && (
                    <button
                      type="button"
                      onClick={() => { setEditingDoc(null); setShowDocForm(false); setDocFiles([]); setDocThumbnailIndex(undefined); }}
                      className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-400"
                    >
                      취소
                    </button>
                  )}
                </div>
              </form>
            )}

            <div className="divide-y divide-gray-200">
              {docCategoriesLoading ? (
                <div className="p-8 text-center text-gray-500">로딩 중...</div>
              ) : docCategories && docCategories.some(c => c.documents.length > 0) ? (
                docCategories.map((cat) =>
                  cat.documents.length > 0 && (
                    <div key={cat.id}>
                      <div className="px-4 py-2 bg-gray-50 border-b">
                        <span className="text-sm font-semibold text-gray-600">{cat.name}</span>
                      </div>
                      {cat.documents.map((doc, idx) => {
                        const thumbFile = doc.thumbnail_id ? doc.files.find(f => f.id === doc.thumbnail_id) : null;
                        const firstFile = doc.files[0];
                        return (
                        <div key={doc.id} className="p-4 flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            {thumbFile && /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(thumbFile.original_name) ? (
                              <img src={thumbFile.file} alt="" className="w-12 h-12 rounded object-cover border" />
                            ) : (
                              <div className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center border text-xs font-bold text-gray-400">
                                {firstFile ? firstFile.original_name.split('.').pop()?.toUpperCase() : 'N/A'}
                              </div>
                            )}
                            <div>
                              <span className="font-medium">{doc.title}</span>
                              <span className="text-xs text-gray-400 ml-2">({doc.files.length}개 파일)</span>
                              {doc.description && <p className="text-xs text-gray-500">{doc.description}</p>}
                              <p className="text-xs text-gray-400">다운로드 {doc.download_count}회 | {new Date(doc.created_at).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                if (idx > 0) {
                                  const prevDoc = cat.documents[idx - 1];
                                  moveDocOrderMutation.mutate({ id: doc.id, order: prevDoc.order });
                                  moveDocOrderMutation.mutate({ id: prevDoc.id, order: doc.order });
                                }
                              }}
                              disabled={idx === 0}
                              className="px-2 py-1 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 rounded disabled:opacity-30"
                            >
                              ↑
                            </button>
                            <button
                              onClick={() => {
                                if (idx < cat.documents.length - 1) {
                                  const nextDoc = cat.documents[idx + 1];
                                  moveDocOrderMutation.mutate({ id: doc.id, order: nextDoc.order });
                                  moveDocOrderMutation.mutate({ id: nextDoc.id, order: doc.order });
                                }
                              }}
                              disabled={idx === cat.documents.length - 1}
                              className="px-2 py-1 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 rounded disabled:opacity-30"
                            >
                              ↓
                            </button>
                            <button
                              onClick={() => {
                                setEditingDoc(doc);
                                setShowDocForm(true);
                                setDocFiles([]);
                                setDocThumbnailIndex(undefined);
                              }}
                              className="px-3 py-1 text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 rounded"
                            >
                              수정
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`"${doc.title}" 서식을 삭제하시겠습니까?`)) {
                                  deleteDocMutation.mutate(doc.id);
                                }
                              }}
                              className="px-3 py-1 text-sm bg-red-100 text-red-700 hover:bg-red-200 rounded"
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )
                )
              ) : (
                <div className="p-8 text-center text-gray-500">등록된 서식이 없습니다.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SMS Tab */}
      {activeTab === 'sms' && (
        <div className="space-y-6">
          {/* 가격표 */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">SMS 가격표</h3>
              <div className="px-4 py-2 bg-green-50 rounded-lg">
                <span className="text-sm text-gray-600">잔여포인트 </span>
                <span className="text-lg font-bold text-green-700">{smsRemain?.point != null ? `${smsRemain.point.toLocaleString()}P` : '-'}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-3 py-1.5 text-center text-xs">단문:SMS</th>
                    <th className="border border-gray-200 px-3 py-1.5 text-center text-xs">장문:LMS</th>
                    <th className="border border-gray-200 px-3 py-1.5 text-center text-xs">그림:MMS</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-200 px-3 py-2.5 text-center font-bold text-green-600">
                      {smsRemain?.SMS_CNT != null ? `${smsRemain.SMS_CNT.toLocaleString()}건` : '-'}
                    </td>
                    <td className="border border-gray-200 px-3 py-2.5 text-center font-bold text-blue-600">
                      {smsRemain?.LMS_CNT != null ? `${smsRemain.LMS_CNT.toLocaleString()}건` : '-'}
                    </td>
                    <td className="border border-gray-200 px-3 py-2.5 text-center font-bold text-purple-600">
                      {smsRemain?.MMS_CNT != null ? `${smsRemain.MMS_CNT.toLocaleString()}건` : '-'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* SMS 발송 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">SMS 발송</h3>

            {/* 클럽 필터 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">수신 대상</label>
              <select
                value={smsClubFilter}
                onChange={(e) => {
                  const val = e.target.value;
                  setSmsClubFilter(val === '' ? '' : Number(val));
                }}
                className="w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
              >
                <option value="">전체 회원</option>
                {allChatRooms?.filter(r => !r.is_public).map(room => (
                  <option key={room.id} value={room.id}>{room.name}</option>
                ))}
              </select>
            </div>

            {/* 회원 선택 */}
            <div className="mb-4">
              <div className="flex items-center mb-2">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smsFilteredUsers.length > 0 && smsSelectedIds.length === smsFilteredUsers.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSmsSelectedIds(smsFilteredUsers.map(u => u.id));
                      } else {
                        setSmsSelectedIds([]);
                      }
                    }}
                    className="mr-2 rounded text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    수신자 전체 선택 ({smsSelectedIds.length}/{smsFilteredUsers.length}명)
                  </span>
                </label>
              </div>
              <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                {smsFilteredUsers.length > 0 ? smsFilteredUsers.map(u => (
                  <label key={u.id} className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smsSelectedIds.includes(u.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSmsSelectedIds(prev => [...prev, u.id]);
                        } else {
                          setSmsSelectedIds(prev => prev.filter(id => id !== u.id));
                        }
                      }}
                      className="mr-3 rounded text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm">{u.username}</span>
                    <span className="text-xs text-gray-400 ml-2">{u.phone}</span>
                  </label>
                )) : (
                  <div className="p-4 text-center text-sm text-gray-500">
                    전화번호가 등록된 회원이 없습니다.
                  </div>
                )}
              </div>
            </div>

            {/* 메시지 입력 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">메시지</label>
              <textarea
                value={smsMessage}
                onChange={(e) => setSmsMessage(e.target.value)}
                rows={4}
                maxLength={2000}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="메시지를 입력하세요..."
              />
              <div className="flex justify-between mt-1">
                <span className={`text-xs ${new TextEncoder().encode(smsMessage).length > 90 ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                  {new TextEncoder().encode(smsMessage).length > 90 ? 'LMS (장문)' : 'SMS (단문)'}
                </span>
                <span className="text-xs text-gray-400">
                  {new TextEncoder().encode(smsMessage).length} byte
                </span>
              </div>
            </div>

            {/* 발송 버튼 */}
            <button
              onClick={async () => {
                if (smsSelectedIds.length === 0) {
                  alert('수신자를 선택해주세요.');
                  return;
                }
                if (!smsMessage.trim()) {
                  alert('메시지를 입력해주세요.');
                  return;
                }
                const msgType = new TextEncoder().encode(smsMessage).length > 90 ? 'LMS' : 'SMS';
                const needed = msgType === 'LMS' ? smsRemain?.LMS_CNT : smsRemain?.SMS_CNT;
                if (needed != null && needed < smsSelectedIds.length) {
                  alert(`포인트가 부족합니다.\n${msgType} 잔여 ${needed}건 / 발송 대상 ${smsSelectedIds.length}명\n\n알리고 사이트에서 포인트를 충전해주세요.`);
                  return;
                }
                if (!confirm(`${smsSelectedIds.length}명에게 ${msgType}를 발송하시겠습니까?`)) return;
                setSmsSending(true);
                try {
                  const result = await smsService.sendSms({
                    recipient_ids: smsSelectedIds,
                    message: smsMessage,
                    msg_type: msgType,
                  });
                  alert(result.message || '발송 완료');
                  setSmsMessage('');
                  setSmsSelectedIds([]);
                  queryClient.invalidateQueries({ queryKey: ['smsHistory'] });
                  queryClient.invalidateQueries({ queryKey: ['smsRemain'] });
                } catch (err: any) {
                  const errMsg = err.response?.data?.error || '발송 실패';
                  if (errMsg.includes('포인트') || err.response?.data?.aligo_response?.result_code === '-100') {
                    alert('포인트가 부족합니다.\n알리고 사이트에서 포인트를 충전해주세요.');
                  } else {
                    alert(errMsg);
                  }
                } finally {
                  setSmsSending(false);
                }
              }}
              disabled={smsSending || smsSelectedIds.length === 0 || !smsMessage.trim()}
              className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
            >
              {smsSending ? '발송 중...' : `SMS 발송 (${smsSelectedIds.length}명)`}
            </button>
          </div>

          {/* 발송 내역 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">발송 내역</h3>
            {smsHistoryLoading ? (
              <Loading />
            ) : smsHistory && smsHistory.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left px-3 py-2">발송일</th>
                      <th className="text-left px-3 py-2">발송자</th>
                      <th className="text-left px-3 py-2">클럽</th>
                      <th className="text-left px-3 py-2">유형</th>
                      <th className="text-left px-3 py-2">수신</th>
                      <th className="text-left px-3 py-2">메시지</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {smsHistory.map((log: SmsLog) => (
                      <tr key={log.id} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-3 py-2">{log.sender_name}</td>
                        <td className="px-3 py-2">{log.club_name || '-'}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${log.msg_type === 'LMS' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                            {log.msg_type}
                          </span>
                        </td>
                        <td className="px-3 py-2">{log.recipients_count}명</td>
                        <td className="px-3 py-2 max-w-xs truncate">{log.message}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button
                              onClick={() => setSmsDetailLog(log)}
                              className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                            >
                              상세
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm('이 발송 내역을 삭제하시겠습니까?')) {
                                  deleteSmsLogMutation.mutate(log.id);
                                }
                              }}
                              className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">발송 내역이 없습니다.</div>
            )}
          </div>
        </div>
      )}

      {/* SMS Detail Modal */}
      {smsDetailLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-semibold">발송 상세</h3>
              <button onClick={() => setSmsDetailLog(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {/* 발송 정보 */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">발송일</span>
                  <p className="font-medium">{new Date(smsDetailLog.created_at).toLocaleString('ko-KR')}</p>
                </div>
                <div>
                  <span className="text-gray-500">발송자</span>
                  <p className="font-medium">{smsDetailLog.sender_name}</p>
                </div>
                <div>
                  <span className="text-gray-500">유형</span>
                  <p>
                    <span className={`px-1.5 py-0.5 rounded text-xs ${smsDetailLog.msg_type === 'LMS' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                      {smsDetailLog.msg_type}
                    </span>
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">수신자 수</span>
                  <p className="font-medium">{smsDetailLog.recipients_count}명</p>
                </div>
              </div>

              {/* 메시지 내용 */}
              <div>
                <span className="text-sm text-gray-500">메시지 내용</span>
                <div className="mt-1 p-3 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap break-words">
                  {smsDetailLog.message}
                </div>
              </div>

              {/* 수신자 목록 */}
              <div>
                <span className="text-sm text-gray-500">수신자 목록</span>
                <div className="mt-1 border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                  {smsDetailLog.recipients_info && smsDetailLog.recipients_info.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b">
                          <th className="text-left px-3 py-1.5 text-xs text-gray-500">이름</th>
                          <th className="text-left px-3 py-1.5 text-xs text-gray-500">전화번호</th>
                        </tr>
                      </thead>
                      <tbody>
                        {smsDetailLog.recipients_info.map((r) => (
                          <tr key={r.id} className="border-b last:border-0">
                            <td className="px-3 py-1.5">{r.username}</td>
                            <td className="px-3 py-1.5 text-gray-600">{r.phone}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-3 text-center text-gray-400 text-sm">수신자 정보 없음</div>
                  )}
                </div>
              </div>
            </div>
            <div className="p-4 border-t">
              <button
                onClick={() => setSmsDetailLog(null)}
                className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Club Assignment Modal */}
      {showClubModal && pendingApprovalUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-semibold">클럽 배정</h3>
              <button
                onClick={() => {
                  setShowClubModal(false);
                  setPendingApprovalUser(null);
                  setPendingApprovalRole('member');
                  setSelectedClubId(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                X
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-4">
                <strong>{pendingApprovalUser.username}</strong>님은 클럽 가입을 희망합니다.
                <br />배정할 클럽을 선택해주세요.
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">클럽 선택</label>
                <select
                  value={selectedClubId || ''}
                  onChange={(e) => setSelectedClubId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                >
                  <option value="">클럽 미배정</option>
                  {allChatRooms?.filter((r) => !r.is_public).map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name} ({room.member_count}명)
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  클럽을 선택하지 않으면 클럽 미배정 상태로 승인됩니다.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowClubModal(false);
                    setPendingApprovalUser(null);
                    setSelectedClubId(null);
                    setPendingApprovalRole('member');
                  }}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  취소
                </button>
                <button
                  onClick={handleApproveWithClub}
                  disabled={approveMutation.isPending}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {approveMutation.isPending ? '처리 중...' : '승인'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BanForm({ roomId, users, onSuccess }: { roomId: number; users: User[]; onSuccess: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      await api.post(`/messenger/rooms/${roomId}/ban_user/`, {
        user_id: Number(formData.get('user_id')),
        ban_type: formData.get('ban_type'),
        reason: formData.get('reason'),
        expires_at: formData.get('expires_at') || null,
      });
      form.reset();
      onSuccess();
      alert('제재가 적용되었습니다.');
    } catch {
      alert('제재 적용에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">대상 회원</label>
          <select
            name="user_id"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
          >
            <option value="">선택하세요</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.username} ({user.email})</option>
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
          disabled={isSubmitting}
          className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
        >
          {isSubmitting ? '처리 중...' : '제재 적용'}
        </button>
      </div>
    </form>
  );
}
