import { create } from 'zustand';

export type AppSection =
  | 'dashboard'
  | 'find-leads'
  | 'my-leads'
  | 'settings';

interface UiState {
  section: AppSection;
  sidebarCollapsed: boolean;
  quickAddOpen: boolean;
  globalSearchOpen: boolean;
  selectedLeadId: string | null;
  setSection: (section: AppSection) => void;
  toggleSidebar: () => void;
  setQuickAddOpen: (open: boolean) => void;
  setGlobalSearchOpen: (open: boolean) => void;
  setSelectedLeadId: (leadId: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  section: 'dashboard',
  sidebarCollapsed: false,
  quickAddOpen: false,
  globalSearchOpen: false,
  selectedLeadId: null,
  setSection: (section) => set({ section }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setQuickAddOpen: (open) => set({ quickAddOpen: open }),
  setGlobalSearchOpen: (open) => set({ globalSearchOpen: open }),
  setSelectedLeadId: (leadId) => set({ selectedLeadId: leadId })
}));
