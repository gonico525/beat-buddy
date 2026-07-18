// 画面遷移。単一画面遷移のみでクライアントルーティング不使用のため
// GitHub Pages の 404 フォールバック問題は発生しない (requirements §11.1)。

export interface Screen {
  el: HTMLElement;
  /** 画面を離れるときの後始末 (エンジン停止・タイマー解除など)。 */
  destroy?: () => void;
}

export type ScreenFactory = (app: App, params?: unknown) => Screen;

export class App {
  private screens = new Map<string, ScreenFactory>();
  private current: Screen | null = null;

  constructor(private root: HTMLElement) {}

  register(name: string, factory: ScreenFactory): void {
    this.screens.set(name, factory);
  }

  go(name: string, params?: unknown): void {
    const factory = this.screens.get(name);
    if (!factory) throw new Error(`unknown screen: ${name}`);
    this.current?.destroy?.();
    const screen = factory(this, params);
    this.root.replaceChildren(screen.el);
    this.current = screen;
    window.scrollTo(0, 0);
  }
}
