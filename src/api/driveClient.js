/**
 * Google Drive API 클라이언트 (refmanager에서 포팅)
 */

let gapiLoaded = false;
let gsiLoaded = false;
let tokenClient = null;
let accessToken = null;
let lastTokenResponse = null; // 최근 토큰 응답 저장 (디버그용)

// 디버그 플래그
function isDriveDebugEnabled() {
  return localStorage.getItem("debug_drive") === "true";
}

function driveDebugLog(label, data) {
  if (!isDriveDebugEnabled()) return;
  try {
    console.log(`[DriveDebug] ${label}`, data);
  } catch (e) {
    // ignore
  }
}

const loadGapi = () => {
  return new Promise((resolve) => {
    if (gapiLoaded) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => {
      try {
        // gapi client만 로드하고 discovery는 생략 (fetch 기반으로 Drive 호출)
        window.gapi.load("client", async () => {
          try {
            // 초기화는 선택적 — 일부 환경에서 discovery 호출이 502를 유발함
            const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
            if (apiKey) {
              await window.gapi.client.init({ apiKey });
            }
          } catch (e) {
            console.warn("gapi.client.init 경고(무시):", e?.message || e);
          } finally {
            gapiLoaded = true;
            console.log("✅ Google API 클라이언트 로드(경량 모드)");
            resolve();
          }
        });
      } catch (e) {
        console.warn("gapi 로드 경고(무시):", e?.message || e);
        gapiLoaded = true;
        resolve();
      }
    };
    document.body.appendChild(script);
  });
};

const loadGsi = () => {
  return new Promise((resolve) => {
    if (gsiLoaded) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.onload = () => {
      gsiLoaded = true;
      console.log("✅ Google Sign-In 로드 완료");
      resolve();
    };
    document.body.appendChild(script);
  });
};

export const initDriveAPI = async () => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;

  if (!clientId || !apiKey) {
    console.warn(
      "⚠️ Google Drive API 키가 설정되지 않았습니다. .env.local을 확인하세요."
    );
    return false;
  }

  try {
    await Promise.all([loadGapi(), loadGsi()]);

    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (response) => {
        lastTokenResponse = response;
        if (response.error) {
          console.error("Google 인증 오류:", response);
          driveDebugLog("token_error", response);
          return;
        }
        accessToken = response.access_token;
        driveDebugLog("token_received", {
          scope: "drive.file",
          accessToken: accessToken?.slice(0, 12) + "...",
          expires_in: response.expires_in,
        });
        console.log("✅ Google Drive 인증 완료");
      },
    });

    console.log("✅ Google Drive API 초기화 완료(Discovery 미사용)");
    return true;
  } catch (e) {
    console.error("❌ Google Drive API 초기화 실패:", e);
    return false;
  }
};

export const authenticateGoogleDrive = () => {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error("Google Drive API가 초기화되지 않았습니다."));
      return;
    }
    if (accessToken) {
      driveDebugLog("reuse_token", {
        accessToken: accessToken.slice(0, 12) + "...",
      });
      resolve(accessToken);
      return;
    }
    tokenClient.callback = (response) => {
      if (response.error) {
        driveDebugLog("auth_error", response);
        reject(response);
        return;
      }
      accessToken = response.access_token;
      driveDebugLog("auth_success", {
        accessToken: accessToken.slice(0, 12) + "...",
      });
      resolve(accessToken);
    };
    tokenClient.requestAccessToken({ prompt: "consent" });
  });
};

// 토큰 유효성 및 스코프 검증
export const verifyDriveAccessToken = async () => {
  if (!accessToken) return { valid: false, reason: "no_token" };
  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`
    );
    const json = await res.json();
    driveDebugLog("tokeninfo", json);
    if (json.error_description || json.error) {
      return { valid: false, reason: json.error_description || json.error };
    }
    // scope 포함 여부 확인 (tokeninfo는 scope 필드를 가질 수 있음)
    const scopeStr = json.scope || "";
    const hasDriveFile = scopeStr.includes("drive.file");
    return { valid: true, hasDriveFile, raw: json };
  } catch (e) {
    return { valid: false, reason: e?.message || "tokeninfo_failed" };
  }
};

export const downloadFromDrive = async (fileId) => {
  if (!accessToken) {
    await authenticateGoogleDrive();
  }
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  driveDebugLog("download_start", { fileId, url });
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    driveDebugLog("download_error", {
      status: res.status,
      body: text.slice(0, 300),
    });
    throw new Error(
      `파일 다운로드 실패: ${res.status} ${text || res.statusText}`
    );
  }
  driveDebugLog("download_success", { fileId });
  return await res.blob();
};

export const uploadToDrive = async (fileBlob, filename, folderId = null) => {
  if (!accessToken) {
    await authenticateGoogleDrive();
  }
  driveDebugLog("upload_start", { filename, size: fileBlob.size, folderId });
  const metadata = { name: filename, mimeType: "application/pdf" };
  if (folderId) metadata.parents = [folderId];

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  form.append("file", fileBlob);

  const uploadUrl =
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink";
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    driveDebugLog("upload_error", {
      status: res.status,
      body: text.slice(0, 300),
    });
    throw new Error(
      `파일 업로드 실패: ${res.status} ${text || res.statusText}`
    );
  }
  driveDebugLog("upload_success", {});
  const data = await res.json();
  return data.id;
};

export const updateDriveFile = async (fileId, fileBlob) => {
  if (!accessToken) {
    await authenticateGoogleDrive();
  }
  driveDebugLog("update_start", { fileId, size: fileBlob.size });
  const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
  const res = await fetch(updateUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/pdf",
    },
    body: fileBlob,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    driveDebugLog("update_error", {
      status: res.status,
      body: text.slice(0, 300),
    });
    throw new Error(
      `파일 업데이트 실패: ${res.status} ${text || res.statusText}`
    );
  }
  driveDebugLog("update_success", { fileId });
  return true;
};

export const extractFileIdFromUrl = (url) => {
  if (!url) return null;
  const m1 = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
};

export const getDriveUrl = (fileId) =>
  `https://drive.google.com/file/d/${fileId}/view`;

export const isDriveAPIAvailable = () => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
  return !!(
    clientId &&
    apiKey &&
    clientId !== "your-client-id.apps.googleusercontent.com"
  );
};

export const isAuthenticated = () => !!accessToken;

export const signOut = () => {
  accessToken = null;
  console.log("✅ Google Drive 로그아웃");
  driveDebugLog("sign_out", {});
};

// 디버그 모드 안내를 위한 헬퍼 (필요 시 UI에서 호출)
export const getDriveDebugStatus = () => ({
  debug: isDriveDebugEnabled(),
  hasToken: !!accessToken,
  tokenSnippet: accessToken ? accessToken.slice(0, 12) + "..." : null,
  lastTokenResponse,
});
