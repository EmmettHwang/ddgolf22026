import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { noticesService } from '../../services/notices';
import ClubImageModal from '../../components/common/ClubImageModal';
import type { PublicClubItem, History } from '../../types';

type Section = 'greeting' | 'clubs' | 'executives';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function About() {
  const [activeSection, setActiveSection] = useState<Section>('greeting');
  const [selectedClub, setSelectedClub] = useState<PublicClubItem | null>(null);

  const { data: aboutContent } = useQuery({
    queryKey: ['aboutContent'],
    queryFn: () => noticesService.getAboutContent(),
  });

  const { data: histories } = useQuery({
    queryKey: ['histories'],
    queryFn: () => noticesService.getHistories(),
    enabled: activeSection === 'greeting',
  });

  const { data: clubs } = useQuery({
    queryKey: ['publicClubs'],
    queryFn: () => noticesService.getPublicClubs(),
    enabled: activeSection === 'clubs',
  });

  const { data: executives } = useQuery({
    queryKey: ['executives'],
    queryFn: () => noticesService.getExecutives(),
    enabled: activeSection === 'executives',
  });

  const getImageUrl = (path: string | null | undefined) => {
    if (!path) return null;
    if (path.startsWith('http') || path.startsWith('/media/')) return path;
    return `${API_BASE}${path}`;
  };

  const sections: { key: Section; label: string }[] = [
    { key: 'greeting', label: '인사말' },
    { key: 'clubs', label: '클럽현황' },
    { key: 'executives', label: '협회임원' },
  ];

  return (
    <div className="bg-white">
      {/* Page Header */}
      <div className="bg-gradient-to-r from-green-800 to-green-700 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl font-bold text-white">협회소개</h1>
          <p className="text-green-100 mt-2">Dae Deok gu Golf Association - 대덕구골프협회</p>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="bg-gray-50 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <p className="text-sm text-gray-500">홈 &gt; 협회소개 &gt; {sections.find(s => s.key === activeSection)?.label}</p>
        </div>
      </div>

      {/* Sub Navigation */}
      <div className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="-mb-px flex gap-x-6">
            {sections.map((section) => (
              <button
                key={section.key}
                onClick={() => setActiveSection(section.key)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeSection === section.key
                    ? 'border-green-700 text-green-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {section.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* 인사말 + 연혁 */}
        {activeSection === 'greeting' && (
          <div className="space-y-12">
            {/* 인사말 */}
            <section>
              <h2 className="text-2xl font-bold text-gray-800 mb-6 pb-3 border-b-2 border-green-700">
                인사말
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2">
                  {aboutContent?.greeting_text ? (
                    aboutContent.greeting_text.split('\n').map((line, i) => (
                      <p key={i} className="text-gray-600 leading-relaxed mb-4">
                        {line}
                      </p>
                    ))
                  ) : (
                    <>
                      <p className="text-gray-600 leading-relaxed mb-4">
                        안녕하십니까. 대덕구골프협회 홈페이지를 방문해 주신 여러분을 진심으로 환영합니다.
                      </p>
                      <p className="text-gray-600 leading-relaxed mb-4">
                        본 협회는 골프 스포츠의 진흥과 보급을 통하여 골프 저변확대를 위한 목적으로
                        설립되었으며, 골프 발전에 전력하고 있습니다.
                      </p>
                      <p className="text-gray-600 leading-relaxed mb-4">
                        우리 협회는 회원 여러분의 골프 실력 향상과 친목 도모를 위해 다양한 프로그램을
                        운영하고 있으며, 정기적인 대회와 모임을 통해 회원 간의 유대를 강화하고 있습니다.
                      </p>
                      <p className="text-gray-600 leading-relaxed">
                        앞으로도 회원 여러분의 많은 관심과 참여를 부탁드리며, 대덕구골프협회가 여러분과
                        함께 성장할 수 있도록 최선을 다하겠습니다. 감사합니다.
                      </p>
                    </>
                  )}
                  <p className="mt-6 text-right text-gray-700 font-medium">
                    {aboutContent?.greeting_author || '대덕구골프협회장'}
                  </p>
                </div>
                <div className="flex items-start justify-center">
                  <img
                    src={getImageUrl(aboutContent?.greeting_image) || '/images/chairman.jpg'}
                    alt="협회장"
                    className="w-full sm:w-48 rounded-lg shadow-md object-cover"
                  />
                </div>
              </div>
            </section>

            {/* 연혁 (인사말 아래에 바로 표시) */}
            {histories && histories.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold text-gray-800 mb-6 pb-3 border-b-2 border-green-700">
                  연혁
                </h2>
                <div className="relative">
                  <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-green-200" />
                  <div className="space-y-6">
                    {histories.map((item: History) => (
                      <div key={item.id} className="relative flex items-start gap-6 pl-4">
                        <div className="relative z-10 flex-shrink-0 w-8 h-8 bg-green-700 rounded-full flex items-center justify-center">
                          <div className="w-2.5 h-2.5 bg-white rounded-full" />
                        </div>
                        <div className="flex-1 pb-2">
                          <span className="inline-block bg-green-700 text-white text-sm font-bold px-3 py-1 rounded mb-2">
                            {item.year}
                          </span>
                          <p className="text-gray-700 leading-relaxed">{item.content}</p>
                          {item.detail && (
                            <p className="text-sm text-gray-500 mt-1 leading-relaxed">{item.detail}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {/* 클럽현황 */}
        {activeSection === 'clubs' && (
          <section>
            <h2 className="text-2xl font-bold text-gray-800 mb-6 pb-3 border-b-2 border-green-700">
              클럽현황
            </h2>
            {clubs && clubs.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {clubs.map((club) => (
                  <div
                    key={club.id}
                    onClick={() => setSelectedClub(club)}
                    className="bg-gray-50 rounded-lg p-6 text-center border border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
                  >
                    {club.icon ? (
                      <img
                        src={club.icon}
                        alt={club.name}
                        className="w-14 h-14 rounded-full object-cover mx-auto mb-3"
                      />
                    ) : (
                      <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg className="w-7 h-7 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                    )}
                    <h3 className="font-bold text-gray-800">{club.name}</h3>
                    <p className="text-sm text-green-700 font-medium mt-1">{club.member_count}명</p>
                    {club.description && (
                      <p className="text-sm text-gray-500 mt-1">{club.description}</p>
                    )}
                    {club.images && club.images.length > 0 && (
                      <p className="text-xs text-gray-400 mt-2">사진 {club.images.length}장</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">등록된 클럽이 없습니다.</p>
            )}
          </section>
        )}

        {/* 협회임원 */}
        {activeSection === 'executives' && (
          <section>
            <h2 className="text-2xl font-bold text-gray-800 mb-6 pb-3 border-b-2 border-green-700">
              협회임원
            </h2>
            {executives && executives.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                {executives.map((exec) => (
                  <div
                    key={exec.id}
                    className="bg-white rounded-lg border border-gray-200 p-3 text-center hover:shadow-md transition-shadow"
                  >
                    {exec.photo ? (
                      <img
                        src={getImageUrl(exec.photo) || ''}
                        alt={exec.name}
                        className="w-14 h-14 rounded-full object-cover mx-auto mb-2"
                      />
                    ) : (
                      <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
                        <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                    )}
                    <h3 className="text-sm font-bold text-gray-800 truncate">{exec.name}</h3>
                    {exec.phone && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{exec.phone}</p>
                    )}
                    {exec.greeting && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-tight">{exec.greeting}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">등록된 임원 정보가 없습니다.</p>
            )}
          </section>
        )}
      </div>

      {/* 클럽 이미지 모달 */}
      {selectedClub && (
        <ClubImageModal
          images={selectedClub.images || []}
          clubName={selectedClub.name}
          onClose={() => setSelectedClub(null)}
        />
      )}
    </div>
  );
}
