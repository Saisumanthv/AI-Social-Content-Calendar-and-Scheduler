import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef, ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  hint,
  leftIcon,
  className = '',
  ...props
}, ref) => {
  return (
    <div className="space-y-1.5">
      {label && <label className="label">{label}</label>}
      <div className="relative">
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          className={`
            input
            ${leftIcon ? 'pl-10' : ''}
            ${error ? 'border-error-500 focus:ring-error-500' : ''}
            ${className}
          `}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-error-600">{error}</p>}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
});

Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({
  label,
  error,
  hint,
  className = '',
  ...props
}, ref) => {
  return (
    <div className="space-y-1.5">
      {label && <label className="label">{label}</label>}
      <textarea
        ref={ref}
        className={`
          input resize-none
          ${error ? 'border-error-500 focus:ring-error-500' : ''}
          ${className}
        `}
        {...props}
      />
      {error && <p className="text-xs text-error-600">{error}</p>}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
});

Textarea.displayName = 'Textarea';
