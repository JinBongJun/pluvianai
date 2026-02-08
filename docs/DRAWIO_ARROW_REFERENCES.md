# Draw.io Arrow Style References

이 문서는 draw.io 스타일 화살표 구현을 위한 참고 자료들을 정리합니다.

## 발견한 오픈소스 리소스

### 1. ReactFlow 관련 프로젝트

#### react-flow-smart-edge
- **Repository**: https://github.com/tisoap/react-flow-smart-edge
- **Stars**: 342
- **설명**: ReactFlow용 커스텀 엣지로, 노드와 교차하지 않는 경로를 자동으로 찾아줍니다.
- **참고 포인트**: 
  - 커스텀 엣지 구현 패턴
  - SVG 경로 생성 방법
  - `getSmartEdge` 함수로 경로 최적화

#### workflow-editor
- **Repository**: https://github.com/dianaow/workflow-editor
- **설명**: ReactFlow를 사용한 드래그 앤 드롭 워크플로우 에디터
- **참고 포인트**: 커스텀 노드와 엣지 구현 예제

### 2. mxGraph (draw.io의 기반 라이브러리)

**중요**: draw.io는 mxGraph를 기반으로 만들어졌습니다. mxGraph의 실제 구현을 참고하면 더 정확한 draw.io 스타일을 구현할 수 있습니다.

#### mxArrowConnector
- **소스 코드**: https://github.com/jgraph/mxgraph/blob/master/javascript/src/js/shape/mxArrowConnector.js
- **문서**: https://jgraph.github.io/mxgraph/docs/js-api/files/shape/mxArrowConnector-js.html
- **설명**: mxGraph의 화살표 커넥터 구현 (draw.io가 사용하는 실제 엔진)
- **주요 메서드**:
  - `paintMarker()`: 화살표 마커 그리기 - 삼각형 화살표를 그리는 실제 구현
  - `paintEdgeShape()`: 엣지 선 그리기
  - `getStartArrowWidth()` / `getEndArrowWidth()`: 화살표 너비 계산
- **기본값**:
  - `startSize = ARROW_SIZE / 5 * 3` (약 6-8px)
  - `endSize = ARROW_SIZE / 5 * 3`
  - `arrowWidth = ARROW_WIDTH` (약 10px)
  - `edgeWidth = ARROW_WIDTH / 3` (약 3px)
  - `strokeWidth = 1` (기본값)

#### mxArrow
- **문서**: https://jgraph.github.io/mxgraph/docs/js-api/files/shape/mxArrow-js.html
- **설명**: 기본 화살표 모양 구현
- **특징**: 더 단순한 화살표 스타일

### 3. draw.io 공식 리포지토리

- **Repository**: https://github.com/jgraph/drawio
- **Stars**: 3,500+
- **라이선스**: Apache 2.0
- **참고**: 실제 draw.io의 화살표 렌더링 로직을 확인할 수 있음

## Draw.io 화살표 스타일 특징

1. **선 두께**: 일반적으로 1-2px (기본값 1.5px)
2. **화살표 크기**: 10x10 픽셀 정도의 삼각형
3. **화살표 스타일**: 채워진 삼각형 (filled triangle)
4. **라인 스타일**: 둥근 모서리 (`strokeLinecap: 'round'`)
5. **색상**: 엣지 색상과 동일하게 채워짐

## 현재 구현

현재 `DrawIOEdge.tsx`는 다음을 구현합니다:

- 1.5px 두께의 선
- 채워진 삼각형 화살표 (10x10)
- 둥근 모서리
- 보라색 색상 스키마 유지

## 개선 가능한 부분

1. **화살표 크기 조정**: draw.io처럼 선 두께에 따라 화살표 크기 조정
2. **다양한 화살표 스타일**: 시작/끝 화살표, 양방향 화살표 지원
3. **경로 최적화**: react-flow-smart-edge의 패턴을 참고하여 노드와 교차하지 않는 경로 생성

## 참고 링크

- [ReactFlow Custom Edges 문서](https://reactflow.dev/learn/customization/custom-edges)
- [ReactFlow Edge Markers 예제](https://reactflow.dev/examples/edges/markers)
- [mxGraph API 문서](https://jgraph.github.io/mxgraph/docs/js-api/index.html)
- [draw.io Shape XML 형식](https://www.drawio.com/doc/faq/custom-shapes)
