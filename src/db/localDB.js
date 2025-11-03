import { openDB } from "idb";

const DB_NAME = "refmanager-offline";
const DB_VERSION = 2; // PDF 기능 추가로 버전 증가

/**
 * IndexedDB 초기화
 * 참고문헌, 인용, 저자, 폴더, 태그 등을 저장
 */
export const initDB = async () => {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // 참고문헌 저장소
      if (!db.objectStoreNames.contains("references")) {
        const referencesStore = db.createObjectStore("references", {
          keyPath: "id",
        });
        referencesStore.createIndex("updated_at", "updated_at");
        referencesStore.createIndex("sync_status", "sync_status");
        referencesStore.createIndex("type", "type");
        referencesStore.createIndex("year", "year");
      }

      // 인용 저장소
      if (!db.objectStoreNames.contains("citations")) {
        const citationsStore = db.createObjectStore("citations", {
          keyPath: "id",
        });
        citationsStore.createIndex("updated_at", "updated_at");
        citationsStore.createIndex("sync_status", "sync_status");
        citationsStore.createIndex("reference_id", "reference_id");
      }

      // 저자 저장소
      if (!db.objectStoreNames.contains("authors")) {
        const authorsStore = db.createObjectStore("authors", {
          keyPath: "id",
        });
        authorsStore.createIndex("updated_at", "updated_at");
        authorsStore.createIndex("sync_status", "sync_status");
        authorsStore.createIndex("name", "name");
      }

      // 인용 스타일 저장소
      if (!db.objectStoreNames.contains("citation_styles")) {
        const citationStylesStore = db.createObjectStore("citation_styles", {
          keyPath: "id",
        });
        citationStylesStore.createIndex("updated_at", "updated_at");
        citationStylesStore.createIndex("sync_status", "sync_status");
      }

      // 폴더 저장소
      if (!db.objectStoreNames.contains("folders")) {
        const foldersStore = db.createObjectStore("folders", {
          keyPath: "id",
        });
        foldersStore.createIndex("updated_at", "updated_at");
        foldersStore.createIndex("sync_status", "sync_status");
      }

      // 태그 저장소
      if (!db.objectStoreNames.contains("tags")) {
        const tagsStore = db.createObjectStore("tags", {
          keyPath: "id",
        });
        tagsStore.createIndex("updated_at", "updated_at");
        tagsStore.createIndex("sync_status", "sync_status");
      }

      // PDF 주석 저장소
      if (!db.objectStoreNames.contains("pdf_annotations")) {
        const pdfAnnotationsStore = db.createObjectStore("pdf_annotations", {
          keyPath: "id",
        });
        pdfAnnotationsStore.createIndex("updated_at", "updated_at");
        pdfAnnotationsStore.createIndex("sync_status", "sync_status");
        pdfAnnotationsStore.createIndex("reference_id", "reference_id");
      }

      // PDF 캐시 저장소 (오프라인용)
      if (!db.objectStoreNames.contains("pdf_cache")) {
        const pdfCacheStore = db.createObjectStore("pdf_cache", {
          keyPath: "id",
        });
        pdfCacheStore.createIndex("reference_id", "reference_id");
        pdfCacheStore.createIndex("drive_url", "drive_url");
        pdfCacheStore.createIndex("last_synced", "last_synced");
      }

      // PDF 하이라이트 저장소
      if (!db.objectStoreNames.contains("highlights")) {
        const highlightsStore = db.createObjectStore("highlights", {
          keyPath: "id",
        });
        highlightsStore.createIndex("reference_id", "reference_id");
        highlightsStore.createIndex("pdf_cache_id", "pdf_cache_id");
        highlightsStore.createIndex("page", "page");
        highlightsStore.createIndex("created_at", "created_at");
        highlightsStore.createIndex("synced", "synced");
      }

      // 동기화 큐 (오프라인 시 변경사항 대기열)
      if (!db.objectStoreNames.contains("sync_queue")) {
        const syncStore = db.createObjectStore("sync_queue", {
          keyPath: "id",
          autoIncrement: true,
        });
        syncStore.createIndex("timestamp", "timestamp");
        syncStore.createIndex("retry_count", "retry_count");
      }

      // 메타데이터 저장소 (마지막 동기화 시간 등)
      if (!db.objectStoreNames.contains("metadata")) {
        db.createObjectStore("metadata", { keyPath: "key" });
      }
    },
  });
};

