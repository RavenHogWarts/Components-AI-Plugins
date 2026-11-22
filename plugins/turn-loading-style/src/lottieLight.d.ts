declare module 'lottie-web/build/player/lottie_light' {
  export interface AnimationItem {
    destroy(): void;
  }
  export interface LoadAnimationParams {
    container: Element;
    renderer: 'svg';
    loop?: boolean;
    autoplay?: boolean;
    animationData: unknown;
  }
  export function loadAnimation(params: LoadAnimationParams): AnimationItem;
  const lottie: { loadAnimation: typeof loadAnimation };
  export default lottie;
}