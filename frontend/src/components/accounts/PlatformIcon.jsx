import React from 'react';
import { getPlatformConfig } from '../../utils/platformConfig';
import { cn } from '../../lib/utils';

export const PlatformIcon = ({ 
  platform, 
  size = 'md', 
  showBackground = false,
  className 
}) => {
  const config = getPlatformConfig(platform);
  const Icon = config.icon;

  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
    xl: 'w-8 h-8',
  };

  const bgSizes = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-11 h-11',
    xl: 'w-14 h-14',
  };

  if (!Icon) {
    // Fallback to letter
    return (
      <div
        className={cn(
          'rounded-xl flex items-center justify-center font-bold text-white',
          showBackground ? bgSizes[size] : sizes[size],
          className
        )}
        style={{ backgroundColor: config.color }}
      >
        {platform.charAt(0).toUpperCase()}
      </div>
    );
  }

  if (showBackground) {
    return (
      <div
        className={cn(
          'rounded-xl flex items-center justify-center',
          bgSizes[size],
          className
        )}
        style={{ backgroundColor: config.color }}
      >
        <Icon className={cn(sizes[size], 'text-white')} />
      </div>
    );
  }

  return (
    <Icon
      className={cn(sizes[size], className)}
      style={{ color: config.color }}
    />
  );
};

export default PlatformIcon;
