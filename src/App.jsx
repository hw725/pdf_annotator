import { useState, useEffect } from "react";
import {
  getPdfInfo,
  getAnnotations,
  setAuthToken,
  isApiAvailable,
} from "./api/refManagerClient";
import PDFViewer from "./components/pdf/BetterPDFViewer";
import "./App.css";

function App() {
  const [referenceId, setReferenceId] = useState(null);
  const [pdfInfo, setPdfInfo] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // URL 파라미터 파싱
    const params = new URLSearchParams(window.location.search);
    const refId = params.get("referenceId");
    const title = params.get("title");
    const pdfUrl = params.get("pdfUrl");
    const token = params.get("token");
    const refManagerApiBaseUrl = params.get("refManagerApiBaseUrl");

    // Base44 파라미터가 없으면 로컬 개발 모드로 판단
    // 기존 Base44 설정을 클리어하여 로컬 환경 보호
    if (!token && !refManagerApiBaseUrl) {
      localStorage.removeItem("base44_auth_token");
      localStorage.removeItem("refmanager_api_url");
    }

    // Base44에서 전달받은 인증 토큰을 localStorage에 저장
    if (token) {
      localStorage.setItem("base44_auth_token", token);
      setAuthToken(token);
    }

    // Base44에서 전달받은 RefManager API URL을 localStorage에 저장
    if (refManagerApiBaseUrl) {
      localStorage.setItem("refmanager_api_url", refManagerApiBaseUrl);
    }

    // 참고문헌 ID와 pdfUrl이 모두 없으면 로컬 임시 모드로 시작
    const effectiveRefId = refId || "temp";
    setReferenceId(effectiveRefId);

    // PDF 정보 및 주석 로드
    loadPdfData(effectiveRefId, title, pdfUrl);
  }, []);

  const loadPdfData = async (refId, urlTitle, urlPdfUrl) => {
    try {
      setLoading(true);
      setError(null);

      // URL에 PDF 정보가 직접 제공된 경우 사용, 그렇지 않으면 API 호출
      let info;
      if (urlPdfUrl) {
        info = {
          referenceId: refId,
          title: urlTitle || "제목 없음",
          pdfUrl: urlPdfUrl,
        };
      } else if (refId === "temp") {
        // 임시 모드: 서버 조회 없이 업로드 유도
        info = {
          referenceId: refId,
          title: urlTitle || "로컬 PDF 세션",
          pdfUrl: null,
        };
      } else {
        info = await getPdfInfo(refId);
      }

      setPdfInfo(info);

      // 주석 로드 (API 사용 가능할 때만). 실패하더라도 뷰어는 동작하게 함
      // refId가 'temp'이거나 없는 경우에는 서버 호출을 생략
      if (isApiAvailable() && refId && refId !== "temp") {
        try {
          const annotationsResponse = await getAnnotations(refId);
          setAnnotations(annotationsResponse.annotations || []);
        } catch (annErr) {
          console.warn("주석 로드 실패 (무시하고 계속 진행):", annErr);
          setAnnotations([]);
        }
      } else {
        setAnnotations([]);
      }
    } catch (err) {
      console.error("데이터 로드 실패:", err);
      setError(err.message || "데이터를 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="app-container loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>PDF를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-container error">
        <div className="error-message">
          <h2>⚠️ 오류 발생</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>다시 시도</button>
        </div>
      </div>
    );
  }

  // pdfUrl이 없어도 뷰어를 띄워 업로드/로컬 세션을 사용할 수 있게 함

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-row">
          <h1 className="title">{pdfInfo?.title || "PDF 주석 뷰어"}</h1>
          <div className="header-info">
            {pdfInfo?.year && <span className="year">{pdfInfo.year}</span>}
            <span className="annotation-count">
              {annotations.length}개 주석
            </span>
          </div>
        </div>
      </header>

      <main className="app-main">
        {/** 외부 PDF는 /proxy를 통해 요청하여 CORS/Range 문제를 회피 */}
        {(() => {
          const url = (pdfInfo && pdfInfo.pdfUrl) || "";
          const proxied = /^https?:\/\//i.test(url)
            ? `/proxy?url=${encodeURIComponent(url)}`
            : url;
          return (
            <PDFViewer
              file={proxied}
              originalPdfUrl={url}
              referenceId={referenceId}
              initialAnnotations={annotations}
              onAnnotationChange={(updatedAnnotations) => {
                setAnnotations(updatedAnnotations);
              }}
            />
          );
        })()}
      </main>
    </div>
  );
}

export default App;
