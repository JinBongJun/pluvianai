# 🎨 AgentGuard UX/UI 가이드

> **목표**: 업계 표준을 준수하는 일관된 사용자 경험 제공 및 접근성 보장  
> **원칙**: 모든 사용자가 쉽고 빠르게 사용할 수 있는 개발자 도구

---

## 📋 목차

1. [디자인 원칙](#1-디자인-원칙)
2. [접근성 (Accessibility)](#2-접근성-accessibility)
3. [반응형 디자인](#3-반응형-디자인)
4. [사용자 플로우 최적화](#4-사용자-플로우-최적화)
5. [에러 처리 및 피드백](#5-에러-처리-및-피드백)
6. [로딩 및 빈 상태](#6-로딩-및-빈-상태)
7. [컴포넌트 설계 원칙](#7-컴포넌트-설계-원칙)
8. [색상 및 타이포그래피](#8-색상-및-타이포그래피)
9. [애니메이션 및 전환](#9-애니메이션-및-전환)
10. [모바일 최적화](#10-모바일-최적화)
11. [성능 최적화](#11-성능-최적화)
12. [체크리스트](#12-체크리스트)

---

## 1. 디자인 원칙

### 1.1 핵심 원칙

**"개발자 도구는 빠르고 명확해야 한다"**

1. **명확성 (Clarity)**
   - 모든 액션의 결과가 즉시 명확해야 함
   - 복잡한 기능도 단순한 인터페이스로 표현
   - 전문 용어 최소화, 직관적인 라벨 사용

2. **속도 (Speed)**
   - 첫 로딩: < 2초
   - 인터랙션 응답: < 100ms
   - 페이지 전환: < 300ms

3. **일관성 (Consistency)**
   - Vercel, Linear, Stripe 같은 모던 SaaS UI 패턴 따르기
   - shadcn/ui 컴포넌트로 일관된 UI 유지
   - 동일한 액션은 동일한 위치에 배치

4. **결과 중심 (Result-Oriented)**
   - 기능 중심이 아닌 "사용자가 원하는 결과" 중심
   - One-Click으로 명확한 결과 제공
   - 불필요한 단계 제거

### 1.2 참고 서비스

**벤치마크 서비스**:
- **Vercel**: 깔끔한 대시보드, 명확한 상태 표시
- **Linear**: 빠른 인터랙션, 키보드 단축키
- **Stripe**: 단계별 온보딩, 명확한 에러 메시지
- **Railway**: 시각화 중심, 직관적인 지도

**패턴 차용**:
- Vercel의 Deployment 로그 뷰어 → Live Stream View
- Railway의 지도 시각화 → Auto-Mapping
- Linear의 빠른 검색 → Global Search

---

## 2. 접근성 (Accessibility)

### 2.1 WCAG 2.1 AA 준수 (필수)

> **목표**: 모든 사용자가 동등하게 사용할 수 있도록 보장

#### 색상 대비

**텍스트 대비 비율**:
- 일반 텍스트: 최소 4.5:1
- 큰 텍스트 (18pt 이상): 최소 3:1
- UI 컴포넌트: 최소 3:1

**구현**:
```css
/* ✅ 좋은 예 */
.text-primary { color: #1a1a1a; } /* 대비 12:1 */
.bg-primary { background: #ffffff; }

/* ❌ 나쁜 예 */
.text-gray { color: #999999; } /* 대비 2.5:1 - 부족 */
```

**검증 도구**:
- Chrome DevTools: Lighthouse Accessibility Audit
- WebAIM Contrast Checker
- axe DevTools

#### 키보드 네비게이션

**필수 기능**:
- 모든 인터랙티브 요소는 키보드로 접근 가능
- Tab 순서가 논리적이어야 함
- 포커스 인디케이터가 명확히 보여야 함

**구현**:
```tsx
// ✅ 좋은 예
<button
  className="focus:ring-2 focus:ring-primary-500 focus:outline-none"
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleClick();
    }
  }}
>
  Click me
</button>

// ❌ 나쁜 예
<div onClick={handleClick}>Click me</div> // 키보드 접근 불가
```

**Tab 순서 규칙**:
1. 왼쪽 → 오른쪽, 위 → 아래
2. 모달: 모달 내부 → 닫기 버튼 → 배경
3. 드롭다운: 트리거 → 메뉴 항목들

#### 스크린 리더 지원

**ARIA 라벨**:
```tsx
// ✅ 좋은 예
<button aria-label="프로젝트 삭제">
  <TrashIcon />
</button>

<div role="alert" aria-live="polite">
  {errorMessage}
</div>

// ❌ 나쁜 예
<button>
  <TrashIcon /> {/* 스크린 리더가 "삭제"를 읽지 못함 */}
</button>
```

**시맨틱 HTML**:
```tsx
// ✅ 좋은 예
<nav aria-label="메인 네비게이션">
  <ul>
    <li><a href="/dashboard">대시보드</a></li>
  </ul>
</nav>

// ❌ 나쁜 예
<div className="nav">
  <div onClick={goToDashboard}>대시보드</div>
</div>
```

#### 포커스 관리

**포커스 트랩 (Modal)**:
```tsx
// Modal 내부에서 Tab 키로 포커스가 밖으로 나가지 않도록
const Modal = ({ isOpen, onClose, children }) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && modalRef.current) {
      // 첫 번째 포커스 가능한 요소로 포커스 이동
      const firstFocusable = modalRef.current.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) as HTMLElement;
      firstFocusable?.focus();
    }
  }, [isOpen]);

  // Tab 키 처리
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      const focusableElements = modalRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      // 포커스 순환 로직
    }
  };

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
};
```

### 2.2 접근성 체크리스트

**모든 컴포넌트에서 확인**:
- [ ] 색상 대비 4.5:1 이상
- [ ] 키보드로 모든 기능 접근 가능
- [ ] 스크린 리더가 모든 정보 읽을 수 있음
- [ ] 포커스 인디케이터 명확함
- [ ] ARIA 라벨 적절히 사용
- [ ] 에러 메시지가 스크린 리더에 전달됨
- [ ] 로딩 상태가 스크린 리더에 전달됨

**검증 도구**:
- Lighthouse Accessibility Score: 90+ 목표
- axe DevTools: 0 violations 목표
- 키보드만으로 전체 플로우 테스트

---

## 3. 반응형 디자인

### 3.1 브레이크포인트

**Tailwind CSS 기본 브레이크포인트**:
```css
/* Mobile First 접근 */
sm: 640px   /* 작은 태블릿 */
md: 768px   /* 태블릿 */
lg: 1024px  /* 작은 데스크톱 */
xl: 1280px  /* 데스크톱 */
2xl: 1536px /* 큰 데스크톱 */
```

**사용 규칙**:
```tsx
// ✅ Mobile First
<div className="
  w-full           /* 모바일: 전체 너비 */
  md:w-1/2         /* 태블릿: 절반 너비 */
  lg:w-1/3         /* 데스크톱: 1/3 너비 */
">
  Content
</div>
```

### 3.2 레이아웃 패턴

#### 대시보드 레이아웃

**데스크톱 (lg+)**:
- 사이드바: 고정 너비 256px
- 메인 콘텐츠: 나머지 공간
- 2-3 컬럼 그리드

**태블릿 (md)**:
- 사이드바: 햄버거 메뉴로 전환
- 메인 콘텐츠: 전체 너비
- 2 컬럼 그리드

**모바일 (sm)**:
- 사이드바: 오버레이 모달
- 메인 콘텐츠: 전체 너비
- 1 컬럼 (스택)

**구현 예시**:
```tsx
<div className="
  flex flex-col
  lg:flex-row
">
  {/* 사이드바 */}
  <aside className="
    hidden
    lg:block lg:w-64 lg:fixed lg:h-screen
  ">
    <Sidebar />
  </aside>

  {/* 메인 콘텐츠 */}
  <main className="
    w-full
    lg:ml-64
  ">
    <Content />
  </main>
</div>
```

#### 테이블/리스트

**데스크톱**: 전체 컬럼 표시
**태블릿**: 중요 컬럼만 표시, 나머지는 "..." 표시
**모바일**: 카드 형태로 전환

```tsx
// 데스크톱: 테이블
<div className="hidden lg:block">
  <table>...</table>
</div>

// 모바일: 카드
<div className="lg:hidden">
  {items.map(item => (
    <Card key={item.id}>...</Card>
  ))}
</div>
```

### 3.3 터치 친화적 디자인

**최소 터치 영역**:
- 버튼: 최소 44x44px (iOS 가이드라인)
- 링크: 최소 44x44px
- 체크박스/라디오: 최소 44x44px

**간격**:
- 버튼 간 간격: 최소 8px
- 터치 영역 간 간격: 최소 16px

```tsx
// ✅ 좋은 예
<button className="
  min-h-[44px] min-w-[44px]
  px-4 py-2
  mb-4
">
  Click
</button>
```

---

## 4. 사용자 플로우 최적화

### 4.1 온보딩 플로우

**목표**: 첫 5분 내 첫 Snapshot 생성

**단계별 설계**:
1. **Welcome (30초)**
   - 프로젝트 이름 입력
   - "Create Project & Continue" 버튼

2. **Quick Start (2분)**
   - cURL 명령어 표시
   - Python/Node.js 코드 스니펫
   - 복사 버튼 (한 번 클릭)

3. **Magic Setup Playground (2분)**
   - 가상 트래픽 생성 버튼
   - 실시간으로 Snapshot 쌓임 시각화
   - 첫 Snapshot 생성 시 축하 모달

4. **Complete (30초)**
   - "You're All Set!" 메시지
   - "Go to Dashboard" 버튼

**최적화 원칙**:
- 각 단계마다 명확한 목표
- 불필요한 입력 최소화
- 진행 상황 표시 (Progress Bar)
- 건너뛰기 옵션 제공

### 4.2 주요 작업 플로우

#### 새 모델 안전성 검증

**플로우**:
1. [새 모델 테스트] 버튼 클릭
2. "최근 100개 트래픽으로 테스트 중..." 표시
3. 진행률 표시 (0% → 100%)
4. 결과 표시: "✅ 안전합니다" 또는 "❌ 위험합니다"

**최적화**:
- 로딩 중 취소 가능
- 예상 소요 시간 표시
- 백그라운드 실행 가능 (Pro)

#### 문제 발생 지점 찾기

**플로우**:
1. [문제 분석] 버튼 클릭
2. 분석 중 상태 표시
3. 결과: 설계도 + 문제 노드 하이라이트
4. 문제 노드 클릭 → 상세 정보 표시

**최적화**:
- 분석 중에도 다른 작업 가능
- 결과를 즉시 공유 가능 (Share 버튼)

### 4.3 네비게이션 패턴

**브레드크럼**:
```
대시보드 > Organizations > My Org > Projects > Project Name > API Calls
```

**사이드바**:
- 현재 페이지 하이라이트
- 접힌 메뉴: 아이콘만 표시
- 확장 메뉴: 아이콘 + 텍스트

**탭 네비게이션**:
- 프로젝트 상세 페이지: API Calls, Quality, Cost, Settings
- 명확한 활성 상태 표시
- 키보드 단축키 지원 (Ctrl+1, Ctrl+2 등)

---

## 5. 에러 처리 및 피드백

### 5.1 에러 메시지 원칙

**명확성**:
- ❌ "에러가 발생했습니다"
- ✅ "프로젝트를 찾을 수 없습니다. 프로젝트가 삭제되었거나 권한이 없습니다."

**해결 방법 제시**:
```tsx
<ErrorDisplay
  title="프로젝트를 찾을 수 없습니다"
  message="이 프로젝트는 삭제되었거나 접근 권한이 없습니다."
  actions={[
    { label: "프로젝트 목록으로", onClick: goToProjects },
    { label: "새 프로젝트 만들기", onClick: createProject }
  ]}
/>
```

**에러 타입별 처리**:
- **네트워크 에러**: "연결을 확인해주세요" + 재시도 버튼
- **권한 에러**: "접근 권한이 없습니다" + 업그레이드 링크
- **서버 에러**: "일시적인 문제가 발생했습니다" + 지원팀 링크
- **검증 에러**: 필드별 구체적인 메시지

### 5.2 성공 피드백

**Toast 알림**:
- 성공: 초록색, 3초 자동 사라짐
- 정보: 파란색, 5초
- 경고: 노란색, 5초
- 에러: 빨간색, 수동 닫기

**인라인 피드백**:
- 폼 제출 성공: 체크 아이콘 + "저장되었습니다"
- 복사 성공: "복사되었습니다" (1초)
- 삭제 성공: "삭제되었습니다" + 실행 취소 버튼 (5초)

### 5.3 확인 다이얼로그

**위험한 액션**:
- 삭제: "정말 삭제하시겠습니까?" + 확인/취소
- 설정 변경: 영향 범위 설명 + 확인/취소

**구현**:
```tsx
<ConfirmDialog
  title="프로젝트 삭제"
  message="이 프로젝트와 모든 데이터가 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다."
  confirmLabel="삭제"
  cancelLabel="취소"
  variant="danger"
  onConfirm={handleDelete}
/>
```

---

## 6. 로딩 및 빈 상태

### 6.1 로딩 상태

**로딩 타입별 처리**:

1. **초기 로딩 (페이지/섹션)**
   - Skeleton UI 사용
   - 예상 콘텐츠 구조 반영

```tsx
<Skeleton>
  <SkeletonHeader />
  <SkeletonList count={5} />
</Skeleton>
```

2. **버튼 로딩**
   - 버튼 내부 스피너
   - "처리 중..." 텍스트
   - 버튼 비활성화

```tsx
<Button disabled={isLoading}>
  {isLoading ? (
    <>
      <Spinner className="mr-2" />
      처리 중...
    </>
  ) : (
    '제출'
  )}
</Button>
```

3. **인라인 로딩**
   - 작은 스피너
   - "로딩 중..." 텍스트 (선택)

4. **전체 화면 로딩**
   - 중앙 스피너
   - 진행률 표시 (가능한 경우)

### 6.2 빈 상태 (Empty States)

**Empty State 설계 원칙**:
- 명확한 메시지
- 다음 액션 제시
- 시각적 요소 (아이콘/일러스트)

**타입별 Empty State**:

1. **Cold Start (프로젝트 생성 후)**
```tsx
<EmptyState
  icon={<Zap />}
  title="첫 Snapshot을 생성해보세요"
  description="프로젝트를 설정하고 API를 호출하면 자동으로 모니터링됩니다."
  actions={[
    { label: "Quick Start 가이드", onClick: showQuickStart },
    { label: "가상 트래픽 생성", onClick: simulateTraffic }
  ]}
/>
```

2. **검색 결과 없음**
```tsx
<EmptyState
  icon={<Search />}
  title="검색 결과가 없습니다"
  description="다른 키워드로 검색해보세요."
  actions={[
    { label: "필터 초기화", onClick: resetFilters }
  ]}
/>
```

3. **권한 없음**
```tsx
<EmptyState
  icon={<Lock />}
  title="접근 권한이 없습니다"
  description="이 프로젝트에 접근하려면 관리자에게 권한을 요청하세요."
  actions={[
    { label: "프로젝트 목록으로", onClick: goToProjects }
  ]}
/>
```

### 6.3 부분 로딩 (Optimistic UI)

**즉시 피드백 제공**:
```tsx
// 좋아요 버튼 예시
const handleLike = async () => {
  // 1. 즉시 UI 업데이트 (Optimistic)
  setLiked(true);
  setLikeCount(prev => prev + 1);

  try {
    // 2. 서버 요청
    await api.like(id);
  } catch (error) {
    // 3. 실패 시 롤백
    setLiked(false);
    setLikeCount(prev => prev - 1);
    toast.error("좋아요에 실패했습니다");
  }
};
```

---

## 7. 컴포넌트 설계 원칙

### 7.1 컴포넌트 구조

**원칙**:
- 재사용 가능한 컴포넌트
- Props로 커스터마이징 가능
- 기본값 제공

**예시**:
```tsx
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  children,
  onClick
}) => {
  return (
    <button
      className={cn(
        'base-button-styles',
        variantStyles[variant],
        sizeStyles[size],
        (isLoading || disabled) && 'opacity-50 cursor-not-allowed'
      )}
      disabled={disabled || isLoading}
      onClick={onClick}
    >
      {isLoading ? <Spinner /> : children}
    </button>
  );
};
```

### 7.2 상태 관리

**로컬 상태**: `useState`
**서버 상태**: `TanStack Query` (React Query)
**전역 상태**: `Zustand` (필요시)

**패턴**:
```tsx
// 서버 데이터는 React Query로
const { data, isLoading, error } = useQuery({
  queryKey: ['projects'],
  queryFn: () => projectsAPI.list()
});

// UI 상태는 useState로
const [isModalOpen, setIsModalOpen] = useState(false);
```

### 7.3 폼 처리

**검증**:
- 클라이언트: 실시간 검증
- 서버: 최종 검증

**에러 표시**:
- 필드별 에러 메시지
- 제출 시 모든 에러 표시

```tsx
const { register, handleSubmit, formState: { errors } } = useForm();

<form onSubmit={handleSubmit(onSubmit)}>
  <input
    {...register('email', {
      required: '이메일을 입력해주세요',
      pattern: {
        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
        message: '올바른 이메일 형식이 아닙니다'
      }
    })}
  />
  {errors.email && (
    <span className="text-red-500 text-sm">
      {errors.email.message}
    </span>
  )}
</form>
```

---

## 8. 색상 및 타이포그래피

### 8.1 색상 시스템 (Guardian Prestige 톤)

> **컨셉**: 조용한 고급스러움, 신뢰, 관제실 무드  
> **원칙**: 딥 그린 베이스 + 은은한 골드 포인트, 순수 흰색 배경은 사용하지 않음

**Base / Surface**
- Base (앱 배경): `#0A0D0B`
- Surface (카드/섹션): `#121712`

**Primary (Deep Emerald)**
- Primary: `#0E4A2F`
- Primary Hover: `#14653D`

**Accent (Muted Gold)**
- Accent: `#B79A3E`
- Accent Light: `#D1B45F`

**Text**
- Main Text: `#E7E7E2`
- Sub Text: `#A7ADA3`

**Semantic Colors**
- Success: `#22C55E`
- Error: `#EF4444`
- Warning: `#F59E0B`
- Info: `#38BDF8`

**사용 원칙**
- 골드 포인트는 전체 UI의 10~15% 이내로 제한
- 버튼, 활성 탭, 배지, 핵심 그래프 라인 정도에만 적용
- 카드/섹션은 항상 Surface 톤을 사용하고 `#FFFFFF` 배경 금지

**구현 예시 (Tailwind 변수 형태)**:
```css
:root {
  --ag-bg: #0a0d0b;
  --ag-surface: #121712;
  --ag-primary: #0e4a2f;
  --ag-primary-hover: #14653d;
  --ag-accent: #b79a3e;
  --ag-accent-light: #d1b45f;
  --ag-text: #e7e7e2;
  --ag-text-muted: #a7ada3;
}
```

### 8.2 타이포그래피

**폰트 스택**:
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 
  'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 
  'Helvetica Neue', sans-serif;
```

**타입 스케일**:
- H1: 2.25rem (36px) - 페이지 제목
- H2: 1.875rem (30px) - 섹션 제목
- H3: 1.5rem (24px) - 서브섹션
- Body: 1rem (16px) - 본문
- Small: 0.875rem (14px) - 보조 텍스트
- Caption: 0.75rem (12px) - 캡션

**가중치**:
- Regular: 400
- Medium: 500
- Semibold: 600
- Bold: 700

**행간 (Line Height)**:
- 제목: 1.2
- 본문: 1.5
- 작은 텍스트: 1.4

---

## 9. 애니메이션 및 전환

### 9.1 애니메이션 원칙

**목적**:
- 상태 변화를 시각적으로 전달
- 사용자 주의를 적절히 유도
- 과도한 애니메이션은 피하기

**지속 시간**:
- 빠른 전환: 150ms (호버, 클릭)
- 일반 전환: 300ms (모달, 페이지 전환)
- 느린 전환: 500ms (복잡한 레이아웃 변경)

### 9.2 전환 효과

**페이지 전환**:
```tsx
// Fade in
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.3 }}
>
  {content}
</motion.div>
```

**모달**:
```tsx
// Slide up + Fade
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: 20 }}
  transition={{ duration: 0.3 }}
>
  {modalContent}
</motion.div>
```

**리스트 아이템**:
```tsx
// Stagger animation
{items.map((item, index) => (
  <motion.div
    key={item.id}
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: index * 0.05 }}
  >
    {item.content}
  </motion.div>
))}
```

### 9.3 로딩 애니메이션

**스피너**:
- 회전 애니메이션
- 부드러운 easing

**Skeleton**:
- 펄스 애니메이션
- 실제 콘텐츠 구조 반영

**프로그레스 바**:
- 부드러운 진행 애니메이션
- 예상 시간 표시

---

## 10. 모바일 최적화

### 10.1 터치 최적화

**터치 영역**:
- 최소 44x44px
- 충분한 간격 (16px 이상)

**제스처**:
- 스와이프: 리스트 삭제, 탭 전환
- Pull to refresh: 리스트 새로고침
- 핀치 줌: 지도 확대/축소

### 10.2 모바일 네비게이션

**하단 네비게이션**:
- 주요 페이지 4-5개
- 현재 페이지 하이라이트

**햄버거 메뉴**:
- 왼쪽 상단
- 오버레이 모달
- 닫기 버튼 명확히

### 10.3 모바일 폼

**입력 필드**:
- 자동 포커스 (적절한 경우)
- 적절한 키보드 타입 (email, number 등)
- 입력 힌트 제공

**제출 버튼**:
- 하단 고정 (Sticky)
- 충분한 크기
- 로딩 상태 명확히

---

## 11. 성능 최적화

### 11.1 로딩 성능

**목표**:
- First Contentful Paint (FCP): < 1.8초
- Largest Contentful Paint (LCP): < 2.5초
- Time to Interactive (TTI): < 3.8초

**최적화 기법**:
- 코드 스플리팅
- 이미지 최적화 (WebP, lazy loading)
- 폰트 최적화 (preload, subset)
- CSS 최적화 (Critical CSS)

### 11.2 런타임 성능

**목표**:
- 60 FPS 유지
- 인터랙션 응답: < 100ms

**최적화 기법**:
- React.memo (불필요한 리렌더링 방지)
- useMemo, useCallback (비용 높은 계산 메모이제이션)
- 가상화 (긴 리스트)
- 디바운싱/스로틀링 (검색, 스크롤)

```tsx
// 가상화 예시 (긴 리스트)
import { useVirtualizer } from '@tanstack/react-virtual';

const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 50,
});
```

---

## 12. 체크리스트

### 12.1 컴포넌트 개발 체크리스트

**기능**:
- [ ] 요구사항대로 동작하는가?
- [ ] 에러 상태 처리하는가?
- [ ] 로딩 상태 처리하는가?
- [ ] 빈 상태 처리하는가?

**접근성**:
- [ ] 키보드로 접근 가능한가?
- [ ] 스크린 리더가 읽을 수 있는가?
- [ ] 색상 대비 4.5:1 이상인가?
- [ ] 포커스 인디케이터가 명확한가?

**반응형**:
- [ ] 모바일에서 잘 보이는가?
- [ ] 태블릿에서 잘 보이는가?
- [ ] 데스크톱에서 잘 보이는가?

**성능**:
- [ ] 불필요한 리렌더링이 없는가?
- [ ] 애니메이션이 부드러운가?
- [ ] 로딩이 빠른가?

### 12.2 페이지 개발 체크리스트

**사용자 경험**:
- [ ] 명확한 목적이 있는가?
- [ ] 사용자 플로우가 직관적인가?
- [ ] 에러 메시지가 명확한가?
- [ ] 성공 피드백이 있는가?

**성능**:
- [ ] 초기 로딩 < 2초인가?
- [ ] 인터랙션 응답 < 100ms인가?

**접근성**:
- [ ] Lighthouse Accessibility Score 90+인가?
- [ ] 키보드만으로 사용 가능한가?

---

## 13. 프레임 및 통일된 앱 쉘 (App Shell)

### 13.1 상단 헤더 (TopHeader)
- **높이**: 고정 `h-14` (56px)
- **구성**:
  - 좌측: AG 로고 (클릭 시 `/organizations` 이동), 브레드크럼
  - 우측: 검색(⌘K), 알림, 도움말, 프로필 메뉴
- **스타일**: `bg-ag-bg/90`, `backdrop-blur`, 하단 보더 `border-white/10`

### 13.2 사이드바 (Sidebar)
- **너비**: 고정 `w-64` (256px)
- **구성**: 
  - 조직/프로젝트 네비게이션 중심
  - 하단: 현재 사용자 요약 (아바타, 플랜)
- **스타일**: `bg-ag-surface`, 우측 보더 `border-white/10`

### 13.3 페이지 레이아웃 (Layouts)
- **DashboardLayout**: 프로젝트 내부 페이지용 (사이드바 + 상단 헤더)
- **OrgLayout**: 조직 수준 페이지용 (사이드바 + 상단 헤더)
- **콘텐츠 영역**: `p-8` (32px) 패딩, 최대 너비 `max-w-7xl` 중앙 정렬

---

## 📚 참고 자료

### 업계 표준
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Material Design Guidelines](https://material.io/design)
- [Human Interface Guidelines (Apple)](https://developer.apple.com/design/human-interface-guidelines/)

### 도구
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)
- [axe DevTools](https://www.deque.com/axe/devtools/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)

### 벤치마크 서비스
- [Vercel Dashboard](https://vercel.com/dashboard)
- [Linear](https://linear.app)
- [Stripe Dashboard](https://dashboard.stripe.com)
- [Railway](https://railway.app)

---

**작성일**: 2026-01-26  
**버전**: 1.0.0  
**작성자**: AI Assistant + User

**중요**: 모든 프론트엔드 개발 시 이 문서를 반드시 참고하여 일관된 UX/UI를 유지하세요.
