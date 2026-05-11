export interface User {
  id: string;
  email: string;
  plan_type?: 'free' | 'starter' | 'pro';
  requests_remaining?: number;
  credits?: number;
}
