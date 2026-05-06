import { ReactNode, useState } from 'react';

interface TooltipProps {
  content: string;
  children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div className="
          absolute top-full left-1/2 -translate-x-1/2 mt-2
          bg-neutral-900 text-white text-xs rounded-md px-2.5 py-1.5
          whitespace-nowrap z-50 pointer-events-none
          animate-fade-in
        ">
          {content}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-neutral-900" />
        </div>
      )}
    </div>
  );
}
