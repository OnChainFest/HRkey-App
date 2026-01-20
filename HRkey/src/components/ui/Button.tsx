/**
 * Button Component - HRKey Design System
 *
 * Matches existing button patterns from the codebase:
 * - Primary: indigo-600 (main actions)
 * - Secondary: border with hover
 * - Danger: red-600 (destructive actions)
 * - Ghost: transparent with hover
 */

import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'brand';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: React.ReactNode;
  fullWidth?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      children,
      fullWidth = false,
      disabled,
      className = '',
      ...props
    },
    ref
  ) => {
    // Base classes matching existing patterns
    const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

    // Variant classes matching existing design
    const variantClasses = {
      primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500',
      secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus:ring-slate-500',
      danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
      ghost: 'text-slate-700 hover:bg-slate-100 focus:ring-slate-500',
      brand: 'bg-[#FF6B35] text-white hover:opacity-90 focus:ring-[#FF6B35]',
    };

    // Size classes matching existing patterns
    const sizeClasses = {
      sm: 'px-3 py-2 text-sm',
      md: 'px-4 py-2 text-base',
      lg: 'px-6 py-3 text-base',
    };

    const widthClass = fullWidth ? 'w-full' : '';

    const combinedClasses = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${widthClass} ${className}`;

    return (
      <button
        ref={ref}
        className={combinedClasses}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Loading...
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
