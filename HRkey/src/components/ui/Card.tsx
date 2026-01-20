/**
 * Card Component - HRKey Design System
 *
 * Matches existing card patterns:
 * - Default: White with border and shadow
 * - Elevated: Larger shadow for prominence
 * - Colored: Semantic colors for alerts/states
 */

import React from 'react';

export type CardVariant = 'default' | 'elevated' | 'success' | 'warning' | 'error' | 'info';

export interface CardProps {
  variant?: CardVariant;
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const Card: React.FC<CardProps> = ({
  variant = 'default',
  children,
  className = '',
  padding = 'md',
}) => {
  // Base classes matching existing patterns
  const baseClasses = 'rounded-lg';

  // Variant classes matching existing card designs
  const variantClasses = {
    default: 'border bg-white shadow-sm',
    elevated: 'border bg-white shadow-lg',
    success: 'border border-green-200 bg-green-50',
    warning: 'border border-amber-200 bg-amber-50',
    error: 'border border-red-200 bg-red-50',
    info: 'border border-blue-200 bg-blue-50',
  };

  // Padding classes matching existing patterns
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  const combinedClasses = `${baseClasses} ${variantClasses[variant]} ${paddingClasses[padding]} ${className}`;

  return <div className={combinedClasses}>{children}</div>;
};

export default Card;
