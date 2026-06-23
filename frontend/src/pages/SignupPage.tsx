import React from 'react';
import { AuthLayout } from '../features/auth/AuthLayout';
import { SignupForm } from '../features/auth/components/SignupForm';
import { useAuthStore } from '../store/auth.store';
import { Navigate } from 'react-router-dom';

const SignupPage: React.FC = () => {
  const { user } = useAuthStore();
  if (user) {
    return <Navigate to="/" replace />;
  }
  return (
    <AuthLayout>
      <SignupForm />
    </AuthLayout>
  );
};

export default SignupPage;
