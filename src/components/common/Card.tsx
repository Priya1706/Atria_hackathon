import React from 'react';

interface CardProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  glow?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  action,
  icon,
  className = '',
  bodyClassName = 'p-5',
  glow = false,
}) => {
  return (
    <div
      className={`bg-[#111827] border border-gray-800 rounded-xl overflow-hidden transition-all duration-200 ${
        glow ? 'shadow-[0_0_20px_rgba(16,185,129,0.05)] border-emerald-900/40' : 'shadow-lg'
      } ${className}`}
    >
      {(title || action) && (
        <div className="px-5 py-4 border-b border-gray-800/80 flex items-center justify-between gap-4 bg-[#0F172A]/40">
          <div className="flex items-center gap-3 min-w-0">
            {icon && <div className="text-emerald-400 shrink-0">{icon}</div>}
            <div className="truncate">
              {title && (
                <h3 className="text-sm font-semibold text-gray-100 tracking-wide truncate">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-xs text-gray-400 truncate mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
};
