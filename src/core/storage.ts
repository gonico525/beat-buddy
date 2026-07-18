// 永続化 (requirements §10)。localStorage のみ・サーバなし・PIIなし。
// sessionLog は直近1セッションの async/IOI ログのみ (検証・デバッグ用、件数上限)。

export type FeatureKey =
  | 'sync' // 同期(基本)
  | 'echo' // こだま(基本)
  | 'syncTempo' // 同期: テンポ課題
  | 'syncContinuation' // 同期: 継続
  | 'echoAdvanced'; // こだま(3音/長短)

/** 推奨表示順の梯子 (§8)。強制はしない・表示順のみ。知覚/全身は常時開放。 */
export const FEATURE_LADDER: { key: FeatureKey; label: string }[] = [
  { key: 'sync', label: 'どうき (あわせてタップ)' },
  { key: 'echo', label: 'こだま (まねっこ)' },
  { key: 'syncTempo', label: 'どうき: テンポちょうせん' },
  { key: 'syncContinuation', label: 'どうき: つづけてタップ' },
  { key: 'echoAdvanced', label: 'こだま: 3おと・ながみじか' },
];

export interface DeviceData {
  deviceOffsetMs: number;
}

export interface ChildProfile {
  id: string;
  name?: string;
  smtMs: number | null;
  reachedLayer: string;
  unlockedFeatures: FeatureKey[];
  updatedAt: number;
}

export interface SessionLogEntry {
  t: number; // Date.now()
  mode: string;
  data: Record<string, unknown>;
}

const KEY_DEVICE = 'beatbuddy:device';
const KEY_CHILDREN = 'beatbuddy:children';
const KEY_ACTIVE = 'beatbuddy:activeChildId';
const KEY_LOG = 'beatbuddy:sessionLog';
const KEY_DEBUG = 'beatbuddy:debugMode';
const LOG_CAP = 500;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ストレージ不可 (プライベートモード等) でもアプリは動作継続
  }
}

export const storage = {
  getDevice(): DeviceData {
    return read<DeviceData>(KEY_DEVICE, { deviceOffsetMs: 0 });
  },
  setDeviceOffsetMs(deviceOffsetMs: number): void {
    write(KEY_DEVICE, { deviceOffsetMs });
  },

  getChildren(): ChildProfile[] {
    return read<ChildProfile[]>(KEY_CHILDREN, []);
  },
  saveChild(child: ChildProfile): void {
    const children = storage.getChildren();
    const i = children.findIndex((c) => c.id === child.id);
    child.updatedAt = Date.now();
    if (i >= 0) children[i] = child;
    else children.push(child);
    write(KEY_CHILDREN, children);
  },
  deleteChild(id: string): void {
    write(KEY_CHILDREN, storage.getChildren().filter((c) => c.id !== id));
  },

  /** アクティブな子プロフィール。無ければ既定プロフィールを作る。 */
  getActiveChild(): ChildProfile {
    const children = storage.getChildren();
    const activeId = read<string | null>(KEY_ACTIVE, null);
    const found = children.find((c) => c.id === activeId) ?? children[0];
    if (found) return found;
    const child: ChildProfile = {
      id: `child-${Date.now().toString(36)}`,
      smtMs: null,
      reachedLayer: 'perception',
      unlockedFeatures: [], // 初期状態: 知覚・全身のみ開放 (両者は常時開放扱い)
      updatedAt: Date.now(),
    };
    storage.saveChild(child);
    storage.setActiveChild(child.id);
    return child;
  },
  setActiveChild(id: string): void {
    write(KEY_ACTIVE, id);
  },

  isUnlocked(child: ChildProfile, key: FeatureKey): boolean {
    return child.unlockedFeatures.includes(key);
  },
  setUnlocked(child: ChildProfile, key: FeatureKey, unlocked: boolean): void {
    const set = new Set(child.unlockedFeatures);
    if (unlocked) set.add(key);
    else set.delete(key);
    child.unlockedFeatures = [...set];
    storage.saveChild(child);
  },

  /** 新セッション開始でログをリセット (直近1セッション分のみ保持)。 */
  resetSessionLog(): void {
    write(KEY_LOG, []);
  },
  log(mode: string, data: Record<string, unknown>): void {
    const log = read<SessionLogEntry[]>(KEY_LOG, []);
    log.push({ t: Date.now(), mode, data });
    while (log.length > LOG_CAP) log.shift();
    write(KEY_LOG, log);
  },
  getSessionLog(): SessionLogEntry[] {
    return read<SessionLogEntry[]>(KEY_LOG, []);
  },

  getDebugMode(): boolean {
    return read<boolean>(KEY_DEBUG, false);
  },
  setDebugMode(on: boolean): void {
    write(KEY_DEBUG, on);
  },
};
