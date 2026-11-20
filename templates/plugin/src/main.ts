import { Plugin } from '@obsidian-components/ai-api';
import type { EventBusApi } from '@obsidian-components/ai-api';

export default class @PASCAL@Plugin extends Plugin {
  static inject = ['eventBus'] as const;

  async onResolving(): Promise<void> {
    // TODO: 初始化插件；this.dependencies[...] 读取注入的服务
    const eventBus = this.dependencies['eventBus'] as EventBusApi;
    console.log('[@NAME@] loaded', typeof eventBus.subscribe);
  }

  async onDisposing(): Promise<void> {
    // TODO: 释放本插件直接持有的订阅/定时器等资源
  }
}