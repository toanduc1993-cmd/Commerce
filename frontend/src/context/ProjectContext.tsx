// ============================================================
// CONTEXT: ProjectContext.tsx
// Global state: dự án đang được chọn — dùng chung toàn app
// ============================================================

'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface Project {
  id: string;
  code: string; // 25-VPI-I-095
  name: string; // BISON (VOGT POWER)
  client: string;
  refNo: string;
  status: 'active' | 'completed' | 'on-hold';
  updatedAt: string;
}

// Danh sách dự án thực tế (mock)
export const PROJECTS: Project[] = [
  {
    id: 'p001',
    code: '25-VPI-I-095',
    name: 'BISON (VOGT POWER PROJECT)',
    client: 'VOGT POWER INTERNATIONAL',
    refNo: 'I-095-ENG-001-REV 08',
    status: 'active',
    updatedAt: '04/04/2026',
  },
  {
    id: 'p002',
    code: '25-BRA-I-090',
    name: 'BRADEN AIR COOLER',
    client: 'BRADEN GROUP',
    refNo: 'I-090-ENG-003-REV 05',
    status: 'active',
    updatedAt: '01/04/2026',
  },
  {
    id: 'p003',
    code: '25-STV-I-082',
    name: 'STEAM VESSEL MODULE',
    client: 'STEINMÜLLER AFRICA',
    refNo: 'I-082-ENG-001-REV 02',
    status: 'on-hold',
    updatedAt: '15/03/2026',
  },
  {
    id: 'p004',
    code: '24-GAS-I-071',
    name: 'GAS TURBINE SKID',
    client: 'GE VERNOVA',
    refNo: 'I-071-ENG-002-REV 07',
    status: 'completed',
    updatedAt: '20/02/2026',
  },
];

interface ProjectContextType {
  selectedProjectIds: string[];
  setSelectedProjectIds: (ids: string[]) => void;
  activeUploadProject: Project | null;
  setActiveUploadProject: (p: Project | null) => void;
  projects: Project[];
  selectedProjects: Project[];
}

const ProjectContext = createContext<ProjectContextType | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  // Mặc định chọn dự án đầu tiên
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>(['p001']);
  const [activeUploadProject, setActiveUploadProject] = useState<Project | null>(PROJECTS[0]);

  const selectedProjects = PROJECTS.filter((p) => selectedProjectIds.includes(p.id));

  return (
    <ProjectContext.Provider
      value={{
        selectedProjectIds,
        setSelectedProjectIds,
        activeUploadProject,
        setActiveUploadProject,
        projects: PROJECTS,
        selectedProjects,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjects() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProjects must be used inside ProjectProvider');
  return ctx;
}
