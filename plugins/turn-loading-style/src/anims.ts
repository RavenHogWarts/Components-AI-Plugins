import type { FileApi } from '@obsidian-components/ai-api';

/** 动画素材通道：.json→Lottie 注入、.svg→运行时 data URI、.gif/.webp→base64 背景 */
export type AnimKind = 'lottie' | 'svg' | 'img';

export interface AnimEntry {
  /** 预设 ID：anim:<slug> */
  readonly id: string;
  /** 展示名（文件名清洗后） */
  readonly label: string;
  readonly kind: AnimKind;
  /** 素材文件路径 */
  readonly file: string;
}

export interface AnimRuntime {
  entries: readonly AnimEntry[];
  /** lottie 原始 JSON 文本（按需解析） */
  readonly lottieText: ReadonlyMap<string, string>;
  dispose(): void;
}

const STYLE_ID = 'ai-turn-anims';

/** 应用重启后 FileApi 要求原生绝对路径；obsidianApp 提供库根做换算。跨平台感知分隔符。 */
function toNative(basePath: string | undefined, path: string): string {
  if (/^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/')) return path;
  if (!basePath) return path;
  const sep = basePath.includes('\\') ? '\\' : '/';
  return `${basePath}${sep}${path.replace(/[\\/]/g, sep)}`;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.svg$|\.json$|\.gif$|\.webp$/, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '');
}

function prettyLabel(name: string): string {
  return name
    .replace(/\.svg$|\.json$|\.gif$|\.webp$/, '')
    .replace(/^wired-outline-\d+-/, '')
    .replace(/-hover-pinch$|-crawl$/, '');
}

/** data URI 安全转义：`%` 必须最先编码，否则后续 `%3C/%3E/%23` 会被二次转义。 */
function encodeSvg(source: string): string {
  return source
    .replace(/\r?\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/"/g, "'")
    .replace(/%/g, '%25')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/#/g, '%23');
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function kindOf(file: string): AnimKind | undefined {
  if (file.endsWith('.json')) return 'lottie';
  if (file.endsWith('.svg')) return 'svg';
  if (file.endsWith('.gif') || file.endsWith('.webp')) return 'img';
  return undefined;
}

/**
 * 扫描部署包 assets/anims/ 并注入运行时样式（选择器与生成器 CSS 同构）。
 * json 不入样式，仅登记供 Lottie 引擎按需加载。
 */
export async function loadAnims(
  files: FileApi,
  packagePath: string,
  basePath?: string,
): Promise<AnimRuntime> {
  const entries: AnimEntry[] = [];
  const lottieText = new Map<string, string>();
  const rules: string[] = [];
  const hideSelectors: string[] = [];

  const dir = `${packagePath}/assets/anims`;
  const nativeDir = toNative(basePath, dir);
  let list: readonly { readonly path: string }[] = [];
  try {
    list = await files.list(nativeDir);
  } catch {
    // 兼容旧行为：FileApi 支持根相对路径时回退
    try {
      list = await files.list(dir);
    } catch {
      return { entries, lottieText, dispose: () => undefined };
    }
  }

  const seen = new Set<string>();
  for (const item of list) {
    const file = toNative(basePath, item.path);
    const kind = kindOf(file);
    if (!kind) continue;
    const fileName = file.split(/[\\/]/).pop() ?? file;
    const label = prettyLabel(fileName);
    let slug = slugify(label);
    if (slug.length === 0) slug = slugify(fileName);
    // 同名去重：后续文件追加 -2/-3 序号
    let id = `anim:${slug}`;
    for (let n = 2; seen.has(id); n += 1) id = `anim:${slug}-${n}`;
    seen.add(id);
    entries.push({ id, label: label || slug, kind, file });
    hideSelectors.push(`body[data-ai-turn-loading="${id}"] .xdb--TurnLoading .xdb--WaveBars`);
    if (kind === 'svg') {
      const source = await files.readText(file);
      const encoded = encodeSvg(source);
      // 外部 SVG 普遍带留白（填充率 ~55-70%），乘 1.4 补偿；基准值由设置经 CSS 变量提供
      rules.push(`body[data-ai-turn-loading="${id}"] .xdb--TurnLoading::before {
  content: '';
  flex: none;
  width: calc(var(--ai-turn-anim-size, 1.3em) * 1.4);
  height: calc(var(--ai-turn-anim-size, 1.3em) * 1.4);
  margin-right: 6px;
  background: url("data:image/svg+xml,${encoded}") center / contain no-repeat;
}`);
    } else if (kind === 'img') {
      const mime = file.endsWith('.gif') ? 'image/gif' : 'image/webp';
      const base64 = toBase64(await files.read(file));
      rules.push(`body[data-ai-turn-loading="${id}"] .xdb--TurnLoading::before {
  content: '';
  flex: none;
  width: calc(var(--ai-turn-anim-size, 1.3em) * 1.4);
  height: calc(var(--ai-turn-anim-size, 1.3em) * 1.4);
  margin-right: 6px;
  background: url("data:${mime};base64,${base64}") center / contain no-repeat;
}`);
    } else {
      lottieText.set(id, await files.readText(file));
      // wired 系 Lottie 内容铺满画布，与旧版贴边宠物同构：基准尺寸即可
      rules.push(`body[data-ai-turn-loading="${id}"] .xdb--TurnLoading .ai-lottie-host {
  flex: none;
  width: var(--ai-turn-anim-size, 1.3em);
  height: var(--ai-turn-anim-size, 1.3em);
  margin-right: 6px;
}`);
    }
  }

  let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent =
    hideSelectors.length > 0 ? `${hideSelectors.join(',\n')} { display: none; }\n\n${rules.join('\n\n')}` : '';

  return {
    entries,
    lottieText,
    dispose: (): void => {
      styleEl?.remove();
    },
  };
}
