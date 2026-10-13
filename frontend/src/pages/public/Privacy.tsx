export default function Privacy() {
  return (
    <div className="bg-white">
      <div className="bg-gradient-to-r from-green-800 to-green-700 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl font-bold text-white">개인정보처리방침</h1>
          <p className="text-green-100 mt-2">Dae Deok gu Golf Association - 대덕구골프협회</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="prose prose-gray max-w-none">
          <p className="text-sm text-gray-500 mb-8">
            대덕구골프협회(이하 "협회")는 회원의 개인정보를 중요시하며, 「개인정보 보호법」을 준수하고 있습니다.
            협회는 개인정보처리방침을 통하여 회원이 제공하는 개인정보가 어떠한 용도와 방식으로 이용되고 있으며,
            개인정보 보호를 위해 어떠한 조치가 취해지고 있는지 알려드립니다.
          </p>

          {/* 제1조 */}
          <section className="mb-10">
            <h2 className="text-lg font-bold text-gray-900 border-b-2 border-green-700 pb-2 mb-4">
              제1조 (개인정보의 처리 목적)
            </h2>
            <p className="text-gray-700 mb-3">협회는 다음의 목적을 위하여 개인정보를 처리합니다.</p>
            <ol className="list-decimal list-inside space-y-2 text-gray-700">
              <li><strong>회원 가입 및 관리</strong>: 본인확인, 개인식별, 가입의사 확인, 서비스 부정이용 방지, 각종 고지·통지, 민원처리</li>
              <li><strong>클럽 운영 및 회원 관리</strong>: 클럽 배정, 클럽 활동 관리, 클럽장 공지사항 전달</li>
              <li><strong>경기 일정 관리</strong>: 경기 일정 등록 및 참가 신청 처리, 참가자 관리</li>
              <li><strong>커뮤니티 서비스 제공</strong>: 게시판 운영, 클럽 메신저 서비스, 갤러리 관리</li>
              <li><strong>협회 운영 지원</strong>: 통계 분석, 서비스 개선, 공지사항 전달</li>
            </ol>
          </section>

          {/* 제2조 */}
          <section className="mb-10">
            <h2 className="text-lg font-bold text-gray-900 border-b-2 border-green-700 pb-2 mb-4">
              제2조 (개인정보의 처리 및 보유 기간)
            </h2>
            <p className="text-gray-700 mb-3">협회는 법령에 따른 개인정보 보유·이용기간 또는 정보주체로부터 개인정보를 수집 시에 동의받은 개인정보 보유·이용기간 내에서 개인정보를 처리·보유합니다.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-300 px-4 py-2 text-left font-medium">처리 목적</th>
                    <th className="border border-gray-300 px-4 py-2 text-left font-medium">보유 기간</th>
                    <th className="border border-gray-300 px-4 py-2 text-left font-medium">근거 법령</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700">
                  <tr>
                    <td className="border border-gray-300 px-4 py-2">회원 가입 정보</td>
                    <td className="border border-gray-300 px-4 py-2">회원 탈퇴 시까지</td>
                    <td className="border border-gray-300 px-4 py-2">개인정보 보호법</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="border border-gray-300 px-4 py-2">소비자 불만 또는 분쟁처리 기록</td>
                    <td className="border border-gray-300 px-4 py-2">3년</td>
                    <td className="border border-gray-300 px-4 py-2">전자상거래법</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-4 py-2">웹사이트 접속 기록</td>
                    <td className="border border-gray-300 px-4 py-2">3개월</td>
                    <td className="border border-gray-300 px-4 py-2">통신비밀보호법</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 제3조 */}
          <section className="mb-10">
            <h2 className="text-lg font-bold text-gray-900 border-b-2 border-green-700 pb-2 mb-4">
              제3조 (처리하는 개인정보 항목)
            </h2>
            <div className="space-y-4 text-gray-700">
              <div>
                <h3 className="font-semibold mb-1">1. 필수 항목</h3>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>성명, 이메일 주소, 비밀번호, 휴대전화번호</li>
                  <li>프로필 사진</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-1">2. 선택 항목</h3>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>Google 계정 정보 (소셜 로그인 시)</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-1">3. 자동 수집 항목</h3>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>접속 IP 주소, 접속 일시, 서비스 이용 기록</li>
                  <li>기기 정보 (브라우저 유형, OS 정보)</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 제4조 */}
          <section className="mb-10">
            <h2 className="text-lg font-bold text-gray-900 border-b-2 border-green-700 pb-2 mb-4">
              제4조 (개인정보의 제3자 제공)
            </h2>
            <p className="text-gray-700 mb-3">
              협회는 정보주체의 개인정보를 제1조에서 명시한 범위 내에서만 처리하며,
              다음의 경우를 제외하고는 동의 없이 본래 목적 범위를 초과하여 처리하거나 제3자에게 제공하지 않습니다.
            </p>
            <ol className="list-decimal list-inside space-y-2 text-gray-700">
              <li>정보주체로부터 별도의 동의를 받은 경우</li>
              <li>법률에 특별한 규정이 있는 경우</li>
              <li>정보주체 또는 법정대리인이 의사표시를 할 수 없는 상태이거나 주소불명 등으로 사전 동의를 받을 수 없는 경우로서 명백히 정보주체 또는 제3자의 급박한 생명, 신체, 재산의 이익을 위하여 필요하다고 인정되는 경우</li>
            </ol>
          </section>

          {/* 제5조 */}
          <section className="mb-10">
            <h2 className="text-lg font-bold text-gray-900 border-b-2 border-green-700 pb-2 mb-4">
              제5조 (개인정보 처리의 위탁)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-300 px-4 py-2 text-left font-medium">수탁업체</th>
                    <th className="border border-gray-300 px-4 py-2 text-left font-medium">위탁 업무</th>
                    <th className="border border-gray-300 px-4 py-2 text-left font-medium">보유 기간</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700">
                  <tr>
                    <td className="border border-gray-300 px-4 py-2">Google LLC</td>
                    <td className="border border-gray-300 px-4 py-2">소셜 로그인 인증</td>
                    <td className="border border-gray-300 px-4 py-2">위탁계약 종료 시</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="border border-gray-300 px-4 py-2">클라우드 호스팅 업체</td>
                    <td className="border border-gray-300 px-4 py-2">서버 운영 및 데이터 저장</td>
                    <td className="border border-gray-300 px-4 py-2">위탁계약 종료 시</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 제6조 */}
          <section className="mb-10">
            <h2 className="text-lg font-bold text-gray-900 border-b-2 border-green-700 pb-2 mb-4">
              제6조 (정보주체의 권리·의무 및 행사 방법)
            </h2>
            <p className="text-gray-700 mb-3">정보주체는 협회에 대해 다음 각 호의 개인정보 보호 관련 권리를 행사할 수 있습니다.</p>
            <ol className="list-decimal list-inside space-y-2 text-gray-700">
              <li>개인정보 열람 요구</li>
              <li>오류 등이 있을 경우 정정 요구</li>
              <li>삭제 요구</li>
              <li>처리정지 요구</li>
            </ol>
            <p className="text-gray-700 mt-3">
              위 권리 행사는 서면, 전자우편 등을 통하여 할 수 있으며, 협회는 지체 없이 조치합니다.
            </p>
          </section>

          {/* 제7조 */}
          <section className="mb-10">
            <h2 className="text-lg font-bold text-gray-900 border-b-2 border-green-700 pb-2 mb-4">
              제7조 (개인정보의 파기)
            </h2>
            <p className="text-gray-700 mb-3">
              협회는 개인정보 보유기간의 경과, 처리목적 달성 등 개인정보가 불필요하게 되었을 때에는 지체 없이 파기합니다.
            </p>
            <div className="space-y-3 text-gray-700">
              <div>
                <h3 className="font-semibold mb-1">1. 파기 절차</h3>
                <p className="ml-4">이용자가 입력한 정보는 목적 달성 후 별도의 DB에 옮겨져 내부 방침 및 기타 관련 법령에 따라 일정기간 저장된 후 혹은 즉시 파기됩니다.</p>
              </div>
              <div>
                <h3 className="font-semibold mb-1">2. 파기 방법</h3>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>전자적 파일 형태: 기록을 재생할 수 없는 기술적 방법을 사용하여 삭제</li>
                  <li>종이에 출력된 정보: 분쇄기로 분쇄하거나 소각하여 파기</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 제8조 */}
          <section className="mb-10">
            <h2 className="text-lg font-bold text-gray-900 border-b-2 border-green-700 pb-2 mb-4">
              제8조 (개인정보의 안전성 확보 조치)
            </h2>
            <p className="text-gray-700 mb-3">협회는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다.</p>
            <ol className="list-decimal list-inside space-y-2 text-gray-700">
              <li><strong>관리적 조치</strong>: 내부관리계획 수립·시행, 정기적 직원 교육</li>
              <li><strong>기술적 조치</strong>: 개인정보 처리시스템의 접근 권한 관리, 접근통제시스템 설치, 고유식별정보 등의 암호화, 보안프로그램 설치</li>
              <li><strong>물리적 조치</strong>: 전산실, 자료보관실 등의 접근통제</li>
              <li><strong>비밀번호 암호화</strong>: 이용자의 비밀번호는 암호화되어 저장 및 관리되며, 본인만이 알 수 있습니다</li>
              <li><strong>통신 암호화</strong>: 개인정보는 SSL/TLS 등의 보안 통신을 통해 전송됩니다</li>
            </ol>
          </section>

          {/* 제9조 */}
          <section className="mb-10">
            <h2 className="text-lg font-bold text-gray-900 border-b-2 border-green-700 pb-2 mb-4">
              제9조 (쿠키의 설치·운영 및 거부)
            </h2>
            <p className="text-gray-700 mb-3">협회는 이용자에게 개별적인 맞춤서비스를 제공하기 위해 쿠키(cookie)를 사용합니다.</p>
            <div className="space-y-3 text-gray-700">
              <div>
                <h3 className="font-semibold mb-1">1. 쿠키의 사용 목적</h3>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>로그인 세션 유지</li>
                  <li>서비스 이용 패턴 분석</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-1">2. 쿠키의 거부 방법</h3>
                <p className="ml-4">이용자는 웹 브라우저의 옵션을 설정하여 모든 쿠키를 허용하거나, 저장될 때마다 확인하거나, 모든 쿠키 저장을 거부할 수 있습니다. 단, 쿠키 저장을 거부할 경우 로그인이 필요한 일부 서비스 이용에 어려움이 있을 수 있습니다.</p>
              </div>
            </div>
          </section>

          {/* 제10조 */}
          <section className="mb-10">
            <h2 className="text-lg font-bold text-gray-900 border-b-2 border-green-700 pb-2 mb-4">
              제10조 (개인정보 보호책임자)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-gray-300">
                <tbody className="text-gray-700">
                  <tr>
                    <td className="border border-gray-300 px-4 py-2 bg-gray-50 font-medium w-1/3">단체명</td>
                    <td className="border border-gray-300 px-4 py-2">대덕구골프협회</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-4 py-2 bg-gray-50 font-medium">개인정보보호책임자</td>
                    <td className="border border-gray-300 px-4 py-2">이현웅</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-4 py-2 bg-gray-50 font-medium">전화</td>
                    <td className="border border-gray-300 px-4 py-2">042-624-7080</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-4 py-2 bg-gray-50 font-medium">팩스</td>
                    <td className="border border-gray-300 px-4 py-2">0504-224-2549</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-4 py-2 bg-gray-50 font-medium">주소</td>
                    <td className="border border-gray-300 px-4 py-2">대전광역시 대덕구 비래동로16번길 13</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-gray-700 mt-3">
              정보주체께서는 서비스 이용 중 발생한 모든 개인정보 보호 관련 문의, 불만처리, 피해구제 등에 관한 사항을 개인정보 보호책임자에게 문의할 수 있습니다. 협회는 정보주체의 문의에 대해 지체 없이 답변 및 처리해드립니다.
            </p>
          </section>

          {/* 제11조 */}
          <section className="mb-10">
            <h2 className="text-lg font-bold text-gray-900 border-b-2 border-green-700 pb-2 mb-4">
              제11조 (권익침해 구제방법)
            </h2>
            <p className="text-gray-700 mb-3">정보주체는 개인정보침해로 인한 구제를 받기 위하여 다음 기관에 분쟁해결이나 상담 등을 신청할 수 있습니다.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-300 px-4 py-2 text-left font-medium">기관</th>
                    <th className="border border-gray-300 px-4 py-2 text-left font-medium">연락처</th>
                    <th className="border border-gray-300 px-4 py-2 text-left font-medium">홈페이지</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700">
                  <tr>
                    <td className="border border-gray-300 px-4 py-2">개인정보분쟁조정위원회</td>
                    <td className="border border-gray-300 px-4 py-2">1833-6972</td>
                    <td className="border border-gray-300 px-4 py-2">www.kopico.go.kr</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="border border-gray-300 px-4 py-2">개인정보침해신고센터</td>
                    <td className="border border-gray-300 px-4 py-2">118</td>
                    <td className="border border-gray-300 px-4 py-2">privacy.kisa.or.kr</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-4 py-2">대검찰청 사이버수사과</td>
                    <td className="border border-gray-300 px-4 py-2">1301</td>
                    <td className="border border-gray-300 px-4 py-2">www.spo.go.kr</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="border border-gray-300 px-4 py-2">경찰청 사이버안전국</td>
                    <td className="border border-gray-300 px-4 py-2">182</td>
                    <td className="border border-gray-300 px-4 py-2">cyberbureau.police.go.kr</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 제12조 */}
          <section className="mb-10">
            <h2 className="text-lg font-bold text-gray-900 border-b-2 border-green-700 pb-2 mb-4">
              제12조 (개인정보 처리방침의 변경)
            </h2>
            <p className="text-gray-700">
              이 개인정보 처리방침은 시행일로부터 적용되며, 법령 및 방침에 따른 변경내용의 추가, 삭제 및 정정이 있는 경우에는
              변경사항의 시행 7일 전부터 공지사항을 통하여 고지할 것입니다.
            </p>
          </section>

          <div className="border-t border-gray-200 pt-6 text-sm text-gray-500 text-center">
            <p>공고일자: 2026년 4월 6일</p>
            <p>시행일자: 2026년 4월 6일</p>
          </div>
        </div>
      </div>
    </div>
  );
}
