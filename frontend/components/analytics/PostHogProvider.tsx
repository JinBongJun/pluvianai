// Analytics - PostHogProvider
'use client';

import React, { useEffect } from 'react';
import posthog from 'posthog-js';

interface PostHogProviderProps {
    children: React.ReactNode;
}

export const PostHogProvider: React.FC<PostHogProviderProps> = ({ children }) => {
    useEffect(() => {
        if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
            posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
                api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
                loaded: (posthog) => {
                    if (process.env.NODE_ENV === 'development') posthog.debug();
                },
            });
        }
    }, []);

    return <>{children}</>;
};

export default PostHogProvider;
