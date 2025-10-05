// src/utils/rateLimiter.js
import { EventEmitter } from 'events';

class InfuraRateLimiter extends EventEmitter {
  // Infura limits
  MAX_CREDITS_PER_SECOND: number;
  MAX_CREDITS_PER_DAY: number;
  SAFE_CREDITS_PER_SECOND: number;
  
  // Credit costs (approximate)
  CREDIT_COSTS: { [key: string]: number };
  
  // Tracking
  secondlyCredits: number;
  dailyCredits: number;
  lastResetSecond: number;
  lastResetDay: string;
  queue: Array<{
    method: string;
    executeFn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    retries: number;
    maxRetries: number;
  }>;
  processing: boolean;
  
  // Statistics
  stats: {
    totalRequests: number;
    throttledRequests: number;
    failedRequests: number;
    dailyCreditsUsed: number;
  };

  constructor() {
    super();
    
    // Infura limits
    this.MAX_CREDITS_PER_SECOND = 500;
    this.MAX_CREDITS_PER_DAY = 3000000;
    this.SAFE_CREDITS_PER_SECOND = 400; // Leave buffer
    
    // Credit costs (approximate)
    this.CREDIT_COSTS = {
      eth_sendRawTransaction: 20,
      eth_call: 15,
      eth_getTransactionReceipt: 15,
      eth_getBalance: 10,
      eth_getBlockByNumber: 10,
      eth_gasPrice: 5,
    };
    
    // Tracking
    this.secondlyCredits = 0;
    this.dailyCredits = 0;
    this.lastResetSecond = Date.now();
    this.lastResetDay = new Date().toDateString();
    this.queue = [];
    this.processing = false;
    
    // Statistics
    this.stats = {
      totalRequests: 0,
      throttledRequests: 0,
      failedRequests: 0,
      dailyCreditsUsed: 0,
    };
    
    // Reset counters periodically
    this.setupResetTimers();
  }
  
  setupResetTimers() {
    // Reset per-second counter
    setInterval(() => {
      this.secondlyCredits = 0;
      this.lastResetSecond = Date.now();
      this.processQueue();
    }, 1000);
    
    // Reset daily counter
    setInterval(() => {
      const currentDay = new Date().toDateString();
      if (currentDay !== this.lastResetDay) {
        this.dailyCredits = 0;
        this.lastResetDay = currentDay;
        this.stats.dailyCreditsUsed = 0;
      }
    }, 60000); // Check every minute
  }
  
  /**
   * Calculate credits needed for a method
   */
  getCreditsForMethod(method) {
    return this.CREDIT_COSTS[method] || 10;
  }
  
  /**
   * Check if request can proceed
   */
  canProceed(method) {
    const credits = this.getCreditsForMethod(method);
    
    // Check daily limit
    if (this.dailyCredits + credits > this.MAX_CREDITS_PER_DAY) {
      return { allowed: false, reason: 'Daily credit limit exceeded' };
    }
    
    // Check per-second limit
    if (this.secondlyCredits + credits > this.SAFE_CREDITS_PER_SECOND) {
      return { allowed: false, reason: 'Per-second rate limit' };
    }
    
    return { allowed: true };
  }
  
  /**
   * Track credit usage
   */
  trackUsage(method) {
    const credits = this.getCreditsForMethod(method);
    this.secondlyCredits += credits;
    this.dailyCredits += credits;
    this.stats.dailyCreditsUsed += credits;
    this.stats.totalRequests++;
  }
  
  /**
   * Queue a request with rate limiting
   */
  async queueRequest(method, executeFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        method,
        executeFn,
        resolve,
        reject,
        retries: 0,
        maxRetries: 3,
      });
      
      this.processQueue();
    });
  }
  
  /**
   * Process queued requests
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const request = this.queue[0];
      const canProceed = this.canProceed(request.method);
      
      if (!canProceed.allowed) {
        // If rate limited, wait
        this.stats.throttledRequests++;
        this.emit('throttled', { method: request.method, reason: canProceed.reason });
        
        // Wait before retrying
        await this.delay(1000);
        continue;
      }
      
      // Remove from queue and execute
      this.queue.shift();
      
      try {
        this.trackUsage(request.method);
        const result = await request.executeFn();
        request.resolve(result);
      } catch (error) {
        if (error.code === 429 && request.retries < request.maxRetries) {
          // Rate limit error - retry with exponential backoff
          request.retries++;
          const backoffMs = Math.pow(2, request.retries) * 1000;
          
          this.emit('retry', { 
            method: request.method, 
            retry: request.retries, 
            backoffMs 
          });
          
          await this.delay(backoffMs);
          this.queue.unshift(request); // Put back at front of queue
        } else {
          // Failed permanently
          this.stats.failedRequests++;
          request.reject(error);
        }
      }
    }
    
    this.processing = false;
  }
  
  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Calculate optimal batch size
   */
  calculateOptimalBatchSize(creditsPerOperation) {
    // Leave room for other operations
    const availableCreditsPerSecond = this.SAFE_CREDITS_PER_SECOND * 0.8;
    const batchSize = Math.floor(availableCreditsPerSecond / creditsPerOperation);
    
    // Cap at 50 to avoid gas limits
    return Math.min(batchSize, 50);
  }
  
  /**
   * Get current stats
   */
  getStats() {
    return {
      ...this.stats,
      currentSecondCredits: this.secondlyCredits,
      currentDayCredits: this.dailyCredits,
      remainingDailyCredits: this.MAX_CREDITS_PER_DAY - this.dailyCredits,
      queueLength: this.queue.length,
    };
  }
  
  /**
   * Monitor credit usage
   */
  startMonitoring(intervalMs = 10000) {
    return setInterval(() => {
      const stats = this.getStats();
      console.log('Infura Rate Limiter Stats:', stats);
      
      // Warn if approaching limits
      if (stats.currentDayCredits > this.MAX_CREDITS_PER_DAY * 0.8) {
        console.warn('WARNING: Approaching daily credit limit');
        this.emit('warning', { type: 'daily_limit', stats });
      }
    }, intervalMs);
  }
}

// Create singleton instance
const rateLimiter = new InfuraRateLimiter();

export default rateLimiter;

/**
 * Wrap Web3 calls with rate limiting
 */
export const rateLimitedWeb3Call = async (method, executeFn) => {
  return rateLimiter.queueRequest(method, executeFn);
};

/**
 * Get optimal batch configuration
 */
export const getOptimalBatchConfig = () => {
  return {
    batchSize: rateLimiter.calculateOptimalBatchSize(20), // Assuming sendTransaction
    delayBetweenBatches: 3000, // 3 seconds
    maxConcurrentBatches: 1, // Process sequentially to avoid rate limits
  };
};