import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
}

const variantClasses = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500 disabled:bg-primary-300',
  secondary: 'bg-white text-neutral-700 hover:bg-neutral-50 focus:ring-primary-500 border border-border disabled:opacity-50',
  ghost: 'bg-transparent text-neutral-600 hover:bg-neutral-100 focus:ring-primary-500 disabled:opacity-50',
  danger: 'bg-error-600 text-white hover:bg-error-700 focus:ring-error-500 disabled:opacity-50',
  success: 'bg-success-600 text-white hover:bg-success-700 focus:ring-success-500 disabled:opacity-50',
};

const sizeClasses = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-base gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...props
}, ref) => {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center font-medium rounded-md
        transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1
        cursor-pointer disabled:cursor-not-allowed
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon}
      {children}
    </button>
  );
});

Button.displayName = 'Button';
