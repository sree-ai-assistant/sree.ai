export interface User {
  id: string;
  email: string;
  plan_type?: 'free' | 'premium' | 'pro';
  requests_remaining?: number;
}
