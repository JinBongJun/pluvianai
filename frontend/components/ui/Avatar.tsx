'use client';

import { HTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  name?: string;
  email?: string;
  size?: 'sm' | 'md' | 'lg';
  src?: string;
}

export default function Avatar({
  className,
  name,
  email,
  size = 'md',
  src,
  ...props
}: AvatarProps) {
  const getInitials = () => {
    if (name) {
      const parts = name.trim().split(' ');
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
      }
      return name[0].toUpperCase();
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return '?';
  };

  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
  };

  return (
    <div
      className={clsx(
        'inline-flex items-center justify-center rounded-full bg-ag-primary/20 text-ag-accentLight font-medium border border-ag-primary/30',
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {src ? (
        <img src={src} alt={name || email || 'Avatar'} className="h-full w-full rounded-full object-cover" />
      ) : (
        <span>{getInitials()}</span>
      )}
    </div>
  );
}

