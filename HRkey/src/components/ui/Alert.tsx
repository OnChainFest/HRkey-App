/**
 * Alert Component - HRKey Design System
 *
 * Matches existing alert/notification patterns with semantic colors
 */

import React from 'react';

export type AlertVariant = 'success' | 'warning' | 'error' | 'info';

export interface AlertProps {
  variant: AlertVariant;
  title?: string;
  children: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const Alert: React.FC<AlertProps> = ({
  variant,
  title,
  children,
  onDismiss,
  className = '',
}) => {
  // Variant classes matching existing colored alert patterns
  const variantClasses = {
    success: 'border-green-200 bg-green-50 text-green-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    error: 'border-red-200 bg-red-50 text-red-700',
    info: 'border-blue-200 bg-blue-50 text-blue-800',
  };

  // Icons for each variant
  const icons = {
    success: '✓',
    warning: '⚠️',
    error: '✕',
    info: 'ℹ',
  };

  const combinedClasses = `rounded-lg border p-4 ${variantClasses[variant]} ${className}`;

  return (
    <div className={combinedClasses} role="alert">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          <span className="text-lg">{icons[variant]}</span>
          <div className="flex-1">
            {title && (
              <p className="font-medium mb-1">{title}</p>
            )}
            <div className="text-sm">{children}</div>
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="ml-3 inline-flex rounded-md p-1.5 hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-offset-2"
            aria-label="Dismiss"
          >
            <span className="text-lg">×</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default Alert;
