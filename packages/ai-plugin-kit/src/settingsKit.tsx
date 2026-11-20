import React, {
  createContext,
  forwardRef,
  useContext,
  useId,
  type ComponentType,
  type ReactNode,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * 官方插件设置 UI 体系（对齐 xdb--Setting* 全局类名与结构）。
 * 样式由应用全局样式表提供；插件无需自带 styles.css。
 */

export type SettingsSize = 'xs' | 'sm' | 'md' | 'lg';

const SettingsSizeContext = createContext<SettingsSize>('md');

export function useSettingsSize(size?: SettingsSize): SettingsSize {
  const inherited = useContext(SettingsSizeContext);
  return size ?? inherited;
}

interface RowContext {
  size: SettingsSize;
  controlId: string;
  labelId: string;
  descriptionId: string;
  errorId: string;
  feedbackId: string;
  describedBy?: string;
  invalid: boolean;
  disabled: boolean;
}

const SettingItemContext = createContext<RowContext | null>(null);

function useSettingItem(): RowContext | null {
  return useContext(SettingItemContext);
}

function mergeDescribedBy(item: RowContext | null, own?: string): string | undefined {
  const values = [item?.describedBy, own].filter((value): value is string => Boolean(value));
  return values.length > 0 ? values.join(' ') : undefined;
}

function useRowContext({
  size,
  controlId,
  error,
  disabled = false,
}: {
  size?: SettingsSize;
  controlId?: string;
  error?: ReactNode;
  disabled?: boolean;
}): RowContext {
  const itemId = useId();
  const resolvedSize = useSettingsSize(size);
  return {
    size: resolvedSize,
    controlId: controlId ?? `${itemId}-control`,
    labelId: `${itemId}-label`,
    descriptionId: `${itemId}-description`,
    errorId: `${itemId}-error`,
    feedbackId: `${itemId}-feedback`,
    describedBy: `${itemId}-description ${itemId}-error ${itemId}-feedback`,
    invalid: error != null && error !== false,
    disabled,
  };
}

export function SettingsSection(props: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { header, footer, children, className } = props;
  return (
    <section className={['xdb--SettingsSection', className].filter(Boolean).join(' ')}>
      {header ? <div className="xdb--SettingsSectionHeader">{header}</div> : null}
      <div className="xdb--SettingsSectionBody">{children}</div>
      {footer ? <div className="xdb--SettingsSectionFooter">{footer}</div> : null}
    </section>
  );
}

interface ItemProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: SettingsSize;
  orientation?: 'horizontal' | 'vertical';
  controlId?: string;
  error?: ReactNode;
  disabled?: boolean;
}

const SettingItemLabel = forwardRef<HTMLDivElement, { description?: ReactNode; children: ReactNode; className?: string }>(
  function SettingItemLabel(props, ref) {
    const { description, children, className, ...rest } = props;
    const item = useSettingItem();
    return (
      <div ref={ref} className={['xdb--SettingRowLabel', className].filter(Boolean).join(' ')} {...rest}>
        <span className="xdb--SettingRowTitle" id={item?.labelId}>
          {children}
        </span>
        {description ? (
          <p className="xdb--SettingRowDescription" id={item?.descriptionId}>
            {description}
          </p>
        ) : null}
      </div>
    );
  },
);

const SettingItemControl = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function SettingItemControl(props, ref) {
    const { className, ...rest } = props;
    return <div ref={ref} className={['xdb--SettingRowContent', className].filter(Boolean).join(' ')} {...rest} />;
  },
);

export const SettingItem = Object.assign(
  forwardRef<HTMLDivElement, ItemProps>(function SettingItem(props, ref) {
    const { size, orientation = 'horizontal', controlId, error, disabled = false, children, ...rest } = props;
    const value = useRowContext({ size, controlId, error, disabled });
    return (
      <SettingItemContext.Provider value={value}>
        <div
          ref={ref}
          className="xdb--SettingRow"
          data-size={value.size}
          data-orientation={orientation}
          {...rest}
        >
          <div className="xdb--SettingRowMain">{children}</div>
          {error != null && error !== false ? (
            <div className="xdb--SettingRowFeedback" data-result="error">
              <p id={value.errorId}>{error}</p>
            </div>
          ) : null}
        </div>
      </SettingItemContext.Provider>
    );
  }),
  { Label: SettingItemLabel, Control: SettingItemControl },
);

interface FieldProps {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  disabled?: boolean;
  size?: SettingsSize;
  orientation?: 'horizontal' | 'vertical';
  id?: string;
}

const InputControl = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function InputControl(
    { className, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, ...rest },
    ref,
  ) {
    const item = useSettingItem();
    return (
      <input
        ref={ref}
        id={item?.controlId}
        aria-labelledby={rest['aria-label'] ? undefined : item?.labelId}
        className={['xdb--SettingControl', className].filter(Boolean).join(' ')}
        aria-describedby={mergeDescribedBy(item, describedBy)}
        disabled={item?.disabled}
        aria-invalid={ariaInvalid || item?.invalid || undefined}
        {...rest}
      />
    );
  },
);

