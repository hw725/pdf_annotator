/* eslint-disable react/prop-types */
import { useState, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PDFViewer = ({ file, referenceId, initialAnnotations = [], onAnnotationChange, onLoadSuccess, onLoadError }) => {
  const [numPages, setNumPages] = useState(null);
  const [scale] = useState(1.0);
  const [annotations, setAnnotations] = useState(initialAnnotations);
  const containerRef = useRef(null);
  const pageRefs = useRef({});

  useEffect(() => { setAnnotations(initialAnnotations); }, [initialAnnotations]);

  const handleDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    if (onLoadSuccess) onLoadSuccess({ numPages });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid #eee", background: "#fafafa" }}>
        <strong>PDF</strong>
        {numPages ? <span style={{ marginLeft: 8, color: "#666" }}>총 {numPages}페이지</span> : null}
      </div>
      <div ref={containerRef} style={{ flex: 1, overflow: "auto", background: "#f3f4f6", padding: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          {file ? (
            <Document
              file={file}
              onLoadSuccess={handleDocumentLoadSuccess}
              onLoadError={onLoadError}
              loading={<div style={{ padding: 24, color: "#6b7280" }}>PDF 로딩 중...</div>}
              error={<div style={{ padding: 24, color: "#dc2626" }}>PDF를 로드할 수 없습니다.</div>}
            >
              {numPages && Array.from({ length: numPages }, (_, i) => (
                <div key={`page_${i + 1}`} ref={(el) => (pageRefs.current[i + 1] = el)} style={{ position: "relative" }}>
                  <Page
                    pageNumber={i + 1}
                    scale={scale}
                    renderTextLayer
                    renderAnnotationLayer
                    loading={<div style={{ padding: 24, background: "white" }}>페이지 {i + 1} 로딩 중...</div>}
                  />
                </div>
              ))}
            </Document>
          ) : (
            <div style={{ padding: 24, color: "#6b7280" }}>PDF 파일이 없습니다.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PDFViewer;
