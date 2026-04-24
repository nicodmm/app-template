"use client";

import { ACCOUNT_MODULES, isModuleEnabled, type AccountModuleKey } from "@/lib/modules-client";

interface AccountModulesTogglesProps {
  defaultValue?: Partial<Record<AccountModuleKey, boolean>> | null;
}

export function AccountModulesToggles({ defaultValue }: AccountModulesTogglesProps) {
  return (
    <div className="rounded-md border border-input bg-background divide-y divide-border">
      {ACCOUNT_MODULES.map((m) => {
        const checked = isModuleEnabled(defaultValue ?? undefined, m.key);
        return (
          <label
            key={m.key}
            className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-accent/50 transition-colors first:rounded-t-md last:rounded-b-md"
          >
            <input
              type="checkbox"
              name="enabledModules"
              value={m.key}
              defaultChecked={checked}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-none">{m.label}</p>
              <p className="text-xs text-muted-foreground mt-1">{m.description}</p>
            </div>
          </label>
        );
      })}
    </div>
  );
}