const SelectControl = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function SelectControl(
    { className, children, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, ...rest },
    ref,
  ) {
    const item = useSettingItem();
    return (
      <select
        ref={ref}
        id={item?.controlId}
        aria-labelledby={rest['aria-label'] ? undefined : item?.labelId}
        className={['dropdown', 'xdb--SettingControl', className].filter(Boolean).join(' ')}
        aria-describedby={mergeDescribedBy(item, describedBy)}
        disabled={item?.disabled}
        aria-invalid={ariaInvalid || item?.invalid || undefined}
        {...rest}
      >
        {children}
      </select>
    );
  },
);

const TextareaControl = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextareaControl(
    { className, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, ...rest },
    ref,
  ) {
    const item = useSettingItem();
    return (
      <textarea
        ref={ref}
        id={item?.controlId}
        aria-labelledby={rest['aria-label'] ? undefined : item?.labelId}
        className={['xdb--SettingControl', 'xdb--SettingTextarea', className].filter(Boolean).join(' ')}
        aria-describedby={mergeDescribedBy(item, describedBy)}
        disabled={item?.disabled}
        aria-invalid={ariaInvalid || item?.invalid || undefined}
        {...rest}
      />
    );
  },
);

export const SettingText = forwardRef<HTMLInputElement, FieldProps & React.InputHTMLAttributes<HTMLInputElement>>(
  function SettingText(props, ref) {
    const { label, description, error, disabled, size, orientation, id, ...rest } = props;
    return (
      <SettingItem size={size} orientation={orientation} error={error} disabled={disabled} controlId={id}>
        <SettingItem.Label description={description}>{label}</SettingItem.Label>
        <SettingItem.Control style={{ minInlineSize: 0 }}>
          <InputControl ref={ref} {...rest} />
        </SettingItem.Control>
      </SettingItem>
    );
  },
);

export const SettingSelect = forwardRef<HTMLSelectElement, FieldProps & React.SelectHTMLAttributes<HTMLSelectElement>>(
  function SettingSelect(props, ref) {
    const { label, description, error, disabled, size, orientation, id, children, ...rest } = props;
    return (
      <SettingItem size={size} orientation={orientation} error={error} disabled={disabled} controlId={id}>
        <SettingItem.Label description={description}>{label}</SettingItem.Label>
        <SettingItem.Control style={{ minInlineSize: 0 }}>
          <SelectControl ref={ref} {...rest}>
            {children}
          </SelectControl>
        </SettingItem.Control>
      </SettingItem>
    );
  },
);

export const SettingTextarea = forwardRef<HTMLTextAreaElement, FieldProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function SettingTextarea(props, ref) {
    const { label, description, error, disabled, size, orientation = 'vertical', id, ...rest } = props;
    return (
      <SettingItem size={size} orientation={orientation} error={error} disabled={disabled} controlId={id}>
        <SettingItem.Label description={description}>{label}</SettingItem.Label>
        <SettingItem.Control style={{ minInlineSize: 0 }}>
          <TextareaControl ref={ref} {...rest} />
        </SettingItem.Control>
      </SettingItem>
    );
  },
);

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'solid' | 'outline' | 'ghost'; size?: SettingsSize }
>(function Button(props, ref) {
  const { variant = 'solid', size, className, type = 'button', ...rest } = props;
  return (
    <button
      ref={ref}
      type={type}
      className={['xdb--Button', className].filter(Boolean).join(' ')}
      data-variant={variant}
      data-size={size ?? 'md'}
      {...rest}
    />
  );
});

class ViewErrorBoundary extends React.Component<{ children: ReactNode }, { error?: unknown }> {
  state: { error?: unknown } = {};

  static getDerivedStateFromError(error: unknown): { error: unknown } {
    return { error };
  }

  render(): ReactNode {
    if (this.state.error != null) {
      return <p>设置视图加载失败：{String(this.state.error)}</p>;
    }
    return this.props.children;
  }
}

class ReactViewRenderer<Input extends Record<string, unknown>> {
  private root?: Root;

  constructor(private readonly component: ComponentType<Input>) {}

  mount(container: HTMLElement, props: { size: SettingsSize; input: Input }): void {
    this.root = createRoot(container, { identifierPrefix: `xdb-${crypto.randomUUID()}-` });
    this.update(props);
  }

  update({ size, input }: { size: SettingsSize; input: Input }): void {
    const Component = this.component;
    this.root?.render(
      <ViewErrorBoundary>
        <SettingsSizeContext.Provider value={size}>
          <Component {...input} />
        </SettingsSizeContext.Provider>
      </ViewErrorBoundary>,
    );
  }

  unmount(): void {
    const pending = this.root?.unmount();
    this.root = undefined;
    void pending;
  }
}

/** 创建与官方插件一致的 React 视图类（零参构造），供 setSettingsView 使用 */
export function createReactView<Input extends Record<string, unknown>>(
  component: ComponentType<Input>,
): new () => {
  mount(container: HTMLElement, props: { size: SettingsSize; input: Input }): void;
  unmount(): void;
} {
  const Renderer = class extends ReactViewRenderer<Input> {};
  return class {
    private readonly renderer = new Renderer(component);
    mount(container: HTMLElement, props: { size: SettingsSize; input: Input }): void {
      this.renderer.mount(container, props);
    }
    unmount(): void {
      this.renderer.unmount();
    }
  };
}