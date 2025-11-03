/* eslint-disable react/prop-types *//* eslint-disable react/prop-types *//* eslint-disable react/prop-types */

import { useState } from "react";

import { Document, Page, pdfjs } from "react-pdf";import { useState, useEffect, useRef, useCallback } from "react";import { useState, useEffect, useRef } from "react";

import "react-pdf/dist/esm/Page/AnnotationLayer.css";

import "react-pdf/dist/esm/Page/TextLayer.css";import { Document, Page, pdfjs } from "react-pdf";import { useCallback } from "react";

import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import "react-pdf/dist/esm/Page/AnnotationLayer.css";import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

import "react-pdf/dist/esm/Page/TextLayer.css";import "react-pdf/dist/esm/Page/AnnotationLayer.css";

export default function PDFViewer({ file, onLoadSuccess, onLoadError }) {

  const [numPages, setNumPages] = useState(null);import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";import "react-pdf/dist/esm/Page/TextLayer.css";



  const handleLoad = ({ numPages }) => {import PDFHighlight from "./PDFHighlight";import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

    setNumPages(numPages);

    onLoadSuccess && onLoadSuccess({ numPages });import PageHighlightOverlay from "./PageHighlightOverlay";

  };

// Configure pdf.js worker for Vite/ESM

  const handleError = (err) => {

    console.error("PDF load error:", err);// Configure pdf.js worker for Vite/ESMpdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

    onLoadError && onLoadError(err);

  };pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;



  const normalizedFile = typeof file === "string" ? { url: file, withCredentials: false } : file;const PDFViewer = ({



// Deprecated: Use BetterPDFViewer instead. This stub avoids build/lint errors.
/* eslint-disable react/prop-types */
import React from "react";
/* eslint-disable react/prop-types */
import React from "react";

// Deprecated: Use BetterPDFViewer instead. This stub avoids build/lint errors.
export default function PDFViewer() {
  return (
    <div style={{ padding: 12, color: "#6b7280", fontSize: 12 }}>
      Deprecated component. Please use BetterPDFViewer.
    </div>
  );
}
/* LEGACY (disabled below)
  <div style={{ padding: "8px 12px", borderBottom: "1px solid #eee", background: "#fafafa" }}>  file,  referenceId,
