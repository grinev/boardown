import { useLayoutEffect } from 'react';
import { displayedTheme, sharedThemeOverrides, type SharedTheme, type Theme } from '@boardown/core';

export function useDocumentTheme(own: Theme, shared: SharedTheme | null): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = displayedTheme(shared, own);
    const overrides = Object.entries(sharedThemeOverrides(shared));
    for (const [name, value] of overrides) root.style.setProperty(name, value);
    return () => {
      for (const [name] of overrides) root.style.removeProperty(name);
    };
  }, [own, shared]);
}
