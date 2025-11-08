import { useState, useEffect } from "react";
import {
  getPdfInfo,
  getAnnotations,
  setAuthToken,
  isApiAvailable,
} from "./api/refManagerClient";
import PDFViewer from "./components/pdf/BetterPDFViewer";
import "./App.css";
import { useMemo } from "react";

function App() {
  const [referenceId, setReferenceId] = useState(null);
  const [pdfInfo, setPdfInfo] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pdfValid, setPdfValid] = useState(true);
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const debugMode = useMemo(
    () => localStorage.getItem("debug_refmanager") === "true",
    []
  );

  useEffect(() => {
    // URL 파라미터 파싱
    const params = new URLSearchParams(window.location.search);
    const refId = params.get("referenceId");
    const title = params.get("title");
    const pdfUrl = params.get("pdfUrl");
    // token 기본은 token, 보조로 auth_token도 허용
    const token = params.get("token") || params.get("auth_token");
    // RefManager에서 전달하는 API URL은 apiUrl로 제공됨. 하위 호환을 위해 두 키 모두 지원
    const refManagerApiBaseUrl =
      params.get("refManagerApiBaseUrl") ||
      params.get("apiUrl") ||
      params.get("api_url");

    // Base44 파라미터가 없더라도, 배포 환경에서는 기존 API URL을 지우지 않습니다.
    // (새로고침/직접 접속 시 프록시로 강제 폴백되어 500이 발생할 수 있음)
    // 로컬 개발(localhost/127.0.0.1) 또는 명시적 clear=1 파라미터일 때만 초기화
    const isLocalhost = /^(localhost|127\.0\.0\.1)$/.test(
      window.location.hostname
    );
    const shouldClear = params.get("clear") === "1";
    if (!token && !refManagerApiBaseUrl) {
      if (isLocalhost || shouldClear) {
        localStorage.removeItem("base44_auth_token");
        localStorage.removeItem("refmanager_api_url");
      }
    }

    // Base44에서 전달받은 인증 토큰을 localStorage에 저장
    if (token) {
      localStorage.setItem("base44_auth_token", token);
      setAuthToken(token);
    }

    // Base44에서 전달받은 RefManager API URL을 localStorage에 저장
    if (refManagerApiBaseUrl) {
      localStorage.setItem("refmanager_api_url", refManagerApiBaseUrl);
      if (localStorage.getItem("debug_refmanager") === "true") {
        console.log(
          "[Annotator] Set RefManager API Base from URL:",
          refManagerApiBaseUrl
        );
      }
    } else {
      // 유지된 API Base를 사용 중인지 디버그 로그로 확인
      const existing = localStorage.getItem("refmanager_api_url");
      if (existing && localStorage.getItem("debug_refmanager") === "true") {
        console.log(
          "[Annotator] Using persisted RefManager API Base:",
          existing
        );
      }
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

  // PDF 사전 검증: 응답이 실제 PDF인지 확인 (서버가 HTML/에러 페이지를 반환하는 경우 대비)
  useEffect(() => {
    (async () => {
      try {
        setPdfValid(true);
        const url = pdfInfo?.pdfUrl || "";
        if (!url) return;
        const proxied = /^https?:\/\//i.test(url)
          ? `/api/proxy?url=${encodeURIComponent(url)}`
          : url;

        // 첫 5바이트만 받아서 %PDF- 시그니처 확인
        const res = await fetch(proxied, { headers: { Range: "bytes=0-4" } });
        if (!res.ok) {
          setError(`PDF 접근 실패: HTTP ${res.status}`);
          setPdfValid(false);
          return;
        }
        const ct = res.headers.get("content-type") || "";
        const ab = await res.arrayBuffer();
        const bytes = new Uint8Array(ab);
        const isPdf =
          bytes.length >= 5 &&
          bytes[0] === 0x25 && // %
          bytes[1] === 0x50 && // P
          bytes[2] === 0x44 && // D
          bytes[3] === 0x46 && // F
          bytes[4] === 0x2d; // -
        if (!isPdf) {
          setError(
            `PDF가 아닌 응답이 반환되었습니다. Content-Type: ${
              ct || "(알 수 없음)"
            }`
          );
          setPdfValid(false);
        }
      } catch (e) {
        console.warn("PDF 사전 검증 실패(계속 진행)", e);
      }
    })();
  }, [pdfInfo?.pdfUrl]);

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
            {debugMode && (
              <button
                className="btn btn-sm"
                style={{ marginLeft: 12 }}
                onClick={() => setDebugPanelOpen((o) => !o)}
              >
                {debugPanelOpen ? "디버그 닫기" : "디버그"}
              </button>
            )}
          </div>
        </div>
      </header>

      {debugMode && debugPanelOpen && <DebugPanel referenceId={referenceId} />}

      <main className="app-main">
        {/** 외부 PDF는 /api/proxy를 통해 요청하여 CORS/Range 문제를 회피 */}
        {(() => {
          const url = (pdfInfo && pdfInfo.pdfUrl) || "";
          const proxied = /^https?:\/\//i.test(url)
            ? `/api/proxy?url=${encodeURIComponent(url)}`
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

function DebugPanel({ referenceId }) {
  const tokenKeys = [
    "base44_auth_token",
    "base44-token",
    "base44_token",
    "auth_token",
    "token",
  ];
  const tokens = tokenKeys
    .map((k) => ({ key: k, value: localStorage.getItem(k) }))
    .filter((t) => t.value);
  const apiUrl = localStorage.getItem("refmanager_api_url") || "(없음)";
  const effectiveToken = tokens[0]?.value || "(토큰 없음)";

  const copy = (text) => {
    try {
      navigator.clipboard.writeText(text);
      alert("복사 완료");
    } catch (e) {
      console.warn("클립보드 복사 실패", e);
    }
  };

  const pingApi = async () => {
    try {
      const base = apiUrl.replace(/\/$/, "");
      const resp = await fetch(base + "/health", {
        headers: {
          Authorization: effectiveToken ? `Bearer ${effectiveToken}` : "",
        },
      });
      const text = await resp.text();
      alert(`Health 응답: HTTP ${resp.status}\n${text.slice(0, 300)}`);
    } catch (e) {
      alert("Health 호출 실패: " + (e.message || e));
    }
  };

  const testList = async () => {
    if (!referenceId || referenceId === "temp") {
      alert("referenceId가 필요합니다.");
      return;
    }
    try {
      const base = apiUrl.replace(/\/$/, "");
      const body = JSON.stringify({ referenceId, reference_id: referenceId });
      const resp = await fetch(base + "/getAnnotations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: effectiveToken ? `Bearer ${effectiveToken}` : "",
        },
        body,
      });
      const text = await resp.text();
      alert(`getAnnotations: HTTP ${resp.status}\n${text.slice(0, 800)}`);
    } catch (e) {
      alert("getAnnotations 테스트 실패: " + (e.message || e));
    }
  };

  return (
    <div
      style={{
        background: "#1f2937",
        color: "#f9fafb",
        padding: "12px 16px",
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>디버그 패널</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontWeight: 600 }}>API Base</div>
          <div style={{ wordBreak: "break-all" }}>{apiUrl}</div>
          <button
            className="btn btn-sm"
            style={{ marginTop: 4 }}
            onClick={() => copy(apiUrl)}
          >
            복사
          </button>
        </div>
        <div>
          <div style={{ fontWeight: 600 }}>Token Candidates</div>
          {tokens.length === 0 && <div>(발견된 토큰 없음)</div>}
          {tokens.map((t) => (
            <div
              key={t.key}
              style={{ marginBottom: 4 }}
            >
              <span style={{ color: "#93c5fd" }}>{t.key}:</span>{" "}
              <span style={{ wordBreak: "break-all" }}>
                {t.value.slice(0, 60)}...
              </span>
              <button
                className="btn btn-sm"
                style={{ marginLeft: 6 }}
                onClick={() => copy(t.value)}
              >
                복사
              </button>
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontWeight: 600 }}>Quick Actions</div>
          <button
            className="btn btn-sm"
            onClick={pingApi}
          >
            /health 호출
          </button>
          <button
            className="btn btn-sm"
            style={{ marginLeft: 6 }}
            onClick={testList}
          >
            getAnnotations 테스트
          </button>
        </div>
      </div>
    </div>
  );
}
