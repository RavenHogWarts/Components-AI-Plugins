import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

export interface KitPopoverProps {
  open: boolean;
  onClose: () => void;
  /** 锚点元素（弹层右对齐到锚点右缘、展示在其上方） */
  anchorRef: RefObject<HTMLElement | null>;
  /** 用于右对齐计算的宽度（视觉宽度由 className/style 控制） */
  alignWidth?: number;
  className?: string;
  style?: CSSProperties;
  role?: string;
  ariaLabel?: string;
  children: ReactNode;
}

/**
 * 通用浮层：Portal 到 body、fixed 锚定（不受父容器裁切）、
 * 外部 mousedown/click 与 Esc 关闭、resize 时重新对齐。
 */
export function Popover(props: KitPopoverProps) {
  const { open, onClose, anchorRef, alignWidth = 320, className, style, role = 'dialog', ariaLabel, children } = props;
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const sync = (): void => {
      if (anchorRef.current) setRect(anchorRef.current.getBoundingClientRect());
    };
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target == null) return;
      if (ref.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('click', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('click', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : alignWidth + 16;
  const left = rect != null
    ? Math.min(Math.max(8, rect.right - alignWidth), Math.max(8, viewportWidth - alignWidth - 8))
    : 8;
  const top = rect != null ? Math.max(8, rect.top - 8) : 8;

  return createPortal(
    <div
      ref={ref}
      data-kit-popover
      role={role}
      aria-label={ariaLabel}
      className={className}
      style={{ position: 'fixed', left: `${left}px`, top: `${top}px`, transform: 'translateY(-100%)', zIndex: 1000, ...style }}
    >
      {children}
    </div>,
    document.body,
  );
}