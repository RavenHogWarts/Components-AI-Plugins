import lottie from 'lottie-web/build/player/lottie_light';

/**
 * Lottie 注入引擎：监听内置 .xdb--TurnLoading 出现即挂载容器播放，
 * 节点移除即销毁；多实例（多面板并存）以 Map 逐个管理。
 * animationData 每实例深拷贝——lottie-web 会改写数据对象。
 */
export class LottieHost {
  private observer?: MutationObserver;
  private readonly instances = new Map<Element, { container: HTMLDivElement; anim: { destroy(): void } }>();
  private data?: unknown;

  start(animationData: unknown): void {
    if (this.data === animationData) {
      this.sync();
      return;
    }
    this.stop();
    this.data = animationData;
    this.observer = new MutationObserver(() => this.sync());
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.sync();
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    for (const el of [...this.instances.keys()]) this.unmount(el);
    this.data = undefined;
  }

  private sync(): void {
    for (const el of [...this.instances.keys()]) {
      if (!el.isConnected) this.unmount(el);
    }
    for (const el of document.querySelectorAll('.xdb--TurnLoading')) {
      if (!this.instances.has(el)) this.mount(el);
    }
  }

  private mount(el: Element): void {
    if (this.data == null) return;
    const container = document.createElement('div');
    container.className = 'ai-lottie-host';
    el.insertBefore(container, el.firstChild);
    const anim = lottie.loadAnimation({
      container,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: typeof structuredClone === 'function' ? structuredClone(this.data) : JSON.parse(JSON.stringify(this.data)),
    });
    this.instances.set(el, { container, anim });
  }

  private unmount(el: Element): void {
    const instance = this.instances.get(el);
    if (!instance) return;
    this.instances.delete(el);
    instance.anim.destroy();
    instance.container.remove();
  }
}