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

    // 인증 토큰 설정
    if (token) {
      setAuthToken(token);
    }

    if (!refId) {
      setError("참고문헌 ID가 제공되지 않았습니다.");
      setLoading(false);
      return;
    }

    setReferenceId(refId);

    // PDF 정보 및 주석 로드
    loadPdfData(refId, title, pdfUrl);
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
      } else {
        info = await getPdfInfo(refId);
      }

      setPdfInfo(info);

      // 주석 로드 (API 사용 가능할 때만). 실패하더라도 뷰어는 동작하게 함
      if (isApiAvailable()) {
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

  if (!pdfInfo || !pdfInfo.pdfUrl) {
    return (
      <div className="app-container error">
        <div className="error-message">
          <h2>📄 PDF를 찾을 수 없습니다</h2>
          <p>이 참고문헌에 PDF가 연결되어 있지 않습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-row">
          <h1 className="title">{pdfInfo.title}</h1>
          <div className="header-info">
            {pdfInfo.year && <span className="year">{pdfInfo.year}</span>}
            <span className="annotation-count">{annotations.length}개 주석</span>
          </div>
        </div>
      </header>

      <main className="app-main">
        {/** 외부 PDF는 /proxy를 통해 요청하여 CORS/Range 문제를 회피 */}
        {(() => {
          const url = pdfInfo.pdfUrl || "";
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
