// 자동 셀프 테스트/검증 유틸
// 가벼운 런타임 헬스체크로 사용자가 수동 검증할 필요를 줄이기 위한 모듈

export async function runSelfTests({ referenceId, apiBaseUrl, token }) {
  const results = [];
  const start = Date.now();

  // 1. API Base 형식 검증
  try {
    if (apiBaseUrl && /^https?:\/\//.test(apiBaseUrl)) {
      results.push({ id: "api.base.format", ok: true });
    } else {
      results.push({
        id: "api.base.format",
        ok: false,
        message: "유효한 절대 URL 아님",
      });
    }
  } catch (e) {
    results.push({ id: "api.base.format", ok: false, message: e.message });
  }

  // 2. /health 또는 getPdfInfo 경량 호출
  if (apiBaseUrl && token && /^https?:\/\//.test(apiBaseUrl)) {
    const base = apiBaseUrl.replace(/\/$/, "");
    try {
      const resp = await fetch(base + "/health", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        results.push({ id: "api.health", ok: true });
      } else {
        results.push({
          id: "api.health",
          ok: false,
          message: `HTTP ${resp.status}`,
        });
      }
    } catch (e) {
      results.push({ id: "api.health", ok: false, message: e.message });
    }
  } else {
    results.push({
      id: "api.health",
      ok: false,
      skipped: true,
      message: "apiBase/token 미존재",
    });
  }

  // 3. referenceId 주석 목록(선택) – 큰 부담 없도록 timeout 처리
  if (referenceId && referenceId !== "temp" && apiBaseUrl && token) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4000);
    try {
      const base = apiBaseUrl.replace(/\/$/, "");
      const resp = await fetch(base + "/getAnnotations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ referenceId, reference_id: referenceId }),
        signal: controller.signal,
      });
      clearTimeout(t);
      if (resp.ok) {
        results.push({ id: "api.getAnnotations", ok: true });
      } else {
        results.push({
          id: "api.getAnnotations",
          ok: false,
          message: `HTTP ${resp.status}`,
        });
      }
    } catch (e) {
      results.push({
        id: "api.getAnnotations",
        ok: false,
        message: e.name === "AbortError" ? "timeout" : e.message,
      });
    }
  } else {
    results.push({ id: "api.getAnnotations", ok: false, skipped: true });
  }

  const elapsed = Date.now() - start;
  return { elapsed, results };
}

// 하이라이트 좌표 표준화: base_size < rect 치수 등 비정상 패턴 자동 수정
export function normalizeHighlights(list, pageW, pageH) {
  const out = [];
  for (const h of list || []) {
    if (!h) continue;
    const clone = { ...h };
    const bw = clone.base_size?.width;
    const bh = clone.base_size?.height;
    const logicalW = pageW || bw || 0;
    const logicalH = pageH || bh || 0;

    // base_size가 없거나 0이면 페이지 기본 크기로 채움
    if (!clone.base_size || !(bw > 0 && bh > 0)) {
      clone.base_size = { width: logicalW, height: logicalH };
    }

    // rect/area가 base보다 과도하게 크면 base를 페이지 크기로 재설정
    const sample =
      clone.type === "area"
        ? clone.area
        : Array.isArray(clone.rects) && clone.rects[0];
    if (sample && clone.base_size) {
      const ratioX = sample.width / clone.base_size.width;
      const ratioY = sample.height / clone.base_size.height;
      if (ratioX > 1.2 || ratioY > 1.2) {
        clone.base_size = { width: logicalW, height: logicalH };
      }
    }
    out.push(clone);
  }
  return out;
}
