import type { Request, Response, NextFunction } from 'express';

import type { ToolType } from '../config/plans';

type Task = () => Promise<any>;

interface QueuedTask {
  task: Task;
  priority: number;
  tool: ToolType;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timestamp: number;
}

/**
 * Priority Queue Service
 * 
 * Simple in-memory priority queue to handle requests during high traffic.
 * Higher priority (3 > 2 > 1 > 0) tasks move to the front.
 * Includes tool-specific concurrency scaling.
 */
class PriorityQueueService {
  private queue: QueuedTask[] = [];
  private activeCounts: Record<ToolType, number> = {
    chat: 0,
    voice: 0,
    image: 0,
    file_upload: 0,
    download: 0,
    tts: 0
  };

  private readonly CONCURRENCY_LIMITS: Record<ToolType, number> = {
    chat: 15,
    voice: 5,
    image: 2, // Image generation is heavy
    file_upload: 5,
    download: 10,
    tts: 5
  };

  /**
   * Adds a task to the queue and waits for its completion.
   */
  public async enqueue<T>(task: Task, priority: number, tool: ToolType): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        task,
        priority,
        tool,
        resolve,
        reject,
        timestamp: Date.now(),
      });

      // Sort by priority (descending), then by timestamp (ascending)
      this.queue.sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return a.timestamp - b.timestamp;
      });

      this.processNext();
    });
  }

  private async processNext() {
    if (this.queue.length === 0) return;

    // Find the first task in queue that doesn't violate its tool's concurrency limit
    const index = this.queue.findIndex(item => 
      this.activeCounts[item.tool] < this.CONCURRENCY_LIMITS[item.tool]
    );

    if (index === -1) return;

    const item = this.queue.splice(index, 1)[0];
    if (!item) return;

    this.activeCounts[item.tool]++;
    
    try {
      const result = await item.task();
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    } finally {
      this.activeCounts[item.tool]--;
      this.processNext();
    }
  }

  public getQueueLength(): number {
    return this.queue.length;
  }
}


export const priorityQueue = new PriorityQueueService();

/**
 * Priority Queue Middleware
 * 
 * Wraps the route execution in the priority queue.
 * Requires toolType to be set on req (e.g., by rateLimitMiddleware).
 */
export const withPriorityQueue = (handler: (req: any, res: Response) => Promise<any>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const priority = (req as any).priority || 0;
    const tool = (req as any).toolType || 'chat';
    
    try {
      await priorityQueue.enqueue(async () => {
        return handler(req, res);
      }, priority, tool as ToolType);
    } catch (error) {
      next(error);
    }
  };
};
