/**
 * 主动触达系统
 * 让Ome主动关心用户
 */

import type { ModelConfig } from "./config.js";

export interface ProactiveMessage {
  type: 'greeting' | 'concern' | 'reminder' | 'share';
  message: string;
  timestamp: number;
}

export class ProactiveSystem {
  private lastActiveTime: Map<string, number> = new Map();
  private greetingSent: Map<string, Set<string>> = new Map(); // sessionId -> Set<date>
  
  /**
   * 检查是否应该发送早安问候
   */
  shouldSendMorningGreeting(sessionId: string): boolean {
    const now = new Date();
    const hour = now.getHours();
    const today = now.toDateString();
    
    // 早上6-10点
    if (hour < 6 || hour > 10) return false;
    
    // 今天还没发送过
    const sent = this.greetingSent.get(sessionId) || new Set();
    if (sent.has(today)) return false;
    
    return true;
  }
  
  /**
   * 生成早安问候
   */
  async generateMorningGreeting(_modelConfig?: ModelConfig, _modelName?: string): Promise<string> {
    const greetings = [
      "早安~ 今天也要元气满满哦！",
      "早上好呀~ 新的一天开始了！",
      "早安！今天想做什么呢？",
      "早~ 昨晚睡得好吗？",
      "早上好！今天天气怎么样？"
    ];
    
    return greetings[Math.floor(Math.random() * greetings.length)];
  }
  
  /**
   * 标记问候已发送
   */
  markGreetingSent(sessionId: string) {
    const today = new Date().toDateString();
    const sent = this.greetingSent.get(sessionId) || new Set();
    sent.add(today);
    this.greetingSent.set(sessionId, sent);
  }
  
  /**
   * 检查是否应该发送晚安问候
   */
  shouldSendNightGreeting(sessionId: string): boolean {
    const now = new Date();
    const hour = now.getHours();
    const today = now.toDateString();
    
    // 晚上22-23点
    if (hour < 22 || hour > 23) return false;
    
    // 今天还没发送过晚安
    const sent = this.greetingSent.get(sessionId) || new Set();
    if (sent.has(`${today}-night`)) return false;
    
    return true;
  }
  
  /**
   * 生成晚安问候
   */
  async generateNightGreeting(_modelConfig?: ModelConfig, _modelName?: string): Promise<string> {
    const greetings = [
      "晚安~ 早点休息哦！",
      "该睡觉啦~ 晚安！",
      "晚安！做个好梦~",
      "今天辛苦了，晚安！",
      "晚安~ 明天见！"
    ];
    
    return greetings[Math.floor(Math.random() * greetings.length)];
  }
  
  /**
   * 标记晚安已发送
   */
  markNightGreetingSent(sessionId: string) {
    const today = new Date().toDateString();
    const sent = this.greetingSent.get(sessionId) || new Set();
    sent.add(`${today}-night`);
    this.greetingSent.set(sessionId, sent);
  }
  
  /**
   * 更新用户活跃时间
   */
  updateLastActive(sessionId: string) {
    this.lastActiveTime.set(sessionId, Date.now());
  }
  
  /**
   * 检查用户是否长时间未活跃
   */
  isUserInactive(sessionId: string, hours: number = 72): boolean {
    const lastActive = this.lastActiveTime.get(sessionId);
    if (!lastActive) return false;
    
    const now = Date.now();
    const diff = now - lastActive;
    return diff > hours * 60 * 60 * 1000;
  }
  
  /**
   * 生成关心消息
   */
  async generateConcernMessage(
    _modelConfig: ModelConfig,
    _modelName: string,
    inactiveDays: number
  ): Promise<string> {
    const messages = [
      `好久不见！已经${inactiveDays}天没见到你了，最近怎么样？`,
      `有${inactiveDays}天没聊天了，想你了~ 最近忙吗？`,
      `${inactiveDays}天没见，还好吗？有什么新鲜事吗？`,
      `好久没联系了，一切都好吗？`,
    ];
    
    return messages[Math.floor(Math.random() * messages.length)];
  }
  
  /**
   * 检查是否是特殊日期
   */
  isSpecialDate(): { isSpecial: boolean; type?: string; message?: string } {
    const now = new Date();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    
    // 节日检查
    const holidays: Record<string, string> = {
      '1-1': '🎉 新年快乐！',
      '2-14': '💝 情人节快乐！',
      '5-1': '🎊 劳动节快乐！',
      '6-1': '🎈 儿童节快乐！',
      '10-1': '🇨🇳 国庆节快乐！',
      '12-25': '🎄 圣诞快乐！',
    };
    
    const key = `${month}-${date}`;
    if (holidays[key]) {
      return {
        isSpecial: true,
        type: 'holiday',
        message: holidays[key]
      };
    }
    
    return { isSpecial: false };
  }
  
  /**
   * 生成分享消息
   */
  async generateShareMessage(
    _modelConfig: ModelConfig,
    _modelName: string,
    _topic: string
  ): Promise<string> {
    // 这里可以根据用户兴趣生成个性化分享
    const shares = [
      "今天看到一个有趣的事情，想分享给你~",
      "刚才想到你，有个好玩的想告诉你！",
      "发现了一个很棒的东西，推荐给你！",
    ];
    
    return shares[Math.floor(Math.random() * shares.length)];
  }
}

// 全局实例
let proactiveInstance: ProactiveSystem | null = null;

export function getProactiveSystem(): ProactiveSystem {
  if (!proactiveInstance) {
    proactiveInstance = new ProactiveSystem();
  }
  return proactiveInstance;
}

/**
 * 启动主动触达定时任务
 */
export function startProactiveScheduler(
  callback: (sessionId: string, message: ProactiveMessage) => void
) {
  const system = getProactiveSystem();
  
  // 每小时检查一次
  setInterval(() => {
    // 这里需要遍历所有活跃会话
    // 简化实现：只检查主会话
    const sessionId = 'owner';
    
    // 检查早安
    if (system.shouldSendMorningGreeting(sessionId)) {
      system.generateMorningGreeting({} as any, 'gpt-4').then(message => {
        callback(sessionId, {
          type: 'greeting',
          message,
          timestamp: Date.now()
        });
        system.markGreetingSent(sessionId);
      });
    }
    
    // 检查晚安
    if (system.shouldSendNightGreeting(sessionId)) {
      system.generateNightGreeting({} as any, 'gpt-4').then(message => {
        callback(sessionId, {
          type: 'greeting',
          message,
          timestamp: Date.now()
        });
        system.markNightGreetingSent(sessionId);
      });
    }
    
    // 检查长时间未活跃
    if (system.isUserInactive(sessionId, 72)) {
      const days = Math.floor((Date.now() - (system as any).lastActiveTime.get(sessionId)!) / (24 * 60 * 60 * 1000));
      system.generateConcernMessage({} as any, 'gpt-4', days).then(message => {
        callback(sessionId, {
          type: 'concern',
          message,
          timestamp: Date.now()
        });
      });
    }
    
    // 检查特殊日期
    const special = system.isSpecialDate();
    if (special.isSpecial && special.message) {
      callback(sessionId, {
        type: 'reminder',
        message: special.message,
        timestamp: Date.now()
      });
    }
  }, 60 * 60 * 1000); // 每小时
  
  console.log("✅ 主动触达系统已启动");
}
