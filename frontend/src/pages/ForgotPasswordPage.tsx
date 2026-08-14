import React from 'react';
import { AuthLayout } from '../features/auth/AuthLayout';
import { ForgotPasswordForm } from '../features/auth/components/ForgotPasswordForm';
import { useAuthStore } from '../store/auth.store';
import { Navigate } from 'react-router-dom';

const ForgotPasswordPage: React.FC = () => {
    const { user } = useAuthStore();
    if (user) {
        return <Navigate to="/" replace />;
    }
    return (
        <AuthLayout>
            <ForgotPasswordForm />
        </AuthLayout>
    );
};

export default ForgotPasswordPage;
