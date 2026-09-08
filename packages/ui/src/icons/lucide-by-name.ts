import { LUCIDE_ICON_NAMES } from '@boardown/core';
import * as LucideIcons from 'lucide-react';
import { Circle, type LucideIcon } from 'lucide-react';

const toPascalCase = (name: string): string =>
  name.replace(/(^\w|-\w)/g, (chunk) => chunk.replace('-', '').toUpperCase());

const ICONS: Record<string, LucideIcon> = {};
for (const name of LUCIDE_ICON_NAMES) {
  const exported = (LucideIcons as Record<string, unknown>)[toPascalCase(name)];
  if (exported != null && (typeof exported === 'function' || typeof exported === 'object')) {
    ICONS[name] = exported as LucideIcon;
  }
}

export const lucideIconFromName = (name: string): LucideIcon => ICONS[name] ?? Circle;

export const lucideIconResolved = (name: string): boolean => ICONS[name] !== undefined;
