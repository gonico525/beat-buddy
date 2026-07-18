// 小さなDOMヘルパー。フレームワークなし (エンジン非依存の素TS方針に合わせる)。

export interface ElProps {
  class?: string;
  text?: string;
  disabled?: boolean;
  title?: string;
  onClick?: (e: MouseEvent) => void;
  /** 幼児UIは click でなく pointerdown を使う (requirements §11)。 */
  onPointerDown?: (e: PointerEvent) => void;
  attrs?: Record<string, string>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.title) node.title = props.title;
  if (props.disabled && 'disabled' in node) {
    (node as unknown as { disabled: boolean }).disabled = true;
  }
  if (props.onClick) node.addEventListener('click', props.onClick as EventListener);
  if (props.onPointerDown) {
    node.addEventListener('pointerdown', props.onPointerDown as EventListener);
  }
  if (props.attrs) {
    for (const [k, v] of Object.entries(props.attrs)) node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

/** 大きな絵文字＋短い言葉のフィードバックを一瞬出す (ポジティブ専用)。 */
export function flashFeedback(
  host: HTMLElement,
  emoji: string,
  text: string,
  big = false,
): void {
  const node = el(
    'div',
    { class: `feedback ${big ? 'feedback-big' : ''}` },
    el('div', { class: 'feedback-emoji', text: emoji }),
    el('div', { class: 'feedback-text', text }),
  );
  host.appendChild(node);
  setTimeout(() => node.remove(), 900);
}
