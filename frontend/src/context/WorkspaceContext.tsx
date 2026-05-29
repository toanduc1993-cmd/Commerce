'use client';

/**
 * context/WorkspaceContext.tsx — UI-1-3: Project workspace selector
 *
 * Provides "focused project" state across the entire app.
 * Sidebar selector → setProject → all pages filter by current project context.
 *
 * Persistence: localStorage `ibshi_workspace_project_id`.
 *
 * Usage:
 *   const { project, setProject, allProjects } = useWorkspace();
 *   const url = project ? `/api/v1/prs?projectId=${project.id}` : '/api/v1/prs';
 */
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { PROJECTS, type Project } from '@/context/ProjectContext';

interface WorkspaceContextValue {
  project: Project | null;
  setProject: (p: Project | null) => void;
  allProjects: Project[];
  isAll: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const STORAGE_KEY = 'ibshi_workspace_project_id';

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [project, setProjectState] = useState<Project | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const found = PROJECTS.find((p) => p.id === saved);
      if (found) setProjectState(found);
    }
  }, []);

  const setProject = (p: Project | null) => {
    setProjectState(p);
    if (typeof window !== 'undefined') {
      if (p) localStorage.setItem(STORAGE_KEY, p.id);
      else localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <WorkspaceContext.Provider
      value={{ project, setProject, allProjects: PROJECTS, isAll: !project }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    // Graceful fallback for pages not yet wrapped (legacy)
    return { project: null, setProject: () => {}, allProjects: PROJECTS, isAll: true };
  }
  return ctx;
}
