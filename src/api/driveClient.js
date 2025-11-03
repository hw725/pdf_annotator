/**
 * Google Drive API 클라이언트 (refmanager에서 포팅)
 */

let gapiLoaded = false;
let gsiLoaded = false;
let tokenClient = null;
let accessToken = null;

const loadGapi = () => {
  return new Promise((resolve) => {
    if (gapiLoaded) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => {
      window.gapi.load("client", async () => {
        await window.gapi.client.init({
          apiKey: import.meta.env.VITE_GOOGLE_API_KEY,
          discoveryDocs: [
            "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
          ],
        });
        gapiLoaded = true;
        console.log("✅ Google API 클라이언트 로드 완료");
        resolve();
      });
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
        if (response.error) {
          console.error("Google 인증 오류:", response);
          return;
        }
        accessToken = response.access_token;
        console.log("✅ Google Drive 인증 완료");
      },
    });

    console.log("✅ Google Drive API 초기화 완료");
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
      resolve(accessToken);
      return;
    }
    tokenClient.callback = (response) => {
      if (response.error) {
        reject(response);
        return;
      }
      accessToken = response.access_token;
      resolve(accessToken);
    };
    tokenClient.requestAccessToken({ prompt: "consent" });
  });
};

export const downloadFromDrive = async (fileId) => {
  if (!accessToken) {
    await authenticateGoogleDrive();
  }
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`파일 다운로드 실패: ${res.statusText}`);
  return await res.blob();
};

export const uploadToDrive = async (fileBlob, filename, folderId = null) => {
  if (!accessToken) {
    await authenticateGoogleDrive();
  }
  const metadata = { name: filename, mimeType: "application/pdf" };
  if (folderId) metadata.parents = [folderId];

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  form.append("file", fileBlob);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  );
  if (!res.ok) throw new Error(`파일 업로드 실패: ${res.statusText}`);
  const data = await res.json();
  return data.id;
};

export const updateDriveFile = async (fileId, fileBlob) => {
  if (!accessToken) {
    await authenticateGoogleDrive();
  }
  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/pdf",
      },
      body: fileBlob,
    }
  );
  if (!res.ok) throw new Error(`파일 업데이트 실패: ${res.statusText}`);
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
};
