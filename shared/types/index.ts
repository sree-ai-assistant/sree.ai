export interface User {
  id: string;
  email: string;
  plan_type?: 'free' | 'basic' | 'pro';
  requests_remaining?: number;
}
