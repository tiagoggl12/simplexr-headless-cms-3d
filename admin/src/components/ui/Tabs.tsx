/**
 * Tabs Component
 * A tab navigation component with accessible keyboard support
 */

import { useState, useRef } from 'react';
import { cn } from '@/lib/utils';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  onChange?: (tabId: string) => void;
  className?: string;
  variant?: 'default' | 'pills' | 'underline';
}

export function Tabs({
  tabs,
  defaultTab,
  onChange,
  className,
  variant = 'default',
}: TabsProps): JSX.Element {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id || '');
  const tabListRef = useRef<HTMLDivElement>(null);

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    onChange?.(tabId);
  };

  // Keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (tabListRef.current) {
      const tabs = Array.from(
        tabListRef.current.querySelectorAll('[role="tab"]:not([disabled])')
      ) as HTMLElement[];
      const currentIndex = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');

      let newIndex = currentIndex;
      switch (event.key) {
        case 'ArrowRight':
          newIndex = (currentIndex + 1) % tabs.length;
          break;
        case 'ArrowLeft':
          newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
          break;
        case 'Home':
          newIndex = 0;
          break;
        case 'End':
          newIndex = tabs.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      tabs[newIndex]?.focus();
      tabs[newIndex]?.click();
    }
  };

  const tabClasses = {
    default: {
      list: 'flex border-b border-gray-200',
      tab: 'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
      active: 'border-primary text-primary',
      inactive: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
    },
    pills: {
      list: 'flex gap-2 p-1 bg-gray-100 rounded-lg',
      tab: 'px-4 py-2 text-sm font-medium rounded-md transition-colors',
      active: 'bg-white text-gray-900 shadow-sm',
      inactive: 'text-gray-600 hover:text-gray-900',
    },
    underline: {
      list: 'flex gap-4',
      tab: 'px-1 py-2 text-sm font-medium border-b-2 transition-colors',
      active: 'border-primary text-primary',
      inactive: 'border-transparent text-gray-500 hover:text-gray-700',
    },
  };

  const styles = tabClasses[variant];

  return (
    <div className={className}>
      <div
        ref={tabListRef}
        role="tablist"
        className={cn(styles.list)}
        onKeyDown={handleKeyDown}
        aria-label="Navegação por abas"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            {...(activeTab === tab.id ? { 'aria-selected': true } : { 'aria-selected': false })}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            disabled={tab.disabled}
            onClick={() => handleTabClick(tab.id)}
            className={cn(
              styles.tab,
              activeTab === tab.id ? styles.active : styles.inactive,
              tab.disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={activeTab !== tab.id}
          className="pt-4"
          tabIndex={0}
        >
          {tab.id === activeTab && <>{/* Content is rendered by the consumer */}</>}
        </div>
      ))}
    </div>
  );
}

// Tab Panel component for use with Tabs
interface TabPanelProps {
  id: string;
  activeTab: string;
  children: React.ReactNode;
}

export function TabPanel({ id, activeTab, children }: TabPanelProps): JSX.Element | null {
  if (id !== activeTab) return null;

  return <div role="tabpanel">{children}</div>;
}