/**
 * 로컬 데이터베이스 작업을 위한 헬퍼 함수들
 */
export const localDB = {
  /**
   * 단일 항목 조회
   */
  async get(store, id) {
    const db = await initDB();
    return db.get(store, id);
  },

  /**
   * 모든 항목 조회
   */
  async getAll(store) {
    const db = await initDB();
    return db.getAll(store);
  },

  /**
   * 인덱스로 조회
   */
  async getAllByIndex(store, indexName, value) {
    const db = await initDB();
    return db.getAllFromIndex(store, indexName, value);
  },

  /**
   * 항목 저장/업데이트
   */
  async put(store, data) {
    const db = await initDB();
    const itemWithMeta = {
      ...data,
      updated_at: data.updated_at || Date.now(),
      sync_status: data.sync_status || "pending",
    };
    await db.put(store, itemWithMeta);
    return itemWithMeta;
  },

  /**
   * 여러 항목 일괄 저장
   */
  async putMany(store, items) {
    const db = await initDB();
    const tx = db.transaction(store, "readwrite");
    const results = [];

    for (const item of items) {
      const itemWithMeta = {
        ...item,
        updated_at: item.updated_at || Date.now(),
        sync_status: item.sync_status || "pending",
      };
      await tx.store.put(itemWithMeta);
      results.push(itemWithMeta);
    }

    await tx.done;
    return results;
  },

  /**
   * 항목 삭제
   */
  async delete(store, id) {
    const db = await initDB();
    return db.delete(store, id);
  },

  /**
   * 모든 항목 삭제
   */
  async clear(store) {
    const db = await initDB();
    return db.clear(store);
  },

  /**
   * 동기화 큐에 작업 추가
   */
  async addToSyncQueue(action) {
    const db = await initDB();
    return db.add("sync_queue", {
      ...action,
      timestamp: Date.now(),
      retry_count: 0,
      status: "pending",
    });
  },

  /**
   * 동기화 큐 조회 (대기 중인 항목만)
   */
  async getSyncQueue() {
    const db = await initDB();
    const all = await db.getAll("sync_queue");
    return all.filter((item) => item.status === "pending");
  },

  /**
   * 동기화 큐에서 항목 제거
   */
  async clearFromSyncQueue(id) {
    const db = await initDB();
    return db.delete("sync_queue", id);
  },

  /**
   * 동기화 큐 항목 업데이트 (재시도 카운트 증가 등)
   */
  async updateSyncQueueItem(id, updates) {
    const db = await initDB();
    const item = await db.get("sync_queue", id);
    if (item) {
      await db.put("sync_queue", { ...item, ...updates });
    }
  },

  /**
   * 메타데이터 저장
   */
  async setMetadata(key, value) {
    const db = await initDB();
    return db.put("metadata", { key, value, updated_at: Date.now() });
  },

  /**
   * 메타데이터 조회
   */
  async getMetadata(key) {
    const db = await initDB();
    const result = await db.get("metadata", key);
    return result ? result.value : null;
  },

  /**
   * sync_status가 'pending'인 항목들 조회
   */
  async getPendingItems(store) {
    const db = await initDB();
    return db.getAllFromIndex(store, "sync_status", "pending");
  },

  /**
   * 특정 참고문헌의 인용 조회
   */
  async getCitationsByReference(referenceId) {
    const db = await initDB();
    return db.getAllFromIndex("citations", "reference_id", referenceId);
  },

  /**
   * 특정 참고문헌의 PDF 주석 조회
   */
  async getAnnotationsByReference(referenceId) {
    const db = await initDB();
    return db.getAllFromIndex("pdf_annotations", "reference_id", referenceId);
  },
};

export default localDB;
