'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Shortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  action: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      shortcuts.forEach((shortcut) => {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const ctrlOrCmd = isMac ? event.metaKey : event.ctrlKey;
        
        if (
          event.key === shortcut.key &&
          (shortcut.ctrlKey ? ctrlOrCmd : true) &&
          (shortcut.metaKey ? event.metaKey : true) &&
          (shortcut.shiftKey ? event.shiftKey : !event.shiftKey)
        ) {
          event.preventDefault();
          shortcut.action();
        }
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}

export function useGlobalShortcuts() {
  const router = useRouter();
  
  useKeyboardShortcuts([
    {
      key: 'k',
      ctrlKey: true,
      action: () => {
        // Open global search (will be implemented)
        const event = new CustomEvent('open-search');
        window.dispatchEvent(event);
      },
      description: 'Open search',
    },
    {
      key: 'n',
      ctrlKey: true,
      action: () => {
        router.push('/dashboard?create=true');
      },
      description: 'New project',
    },
    {
      key: ',',
      ctrlKey: true,
      action: () => {
        router.push('/settings');
      },
      description: 'Open settings',
    },
  ]);
}
