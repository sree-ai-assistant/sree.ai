import React from 'react';
import { AuthLayout } from '../features/auth/AuthLayout';
import { LoginForm } from '../features/auth/components/LoginForm';
import { useAuthStore } from '../store/auth.store';
import { Navigate } from 'react-router-dom';

const LoginPage: React.FC = () => {
  const { user } = useAuthStore();
  if (user) {
    return <Navigate to="/" replace />;
  }
  return (
    <AuthLayout>
      <LoginForm />
    </AuthLayout>
  );
};

export default LoginPage;
