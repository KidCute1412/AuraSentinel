export const QUEUES = {
  rebalance: 'rebalance',
  swap: 'swap',
  explain: 'explain',
  attack: 'attack',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
