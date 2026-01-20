/**
 * Badge Component - HRKey Design System
 *
 * Matches existing badge/status patterns (rounded-full pills)
 */

import React from 'react';

export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'indigo';

export interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

const Badge: React.FC<BadgeProps> = ({
  variant,
  children,
  size = 'md',
  className = '',
}) => {
  // Base classes matching existing badge patterns
  const baseClasses = 'inline-flex items-center rounded-full font-medium';

  // Variant classes matching existing status badges
  const variantClasses = {
    success: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    error: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700',
    neutral: 'bg-slate-100 text-slate-700',
    indigo: 'bg-indigo-50 text-indigo-700 border border-indigo-100',
  };

  // Size classes matching existing patterns
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1 text-xs',
  };

  const combinedClasses = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

  return <span className={combinedClasses}>{children}</span>;
};

export default Badge;
